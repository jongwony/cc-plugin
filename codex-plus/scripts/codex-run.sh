#!/bin/bash
# codex-run.sh — Parameterized CLI wrapper for codex exec.
# Single entry point for all codex invocations. Run with -h for usage.

set -euo pipefail

# Defaults
readonly DEFAULT_MODEL="gpt-5.5"
readonly DEFAULT_EFFORT="xhigh"
readonly DEFAULT_SANDBOX="read-only"

MODEL="$DEFAULT_MODEL"
EFFORT="$DEFAULT_EFFORT"
SANDBOX="$DEFAULT_SANDBOX"
FULL_AUTO=false
RESUME=false
CWD=""

usage() {
  cat <<'USAGE'
Usage: codex-run.sh [options] <prompt_file>

Options:
  -m, --model MODEL      Model name (default: gpt-5.5)
  -r, --effort EFFORT    Reasoning effort: medium|high|xhigh (default: xhigh)
  -s, --sandbox SANDBOX  Sandbox: read-only|workspace-write|danger-full-access (default: read-only)
  -C, --cwd DIR          Working directory for codex
  --resume               Resume last codex session
  --full-auto            Enable full auto mode
  -h, --help             Show this help

Examples:
  codex-run.sh /tmp/codex_prompt_a3f9.txt
  codex-run.sh -m gpt-5.4 -r high /tmp/codex_prompt_a3f9.txt
  codex-run.sh --resume /tmp/codex_prompt_a3f9.txt
  codex-run.sh -s workspace-write --full-auto /tmp/codex_prompt_a3f9.txt
USAGE
  exit "${1:-0}"
}

# Parse options
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--model) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; MODEL="$2"; shift 2 ;;
    -r|--effort) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; EFFORT="$2"; shift 2 ;;
    -s|--sandbox) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; SANDBOX="$2"; shift 2 ;;
    -C|--cwd) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; CWD="$2"; shift 2 ;;
    --resume) RESUME=true; shift ;;
    --full-auto) FULL_AUTO=true; shift ;;
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

# Execute
if [[ "$RESUME" == true ]]; then
  # Warn if non-default options are passed with --resume (they are ignored)
  IGNORED=()
  [[ "$MODEL" != "$DEFAULT_MODEL" ]] && IGNORED+=("-m $MODEL")
  [[ "$EFFORT" != "$DEFAULT_EFFORT" ]] && IGNORED+=("-r $EFFORT")
  [[ "$SANDBOX" != "$DEFAULT_SANDBOX" ]] && IGNORED+=("-s $SANDBOX")
  [[ "$FULL_AUTO" == true ]] && IGNORED+=("--full-auto")
  [[ -n "$CWD" ]] && IGNORED+=("-C $CWD")
  if [[ ${#IGNORED[@]} -gt 0 ]]; then
    echo "Warning: --resume ignores options: ${IGNORED[*]} (uses last session settings)" >&2
  fi
  codex exec --skip-git-repo-check resume --last 2>/dev/null < "$PROMPT_FILE"
else
  EXTRA_ARGS=()
  [[ "$FULL_AUTO" == true ]] && EXTRA_ARGS+=(--full-auto)
  [[ -n "$CWD" ]] && EXTRA_ARGS+=(-C "$CWD")
  codex exec --skip-git-repo-check \
    -m "$MODEL" \
    --config model_reasoning_effort="$EFFORT" \
    --sandbox "$SANDBOX" \
    ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"} 2>/dev/null < "$PROMPT_FILE"
fi
