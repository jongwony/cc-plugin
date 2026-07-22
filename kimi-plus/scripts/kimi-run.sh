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
  -s, --sandbox SANDBOX  Sandbox: read-only|workspace-write|auto|danger-full-access
                          (default: read-only). Each tier pins its permission
                          mode explicitly, so an ambient
                          permissions.defaultMode cannot widen it:
                            read-only          --permission-mode default
                                               (reads only; Bash denied)
                            workspace-write    --permission-mode acceptEdits
                                               (file edits; arbitrary Bash
                                               still denied — a linter or build
                                               will NOT run under this tier)
                            auto               --permission-mode auto
                                               (a classifier screens each
                                               action instead of prompting, so
                                               lint/build/test do run; use when
                                               the task must verify its own
                                               work, and state the boundary in
                                               the prompt)
                            danger-full-access --dangerously-skip-permissions
                                               (no review layer at all)
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
"SESSION_ID: <uuid>". The full claude event log streams to a scratchpad file
(<prompt>.stream.jsonl) for mid-run progress and post-run inspection. On failure
the script names that file path on stderr rather than dumping it — the log can be
very long; inspect it with head/tail (see the skill's Error Handling).

Examples (<scratchpad> = the calling session's scratchpad directory):
  kimi-run.sh <scratchpad>/kimi_prompt_a3f9.txt
  kimi-run.sh -m 'k3[1m]' <scratchpad>/kimi_prompt_a3f9.txt
  kimi-run.sh -r high <scratchpad>/kimi_prompt_a3f9.txt
  kimi-run.sh -S 019e3eff-c191-7401-bffb-bb8c31ac37c7 <scratchpad>/kimi_prompt_a3f9.txt
  kimi-run.sh -s workspace-write <scratchpad>/kimi_prompt_a3f9.txt
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
    -S|--session-id) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty session id" >&2; usage 1; }; SESSION_ID="$2"; shift 2 ;;
    -o|--output-last-message) [[ $# -ge 2 ]] || { echo "Error: $1 requires a value" >&2; usage 1; }; OUTPUT_FILE="$2"; shift 2 ;;
    -h|--help) usage 0 ;;
    -*) echo "Unknown option: $1" >&2; usage 1 ;;
    # Reject a second positional rather than letting it overwrite the first:
    # silently running the last of several prompt files hides the mistake.
    *) [[ -z "${PROMPT_FILE:-}" ]] || { echo "Error: unexpected extra argument: $1 (exactly one prompt_file is accepted)" >&2; usage 1; }; PROMPT_FILE="$1"; shift ;;
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

command -v jq >/dev/null 2>&1 || { echo "Error: jq is required (used to parse claude's stream-json event log)" >&2; exit 1; }

# Sandbox tier -> claude permission flags. Same tier names as codex-run.sh
# for cross-skill consistency.
PERM_ARGS=()
case "$SANDBOX" in
  # Pinned explicitly rather than left blank: with no --permission-mode flag the
  # run inherits whatever `permissions.defaultMode` the ambient settings carry,
  # so a machine configured with `bypassPermissions` silently turns the
  # advertised read-only lane into full access. Verified: the flag does take
  # precedence over a settings-file defaultMode.
  read-only) PERM_ARGS+=(--permission-mode default) ;;
  workspace-write) PERM_ARGS+=(--permission-mode acceptEdits) ;;
  # auto keeps a review layer (a classifier screens each action) instead of
  # removing the check entirely, so a boundary conveyed in the prompt has
  # something to bind to. Unlike acceptEdits it also clears arbitrary Bash —
  # `npm run lint` / build / test, which acceptEdits denies. Verified accepted
  # on the Kimi coding endpoint.
  auto) PERM_ARGS+=(--permission-mode auto) ;;
  danger-full-access) PERM_ARGS+=(--dangerously-skip-permissions) ;;
  *) echo "Error: unknown sandbox mode: $SANDBOX (expected read-only|workspace-write|auto|danger-full-access)" >&2; usage 1 ;;
esac

# The nested session loads installed plugin skills and may invoke them itself.
# kimi-plus's own skill matches exactly the frontend/boilerplate prompts this
# wrapper carries, so without this the child can call kimi-run.sh recursively.
# Blocked at the flag layer, not in the skill's frontmatter: the skill must stay
# model-invocable in ordinary sessions, where it is the frontend executor.
#
# The subagent tool is denied in the same flag, one level down. The recursive
# skill call is only the child's FIRST attempt at delegating; blocked there, it
# does not conclude that it is the executor — it spawns a plain subagent on some
# other tier instead, and that is the channel the observed silent failure
# actually took. Denying it here is what makes the executor stance below
# enforced rather than merely obeyed, which matters because the stance's
# obey-dependence is the part that does not travel to a non-Anthropic endpoint.
# `Task` is the name that bites in a headless `claude -p` session; `Agent`
# matches nothing there today and is listed beside it so a rename cannot
# silently reopen the channel.
DELEGATION_GUARD_ARGS=(--disallowedTools "Skill(kimi-plus:kimi)" "Skill(kimi-plus:kimi *)" "Task" "Agent")

# Blocking the recursive skill call is not enough on its own. The nested session
# also loads the ambient CLAUDE.md / rules/*.md, including any Tier Registry that
# routes frontend work TO kimi and delegates non-trivial edits to an executor. A
# frontend prompt satisfies that rule inside the wrapper exactly as it does
# outside it, and the rule carries no termination condition, so the child reads
# itself as an orchestrator: it tries the recursive skill call, meets the guard
# above, and falls back to spawning some OTHER executor rather than concluding
# that it is itself the executor. The observable is a run that "succeeds" with
# the work done by a fallback tier — the requested model never touches it.
# Stance is therefore pinned at the flag layer too, for the same reason the guard
# is: a prompt-file clause only helps when the caller remembers to write one, and
# a resume (-S) reuses a prompt file the caller may not revisit.
#
# The stance is not made redundant by the guard above, because the offload
# channels are not all deniable. Two of them are — the recursive skill call and
# the subagent tool — and both are denied. The third is shelling out to another
# CLI (`claude -p`, `codex-run.sh`) through Bash, which cannot be denied without
# taking Bash away from the executor that needs it. How reachable it is varies by
# sandbox tier and by what the permission layer makes of the specific command
# rather than being closed outright anywhere, so it stays covered by instruction
# only — and the stance is that instruction.
EXECUTOR_STANCE='You are the executor at the end of a delegation chain, not an orchestrator. This invocation IS the delegated execution. Perform the requested work yourself with your own tools; do not delegate it onward, spawn subagents, or invoke another executor tier. If a loaded project rule routes work of this kind to a "kimi" tier or tells you to delegate non-trivial edits, that rule has already been satisfied by this invocation — applying it again here is a recursion error, not compliance.'
STANCE_ARGS=(--append-system-prompt "$EXECUTOR_STANCE")

RESUME_ARGS=()
[[ -n "$SESSION_ID" ]] && RESUME_ARGS+=(--resume "$SESSION_ID")

if [[ -n "$CWD" ]]; then
  # Neutralize CDPATH before cd: with it set, a relative -C could resolve to a
  # CDPATH entry instead of the intended directory AND cd would print the
  # resolved path to STDOUT, corrupting the result contract (stdout is the
  # result text plus the SESSION_ID line, nothing else). `--` guards a $CWD
  # that begins with `-`. Unset rather than a `CDPATH= cd` prefix: cd is a
  # special builtin, so a preceding assignment can persist.
  unset CDPATH
  cd -- "$CWD"
fi

# Disable xtrace for the rest of the script: from here the coding key lives in
# the environment (MOONSHOT_CODING_KEY, then ANTHROPIC_API_KEY), and an inherited
# `set -x` / `bash -x` would print it verbatim to the trace stream — a log. No-op
# when tracing is already off.
set +x

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
unset ANTHROPIC_AUTH_TOKEN \
      CLAUDE_CODE_USE_BEDROCK CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_FOUNDRY \
      CLAUDE_CODE_USE_ANTHROPIC_AWS CLAUDE_CODE_USE_MANTLE \
      CLAUDE_CODE_USE_ANTHROPIC_GOOGLE_CLOUD CLAUDE_CODE_USE_GATEWAY \
      ANTHROPIC_CUSTOM_HEADERS
# The selector list above is the full set recognized by claude 2.1.215, not just
# the three headline ones: ANTHROPIC_AWS and MANTLE are documented providers that
# build their own endpoint from provider credentials (so they bypass this base
# URL entirely), and GOOGLE_CLOUD/GATEWAY are present in the binary though
# undocumented — cleared defensively since an unset costs nothing.
# ANTHROPIC_CUSTOM_HEADERS is a different risk in kind: it is applied at
# client construction regardless of which host ANTHROPIC_BASE_URL names, so an
# inherited gateway/org header would be transmitted TO the third-party Kimi
# endpoint. Routing breakage vs credential disclosure — both closed here.

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

# Invoke claude headless against the swapped endpoint, streaming the event log to
# a scratchpad file rather than capturing one blocking JSON blob. Two ends at once:
# the caller can open the stream file mid-run for progress and after for the result
# (no silent multi-minute wait), and — critical for a thin wrapper — NO transform
# sits in the result-carrying path. claude writes the stream directly to the file
# with `>`; there is no `tee`/`jq` pipeline whose failure could SIGPIPE claude or
# truncate the capture. The stream file is a bystander: the run's integrity never
# depends on anything downstream reading it.
#
# STREAM_FILE co-locates with the prompt in the scratchpad (kimi_prompt_<sfx>.txt ->
# kimi_prompt_<sfx>.stream.jsonl) — a known, inspectable path the caller already
# reaches, cleaned by the same session lifecycle that cleans the prompt file. No
# mktemp, no exit-trap cleanup, nothing to leak on an untrapped signal.
STREAM_FILE="${PROMPT_FILE%.txt}.stream.jsonl"

# --verbose is required for stream-json to emit the full event log (incl. the final
# result event carrying .result and .session_id). Session persistence stays ON so
# `-S <SESSION_ID>` resume keeps working — the whole {purpose -> SESSION_ID} contract.
set +e
claude -p --output-format stream-json --verbose \
  ${RESUME_ARGS[@]+"${RESUME_ARGS[@]}"} \
  ${PERM_ARGS[@]+"${PERM_ARGS[@]}"} \
  ${DELEGATION_GUARD_ARGS[@]+"${DELEGATION_GUARD_ARGS[@]}"} \
  ${STANCE_ARGS[@]+"${STANCE_ARGS[@]}"} \
  < "$PROMPT_FILE" > "$STREAM_FILE"
rc=$?
set -e

# The coding key was needed only for the claude call above. Drop it now, before the
# jq parses below, so they never inherit it. Unlike a streaming-pipe design, jq here
# runs strictly AFTER claude has exited — never a concurrent pipeline sibling holding
# the key — so the confinement is literal, not approximate.
unset ANTHROPIC_API_KEY

if [[ $rc -ne 0 ]]; then
  echo "Error: claude exited $rc. Full event stream: $STREAM_FILE (inspect with head/tail)." >&2
  exit "$rc"
fi

# Extract the final `result`-type event from the streamed log (verified shape:
# {"type":"result","subtype":"success","result":"<text>","session_id":"<uuid>",...}).
# Because claude wrote the stream directly to the file with no downstream transform,
# the file is complete here — this is a plain post-read, no SIGPIPE/PIPESTATUS games,
# no truncation risk. Take the LAST result event in case an earlier line coincidentally
# matched. Guarded: a malformed stream makes jq exit non-zero, which under set -e would
# abort before the guards below and never surface the raw stream.
set +e
FINAL_EVENT=$(jq -cs '[.[] | select(.type == "result")] | last // empty' "$STREAM_FILE")
jq_rc_final=$?
set -e
if [[ $jq_rc_final -ne 0 || -z "$FINAL_EVENT" ]]; then
  echo "Error: claude finished but its stream carried no parseable result event — resume handle unavailable. Full event stream: $STREAM_FILE (inspect with head/tail)." >&2
  exit 1
fi

# `| strings`: a missing or non-string .result/.session_id is selected out rather than
# emitted as blank text or an unusable multiline handle, so a wrong-shaped event falls
# through to the guards below instead of passing as success.
set +e
RESULT=$(printf '%s' "$FINAL_EVENT" | jq -r '.result | strings')
jq_rc_result=$?
KIMI_SESSION_ID=$(printf '%s' "$FINAL_EVENT" | jq -r '.session_id | strings')
jq_rc_session=$?
set -e
if [[ $jq_rc_result -ne 0 || $jq_rc_session -ne 0 ]]; then
  echo "Error: claude finished but the result event did not parse — resume handle unavailable. Full event stream: $STREAM_FILE (inspect with head/tail)." >&2
  exit 1
fi

# A finished run with no session_id is an unexpected shape, not success: the resume
# handle would be blank and the output contract ("SESSION_ID: <uuid>") unmet.
if [[ -z "$KIMI_SESSION_ID" ]]; then
  echo "Error: claude finished but the result event carried no usable session_id — resume handle unavailable. Full event stream: $STREAM_FILE (inspect with head/tail)." >&2
  exit 1
fi

# Same for the answer: a finished run yielding no result text is an unexpected shape,
# not a successful empty answer, and must not be handed over as a blank deliverable.
if [[ -z "$RESULT" ]]; then
  echo "Error: claude finished but the result event carried no result text — unexpected stream shape. Full event stream: $STREAM_FILE (inspect with head/tail)." >&2
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
