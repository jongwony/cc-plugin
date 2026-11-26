#!/bin/bash
# agy-run.sh — Parameterized CLI wrapper for `agy --print`.
# Single entry point for all headless agy invocations. Run with -h for usage.

set -euo pipefail

# Neutralize CDPATH so `cd` never echoes a resolved directory to stdout and
# corrupts command substitutions. Use `cd -P` everywhere for physical path
# resolution.
CDPATH=

# Defaults
readonly DEFAULT_MODE="auto"
readonly DEFAULT_OUTPUT_FORMAT="json"

MODEL=""
EFFORT=""
MODE="$DEFAULT_MODE"
OUTPUT_FORMAT="$DEFAULT_OUTPUT_FORMAT"
SESSION_ID=""
CWD=""
SANDBOX=0
SKIP_PERMISSIONS=0
AGENT=""
ADD_DIRS=()
DISABLE_SLASH_COMMANDS=0
JSON_SCHEMA=""
PRINT_TIMEOUT=""
PROJECT=""
REMOTE_AGENT=0
SETTINGS=""
PROMPT_FILE=""

usage() {
  cat <<'USAGE'
Usage: agy-run.sh [options] <prompt_file>

Core options:
  -m, --model MODEL           Model slug from `agy models`. Omitted, agy uses
                              its configured default (and on resume, stays on
                              the session's recorded model).
  -r, --effort EFFORT         Reasoning effort: low|medium|high|xhigh|max.
                              Omitted, agy uses the model's/config's default.
  -M, --mode MODE             Execution mode: auto|accept-edits|plan
                              (default: auto).
  -f, --output-format FORMAT  Print-mode output format: json|text|stream-json
                              (default: json). Raw output is passed straight
                              through without in-script parsing. Note: `text`
                              omits `conversation_id`, so use `json` whenever
                              a session may be resumed.
  -S, --session-id ID         Resume a specific conversation by UUID
                              (`--conversation`). Deterministic — no --continue
                              fallback. Omit -m to stay on the session's
                              original model.
  -C, --cwd DIR               Working directory for agy (`cd -P` before exec,
                              since agy has no --cd flag). Pass it again on
                              resume so relative pointers resolve against the
                              same tree.
  -s, --sandbox               Run agy with `--sandbox` (terminal restrictions).
  --dangerously-skip-permissions
                              Pass `--dangerously-skip-permissions` to agy
                              (auto-approve all tool permission requests).

agy-specific options (see references/agy-features.md):
  -a, --agent AGENT           Agent for the CLI session (`--agent`).
  --add-dir DIR               Add a directory to the workspace (repeatable).
  --disable-slash-commands    Disable slash command and skill expansion.
  --json-schema SCHEMA        JSON schema string or path to enforce structured
                              output.
  --print-timeout DURATION    Time limit for print mode (e.g., 120s, 5m).
  --project PROJECT           Project ID or name for the CLI session.
  --remote-agent              Run conversations using remote agents.
  --settings SETTINGS         Session-only settings JSON object or file path.
  -h, --help                  Show this help.

Stdout and stderr are passed through untouched so the calling subagent reads
`conversation_id`, `response`, `usage`, and any errors directly from agy's
output. Exit code is propagated unchanged.

Examples (<scratchpad> = the calling session's scratchpad directory):
  agy-run.sh <scratchpad>/agy_prompt_a3f9.txt
  agy-run.sh -m gemini-4-neon-high -C /path/to/repo <scratchpad>/agy_prompt_a3f9.txt
  agy-run.sh -M plan -r high <scratchpad>/agy_prompt_a3f9.txt
  agy-run.sh -S 7d3d885d-0ccd-494a-9746-a9881dfa9341 -C /path/to/repo <scratchpad>/agy_prompt_b1c2.txt
USAGE
  exit "${1:-0}"
}

resolve_existing_path() {
  local p="$1"
  if [[ "$p" == *$'\n'* ]]; then
    echo "Error: paths containing newlines are not supported" >&2
    exit 1
  fi
  if [[ -d "$p" ]]; then
    (cd -P -- "$p" && pwd -P)
  elif [[ -e "$p" ]]; then
    printf '%s/%s\n' "$(cd -P -- "$(dirname -- "$p")" && pwd -P)" "$(basename -- "$p")"
  else
    printf '%s\n' "$p"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--model) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; MODEL="$2"; shift 2 ;;
    -r|--effort) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; EFFORT="$2"; shift 2 ;;
    -M|--mode) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; MODE="$2"; shift 2 ;;
    -f|--output-format) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; OUTPUT_FORMAT="$2"; shift 2 ;;
    -S|--session-id) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; SESSION_ID="$2"; shift 2 ;;
    -C|--cwd) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; CWD="$2"; shift 2 ;;
    -s|--sandbox) SANDBOX=1; shift ;;
    --dangerously-skip-permissions) SKIP_PERMISSIONS=1; shift ;;
    -a|--agent) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; AGENT="$2"; shift 2 ;;
    --add-dir) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; ADD_DIRS+=("$2"); shift 2 ;;
    --disable-slash-commands) DISABLE_SLASH_COMMANDS=1; shift ;;
    --json-schema) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; JSON_SCHEMA="$2"; shift 2 ;;
    --print-timeout) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; PRINT_TIMEOUT="$2"; shift 2 ;;
    --project) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; PROJECT="$2"; shift 2 ;;
    --remote-agent) REMOTE_AGENT=1; shift ;;
    --settings) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; SETTINGS="$2"; shift 2 ;;
    -h|--help) usage 0 ;;
    -*) echo "Unknown option: $1" >&2; usage 1 ;;
    *) [[ -z "$PROMPT_FILE" ]] || { echo "Error: only one prompt file is accepted, got \"$PROMPT_FILE\" and \"$1\"" >&2; usage 1; }; PROMPT_FILE="$1"; shift ;;
  esac
done

# Validate prompt file
if [[ -z "$PROMPT_FILE" ]]; then
  echo "Error: prompt_file is required" >&2
  usage 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

if [[ ! -s "$PROMPT_FILE" ]]; then
  echo "Error: prompt file is empty: $PROMPT_FILE" >&2
  exit 1
fi

# Resolve paths before any `cd -P -- "$CWD"` below so relative paths never
# silently re-root against the new working directory.
PROMPT_FILE="$(resolve_existing_path "$PROMPT_FILE")"

if [[ ${#ADD_DIRS[@]} -gt 0 ]]; then
  RESOLVED_ADD_DIRS=()
  for d in "${ADD_DIRS[@]}"; do
    RESOLVED_ADD_DIRS+=("$(resolve_existing_path "$d")")
  done
  ADD_DIRS=("${RESOLVED_ADD_DIRS[@]}")
fi

if [[ -n "$JSON_SCHEMA" && -f "$JSON_SCHEMA" ]]; then
  JSON_SCHEMA="$(resolve_existing_path "$JSON_SCHEMA")"
fi

if [[ -n "$SETTINGS" && -f "$SETTINGS" ]]; then
  SETTINGS="$(resolve_existing_path "$SETTINGS")"
fi

# Resolve agy binary before changing directory so a relative PATH entry cannot
# resolve to a different executable after `cd`.
AGY_BIN="$(command -v agy)" || {
  echo "Error: agy not found on PATH" >&2
  exit 1
}
[[ "$AGY_BIN" == /* ]] || AGY_BIN="$PWD/$AGY_BIN"

# Read prompt content (`agy --print` takes the prompt as its flag argument, not stdin).
PROMPT_CONTENT="$(<"$PROMPT_FILE")"

# Build agy argv.
AGY_ARGS=(--mode "$MODE" --output-format "$OUTPUT_FORMAT")
[[ -n "$MODEL" ]] && AGY_ARGS+=(--model "$MODEL")
[[ -n "$EFFORT" ]] && AGY_ARGS+=(--effort "$EFFORT")
[[ -n "$SESSION_ID" ]] && AGY_ARGS+=(--conversation "$SESSION_ID")
[[ "$SANDBOX" -eq 1 ]] && AGY_ARGS+=(--sandbox)
[[ "$SKIP_PERMISSIONS" -eq 1 ]] && AGY_ARGS+=(--dangerously-skip-permissions)
[[ -n "$AGENT" ]] && AGY_ARGS+=(--agent "$AGENT")
if [[ ${#ADD_DIRS[@]} -gt 0 ]]; then
  for d in "${ADD_DIRS[@]}"; do
    AGY_ARGS+=(--add-dir "$d")
  done
fi
[[ "$DISABLE_SLASH_COMMANDS" -eq 1 ]] && AGY_ARGS+=(--disable-slash-commands)
[[ -n "$JSON_SCHEMA" ]] && AGY_ARGS+=(--json-schema "$JSON_SCHEMA")
[[ -n "$PRINT_TIMEOUT" ]] && AGY_ARGS+=(--print-timeout "$PRINT_TIMEOUT")
[[ -n "$PROJECT" ]] && AGY_ARGS+=(--project "$PROJECT")
[[ "$REMOTE_AGENT" -eq 1 ]] && AGY_ARGS+=(--remote-agent)
[[ -n "$SETTINGS" ]] && AGY_ARGS+=(--settings "$SETTINGS")

# Attach the prompt directly with `=` so a prompt starting with `-` is never
# mistaken for a flag.
AGY_ARGS+=("--print=$PROMPT_CONTENT")

# Switch working directory if requested.
if [[ -n "$CWD" ]]; then
  cd -P -- "$CWD"
fi

# Hand off to agy with stdout/stderr unsuppressed and exit code propagated.
exec "$AGY_BIN" "${AGY_ARGS[@]}"
