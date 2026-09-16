#!/bin/bash
# codex-run.sh — Parameterized CLI wrapper for codex exec and codex review.
# Single entry point for all codex invocations. Run with -h for usage.

set -euo pipefail

# `cd` consults CDPATH for a relative target and then echoes the directory it
# picked to stdout — which would silently corrupt the command substitutions
# below. Neutralize it once, and use `cd -P` everywhere: the kernel resolves
# `symlink/..` physically when it opens a file, so logical `cd` would pin a
# different directory than the one the path actually names.
CDPATH=

# Defaults
readonly DEFAULT_MODEL="gpt-6-astra"
# medium is a starting point, not a ceiling. Raising effort is a per-call
# judgment made from the task in front of the caller; a default cannot read the
# task, so pinning the top of the ladder here spends it on every run that never
# needed it. OpenAI's own guidance for the current generation is to start at
# medium and compare against neighbours on representative work rather than
# assume the highest effort wins. Callers escalate to high, xhigh or max
# deliberately.
#
# astra's ladder is low|medium|high|xhigh|max|ultra. It has no `none` rung, unlike
# the gpt-5.6 family — passing one is codex's error to report, not this
# script's to pre-empt.
readonly DEFAULT_EFFORT="medium"
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
SESSION_ID=""
CWD=""
OUTPUT_FILE=""
REVIEW=0
REVIEW_BASE=""
REVIEW_COMMIT=""
REVIEW_TITLE=""
REVIEW_UNCOMMITTED=0

usage() {
  cat <<'USAGE'
Usage: codex-run.sh [options] <prompt_file>
       codex-run.sh --review [scope] [options] [prompt_file]

Options:
  -m, --model MODEL      Model name (default: gpt-6-astra)
  -r, --effort EFFORT    Reasoning effort: low|medium|high|xhigh|max|ultra (default:
                         medium, a starting point rather than a ceiling —
                         escalate per task. astra has no `none` rung)
  -s, --sandbox SANDBOX  Sandbox: read-only|workspace-write|danger-full-access
                         (default: workspace-write, which this wrapper always
                         runs with network access enabled, and which already
                         applies edits unattended — `codex exec` is headless, so
                         there is no approval step to opt out of and no
                         --ask-for-approval to set). read-only has no network at
                         all — codex offers no switch for it there
  -C, --cwd DIR          Working directory for codex. Pass it again when
                         resuming: `codex exec resume` has no --cd of its own,
                         so this script cd's there before handing off
  -S, --session-id ID    Resume a specific session by UUID (deterministic;
                         the only resume path — there is no --last fallback).
                         A resumed turn does not inherit the session's model or
                         effort: pass -m and -r again to stay on them, or the
                         turn runs on whatever config.toml says. -s cannot be
                         set on resume at all
  -o, --output-last-message FILE
                         Also write codex's final message to FILE (deterministic
                         capture, decoupled from stdout banner noise)
  -h, --help             Show this help

Review mode (`codex review`: the review rubric as system prompt, prioritized
findings as the answer):
      --review           Run `codex review` instead of `codex exec`
  -b, --base BRANCH      Scope: the changes against BRANCH (merge base with HEAD)
      --commit SHA       Scope: the changes introduced by SHA
      --title TITLE      Commit title shown in the review summary (with --commit)
      --uncommitted      Scope: staged, unstaged and untracked changes

  `codex review` takes exactly one target: a scope flag or custom instructions,
  never both — clap rejects `--base main "<prompt>"`. This wrapper accepts a
  scope AND a prompt file together and composes the one target codex allows:
  the scope sentence codex would have rendered for that flag (merge base
  resolved here, in the target cwd, the way codex resolves it), a blank line,
  then the prompt file — sent as custom instructions on stdin. A scope alone is
  passed through as the flag; a prompt file alone is passed through as custom
  instructions. One scope at a time.

  `codex review` has no -m, -C, --sandbox or --output-last-message of its own:
  -m/-r/-s become `-c` config overrides, -C becomes a cd before the handoff,
  and -o captures stdout (the final message is all codex writes there; the
  banner and `session id:` go to stderr). -S is rejected: a review is not
  resumable.

codex prints "session id: <uuid>" to stderr on every run. stderr is not
suppressed, so the caller (a subagent) reads that line directly and resumes
that exact session later with -S. Resume is always by explicit id — there is
no most-recent fallback, so it is never a race under parallel sessions.

Examples (<scratchpad> = the calling session's scratchpad directory):
  codex-run.sh <scratchpad>/codex_prompt_a3f9.txt
  codex-run.sh -m gpt-5.6-terra -r xhigh <scratchpad>/codex_prompt_a3f9.txt
  codex-run.sh -S 019e3eff-c191-7401-bffb-bb8c31ac37c7 <scratchpad>/codex_prompt_a3f9.txt
  codex-run.sh --review -b main -r high -C ~/repo -o <scratchpad>/review_a3f9.md <scratchpad>/codex_prompt_a3f9.txt
  codex-run.sh --review --uncommitted -C ~/repo
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
# The review scopes (-b, --commit, --title) are in the first group: an empty
# scope value would be read below as "no scope given" and silently change which
# target codex reviews.
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--model) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; MODEL="$2"; shift 2 ;;
    -r|--effort) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; EFFORT="$2"; shift 2 ;;
    -s|--sandbox) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; SANDBOX="$2"; shift 2 ;;
    -C|--cwd) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; CWD="$2"; shift 2 ;;
    -S|--session-id) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; SESSION_ID="$2"; shift 2 ;;
    -o|--output-last-message) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; OUTPUT_FILE="$2"; shift 2 ;;
    --review) REVIEW=1; shift ;;
    -b|--base) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; REVIEW_BASE="$2"; shift 2 ;;
    --commit) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; REVIEW_COMMIT="$2"; shift 2 ;;
    --title) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; REVIEW_TITLE="$2"; shift 2 ;;
    --uncommitted) REVIEW_UNCOMMITTED=1; shift ;;
    -h|--help) usage 0 ;;
    -*) echo "Unknown option: $1" >&2; usage 1 ;;
    *) [[ -z "${PROMPT_FILE:-}" ]] || { echo "Error: only one prompt file is accepted, got \"$PROMPT_FILE\" and \"$1\"" >&2; usage 1; }; PROMPT_FILE="$1"; shift ;;
  esac
done

# Review-mode argument shape. Scope flags outside --review are rejected rather
# than ignored: a caller who typed -b expected a diff to be reviewed.
REVIEW_SCOPES=0
[[ -n "$REVIEW_BASE" ]] && REVIEW_SCOPES=$((REVIEW_SCOPES + 1))
[[ -n "$REVIEW_COMMIT" ]] && REVIEW_SCOPES=$((REVIEW_SCOPES + 1))
[[ "$REVIEW_UNCOMMITTED" -eq 1 ]] && REVIEW_SCOPES=$((REVIEW_SCOPES + 1))
if [[ "$REVIEW" -eq 1 ]]; then
  [[ -z "$SESSION_ID" ]] || { echo "Error: --review cannot resume a session (-S); a review is a fresh run" >&2; usage 1; }
  [[ "$REVIEW_SCOPES" -le 1 ]] || { echo "Error: --review takes one scope: -b/--base, --commit or --uncommitted" >&2; usage 1; }
  [[ -z "$REVIEW_TITLE" || -n "$REVIEW_COMMIT" ]] || { echo "Error: --title requires --commit" >&2; usage 1; }
  [[ "$REVIEW_SCOPES" -eq 1 || -n "${PROMPT_FILE:-}" ]] || { echo "Error: --review needs a scope (-b/--base, --commit, --uncommitted), a prompt file, or both" >&2; usage 1; }
else
  [[ "$REVIEW_SCOPES" -eq 0 && -z "$REVIEW_TITLE" ]] || { echo "Error: -b/--base, --commit, --title and --uncommitted apply to --review only" >&2; usage 1; }
  # Validate prompt file (exec mode: always required)
  if [[ -z "${PROMPT_FILE:-}" ]]; then
    echo "Error: prompt_file is required" >&2
    usage 1
  fi
fi

if [[ -n "${PROMPT_FILE:-}" && ! -f "$PROMPT_FILE" ]]; then
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
if [[ "${PROMPT_FILE:-}" == *$'\n'* || "$OUTPUT_FILE" == *$'\n'* ]]; then
  echo "Error: paths containing newlines are not supported" >&2
  exit 1
fi
if [[ -n "${PROMPT_FILE:-}" ]]; then
  PROMPT_FILE="$(cd -P -- "$(dirname -- "$PROMPT_FILE")" && pwd -P)/$(basename -- "$PROMPT_FILE")"
fi
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

# The scope sentence `codex review` renders for a scope flag, reproduced here so
# a scope and custom instructions can share the one target codex accepts. The
# wording is codex's own (codex-rs/prompts/src/review_request.rs); the merge base
# is resolved the way codex resolves it — against the branch's upstream when
# the remote is ahead of the local branch, else the local branch — and the
# wording without a sha is codex's own fallback when no merge base exists.
review_scope_sentence() {
  if [[ "$REVIEW_UNCOMMITTED" -eq 1 ]]; then
    printf '%s' "Review the current code changes (staged, unstaged, and untracked files) and provide prioritized findings."
  elif [[ -n "$REVIEW_COMMIT" ]]; then
    if [[ -n "$REVIEW_TITLE" ]]; then
      printf 'Review the code changes introduced by commit %s ("%s"). Provide prioritized, actionable findings.' "$REVIEW_COMMIT" "$REVIEW_TITLE"
    else
      printf 'Review the code changes introduced by commit %s. Provide prioritized, actionable findings.' "$REVIEW_COMMIT"
    fi
  else
    local ref="$REVIEW_BASE" upstream merge_base
    if upstream="$(git rev-parse --abbrev-ref --verify --quiet "$REVIEW_BASE@{upstream}" 2>/dev/null)" \
      && [[ -n "$upstream" ]] \
      && git merge-base --is-ancestor "$REVIEW_BASE" "$upstream" 2>/dev/null \
      && [[ "$(git rev-parse "$REVIEW_BASE" 2>/dev/null)" != "$(git rev-parse "$upstream" 2>/dev/null)" ]]; then
      ref="$upstream"
    fi
    if merge_base="$(git merge-base HEAD "$ref" 2>/dev/null)" && [[ -n "$merge_base" ]]; then
      printf "Review the code changes against the base branch '%s'. The merge base commit for this comparison is %s. Run \`git diff %s\` to inspect the changes relative to %s. Provide prioritized, actionable findings." "$REVIEW_BASE" "$merge_base" "$merge_base" "$REVIEW_BASE"
    else
      printf "Review the code changes against the base branch '%s'. Start by finding the merge diff between the current branch and %s's upstream e.g. (\`git merge-base HEAD \"\$(git rev-parse --abbrev-ref \"%s@{upstream}\")\"\`), then run \`git diff\` against that SHA to see what changes we would merge into the %s branch. Provide prioritized, actionable findings." "$REVIEW_BASE" "$REVIEW_BASE" "$REVIEW_BASE" "$REVIEW_BASE"
    fi
  fi
}

# Build codex argv.
if [[ "$REVIEW" -eq 1 ]]; then
  # `codex review` carries none of exec's flags: model, effort and sandbox go
  # through -c (verified on 0.154.0: the banner reports the overridden values),
  # the cwd is entered here because there is no --cd, and the final message is
  # captured from stdout because there is no --output-last-message.
  CODEX_ARGS=(review -c "model=\"$MODEL\"" -c "model_reasoning_effort=\"$EFFORT\"" -c "sandbox_mode=\"$SANDBOX\"")
  [[ "$SANDBOX" == "workspace-write" ]] && CODEX_ARGS+=(-c "sandbox_workspace_write.network_access=true")
  if [[ -n "$CWD" ]]; then
    cd -P -- "$CWD"
  fi
  if [[ "$REVIEW_SCOPES" -eq 1 && -z "${PROMPT_FILE:-}" ]]; then
    # Scope alone: codex renders the target itself.
    [[ "$REVIEW_UNCOMMITTED" -eq 1 ]] && CODEX_ARGS+=(--uncommitted)
    [[ -n "$REVIEW_BASE" ]] && CODEX_ARGS+=(--base "$REVIEW_BASE")
    [[ -n "$REVIEW_COMMIT" ]] && CODEX_ARGS+=(--commit "$REVIEW_COMMIT")
    [[ -n "$REVIEW_TITLE" ]] && CODEX_ARGS+=(--title "$REVIEW_TITLE")
    STDIN_SOURCE=/dev/null
  elif [[ "$REVIEW_SCOPES" -eq 1 ]]; then
    # Scope + instructions: one custom target, scope sentence first.
    CODEX_ARGS+=(-)
    SCOPE_SENTENCE="$(review_scope_sentence)"
    STDIN_SOURCE="$(mktemp "${TMPDIR:-/tmp}/codex-review.XXXXXX")"
    { printf '%s\n\n' "$SCOPE_SENTENCE"; cat -- "$PROMPT_FILE"; } > "$STDIN_SOURCE"
  else
    # Instructions alone: custom target as written.
    CODEX_ARGS+=(-)
    STDIN_SOURCE="$PROMPT_FILE"
  fi
  # Hand off. stdout is the final message alone (the banner and the session id
  # go to stderr), so -o is a copy of stdout rather than a separate channel:
  # tee, not exec, so the file is complete when this script exits. The shell
  # stays alive here for that and for removing the composed stdin file; codex's
  # exit code is carried through either way.
  status=0
  if [[ -n "$OUTPUT_FILE" ]]; then
    "$CODEX_BIN" "${CODEX_ARGS[@]}" < "$STDIN_SOURCE" | tee -- "$OUTPUT_FILE" || status=$?
  else
    "$CODEX_BIN" "${CODEX_ARGS[@]}" < "$STDIN_SOURCE" || status=$?
  fi
  [[ "$STDIN_SOURCE" != "${PROMPT_FILE:-}" && "$STDIN_SOURCE" != /dev/null ]] && rm -f -- "$STDIN_SOURCE"
  exit "$status"
fi

# exec mode. Resume iff a session id was given.
CODEX_ARGS=(exec --skip-git-repo-check)
[[ -n "$OUTPUT_FILE" ]] && CODEX_ARGS+=(--output-last-message "$OUTPUT_FILE")
if [[ -n "$SESSION_ID" ]]; then
  # A resumed turn does NOT inherit the session's model or effort. codex reads
  # both from the flags and config in force at resume time, so passing nothing
  # runs the turn on whatever ~/.codex/config.toml happens to say — a different
  # model from the one the session was recorded with, and codex says so itself:
  # "This session was recorded with model X but is resuming with Y". Forward
  # them, so the resumed turn runs on what the caller asked for. `-m` and `-c`
  # are both accepted by `codex exec resume`.
  #
  # The caller must pass -m/-r again to stay on the same model, exactly as with
  # -C below; this script keeps no memory of a session it did not start.
  CODEX_ARGS+=(-m "$MODEL" --config "model_reasoning_effort=$EFFORT")
  # -s is the one that genuinely cannot be set here: `codex exec resume` has no
  # --sandbox and exits 2 on it. The session's sandbox stands.
  if [[ "$SANDBOX" != "$DEFAULT_SANDBOX" ]]; then
    echo "Warning: resume ignores -s $SANDBOX (the sandbox is fixed when the session is created)" >&2
  fi
  # -C is ignored for a different reason: `codex exec resume` has no --cd, so a
  # resumed turn runs in whatever cwd it inherits — not the session's original
  # directory. Restore the scope here; otherwise every pointer in the prompt
  # silently re-resolves against the caller's tree.
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
  [[ -n "$CWD" ]] && CODEX_ARGS+=(-C "$CWD")
fi

# Hand off to codex. stdout = readable agent answer; stderr = codex banner,
# which includes "session id: <uuid>". Neither is suppressed: the calling
# subagent reads the session id (and any failure) straight from the output,
# so no in-script regex extraction is needed. exec propagates codex's exit
# code unchanged.
exec "$CODEX_BIN" "${CODEX_ARGS[@]}" < "$PROMPT_FILE"
