"""Session parsing utilities. Workarounds for SDK limitations on large JSONL files."""

import json
import logging
import os

from claude_agent_sdk import (
    AssistantMessage,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)

logger = logging.getLogger("bord")


def find_custom_title(session_id: str) -> str | None:
    """Find custom title by scanning session JSONL backwards. Workaround for SDK bug on large files."""
    import glob as glob_mod
    files = glob_mod.glob(os.path.expanduser(f"~/.claude/projects/*/{session_id}.jsonl"))
    if not files:
        return None
    try:
        with open(files[0], "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            chunk_size = 1048576  # 1MB chunks
            pos = size
            while pos > 0:
                start = max(0, pos - chunk_size)
                f.seek(start)
                data = f.read(pos - start).decode("utf-8", errors="replace")
                for line in reversed(data.strip().split("\n")):
                    try:
                        entry = json.loads(line)
                        if entry.get("type") == "custom-title":
                            return entry.get("customTitle")
                    except (json.JSONDecodeError, KeyError):
                        continue
                pos = start
    except Exception:
        logger.debug("Failed to scan custom title for %s", session_id)
    return None


def find_session_model(session_id: str) -> str | None:
    """Find the model used in the last assistant message of a session."""
    import glob as glob_mod
    files = glob_mod.glob(os.path.expanduser(f"~/.claude/projects/*/{session_id}.jsonl"))
    if not files:
        return None
    try:
        with open(files[0], "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 524288))  # last 512KB
            tail = f.read().decode("utf-8", errors="replace")
        for line in reversed(tail.strip().split("\n")):
            try:
                entry = json.loads(line)
                model = entry.get("message", {}).get("model", "")
                if model:
                    return model
            except (json.JSONDecodeError, KeyError):
                continue
    except Exception:
        pass
    return None


def find_session_tokens(session_id: str) -> int:
    """Find total context tokens from the last assistant message in session JSONL."""
    import glob as glob_mod
    files = glob_mod.glob(os.path.expanduser(f"~/.claude/projects/*/{session_id}.jsonl"))
    if not files:
        return 0
    try:
        with open(files[0], "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 524288))
            tail = f.read().decode("utf-8", errors="replace")
        for line in reversed(tail.strip().split("\n")):
            try:
                entry = json.loads(line)
                usage = entry.get("message", {}).get("usage", {})
                if usage:
                    return (
                        usage.get("input_tokens", 0)
                        + usage.get("cache_creation_input_tokens", 0)
                        + usage.get("cache_read_input_tokens", 0)
                    )
            except (json.JSONDecodeError, KeyError):
                continue
    except Exception:
        pass
    return 0


def model_to_short(model_id: str) -> str:
    """Convert full model ID to short name (opus, sonnet, haiku)."""
    if not model_id:
        return "sonnet"
    m = model_id.lower()
    if "opus" in m:
        return "opus"
    if "haiku" in m:
        return "haiku"
    return "sonnet"


def parse_message(msg: object, blocks: list) -> str | None:
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
            "content": extract_content(b.content)[:2000], "is_error": b.is_error,
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
                "content": extract_content(b.get("content", ""))[:2000],
                "is_error": b.get("is_error", False),
            })


def extract_content(content):
    """Extract text content from various formats."""
    if isinstance(content, list):
        return "\n".join(
            bl.get("text", "") if isinstance(bl, dict) else str(bl)
            for bl in content
        )
    if not isinstance(content, str):
        return str(content)
    return content
