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
# the repo, never persisted to disk — exported only into this script's own
# process tree (the claude child process invoked below).
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
export ANTHROPIC_MODEL="$MODEL"
export ANTHROPIC_DEFAULT_OPUS_MODEL="$MODEL"
export ANTHROPIC_DEFAULT_SONNET_MODEL="$MODEL"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="$MODEL"
export ANTHROPIC_DEFAULT_FABLE_MODEL="$MODEL"
export CLAUDE_CODE_SUBAGENT_MODEL="$MODEL"
export ENABLE_TOOL_SEARCH=false
export CLAUDE_CODE_EFFORT_LEVEL="$EFFORT"

# Thinking stays on: the Kimi Code docs state a thinking-disabled request
# routes K3 and K2.7 Code to K2.6, a downgrade that surfaces as lower
# quality rather than an error. An explicit positive budget keeps the
# configuration stated rather than inherited. Verified 2026-07: this default
# yields real thinking blocks on the stream (186 thinking_delta events on a
# reasoning prompt). Probing MAX_THINKING_TOKENS=0 did NOT suppress thinking
# here, so this variable's exact effect against this endpoint is unconfirmed
# — the budget is a safeguard, and the verified claim is only that the
# default configuration thinks.
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

if [[ $rc -ne 0 ]]; then
  printf '%s\n' "$RAW" >&2
  exit "$rc"
fi

RESULT=$(printf '%s' "$RAW" | jq -r '.result // empty')
KIMI_SESSION_ID=$(printf '%s' "$RAW" | jq -r '.session_id // empty')

# A zero exit with no session_id is an unexpected response shape, not success:
# the resume handle would be blank and the output contract ("SESSION_ID: <uuid>")
# unmet. Fail loudly with the raw JSON rather than printing an empty handle.
if [[ -z "$KIMI_SESSION_ID" ]]; then
  echo "Error: claude exited 0 but the response carried no session_id — unexpected JSON, resume handle unavailable. Raw response:" >&2
  printf '%s\n' "$RAW" >&2
  exit 1
fi

printf '%s\n' "$RESULT"
[[ -n "$OUTPUT_FILE" ]] && printf '%s\n' "$RESULT" > "$OUTPUT_FILE"
echo "SESSION_ID: $KIMI_SESSION_ID"
