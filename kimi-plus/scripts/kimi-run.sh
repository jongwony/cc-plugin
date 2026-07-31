#!/bin/bash
# kimi-run.sh — Parameterized CLI wrapper that runs the Claude Code CLI
# env-swapped against the Kimi Code membership coding endpoint (Moonshot's
# Kimi K3), NOT the paygo Moonshot API. Single entry point for all kimi
# invocations. Run with -h for usage.

set -euo pipefail

# Defaults
#
# This wrapper serves ONE context tier — 1M — on the standing assumption of a
# membership that carries it. That premise is what lets the window constants
# below be constants; it is the only thing that would have to be revisited if
# the subscription ever changed.
#
# `k3[1m]`: the model value in Kimi's own 1M Claude Code setup block
# (https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html — plain
# `k3` appears in no block there, only `k3[1m]` and `k3-256k`). Reading `k3[1m]`
# as "pin the 1M tier" is INFERENCE: it sits in that setup block but not in the
# canonical four-id list (https://www.kimi.com/code/docs/en/kimi-code/models).
# Keep every `$MODEL` expansion double-quoted — the brackets are a glob pattern.
readonly DEFAULT_MODEL="k3[1m]"
# `high`, not `max`: Kimi's own official Claude Code setup block ships
# `export CLAUDE_CODE_EFFORT_LEVEL=high`, so the previous `max` default sat a
# rung above the vendor's own recommendation and spent quota accordingly on
# every run that never asked for it. Verified 2026-07.
readonly DEFAULT_EFFORT="high"
readonly DEFAULT_SANDBOX="read-only"
# Accepted by claude's CLAUDE_CODE_EFFORT_LEVEL parser. K3 itself resolves only
# three levels — low, high, max — so `medium` lands on high and `xhigh` on max;
# both are accepted here because claude accepts them, not because they add a rung.
readonly VALID_EFFORTS="low|medium|high|xhigh|max|auto"
# The 1M window, pinned to the one tier this wrapper serves. Kimi's setup block
# ships both window variables alongside the model; here they are constants
# rather than derived from $MODEL. Consequence, with -m left open: a 256K model
# passed via -m still gets a 1M declaration — see the -m note in usage.
readonly CONTEXT_WINDOW=1048576

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
  -m, --model MODEL      Model name (default: 'k3[1m]' — the 1M window, and the
                          model value in Kimi's own 1M Claude Code setup block).
                          Passthrough, not validated: the accepted ids are not a
                          closed set the way the effort levels are, and 'k3[1m]'
                          is itself absent from the canonical id list while
                          appearing in the official setup block, so a validator
                          would reject a value Kimi's own instructions hand you.
                          TRADEOFF: the context-window variables are pinned to
                          1M and do NOT follow -m. Passing a narrower model
                          (k3-256k, ~half the quota) therefore leaves the window
                          declared at 1M. The escape hatch was kept over a guard
                          deliberately — mind the mismatch when you use it.
  -r, --effort EFFORT    Reasoning effort: low|medium|high|xhigh|max|auto
                          (default: high — the value Kimi's own Claude Code
                          setup block ships). Maps to CLAUDE_CODE_EFFORT_LEVEL.
                          K3 resolves three levels only: medium collapses onto
                          high, xhigh onto max. An out-of-set value is rejected
                          here, because claude would otherwise discard it
                          silently and fall back to the default.
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
                         Also write kimi's final result text to FILE. Must not
                          be the reserved stream path (<prompt>.stream.jsonl):
                          the late result write would truncate the diagnostic
                          event log the empty-result/error inspection path needs.
  -h, --help             Show this help

The Kimi Code membership coding key is read from the MOONSHOT_CODING_KEY
environment variable, which the caller exports before invoking (how to source it
is machine-local setup outside this wrapper's concern). It is exported only into
this script's own child process (claude); the SCRIPT itself never fetches,
writes, or persists it. That guarantee is scoped to the script's own handling —
env-scrub is left off, so claude's child subprocesses inherit the key and one
that dumps its environment could echo it into the stream file (see the
SUBPROCESS_ENV_SCRUB note in the source for why that boundary is left where the
harness owns it). If MOONSHOT_CODING_KEY is unset, the script exits with a
one-line error naming it.

Output contract: stdout is the result text followed by a final line
"SESSION_ID: <uuid>". The full claude event log streams to a scratchpad file
(<prompt>.stream.jsonl) for mid-run progress and post-run inspection. Failures are not
intercepted: a failing claude/jq surfaces its own stderr and exit code directly
(set -e), and a claude failure's full event log is in that stream file — inspect it
byte-bounded (tail -c / jq, not bare head/tail — one event can be many MB; see the
skill's Error Handling).

Examples (<scratchpad> = the calling session's scratchpad directory):
  kimi-run.sh <scratchpad>/kimi_prompt_a3f9.txt
  kimi-run.sh -r max <scratchpad>/kimi_prompt_a3f9.txt
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
    -o|--output-last-message) [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; OUTPUT_FILE="$2"; shift 2 ;;
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

# Effort tier validation, same shape as the sandbox check above and for a sharper
# reason. claude's CLAUDE_CODE_EFFORT_LEVEL parser accepts only the values in
# VALID_EFFORTS and DISCARDS anything else in silence — no warning (unlike the
# --effort CLI flag, which does warn), and it does not trim, so a stray leading
# space alone loses the value. The run then proceeds at the default and looks
# entirely normal. The Kimi endpoint would answer an unknown level with HTTP 400,
# but that error is unreachable from here: claude's own filter drops the value
# before a request is ever built. This wrapper is therefore the only place the
# loss can be made loud, so it is made loud here. Verified 2026-07 against claude
# 2.1.220.
# Matched against VALID_EFFORTS itself rather than a second literal list, so the
# accepted set has one definition. The delimiters on both sides make it an exact
# member test: without them "hi" would match inside "xhigh".
if [[ "|$VALID_EFFORTS|" != *"|$EFFORT|"* ]]; then
  echo "Error: unknown effort level: '$EFFORT' (expected $VALID_EFFORTS)" >&2
  usage 1
fi

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

# The membership coding key is read from the environment, not fetched by this
# script: the caller exports MOONSHOT_CODING_KEY before invoking (how to source it,
# e.g. from a secret store, is machine-local setup outside this wrapper's concern).
# Held only in this script's process and copied into the exported ANTHROPIC_API_KEY
# below; the wrapper never fetches, stores, or persists it. A one-line error (not a
# raw traceback) names the missing var, since an unset key is a caller setup mistake,
# not a runtime failure to pass through.
[[ -n "${MOONSHOT_CODING_KEY:-}" ]] || { echo "Error: MOONSHOT_CODING_KEY is not set — export the Kimi coding key before invoking" >&2; exit 1; }

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
# Drop the source var so it never reaches claude's env. The caller exports
# MOONSHOT_CODING_KEY, so it IS in this script's environment and would otherwise be
# inherited by claude and its tools; unsetting it confines the raw key to
# ANTHROPIC_API_KEY (which already holds a copy). This also covers the allexport
# case — an inherited exported SHELLOPTS auto-exporting the custom-named var.
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
# lanes this wrapper advertises. Consequence, accepted deliberately: the key is
# confined to claude's process tree but NOT scrubbed from its child subprocesses,
# so a child that dumps its environment can echo the key into the stream file on
# disk — the "never persisted" guarantee is scoped to the SCRIPT's own handling,
# not to what a claude child chooses to print. That subprocess credential
# boundary is a claude-harness concern SUBPROCESS_ENV_SCRUB exists to own; taking
# it here breaks the edit lanes, so edit-lane function outranks that
# defense-in-depth and the boundary stays where the harness owns it.

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

# Kimi's own Claude Code setup blocks ship both window variables alongside the
# model, and a mismatch is silent — compaction fires at the wrong boundary and
# the session under-uses a window it is paying for, never an error. Pinned to
# the single 1M tier this wrapper serves (CONTEXT_WINDOW above) rather than
# derived from $MODEL; the -m tradeoff that follows from that is documented in
# usage. Left overridable (`:-`) like MAX_THINKING_TOKENS above, so a caller can
# still pin a narrower window.
export CLAUDE_CODE_AUTO_COMPACT_WINDOW="${CLAUDE_CODE_AUTO_COMPACT_WINDOW:-$CONTEXT_WINDOW}"
export CLAUDE_CODE_MAX_CONTEXT_TOKENS="${CLAUDE_CODE_MAX_CONTEXT_TOKENS:-$CONTEXT_WINDOW}"

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
# reaches. The script keeps no cleanup of its own — deliberately: no mktemp, no
# exit-trap cleanup, nothing to leak on an untrapped signal. When the scratchpad is
# lifecycle-managed (the usual case) the stream file is removed with the prompt file;
# otherwise these possibly-large files persist until that directory's owner clears them.
STREAM_FILE="${PROMPT_FILE%.txt}.stream.jsonl"

# --verbose is required for stream-json to emit the full event log (incl. the final
# result event carrying .result and .session_id). Session persistence stays ON so
# `-S <SESSION_ID>` resume keeps working — the whole {purpose -> SESSION_ID} contract.
#
# No error interception here. On any claude failure — a nonzero exit, a stream-file that
# will not open (bash's own redirect error), or the binary missing — set -e aborts and
# the underlying tool's stderr + exit code pass straight to the caller. The thin wrapper
# crafts no message; the calling agent reads the raw failure and fixes it over the next turn.
claude -p --output-format stream-json --verbose \
  ${RESUME_ARGS[@]+"${RESUME_ARGS[@]}"} \
  ${PERM_ARGS[@]+"${PERM_ARGS[@]}"} \
  ${DELEGATION_GUARD_ARGS[@]+"${DELEGATION_GUARD_ARGS[@]}"} \
  ${STANCE_ARGS[@]+"${STANCE_ARGS[@]}"} \
  < "$PROMPT_FILE" > "$STREAM_FILE"

# The coding key was needed only for the claude call above. Drop it now, before the jq
# parses below, so they never inherit it — jq runs strictly AFTER claude has exited, so
# the confinement is literal, not approximate.
unset ANTHROPIC_API_KEY

# Neutralize allexport for the extraction captures below — symmetric with the key-defense
# at the MOONSHOT_CODING_KEY unset above. Under an inherited `allexport` (exported SHELLOPTS)
# the RESULT/FINAL_EVENT assignments would auto-export a multi-hundred-KB payload into the
# environment, whose envp then counts toward ARG_MAX at the next `jq` exec — a large but valid
# run could abort with "Argument list too long". Two steps, both required: `set +a` stops NEW
# auto-exports, but does NOT clear an export attribute a same-named var INHERITED from the
# caller (a caller under `set -a` carrying its own generic `RESULT` reassigns-but-stays-exported,
# so `set +a` alone leaves that one exported); the `unset` drops any inherited attribute so the
# fresh assignments start clean. No child below needs a fresh export (claude already ran), so
# this is free; unset of never-set names is a no-op even under `set -u`.
set +a
unset FINAL_EVENT RESULT KIMI_SESSION_ID

# Extract the final `result`-type event from the streamed log. Because claude wrote the
# stream directly to the file with no downstream transform, this is a plain post-read.
# `last(inputs | select ...)` streams the log lazily and retains only that one event, so
# an arbitrarily large stream is never slurped into memory. A malformed stream makes jq
# exit non-zero and set -e aborts with jq's own parse error surfaced — no crafted message.
FINAL_EVENT=$(jq -n -c 'last(inputs | select(.type == "result")) // empty' "$STREAM_FILE")

# `| strings`: a missing or non-string .result / .session_id is selected out and emitted
# as empty rather than as garbage — the extraction stays type-safe with no guard block.
RESULT=$(printf '%s' "$FINAL_EVENT" | jq -r '.result | strings')
KIMI_SESSION_ID=$(printf '%s' "$FINAL_EVENT" | jq -r '.session_id | strings')

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
