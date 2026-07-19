#!/bin/bash
# kimi-run.sh — Parameterized CLI wrapper that runs the Claude Code CLI
# env-swapped against the Kimi Code membership coding endpoint (Moonshot's
# Kimi K3), NOT the paygo Moonshot API. Single entry point for all kimi
# invocations. Run with -h for usage.

set -euo pipefail

# Defaults
readonly DEFAULT_MODEL="k3"
readonly DEFAULT_EFFORT="max"
readonly DEFAULT_SANDBOX="read-only"

MODEL="$DEFAULT_MODEL"
EFFORT="$DEFAULT_EFFORT"
SANDBOX="$DEFAULT_SANDBOX"
SESSION_ID=""
CWD=""
OUTPUT_FILE=""

usage() {
  cat <<'USAGE'
Usage: kimi-run.sh [options] <prompt_file>

Options:
  -m, --model MODEL      Model name (default: k3 — 256K context, Moderato+).
                          Opt-in: 'k3[1m]' requests 1M-context mode, which is
                          plan-gated at a higher membership tier — a below-tier
                          call fails; verify your plan before opting in. Other
                          valid values: kimi-for-coding,
                          kimi-for-coding-highspeed.
  -r, --effort EFFORT    Reasoning effort, maps to CLAUDE_CODE_EFFORT_LEVEL
                          (default: max)
  -s, --sandbox SANDBOX  Sandbox: read-only|workspace-write|danger-full-access
                          (default: read-only). read-only passes no permission
                          flags (headless -p denies permission-requiring tools
                          by default); workspace-write adds
                          --permission-mode acceptEdits; danger-full-access
                          adds --dangerously-skip-permissions.
  -C, --cwd DIR          Working directory to cd into before invoking claude
  -S, --session-id ID    Resume a specific session by UUID (adds --resume ID).
                          Model/effort env still applies per-invocation on
                          resume — switching models mid-session is a session
                          discipline concern, not enforced by this script.
  -o, --output-last-message FILE
                         Also write kimi's final result text to FILE
  -h, --help             Show this help

The Kimi Code membership coding key is pulled from gopass at call time
(entry: api-key/kimi-coding) and exported only into this script's own child
process (claude) — it is never written to disk or the repo. If the gopass
entry does not exist yet, the script exits with a one-line error naming it.

Output contract: stdout is the result text followed by a final line
"SESSION_ID: <uuid>". A non-zero claude exit propagates unchanged, with the
raw JSON response surfaced on stderr for diagnosis.

Examples:
  kimi-run.sh /tmp/kimi_prompt_a3f9.txt
  kimi-run.sh -m 'k3[1m]' /tmp/kimi_prompt_a3f9.txt
  kimi-run.sh -r high /tmp/kimi_prompt_a3f9.txt
  kimi-run.sh -S 019e3eff-c191-7401-bffb-bb8c31ac37c7 /tmp/kimi_prompt_a3f9.txt
  kimi-run.sh -s workspace-write /tmp/kimi_prompt_a3f9.txt
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

# Anchor a relative prompt path to the invocation cwd BEFORE any -C cd. The -f
# check above resolves against the current cwd, but the `< "$PROMPT_FILE"`
# redirection at invocation runs after the cd — so with -C a relative path would
# validate here yet read a different (or missing) same-named file afterward.
case "$PROMPT_FILE" in
  /*) : ;;
  *)  PROMPT_FILE="$PWD/$PROMPT_FILE" ;;
esac

command -v jq >/dev/null 2>&1 || { echo "Error: jq is required (used to parse claude's --output-format json response)" >&2; exit 1; }

# Sandbox tier -> claude permission flags. Same tier names as codex-run.sh
# for cross-skill consistency.
PERM_ARGS=()
case "$SANDBOX" in
  read-only) ;;
  workspace-write) PERM_ARGS+=(--permission-mode acceptEdits) ;;
  danger-full-access) PERM_ARGS+=(--dangerously-skip-permissions) ;;
  *) echo "Error: unknown sandbox mode: $SANDBOX (expected read-only|workspace-write|danger-full-access)" >&2; usage 1 ;;
esac

RESUME_ARGS=()
[[ -n "$SESSION_ID" ]] && RESUME_ARGS+=(--resume "$SESSION_ID")

if [[ -n "$CWD" ]]; then
  cd "$CWD"
fi

# Pull the membership coding key from gopass at call time. Never stored in
# the repo, never persisted to disk — held only in this script's process and
# copied into the exported ANTHROPIC_API_KEY below.
MOONSHOT_CODING_KEY="$(gopass show -o api-key/kimi-coding)" || {
  echo "Error: gopass entry 'api-key/kimi-coding' not found. Issue the Kimi Code membership coding key and store it via 'gopass insert api-key/kimi-coding' before running kimi-run.sh." >&2
  exit 1
}

# Neutralize inherited credentials that OUTRANK ANTHROPIC_API_KEY, or the swap
# is silently hijacked (docs: Authentication precedence). ANTHROPIC_AUTH_TOKEN
# (rank 2, sent as Authorization: Bearer) beats ANTHROPIC_API_KEY (rank 3,
# x-api-key) — the request still hits the Kimi base URL but with the wrong
# credential in the wrong header (401, or a wrong-identity success if the
# endpoint also accepts the bearer). The cloud-provider selectors rank above
# both. CLAUDE_CODE_OAUTH_TOKEN and on-disk OAuth login rank BELOW the API key
# and need no unset. Two sources a shell swap cannot neutralize: a settings.json
# `env` block (outranks shell exports) and a signed-in Claude apps gateway
# session (cleared only by /logout) — out of scope for this wrapper.
unset ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_FOUNDRY

export ANTHROPIC_BASE_URL="https://api.kimi.com/coding/"
# The coding endpoint authenticates via ANTHROPIC_API_KEY (x-api-key header),
# per its official docs — NOT ANTHROPIC_AUTH_TOKEN, which is the paygo
# api.moonshot.ai convention.
export ANTHROPIC_API_KEY="$MOONSHOT_CODING_KEY"
# Drop the intermediate so it never reaches claude's env. Normally a non-exported
# local stays out of the child's env, but an inherited `allexport` (exported
# SHELLOPTS) would auto-export this custom-named var and leak the raw key to
# claude and its tools. Unsetting the source makes that moot — ANTHROPIC_API_KEY
# already holds a copy.
unset MOONSHOT_CODING_KEY
export ANTHROPIC_MODEL="$MODEL"
export ANTHROPIC_DEFAULT_OPUS_MODEL="$MODEL"
export ANTHROPIC_DEFAULT_SONNET_MODEL="$MODEL"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="$MODEL"
export ANTHROPIC_DEFAULT_FABLE_MODEL="$MODEL"
export CLAUDE_CODE_SUBAGENT_MODEL="$MODEL"
export ENABLE_TOOL_SEARCH=false
export CLAUDE_CODE_EFFORT_LEVEL="$EFFORT"
# NOTE: do not set CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1 here. On claude 2.1.215 it
# forces permission mode to `default` and blocks the Edit tool under
# --permission-mode acceptEdits / --dangerously-skip-permissions (verified by
# isolated A/B run), which would break the workspace-write and danger-full-access
# lanes this wrapper advertises. The key is already confined to claude's own
# process tree (gopass, never persisted); edit-lane function outranks that
# defense-in-depth here.

# Thinking stays on: the Kimi Code docs state a thinking-disabled request
# routes K3 and K2.7 Code to K2.6, a downgrade that surfaces as lower
# quality rather than an error. Unset the inherited off-switch so the wrapper's
# thinking-on contract is not silently overridden by parent env. Verified
# 2026-07: this default yields real thinking blocks on the stream (186
# thinking_delta events on a reasoning prompt). Probing MAX_THINKING_TOKENS=0
# did NOT suppress thinking here (this endpoint omits the param rather than
# forcing off), so the budget below is a stated safeguard, not a guarantee; the
# verified claim is only that the default configuration thinks. Left overridable
# (`:-`) so a task can raise the budget.
unset CLAUDE_CODE_DISABLE_THINKING
export MAX_THINKING_TOKENS="${MAX_THINKING_TOKENS:-32000}"

# Auto-compact window must match the model's actual context entitlement,
# or compaction fires at the wrong boundary (docs: 262144 for k3/256K,
# 1048576 for k3[1m]).
case "$MODEL" in
  "k3[1m]") export CLAUDE_CODE_AUTO_COMPACT_WINDOW=1048576 ;;
  *)        export CLAUDE_CODE_AUTO_COMPACT_WINDOW=262144 ;;
esac

# Invoke claude headless against the swapped endpoint. --output-format json
# is required (not a plain exec like codex-run.sh) because session-id capture
# here is JSON-based, not a stderr banner grep.
set +e
RAW=$(claude -p --output-format json \
  ${RESUME_ARGS[@]+"${RESUME_ARGS[@]}"} \
  ${PERM_ARGS[@]+"${PERM_ARGS[@]}"} \
  < "$PROMPT_FILE")
rc=$?
set -e

# The coding key was needed only for the claude call above. Drop it now, before
# the jq subprocesses below, so they never inherit it — this is what makes the
# "confined to claude's own process tree" claim (see NOTE above) literally true
# rather than approximately so.
unset ANTHROPIC_API_KEY

if [[ $rc -ne 0 ]]; then
  printf '%s\n' "$RAW" >&2
  exit "$rc"
fi

# Guard the JSON parse like the claude call above: malformed or wrong-type JSON
# makes jq exit non-zero (pipefail propagates it), which under set -e would abort
# HERE — before the empty-session_id guard below — and never surface the raw
# response the output contract promises. Capture the parse failure and surface
# $RAW on stderr, same shape as that guard.
set +e
RESULT=$(printf '%s' "$RAW" | jq -r '.result // empty')
jq_rc_result=$?
KIMI_SESSION_ID=$(printf '%s' "$RAW" | jq -r '.session_id // empty')
jq_rc_session=$?
set -e
if [[ $jq_rc_result -ne 0 || $jq_rc_session -ne 0 ]]; then
  echo "Error: claude exited 0 but its response did not parse as JSON — resume handle unavailable. Raw response:" >&2
  printf '%s\n' "$RAW" >&2
  exit 1
fi

# A zero exit with no session_id is an unexpected response shape, not success:
# the resume handle would be blank and the output contract ("SESSION_ID: <uuid>")
# unmet. Fail loudly with the raw JSON rather than printing an empty handle.
if [[ -z "$KIMI_SESSION_ID" ]]; then
  echo "Error: claude exited 0 but the response carried no session_id — unexpected JSON, resume handle unavailable. Raw response:" >&2
  printf '%s\n' "$RAW" >&2
  exit 1
fi

printf '%s\n' "$RESULT"
# Emit the resume handle BEFORE the optional -o write: the session already
# exists server-side, so an unwritable -o path must not abort (set -e) and
# discard the only resume handle. SESSION_ID stays the last stdout line (the
# -o write goes to a file, not stdout).
echo "SESSION_ID: $KIMI_SESSION_ID"
# `if`, not `[[ … ]] && …`: a bare trailing test whose condition is false (no -o)
# would be the script's LAST command and hand its exit status (1) to the whole
# script, failing every otherwise-successful default run. An unwritable -o still
# aborts (set -e) inside the body — after SESSION_ID is already emitted, per the
# ordering above. The explicit `exit 0` pins the success contract to the code
# path rather than to whatever command happened to run last.
if [[ -n "$OUTPUT_FILE" ]]; then
  printf '%s\n' "$RESULT" > "$OUTPUT_FILE"
fi
exit 0
