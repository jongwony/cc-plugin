#!/bin/bash
# claude-run.sh — Parameterized CLI wrapper for `claude -p`.
# Single entry point for all Claude Code invocations. Run with -h for usage.

set -euo pipefail

# `cd` consults CDPATH for a relative target and then echoes the directory it
# picked to stdout — which would silently corrupt the command substitutions
# below. Neutralize it once, and use `cd -P` everywhere: the kernel resolves
# `symlink/..` physically when it opens a file, so logical `cd` would pin a
# different directory than the one the path actually names.
CDPATH=

# Defaults
# fable is what this plugin exists to reach. A consult wants a judgment from a
# model that is not the one already holding the question, and every caller of
# this wrapper — Claude Code or Codex — is a different model than fable.
# Execution delegation is the exception and takes `-m opus`; the default does
# not cover it, so skills/claude/SKILL.md requires the caller to pass it.
readonly DEFAULT_MODEL="fable"
# high, because of what this wrapper is for. Reaching for it means reaching past
# the loop already running the task — for more model and more thinking than that
# loop has — and a default one rung down quietly gives back part of what was
# being asked for. The ladder is low|medium|high|xhigh|max, and it is still a
# starting point: callers escalate to xhigh or max, or drop to medium or low for
# work that does not need the depth.
readonly DEFAULT_EFFORT="high"
# auto lets the run proceed unattended. `claude -p` is headless: there is no
# one to answer a permission prompt, so a mode that prompts is a mode that
# hangs. What holds a run to its lane is the role its prompt declares —
# skills/claude/SKILL.md requires every prompt to state one — not the mode.
readonly DEFAULT_PERMISSION_MODE="auto"

MODEL="$DEFAULT_MODEL"
EFFORT="$DEFAULT_EFFORT"
PERMISSION_MODE="$DEFAULT_PERMISSION_MODE"
SESSION_ID=""
FORK=0
CWD=""
OUTPUT_FILE=""
RUN_BASE=""
ADD_DIRS=()

usage() {
  cat <<'USAGE'
Usage: claude-run.sh [options] <prompt_file>

Options:
  -m, --model MODEL      Model alias or full name (default: fable; an execution
                         delegation passes -m opus, which the default does not
                         cover)
  -r, --effort EFFORT    Effort level: low|medium|high|xhigh|max (default: high,
                         since reaching for this wrapper means reaching past the
                         loop already running the task — still a starting point,
                         so escalate or drop it per task)
  -p, --permission-mode MODE
                         Permission mode: acceptEdits|auto|bypassPermissions|
                         manual|dontAsk|plan (default: auto). A headless run
                         has nobody to answer a prompt, so a prompting mode
                         hangs rather than asks
  -C, --cwd DIR          Working directory for the run. `claude` has no --cd of
                         its own, so this script cd's there before handing off.
                         Pass it again when resuming: pointers in the prompt
                         re-resolve against whatever tree the run lands in.
                         It does NOT relocate the prompt file, -o or -D — those
                         are resolved first, against the caller's directory
  -a, --add-dir DIR      Extra readable directory (repeatable). An access
                         grant, not a substitute for -C
  -S, --session-id ID    Resume that session by UUID (deterministic; the only
                         resume path — there is no most-recent fallback)
  -F, --fork             With -S, fork instead of continuing: the prior context
                         carries over under a newly minted session id
  -o, --output FILE      Also copy the final assistant message to FILE. The CLI
                         has no flag for this, so it is read out of the result
                         event after the run
  -D, --run-dir-base DIR Parent for this run's directory (default: $TMPDIR).
                         Pass the calling session's scratchpad so the artifacts
                         land where that session can read them
  -h, --help             Show this help

Every run gets its own directory holding prompt.txt, events.jsonl, stderr.log,
exit_status, result.json, final.md and run.json. The path and the session id
are printed on stdout as RUN_DIR: and SESSION_ID: lines, so the caller reads
both without parsing the stream. Resume is always by explicit id, so it is
never a race under parallel sessions.

Prerequisites: the `claude` CLI on PATH, and python3 (reads the JSON stream).

Examples (<scratchpad> = the calling session's scratchpad directory):
  claude-run.sh -D <scratchpad> <scratchpad>/claude_prompt_a3f9.txt
  claude-run.sh -r xhigh -o <scratchpad>/answer_fable.md <scratchpad>/claude_prompt_a3f9.txt
  claude-run.sh -S 6f1d1c22-... -C /path/to/repo <scratchpad>/claude_prompt_b7c2.txt
USAGE
  exit "${1:-0}"
}

# Parse options.
#
# -S, -C, -o, -D and -a are checked for emptiness, not merely for presence:
# each is tested with -n further down, so an empty value there is
# indistinguishable from the option never being passed. A caller whose variable
# came up empty would silently get a new session, its own cwd, or no capture at
# all. -m/-r/-p carry no such check — their values are always handed through to
# claude, so an empty one is claude's to reject in the open rather than
# something this script swallows.
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--model) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; MODEL="$2"; shift 2 ;;
    -r|--effort) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; EFFORT="$2"; shift 2 ;;
    -p|--permission-mode) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; PERMISSION_MODE="$2"; shift 2 ;;
    -C|--cwd) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; CWD="$2"; shift 2 ;;
    -a|--add-dir) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; ADD_DIRS+=("$2"); shift 2 ;;
    -S|--session-id) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; SESSION_ID="$2"; shift 2 ;;
    -F|--fork) FORK=1; shift ;;
    -o|--output) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; OUTPUT_FILE="$2"; shift 2 ;;
    -D|--run-dir-base) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; RUN_BASE="$2"; shift 2 ;;
    -h|--help) usage 0 ;;
    -*) echo "Unknown option: $1" >&2; usage 1 ;;
    *) [[ -z "${PROMPT_FILE:-}" ]] || { echo "Error: only one prompt file is accepted, got \"$PROMPT_FILE\" and \"$1\"" >&2; usage 1; }; PROMPT_FILE="$1"; shift ;;
  esac
done

if [[ -z "${PROMPT_FILE:-}" ]]; then
  echo "Error: prompt_file is required" >&2
  usage 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

if [[ $FORK -eq 1 && -z "$SESSION_ID" ]]; then
  echo "Error: -F/--fork requires -S/--session-id — there is nothing to fork from" >&2
  exit 1
fi

# Resolve paths to absolute BEFORE the cd below — a relative path would
# otherwise be re-resolved against the new cwd, silently reading the wrong
# prompt or writing the answer somewhere else. The resolution runs through
# command substitution, which strips trailing newlines: a path ending in one
# would resolve to a different sibling and read it without a word. Reject that
# shape up front instead. Every path operand is passed after `--`, so a leading
# dash is a directory name here, never an option.
if [[ "$PROMPT_FILE" == *$'\n'* || "$OUTPUT_FILE" == *$'\n'* || "$RUN_BASE" == *$'\n'* ]]; then
  echo "Error: paths containing newlines are not supported" >&2
  exit 1
fi
PROMPT_FILE="$(cd -P -- "$(dirname -- "$PROMPT_FILE")" && pwd -P)/$(basename -- "$PROMPT_FILE")"
if [[ -n "$OUTPUT_FILE" ]]; then
  OUTPUT_DIR="$(cd -P -- "$(dirname -- "$OUTPUT_FILE")" 2>/dev/null && pwd -P)" || {
    echo "Error: output directory not found: $(dirname -- "$OUTPUT_FILE")" >&2
    exit 1
  }
  OUTPUT_FILE="$OUTPUT_DIR/$(basename -- "$OUTPUT_FILE")"
fi

# Resolve the binaries before the cd below: PATH lookup happens at exec time, so
# a relative PATH entry would be re-rooted at the new directory and could hand
# the prompt to an entirely different binary.
CLAUDE_BIN="$(command -v claude)" || {
  echo "Error: claude not found on PATH" >&2
  exit 1
}
[[ "$CLAUDE_BIN" == /* ]] || CLAUDE_BIN="$PWD/$CLAUDE_BIN"
PYTHON_BIN="$(command -v python3)" || {
  echo "Error: python3 not found on PATH (needed to read the JSON stream)" >&2
  exit 1
}
[[ "$PYTHON_BIN" == /* ]] || PYTHON_BIN="$PWD/$PYTHON_BIN"

# The extractor sits beside this script. Resolve it here, before the cd below,
# and refuse to run without it: it is what rules on the outcome, so a run that
# cannot reach it has no verdict rather than a passing one.
SCRIPT_DIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
EXTRACTOR="$SCRIPT_DIR/claude-run-extract.py"
[[ -f "$EXTRACTOR" ]] || {
  echo "Error: extractor not found beside this script: $EXTRACTOR" >&2
  exit 1
}

# The run directory is created before the cd, under an absolute base, so the
# artifacts stay where the caller was told to look for them regardless of where
# the run itself executes.
if [[ -n "$RUN_BASE" ]]; then
  [[ -d "$RUN_BASE" ]] || { echo "Error: run-dir base not found: $RUN_BASE" >&2; exit 1; }
  RUN_BASE="$(cd -P -- "$RUN_BASE" && pwd -P)"
else
  RUN_BASE="${TMPDIR:-/tmp}"
fi
RUN_DIR="$(mktemp -d "${RUN_BASE%/}/claude-run.XXXXXXXX")"

# Mint the session id this run will carry. Lowercase: the CLI requires a valid
# UUID and the stream reports ids lowercased, so reconciling a minted uppercase
# id against the reported one would fail a string comparison that is really an
# agreement.
mint_uuid() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen | tr '[:upper:]' '[:lower:]'
  else
    "$PYTHON_BIN" -c 'import uuid; print(uuid.uuid4())'
  fi
}

# Build claude argv. Three shapes: a new session, a continued one, a fork.
CLAUDE_ARGS=(-p --output-format stream-json --verbose --include-partial-messages)
CLAUDE_ARGS+=(--model "$MODEL" --effort "$EFFORT" --permission-mode "$PERMISSION_MODE")
for d in ${ADD_DIRS[@]+"${ADD_DIRS[@]}"}; do
  CLAUDE_ARGS+=(--add-dir "$d")
done

RESUMED_FROM=""
if [[ -n "$SESSION_ID" ]]; then
  RESUMED_FROM="$SESSION_ID"
  CLAUDE_ARGS+=(--resume "$SESSION_ID")
  if [[ $FORK -eq 1 ]]; then
    ASSIGNED_ID="$(mint_uuid)"
    CLAUDE_ARGS+=(--fork-session --session-id "$ASSIGNED_ID")
  else
    ASSIGNED_ID="$SESSION_ID"
  fi
else
  ASSIGNED_ID="$(mint_uuid)"
  CLAUDE_ARGS+=(--session-id "$ASSIGNED_ID")
fi

# Keep the prompt beside the run's own artifacts. The caller's copy can be
# overwritten or cleaned up; a resumed turn's diagnosis needs the text that was
# actually sent.
cp -- "$PROMPT_FILE" "$RUN_DIR/prompt.txt"

if [[ -n "$CWD" ]]; then
  cd -P -- "$CWD"
fi
RUN_CWD="$PWD"

echo "RUN_DIR: $RUN_DIR"
echo "SESSION_ID: $ASSIGNED_ID"
[[ -n "$RESUMED_FROM" && "$RESUMED_FROM" != "$ASSIGNED_ID" ]] && echo "FORKED_FROM: $RESUMED_FROM"
[[ -n "$RESUMED_FROM" && "$RESUMED_FROM" == "$ASSIGNED_ID" ]] && echo "RESUMED: $RESUMED_FROM"

# Run. The exit status is captured immediately and persisted before anything
# else can overwrite $? — a run that failed must leave that fact on disk even
# if the extraction below then fails too.
set +e
"$CLAUDE_BIN" "${CLAUDE_ARGS[@]}" \
  < "$RUN_DIR/prompt.txt" \
  > "$RUN_DIR/events.jsonl" \
  2> "$RUN_DIR/stderr.log"
CLAUDE_STATUS=$?
set -e
printf '%s\n' "$CLAUDE_STATUS" > "$RUN_DIR/exit_status"

# Read the stream out into the files the caller reconciles against: result.json
# (the final result event), final.md (its answer text) and run.json (the
# coordinates and the verdict). The extractor decides the verdict, because it is
# the only thing here that has parsed the stream — and it says so through its
# exit status: 0 only when it has positively established a valid successful
# result, 1 for an established failure, anything else for a validation it could
# not finish. Every nonzero is a failed run below, so a broken interpreter, a
# truncated stream and a genuine error all fail closed rather than reading as
# success by default.
set +e
"$PYTHON_BIN" "$EXTRACTOR" \
  "$RUN_DIR" "$ASSIGNED_ID" "$RESUMED_FROM" "$RUN_CWD" "$CLAUDE_STATUS"
EXTRACT_STATUS=$?
set -e

if [[ -n "$OUTPUT_FILE" ]]; then
  if [[ -f "$RUN_DIR/final.md" ]]; then
    cp -- "$RUN_DIR/final.md" "$OUTPUT_FILE"
    echo "OUTPUT: $OUTPUT_FILE"
  else
    echo "Warning: no final message to write to $OUTPUT_FILE" >&2
  fi
fi

# A created session and a written file are not a completed task. The run passes
# only when the process exited zero AND the extractor established success.
if [[ "$CLAUDE_STATUS" -ne 0 ]]; then
  exit "$CLAUDE_STATUS"
fi
if [[ "$EXTRACT_STATUS" -eq 0 ]]; then
  exit 0
fi
if [[ "$EXTRACT_STATUS" -ne 1 ]]; then
  echo "Error: could not validate the run (extractor exited $EXTRACT_STATUS) — see $RUN_DIR" >&2
fi
exit 1
