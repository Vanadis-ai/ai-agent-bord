"""Vanadis Bord -- desktop AI chat application."""

import asyncio
import atexit
import json
import logging
import os
import signal
import threading
import uuid
from pathlib import Path

import webview

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    HookMatcher,
    PermissionResultAllow,
    PermissionResultDeny,
    ResultMessage,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
    delete_session,
    get_session_messages,
    list_sessions,
    rename_session,
)

from session_utils import (
    extract_content,
    find_custom_title,
    find_session_model,
    find_session_tokens,
    model_to_short,
    parse_message,
)

logger = logging.getLogger("bord")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")

SETTINGS_DIR = Path.home() / ".Vanadis"
SETTINGS_FILE = SETTINGS_DIR / "bord-settings.json"


async def _dummy_hook(input_data, tool_use_id, context):
    """Required workaround: keeps stream open for can_use_tool callback."""
    return {"continue_": True}


class BordAPI:
    """Python backend exposed to JS via pywebview bridge."""

    def __init__(self):
        self.window = None
        self._perm_events = {}
        self._perm_responses = {}
        self._allowed_tools = {}

    # -- Permission handling --

    async def _permission_handler(self, tool_name, tool_input, context):
        tid = threading.current_thread().ident
        allowed = self._allowed_tools.get(tid, set())
        if tool_name in allowed:
            return PermissionResultAllow()
        perm_id = uuid.uuid4().hex[:8]
        event = threading.Event()
        self._perm_events[perm_id] = event
        self._emit("permission_request", {
            "id": perm_id, "tool_name": tool_name,
            "tool_input": tool_input if isinstance(tool_input, dict) else str(tool_input),
        })
        await asyncio.get_event_loop().run_in_executor(None, event.wait, 300)
        action = self._perm_responses.pop(perm_id, "deny")
        self._perm_events.pop(perm_id, None)
        if action == "allow":
            return PermissionResultAllow()
        if action == "allow_tool":
            allowed.add(tool_name)
            self._allowed_tools[tid] = allowed
            return PermissionResultAllow()
        if action == "bypass":
            return PermissionResultAllow()
        return PermissionResultDeny(message="User denied")

    def respond_permission(self, perm_id, action):
        self._perm_responses[perm_id] = action
        event = self._perm_events.get(perm_id)
        if event:
            event.set()

    # -- Sessions --

    def get_sessions(self, directory=None):
        try:
            sessions = list_sessions(directory=directory, limit=50)
            result = []
            for s in sessions:
                title = s.custom_title or find_custom_title(s.session_id)
                if not title:
                    title = s.summary or s.first_prompt or "Untitled"
                result.append({
                    "id": s.session_id, "title": title,
                    "last_modified": s.last_modified, "cwd": s.cwd or "",
                    "tag": s.tag or "",
                    "model": model_to_short(find_session_model(s.session_id)),
                })
            return result
        except Exception:
            logger.exception("Failed to list sessions")
            return {"error": "Failed to list sessions"}

    def get_messages(self, session_id, directory=None):
        try:
            msgs = get_session_messages(session_id, directory=directory)
            result = []
            for m in msgs:
                blocks = []
                role = parse_message(m.message, blocks)
                if role and blocks:
                    result.append({"role": role, "blocks": blocks})
            tokens = 0
            try:
                tokens = find_session_tokens(session_id)
            except Exception:
                pass
            return {"messages": result, "tokens": tokens}
        except Exception:
            logger.exception("Failed to get messages for session %s", session_id)
            return {"error": "Failed to load"}

    # -- Streaming (each query in its own thread via ClaudeSDKClient) --

    def send_message(self, prompt, session_id=None, cwd=None, perm_mode="bypassPermissions", model="sonnet"):
        threading.Thread(target=self._run_query, args=(prompt, session_id, cwd, perm_mode, model), daemon=True).start()
        return {"status": "started"}

    def _run_query(self, prompt, session_id, cwd, perm_mode, model):
        tid = threading.current_thread().ident
        self._allowed_tools[tid] = set()
        try:
            asyncio.run(self._stream_query(prompt, session_id, cwd, perm_mode, model))
        except Exception as e:
            logger.exception("Query thread failed: %s", e)
            self._emit("error", {"message": str(e)})
        finally:
            self._allowed_tools.pop(tid, None)

    async def _stream_query(self, prompt, session_id=None, cwd=None, perm_mode="bypassPermissions", model="sonnet"):
        is_resume = session_id and not session_id.startswith("new-")
        opts = ClaudeAgentOptions(model=model or "sonnet", permission_mode=perm_mode)
        if is_resume:
            opts.resume = session_id
            opts.continue_conversation = True
            if cwd: opts.cwd = cwd
        else:
            opts.cwd = cwd or os.path.expanduser("~")
        if perm_mode not in ("bypassPermissions", "plan"):
            opts.can_use_tool = self._permission_handler
            opts.hooks = {"PreToolUse": [HookMatcher(matcher=None, hooks=[_dummy_hook])]}

        logger.info("Query: session=%s mode=%s model=%s", session_id, perm_mode, model)
        try:
            async with ClaudeSDKClient(opts) as client:
                await client.query(prompt)
                async for msg in client.receive_response():
                    if isinstance(msg, AssistantMessage):
                        sid = getattr(msg, "session_id", "")
                        for block in msg.content:
                            if isinstance(block, TextBlock):
                                if "prompt is too long" in block.text.lower() and is_resume:
                                    await self._auto_compact(prompt, session_id, cwd, perm_mode, model)
                                    return
                                self._emit("assistant_text", {"text": block.text, "session_id": sid})
                            elif isinstance(block, ToolUseBlock):
                                self._emit("tool_use", {"id": block.id, "name": block.name,
                                    "input": block.input if isinstance(block.input, dict) else str(block.input)})
                            elif isinstance(block, ToolResultBlock):
                                self._emit("tool_result", {"tool_use_id": block.tool_use_id,
                                    "content": extract_content(block.content)[:5000], "is_error": block.is_error})
                    elif isinstance(msg, ResultMessage):
                        sid = getattr(msg, "session_id", "")
                        cost = getattr(msg, "total_cost_usd", 0) or getattr(msg, "cost_usd", 0)
                        usage = getattr(msg, "usage", None)
                        tokens = 0
                        if usage and isinstance(usage, dict):
                            tokens = sum(usage.get(k, 0) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
                        self._emit("result", {"session_id": sid, "cost": cost, "tokens": tokens})
        except Exception as e:
            logger.exception("Query failed: %s", e)
            self._emit("error", {"message": str(e)})

    async def _auto_compact(self, prompt, session_id, cwd, perm_mode, model):
        for attempt in range(3):
            self._emit("assistant_text", {"text": f"Compacting ({attempt + 1}/3)...\n", "session_id": session_id})
            opts = ClaudeAgentOptions(resume=session_id, continue_conversation=True, model=model or "sonnet",
                                     permission_mode="bypassPermissions")
            if cwd: opts.cwd = cwd
            try:
                async with ClaudeSDKClient(opts) as client:
                    await client.query("/compact")
                    ok = True
                    async for msg in client.receive_response():
                        if isinstance(msg, AssistantMessage):
                            for b in msg.content:
                                if isinstance(b, TextBlock) and "rate limit" in b.text.lower():
                                    ok = False; break
                if ok:
                    await asyncio.sleep(2)
                    await self._stream_query(prompt, session_id, cwd, perm_mode, model)
                    return
            except Exception as e:
                if "rate limit" not in str(e).lower():
                    self._emit("error", {"message": f"Compact failed: {e}"}); return
            self._emit("assistant_text", {"text": f"Rate limited, waiting {15*(attempt+1)}s...\n", "session_id": session_id})
            await asyncio.sleep(15 * (attempt + 1))
        self._emit("error", {"message": "Compact failed after retries."})

    # -- Utilities --

    def _emit(self, event_type, data):
        if self.window:
            self.window.evaluate_js(f"window.onBordEvent({json.dumps({'type': event_type, 'data': data})})")

    def pick_directory(self) -> str | None:
        result = self.window.create_file_dialog(webview.FOLDER_DIALOG, directory=os.path.expanduser("~"))
        return result[0] if result and len(result) > 0 else None

    def rename(self, session_id, new_name):
        try:
            rename_session(session_id, new_name)
            return {"ok": True}
        except Exception:
            logger.exception("Failed to rename session %s", session_id)
            return {"error": "Failed to rename"}

    def delete(self, session_id):
        try:
            delete_session(session_id)
            return {"ok": True}
        except Exception:
            logger.exception("Failed to delete session %s", session_id)
            return {"error": "Failed to delete"}

    def load_settings(self):
        try:
            return json.loads(SETTINGS_FILE.read_text(encoding="utf-8")) if SETTINGS_FILE.exists() else {}
        except Exception:
            return {}

    def save_settings(self, data):
        try:
            SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
            SETTINGS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
            return {"ok": True}
        except Exception:
            return {"error": "Failed to save settings"}


def _cleanup() -> None:
    import subprocess
    try:
        subprocess.run(["pkill", "-f", "claude.*stream-json"], capture_output=True, timeout=5)
    except Exception:
        pass


def main() -> None:
    atexit.register(_cleanup)
    signal.signal(signal.SIGTERM, lambda *_: (_cleanup(), os._exit(0)))
    api = BordAPI()
    window = webview.create_window(
        "Vanadis Bord", url=str(Path(__file__).parent / "ui" / "index.html"), js_api=api,
        width=1400, height=900, min_size=(900, 600),
    )
    api.window = window
    webview.start(debug=False)
    _cleanup()


if __name__ == "__main__":
    main()
