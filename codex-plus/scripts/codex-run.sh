#!/bin/bash
# codex-run.sh — Parameterized CLI wrapper for codex exec.
# Single entry point for all codex invocations. Run with -h for usage.

set -euo pipefail

# `cd` consults CDPATH for a relative target and then echoes the directory it
# picked to stdout — which would silently corrupt the command substitutions
# below. Neutralize it once, and use `cd -P` everywhere: the kernel resolves
# `symlink/..` physically when it opens a file, so logical `cd` would pin a
# different directory than the one the path actually names.
CDPATH=

# Defaults
readonly DEFAULT_MODEL="gpt-5.6-sol"
readonly DEFAULT_EFFORT="xhigh"
# workspace-write, not read-only, for one reason: the network. codex exposes no
# network switch under read-only — the toggle lives in the
# sandbox_workspace_write table and does nothing while the mode is read-only
# (verified on 0.144.6: the same request is blocked with the key and without
# it). Reaching the network therefore costs workspace writes. That cost is
# being paid, not a judgment that codex ought to be writing. What holds a run
# to its lane is the role its prompt declares — skills/codex/SKILL.md requires
# every prompt to state one — not the sandbox.
readonly DEFAULT_SANDBOX="workspace-write"

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
  -m, --model MODEL      Model name (default: gpt-5.6-sol)
  -r, --effort EFFORT    Reasoning effort: medium|high|xhigh|max (default: xhigh)
  -s, --sandbox SANDBOX  Sandbox: read-only|workspace-write|danger-full-access
                         (default: workspace-write, which this wrapper always
                         runs with network access enabled). read-only has no
                         network at all — codex offers no switch for it there
  -C, --cwd DIR          Working directory for codex. Pass it again when
                         resuming: `codex exec resume` has no --cd of its own,
                         so this script cd's there before handing off
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

Examples (<scratchpad> = the calling session's scratchpad directory):
  codex-run.sh <scratchpad>/codex_prompt_a3f9.txt
  codex-run.sh -m gpt-5.6-terra -r high <scratchpad>/codex_prompt_a3f9.txt
  codex-run.sh -S 019e3eff-c191-7401-bffb-bb8c31ac37c7 <scratchpad>/codex_prompt_a3f9.txt
  codex-run.sh -s workspace-write --full-auto <scratchpad>/codex_prompt_a3f9.txt
USAGE
  exit "${1:-0}"
}

# Parse options.
#
# -S, -C and -o are checked for emptiness, not merely for presence: each is
# tested with -n further down, so an empty value there is indistinguishable from
# the option never being passed. A caller whose variable came up empty would
# silently get a new session, its own cwd, or no capture at all. -m/-r/-s carry
# no such check — their values are always handed through to codex, so an empty
# one is codex's to reject in the open rather than something this script
# swallows. The asymmetry is the point; it is not an oversight to even out.
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--model) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; MODEL="$2"; shift 2 ;;
    -r|--effort) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; EFFORT="$2"; shift 2 ;;
    -s|--sandbox) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; SANDBOX="$2"; shift 2 ;;
    -C|--cwd) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; CWD="$2"; shift 2 ;;
    -S|--session-id) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; SESSION_ID="$2"; shift 2 ;;
    -o|--output-last-message) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; OUTPUT_FILE="$2"; shift 2 ;;
    --full-auto) FULL_AUTO=true; shift ;;
    -h|--help) usage 0 ;;
    -*) echo "Unknown option: $1" >&2; usage 1 ;;
    *) [[ -z "${PROMPT_FILE:-}" ]] || { echo "Error: only one prompt file is accepted, got \"$PROMPT_FILE\" and \"$1\"" >&2; usage 1; }; PROMPT_FILE="$1"; shift ;;
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

# Resolve paths to absolute BEFORE the resume branch changes directory below —
# a relative path would otherwise be re-resolved against the new cwd, silently
# reading the wrong prompt or writing the answer somewhere else. The resolution
# runs through command substitution, which strips trailing newlines: a path
# ending in one would resolve to a different sibling and read it without a word.
# Reject that shape up front instead. Every path operand is passed after `--`,
# so a leading dash is a directory name here, never an option.
if [[ "$PROMPT_FILE" == *$'\n'* || "$OUTPUT_FILE" == *$'\n'* ]]; then
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

# Resolve codex itself before the resume branch cd's below: PATH lookup happens
# at exec time, so a relative PATH entry would be re-rooted at the new directory
# and could hand the prompt to an entirely different binary.
CODEX_BIN="$(command -v codex)" || {
  echo "Error: codex not found on PATH" >&2
  exit 1
}
[[ "$CODEX_BIN" == /* ]] || CODEX_BIN="$PWD/$CODEX_BIN"

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
  if [[ ${#IGNORED[@]} -gt 0 ]]; then
    echo "Warning: resume ignores options: ${IGNORED[*]} (uses session settings)" >&2
  fi
  # -C is NOT one of them. `codex exec resume` has no --cd, so a resumed turn
  # runs in whatever cwd it inherits — not the session's original directory.
  # Restore the scope here; otherwise every pointer in the prompt silently
  # re-resolves against the caller's tree.
  if [[ -n "$CWD" ]]; then
    cd -P -- "$CWD"
  fi
  CODEX_ARGS+=(resume "$SESSION_ID")
else
  CODEX_ARGS+=(-m "$MODEL" --config "model_reasoning_effort=$EFFORT" --sandbox "$SANDBOX")
  # The mode and the network are two separate switches: workspace-write on its
  # own still blocks every outbound connection. Since the network is the whole
  # reason this wrapper defaults to that mode, bind them here — `-s
  # workspace-write` must never quietly mean "writes, but still no network".
  [[ "$SANDBOX" == "workspace-write" ]] && CODEX_ARGS+=(--config "sandbox_workspace_write.network_access=true")
  [[ "$FULL_AUTO" == true ]] && CODEX_ARGS+=(--full-auto)
  [[ -n "$CWD" ]] && CODEX_ARGS+=(-C "$CWD")
fi

# Hand off to codex. stdout = readable agent answer; stderr = codex banner,
# which includes "session id: <uuid>". Neither is suppressed: the calling
# subagent reads the session id (and any failure) straight from the output,
# so no in-script regex extraction is needed. exec propagates codex's exit
# code unchanged.
exec "$CODEX_BIN" "${CODEX_ARGS[@]}" < "$PROMPT_FILE"
