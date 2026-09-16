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
readonly DEFAULT_MODEL="fable"
# medium is a starting point, not a ceiling. Raising effort is a per-call
# judgment made from the task in front of the caller; a default cannot read the
# task, so pinning the top of the ladder here spends it on every run that never
# needed it. The ladder is low|medium|high|xhigh|max. Callers escalate
# deliberately.
readonly DEFAULT_EFFORT="medium"
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
  -m, --model MODEL      Model alias or full name (default: fable)
  -r, --effort EFFORT    Effort level: low|medium|high|xhigh|max (default:
                         medium, a starting point rather than a ceiling —
                         escalate per task)
  -p, --permission-mode MODE
                         Permission mode: acceptEdits|auto|bypassPermissions|
                         manual|dontAsk|plan (default: auto). A headless run
                         has nobody to answer a prompt, so a prompting mode
                         hangs rather than asks
  -C, --cwd DIR          Working directory for the run. `claude` has no --cd of
                         its own, so this script cd's there before handing off.
                         Pass it again when resuming: pointers in the prompt
                         re-resolve against whatever tree the run lands in
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

# Read the stream out into the three files the caller reconciles against:
# result.json (the final result event), final.md (its answer text) and run.json
# (the coordinates). A stream that carries no result event is itself the
# finding, so the extractor reports that rather than inventing an empty answer.
"$PYTHON_BIN" - "$RUN_DIR" "$ASSIGNED_ID" "$RESUMED_FROM" "$RUN_CWD" "$CLAUDE_STATUS" <<'PY'
import json, os, sys

run_dir, assigned_id, resumed_from, run_cwd, exit_status = sys.argv[1:6]

first_session_id = None
result_event = None
with open(os.path.join(run_dir, "events.jsonl"), encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        if first_session_id is None and event.get("session_id"):
            first_session_id = event["session_id"]
        if event.get("type") == "result":
            result_event = event

answer = ""
if result_event is not None:
    with open(os.path.join(run_dir, "result.json"), "w", encoding="utf-8") as fh:
        json.dump(result_event, fh, ensure_ascii=False, indent=2)
    raw = result_event.get("result")
    answer = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False, indent=2)
    with open(os.path.join(run_dir, "final.md"), "w", encoding="utf-8") as fh:
        fh.write(answer)

run = {
    "assigned_session_id": assigned_id,
    "first_event_session_id": first_session_id,
    "resumed_from": resumed_from or None,
    "cwd": run_cwd,
    "exit_status": int(exit_status),
    "result_present": result_event is not None,
    "is_error": bool(result_event.get("is_error")) if result_event else None,
    "subtype": result_event.get("subtype") if result_event else None,
    "files": {
        "prompt": os.path.join(run_dir, "prompt.txt"),
        "events": os.path.join(run_dir, "events.jsonl"),
        "stderr": os.path.join(run_dir, "stderr.log"),
        "exit_status": os.path.join(run_dir, "exit_status"),
        "result": os.path.join(run_dir, "result.json") if result_event else None,
        "final": os.path.join(run_dir, "final.md") if result_event else None,
    },
}
with open(os.path.join(run_dir, "run.json"), "w", encoding="utf-8") as fh:
    json.dump(run, fh, ensure_ascii=False, indent=2)

# The session id the CLI reports is the one that actually exists. Say so when it
# disagrees with the minted one rather than letting a later resume fail on an id
# that was never real.
if first_session_id and first_session_id != assigned_id:
    print(f"SESSION_ID_MISMATCH: assigned {assigned_id}, stream reported {first_session_id}")
if result_event is None:
    print("RESULT: missing — the stream carried no result event")
else:
    print(f"RESULT: {result_event.get('subtype', 'unknown')}"
          + (" (is_error)" if result_event.get("is_error") else ""))
PY

if [[ -n "$OUTPUT_FILE" ]]; then
  if [[ -f "$RUN_DIR/final.md" ]]; then
    cp -- "$RUN_DIR/final.md" "$OUTPUT_FILE"
    echo "OUTPUT: $OUTPUT_FILE"
  else
    echo "Warning: no final message to write to $OUTPUT_FILE" >&2
  fi
fi

# A missing or failed result is a failed run even when the process exited zero:
# a created session and a written file are not a completed task.
if [[ "$CLAUDE_STATUS" -ne 0 ]]; then
  exit "$CLAUDE_STATUS"
fi
if [[ ! -f "$RUN_DIR/result.json" ]]; then
  exit 1
fi
if "$PYTHON_BIN" -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1])).get("is_error") else 1)' "$RUN_DIR/result.json"; then
  exit 1
fi
exit 0
