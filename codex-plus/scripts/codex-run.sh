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
SESSION_ID=""
CWD=""
OUTPUT_FILE=""

usage() {
  cat <<'USAGE'
Usage: codex-run.sh [options] <prompt_file>

Options:
  -m, --model MODEL      Model name (default: gpt-5.5)
  -r, --effort EFFORT    Reasoning effort: medium|high|xhigh (default: xhigh)
  -s, --sandbox SANDBOX  Sandbox: read-only|workspace-write|danger-full-access (default: read-only)
  -C, --cwd DIR          Working directory for codex
  -S, --session-id ID    Resume a specific session by UUID (deterministic;
                         the only resume path — there is no --last fallback)
  -o, --output-last-message FILE
                         Also write codex's final message to FILE (deterministic
                         capture, decoupled from stdout banner noise)
  --full-auto            Enable full auto mode
  -h, --help             Show this help

codex prints "session id: <uuid>" to stderr on every run. stderr is not
suppressed, so the caller (a subagent) reads that line directly and resumes
that exact session later with -S. Resume is always by explicit id — there is
no most-recent fallback, so it is never a race under parallel sessions.

Examples:
  codex-run.sh /tmp/codex_prompt_a3f9.txt
  codex-run.sh -m gpt-5.4 -r high /tmp/codex_prompt_a3f9.txt
  codex-run.sh -S 019e3eff-c191-7401-bffb-bb8c31ac37c7 /tmp/codex_prompt_a3f9.txt
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
    -S|--session-id) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; SESSION_ID="$2"; shift 2 ;;
    -o|--output-last-message) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; OUTPUT_FILE="$2"; shift 2 ;;
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

# Build codex argv. Resume iff a session id was given.
CODEX_ARGS=(exec --skip-git-repo-check)
[[ -n "$OUTPUT_FILE" ]] && CODEX_ARGS+=(--output-last-message "$OUTPUT_FILE")
if [[ -n "$SESSION_ID" ]]; then
  # Warn if non-default options are passed with resume (they are ignored —
  # the session keeps its original settings).
  IGNORED=()
  [[ "$MODEL" != "$DEFAULT_MODEL" ]] && IGNORED+=("-m $MODEL")
  [[ "$EFFORT" != "$DEFAULT_EFFORT" ]] && IGNORED+=("-r $EFFORT")
  [[ "$SANDBOX" != "$DEFAULT_SANDBOX" ]] && IGNORED+=("-s $SANDBOX")
  [[ "$FULL_AUTO" == true ]] && IGNORED+=("--full-auto")
  [[ -n "$CWD" ]] && IGNORED+=("-C $CWD")
  if [[ ${#IGNORED[@]} -gt 0 ]]; then
    echo "Warning: resume ignores options: ${IGNORED[*]} (uses session settings)" >&2
  fi
  CODEX_ARGS+=(resume "$SESSION_ID")
else
  CODEX_ARGS+=(-m "$MODEL" --config "model_reasoning_effort=$EFFORT" --sandbox "$SANDBOX")
  [[ "$FULL_AUTO" == true ]] && CODEX_ARGS+=(--full-auto)
  [[ -n "$CWD" ]] && CODEX_ARGS+=(-C "$CWD")
fi

# Hand off to codex. stdout = readable agent answer; stderr = codex banner,
# which includes "session id: <uuid>". Neither is suppressed: the calling
# subagent reads the session id (and any failure) straight from the output,
# so no in-script regex extraction is needed. exec propagates codex's exit
# code unchanged.
exec codex "${CODEX_ARGS[@]}" < "$PROMPT_FILE"
