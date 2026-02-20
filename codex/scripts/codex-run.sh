#!/bin/bash
# codex-run.sh — Parameterized CLI wrapper for codex exec.
# Single entry point for all codex invocations.
#
# Usage: codex-run.sh [options] <prompt_file>
#   -m MODEL    Model name (default: gpt-5.3-codex)
#   -r EFFORT   Reasoning effort (default: xhigh)
#   -s SANDBOX  Sandbox mode (default: read-only)
#   -C DIR      Working directory
#   --resume    Resume last session
#   --full-auto Enable full auto mode

set -euo pipefail

# Defaults
MODEL="gpt-5.3-codex"
EFFORT="xhigh"
SANDBOX="read-only"
FULL_AUTO=""
RESUME=false
CWD=""

usage() {
  cat <<'USAGE'
Usage: codex-run.sh [options] <prompt_file>

Options:
  -m MODEL      Model name (default: gpt-5.3-codex)
  -r EFFORT     Reasoning effort: medium|high|xhigh (default: xhigh)
  -s SANDBOX    Sandbox: read-only|workspace-write|danger-full-access (default: read-only)
  -C DIR        Working directory for codex
  --resume      Resume last codex session
  --full-auto   Enable full auto mode
  -h, --help    Show this help

Examples:
  codex-run.sh /tmp/codex_prompt_a3f9.txt
  codex-run.sh -m gpt-5.2-codex -r high /tmp/codex_prompt_a3f9.txt
  codex-run.sh --resume /tmp/codex_prompt_a3f9.txt
  codex-run.sh -s workspace-write --full-auto /tmp/codex_prompt_a3f9.txt
USAGE
  exit "${1:-0}"
}

# Parse options
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m) MODEL="$2"; shift 2 ;;
    -r) EFFORT="$2"; shift 2 ;;
    -s) SANDBOX="$2"; shift 2 ;;
    -C) CWD="$2"; shift 2 ;;
    --resume) RESUME=true; shift ;;
    --full-auto) FULL_AUTO="--full-auto"; shift ;;
    -h|--help) usage 0 ;;
    -*) echo "Unknown option: $1" >&2; usage 1 ;;
    *) PROMPT_FILE="$1"; shift ;;
  esac
done

# Validate prompt file
if [[ -z "${PROMPT_FILE:-}" ]]; then
  echo "Error: prompt_file is required" >&2
  usage 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

# Build CWD flag
CWD_FLAG=""
if [[ -n "$CWD" ]]; then
  CWD_FLAG="-C $CWD"
fi

# Execute
if [[ "$RESUME" == true ]]; then
  cat "$PROMPT_FILE" | codex exec --skip-git-repo-check resume --last 2>/dev/null
else
  cat "$PROMPT_FILE" | codex exec --skip-git-repo-check \
    -m "$MODEL" \
    --config model_reasoning_effort="$EFFORT" \
    --sandbox "$SANDBOX" \
    $FULL_AUTO $CWD_FLAG 2>/dev/null
fi
