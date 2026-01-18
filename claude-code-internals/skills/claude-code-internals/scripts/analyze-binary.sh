#!/bin/bash
# Zero-Context Binary Analyzer
# Headless CLI로 바이너리 분석 실행, 결과만 반환
# 세션 로그 오염 방지를 위해 --no-session-persistence 사용

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QUERY="${1:-beta headers}"
MAX_LINES="${2:-30}"

# Binary path 획득
source "$SCRIPT_DIR/find_installation.sh" 2>/dev/null

if [[ -z "${BINARY_PATH:-}" ]]; then
    echo "Error: Could not find Claude Code binary"
    exit 1
fi

# Headless CLI 실행 (세션 미저장, JSON 출력)
claude -p "Search Claude Code binary at $BINARY_PATH for: $QUERY

Instructions:
1. Use: strings \"\$BINARY_PATH\" | grep -E '[relevant-pattern]' | head -$MAX_LINES
2. Show matching lines with context (-B1 -A1) if helpful
3. Summarize findings in 3-5 bullet points

Binary path: $BINARY_PATH" \
    --no-session-persistence \
    --output-format stream-json \
    2>/dev/null | jq -rs 'map(select(.type == "result") | .result) | .[0] // "No result"'
