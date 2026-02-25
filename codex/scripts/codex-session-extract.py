#!/usr/bin/env python3
"""Extract context from Codex session JSONL files.

Usage:
    codex-session-extract.py <partial-uuid>           # Find and summarize
    codex-session-extract.py <partial-uuid> --list     # List matches only
    codex-session-extract.py <partial-uuid> --full     # Include reasoning blocks
    codex-session-extract.py --recent [N]              # Show N most recent sessions (default: 5)
"""

import json
import re
import subprocess
import sys
from pathlib import Path

SESSIONS_DIR = Path.home() / ".codex" / "sessions"


def find_sessions(partial_uuid: str) -> list[Path]:
    """Find session files matching a partial UUID."""
    result = subprocess.run(
        ["find", str(SESSIONS_DIR), "-name", f"*{partial_uuid}*", "-type", "f"],
        capture_output=True,
        text=True,
    )
    paths = [Path(p) for p in result.stdout.strip().splitlines() if p]
    return sorted(paths)


def recent_sessions(n: int = 5) -> list[Path]:
    """Return the N most recently modified session files."""
    result = subprocess.run(
        ["find", str(SESSIONS_DIR), "-name", "*.jsonl", "-type", "f"],
        capture_output=True,
        text=True,
    )
    paths = [Path(p) for p in result.stdout.strip().splitlines() if p]
    return sorted(paths, key=lambda p: p.stat().st_mtime, reverse=True)[:n]


def parse_session(path: Path, include_reasoning: bool = False) -> dict:
    """Parse a Codex session JSONL and extract structured context."""
    meta = None
    messages = []
    reasoning = []
    function_calls = []
    token_usage = None
    user_prompts = []
    turns = []

    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            event_type = obj.get("type", "")
            payload = obj.get("payload", {})

            if event_type == "session_meta":
                meta = payload

            elif event_type == "event_msg":
                sub_type = payload.get("type", "")
                if sub_type == "agent_message":
                    messages.append(payload.get("message", ""))
                elif sub_type == "agent_reasoning":
                    reasoning.append(payload.get("text", ""))
                elif sub_type == "token_count":
                    info = payload.get("info")
                    if info:
                        token_usage = info.get("total_token_usage")

            elif event_type == "response_item":
                role = payload.get("role")
                if role == "user":
                    content = payload.get("content", [])
                    for c in content:
                        if isinstance(c, dict) and c.get("text"):
                            user_prompts.append(c["text"])
                        elif isinstance(c, str):
                            user_prompts.append(c)
                item_type = payload.get("type")
                if item_type == "function_call":
                    function_calls.append(
                        {
                            "name": payload.get("name", ""),
                            "arguments": payload.get("arguments", ""),
                        }
                    )

            elif event_type == "turn_context":
                turns.append(payload)

    result = {
        "path": str(path),
        "meta": meta,
        "user_prompts": user_prompts,
        "messages": messages,
        "function_calls": function_calls,
        "token_usage": token_usage,
        "turn_count": len(turns),
    }
    if include_reasoning:
        result["reasoning"] = reasoning
    return result


def format_meta(meta: dict | None) -> str:
    """Format session metadata as markdown."""
    if not meta:
        return "*(no metadata)*"
    lines = []
    lines.append(f"- **Session ID**: `{meta.get('id', 'unknown')}`")
    lines.append(f"- **CWD**: `{meta.get('cwd', 'unknown')}`")
    lines.append(f"- **CLI Version**: {meta.get('cli_version', 'unknown')}")
    lines.append(f"- **Model Provider**: {meta.get('model_provider', 'unknown')}")
    git = meta.get("git", {})
    if git:
        lines.append(
            f"- **Git**: `{git.get('branch', '?')}` @ `{git.get('commit_hash', '?')[:12]}`"
        )
    instructions = meta.get("instructions", "")
    if instructions:
        preview = instructions[:200].replace("\n", " ")
        if len(instructions) > 200:
            preview += "..."
        lines.append(f"- **Instructions preview**: {preview}")
    return "\n".join(lines)


_FILENAME_RE = re.compile(
    r"rollout-(\d{4}-\d{2}-\d{2})T(\d{2}-\d{2}-\d{2})-(.+)"
)


def format_list(paths: list[Path]) -> str:
    """Format a list of session paths as a table."""
    lines = ["| # | Date | Time | UUID | Size |", "|---|------|------|------|------|"]
    for i, p in enumerate(paths, 1):
        m = _FILENAME_RE.match(p.stem)
        if m:
            date_str = m.group(1)
            time_str = m.group(2).replace("-", ":")
            uuid_part = m.group(3)
        else:
            date_str = "unknown"
            time_str = ""
            uuid_part = p.stem
        size_kb = p.stat().st_size / 1024
        lines.append(
            f"| {i} | {date_str} | {time_str} | `{uuid_part[:36]}` | {size_kb:.0f}KB |"
        )
    return "\n".join(lines)


def format_summary(data: dict) -> str:
    """Format extracted session data as markdown summary."""
    lines = []
    lines.append(f"## Codex Session Context")
    lines.append(f"**File**: `{data['path']}`\n")

    lines.append("### Metadata")
    lines.append(format_meta(data["meta"]))
    lines.append("")

    if data["user_prompts"]:
        lines.append("### User Prompts")
        for i, prompt in enumerate(data["user_prompts"], 1):
            preview = prompt[:500]
            if len(prompt) > 500:
                preview += f"\n\n*...truncated ({len(prompt)} chars total)*"
            lines.append(f"**Prompt {i}:**\n{preview}\n")

    if data["messages"]:
        lines.append("### Agent Output")
        for i, msg in enumerate(data["messages"], 1):
            lines.append(f"**Message {i}:**\n{msg}\n")

    if data.get("reasoning"):
        lines.append("### Reasoning Blocks")
        for i, r in enumerate(data["reasoning"], 1):
            preview = r[:300]
            if len(r) > 300:
                preview += "..."
            lines.append(f"**Block {i}:** {preview}\n")

    if data["function_calls"]:
        lines.append("### Function Calls")
        lines.append(f"Total: {len(data['function_calls'])} calls")
        for fc in data["function_calls"][:10]:
            lines.append(f"- `{fc['name']}`")
        if len(data["function_calls"]) > 10:
            lines.append(f"- *...and {len(data['function_calls']) - 10} more*")
        lines.append("")

    stats = []
    stats.append(f"- **Turns**: {data['turn_count']}")
    if data["token_usage"]:
        inp = data["token_usage"].get("input_tokens", 0)
        out = data["token_usage"].get("output_tokens", 0)
        stats.append(f"- **Tokens**: {inp:,} in / {out:,} out")
    lines.append("### Stats")
    lines.extend(stats)

    return "\n".join(lines)


def main():
    args = sys.argv[1:]

    if not args:
        print(__doc__)
        sys.exit(1)

    if args[0] == "--recent":
        n = int(args[1]) if len(args) > 1 else 5
        paths = recent_sessions(n)
        if not paths:
            print("No sessions found.")
            sys.exit(0)
        print(f"## Recent {len(paths)} Codex Sessions\n")
        print(format_list(paths))
        sys.exit(0)

    partial_uuid = args[0]
    list_only = "--list" in args
    include_reasoning = "--full" in args

    paths = find_sessions(partial_uuid)

    if not paths:
        print(f"No sessions found matching `{partial_uuid}`.")
        sys.exit(1)

    if len(paths) > 1 or list_only:
        print(f"## Found {len(paths)} session(s) matching `{partial_uuid}`\n")
        print(format_list(paths))
        if not list_only:
            print(f"\nUsing first match: `{paths[0]}`\n")
            data = parse_session(paths[0], include_reasoning)
            print(format_summary(data))
    else:
        data = parse_session(paths[0], include_reasoning)
        print(format_summary(data))


if __name__ == "__main__":
    main()
