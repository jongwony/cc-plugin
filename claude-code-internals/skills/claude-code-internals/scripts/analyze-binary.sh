#!/bin/bash
# Zero-Context Binary Analyzer
# Headless CLI로 바이너리 분석 실행, 결과만 반환
# 세션 로그 오염 방지를 위해 --no-session-persistence 사용
#
# Usage:
#   analyze-binary.sh <prompt_file> [allowed_tools]
#   analyze-binary.sh /tmp/internals_prompt.txt "Bash,Read,Glob,Grep"
#
# Prompt file should contain the full investigation prompt.
# The script injects BINARY_PATH as environment context.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="${1:-}"
ALLOWED_TOOLS="${2:-Bash,Read,Glob,Grep}"

# Validate prompt file
if [[ -z "$PROMPT_FILE" ]]; then
    echo "Usage: analyze-binary.sh <prompt_file> [allowed_tools]"
    echo "  prompt_file: Path to file containing investigation prompt"
    echo "  allowed_tools: Comma-separated tool list (default: Bash,Read,Glob,Grep)"
    exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
    echo "Error: Prompt file not found: $PROMPT_FILE"
    exit 1
fi

# Binary path 획득
source "$SCRIPT_DIR/find_installation.sh" 2>/dev/null

if [[ -z "${BINARY_PATH:-}" ]]; then
    echo "Error: Could not find Claude Code binary"
    exit 1
fi

# Inject binary path context and execute
{
    echo "BINARY_PATH=$BINARY_PATH"
    echo "---"
    cat "$PROMPT_FILE"
} | claude \
    --allowedTools "$ALLOWED_TOOLS" \
    --no-session-persistence \
    2>/dev/null
