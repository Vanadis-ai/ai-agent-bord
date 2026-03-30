"""Vanadis Bord -- desktop AI chat application."""

import asyncio
import json
import logging
import os
import threading
from pathlib import Path

import webview

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    PermissionMode,
    ResultMessage,
    StreamEvent,
    SystemMessage,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
    get_session_messages,
    list_sessions,
    query,
    rename_session,
)

logger = logging.getLogger("bord")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")


class BordAPI:
    """Python backend exposed to JS via pywebview bridge."""

    def __init__(self):
        self.window = None
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()

    def _run_loop(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def _run_async(self, coro):
        return asyncio.run_coroutine_threadsafe(coro, self.loop)

    def get_sessions(self, directory=None):
        try:
            sessions = list_sessions(directory=directory, limit=50)
            return [
                {
                    "id": s.session_id,
                    "title": s.custom_title or s.summary or s.first_prompt or "Untitled",
                    "last_modified": s.last_modified,
                    "cwd": s.cwd or "",
                    "tag": s.tag or "",
                }
                for s in sessions
            ]
        except Exception:
            logger.exception("Failed to list sessions")
            return {"error": "Failed to list sessions"}

    def get_messages(self, session_id, directory=None):
        try:
            msgs = get_session_messages(session_id, directory=directory)
            result = []
            for m in msgs:
                msg = m.message
                blocks = []
                role = _parse_message(msg, blocks)
                if role and blocks:
                    result.append({"role": role, "blocks": blocks})
            return result
        except Exception:
            logger.exception("Failed to get messages for session %s", session_id)
            return {"error": "Failed to get messages"}

    def send_message(self, prompt, session_id=None, cwd=None, bypass=False):
        self._run_async(self._stream_query(prompt, session_id, cwd, bypass))
        return {"status": "started"}

    async def _stream_query(self, prompt, session_id=None, cwd=None, bypass=False):
        is_resume = session_id and not session_id.startswith("new-")
        opts = ClaudeAgentOptions(model="sonnet")
        if is_resume:
            opts.resume = session_id
            opts.continue_conversation = True
            if cwd:
                opts.cwd = cwd
        else:
            opts.cwd = cwd or os.path.expanduser("~")
        if bypass:
            opts.permission_mode = PermissionMode.DANGEROUSLY_SKIP_PERMISSIONS

        logger.info("Starting query: session=%s cwd=%s bypass=%s", session_id, cwd, bypass)

        try:
            async for msg in query(prompt=prompt, options=opts):
                if isinstance(msg, AssistantMessage):
                    sid = getattr(msg, "session_id", "")
                    for block in msg.content:
                        if isinstance(block, TextBlock):
                            self._emit("assistant_text", {"text": block.text, "session_id": sid})
                        elif isinstance(block, ToolUseBlock):
                            self._emit("tool_use", {
                                "id": block.id,
                                "name": block.name,
                                "input": block.input if isinstance(block.input, dict) else str(block.input),
                            })
                        elif isinstance(block, ToolResultBlock):
                            content = _extract_content(block.content)
                            self._emit("tool_result", {
                                "tool_use_id": block.tool_use_id,
                                "content": content[:5000],
                                "is_error": block.is_error,
                            })
                elif isinstance(msg, ResultMessage):
                    sid = getattr(msg, "session_id", "")
                    cost = getattr(msg, "cost_usd", 0)
                    self._emit("result", {"session_id": sid, "cost": cost})
                    logger.info("Query completed: session=%s cost=%s", sid, cost)
        except Exception as e:
            err_msg = str(e)
            logger.exception("Query failed: %s", err_msg)
            if "too long" in err_msg.lower():
                self._emit("error", {"message": "Session context is too long. Try starting a new session."})
            elif "exit code 1" in err_msg.lower():
                self._emit("error", {"message": f"Claude Code error: {err_msg}"})
            else:
                self._emit("error", {"message": err_msg})

    def _emit(self, event_type, data):
        if self.window:
            payload = json.dumps({"type": event_type, "data": data})
            self.window.evaluate_js(f"window.onBordEvent({payload})")

    def pick_directory(self) -> str | None:
        result = self.window.create_file_dialog(
            webview.FOLDER_DIALOG,
            directory=os.path.expanduser("~"),
        )
        if result and len(result) > 0:
            return result[0]
        return None

    def rename(self, session_id, new_name):
        try:
            rename_session(session_id, new_name)
            return {"ok": True}
        except Exception:
            logger.exception("Failed to rename session %s", session_id)
            return {"error": "Failed to rename"}


def _parse_message(msg: object, blocks: list) -> str | None:
    """Parse message into blocks list. Handles both typed SDK objects and raw dicts."""
    if isinstance(msg, (UserMessage, AssistantMessage)):
        role = "user" if isinstance(msg, UserMessage) else "assistant"
        for b in msg.content:
            _parse_block(b, blocks)
        return role
    if isinstance(msg, dict):
        role = msg.get("role", "")
        if role not in ("user", "assistant"):
            return None
        content = msg.get("content", [])
        if isinstance(content, str):
            blocks.append({"type": "text", "text": content})
            return role
        if isinstance(content, list):
            for b in content:
                _parse_block(b, blocks)
        return role
    return None


def _parse_block(b: object, blocks: list) -> None:
    """Parse a single content block (typed or dict) into blocks list."""
    if isinstance(b, TextBlock):
        blocks.append({"type": "text", "text": b.text})
    elif isinstance(b, ToolUseBlock):
        blocks.append({
            "type": "tool_use", "id": b.id, "name": b.name,
            "input": b.input if isinstance(b.input, dict) else str(b.input),
        })
    elif isinstance(b, ToolResultBlock):
        blocks.append({
            "type": "tool_result", "tool_use_id": b.tool_use_id,
            "content": _extract_content(b.content)[:2000], "is_error": b.is_error,
        })
    elif isinstance(b, dict):
        btype = b.get("type", "")
        if btype == "text":
            blocks.append({"type": "text", "text": b.get("text", "")})
        elif btype == "tool_use":
            blocks.append({
                "type": "tool_use", "id": b.get("id", ""),
                "name": b.get("name", ""), "input": b.get("input", {}),
            })
        elif btype == "tool_result":
            blocks.append({
                "type": "tool_result", "tool_use_id": b.get("tool_use_id", ""),
                "content": _extract_content(b.get("content", ""))[:2000],
                "is_error": b.get("is_error", False),
            })


def _extract_content(content):
    if isinstance(content, list):
        return "\n".join(
            bl.get("text", "") if isinstance(bl, dict) else str(bl)
            for bl in content
        )
    if not isinstance(content, str):
        return str(content)
    return content


def main() -> None:
    api = BordAPI()
    ui_dir = Path(__file__).parent / "ui"
    index_path = ui_dir / "index.html"
    window = webview.create_window(
        "Vanadis Bord",
        url=str(index_path),
        js_api=api,
        width=1400,
        height=900,
        min_size=(900, 600),
    )
    api.window = window
    webview.start(debug=False)


if __name__ == "__main__":
    main()
