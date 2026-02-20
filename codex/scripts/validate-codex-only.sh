#!/bin/bash
# Validates that Bash commands in codex-frontier agent are codex CLI only.
# PreToolUse hook: exit 0 = allow, exit 2 = deny.

INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$CMD" ]; then
  exit 0
fi

if echo "$CMD" | grep -qE '^\s*(codex\b|.*/codex-run\.sh\b)'; then
  exit 0
fi

echo "Blocked: Bash is restricted to codex CLI commands in this agent." >&2
exit 2
