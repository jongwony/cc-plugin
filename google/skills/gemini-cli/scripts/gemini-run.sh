#!/bin/bash
# gemini-run.sh — headless Gemini CLI wrapper: one prompt file in, answer +
# token counts + session id out. Run with -h for usage.

set -euo pipefail
CDPATH=

APPROVAL="plan"
MODEL=""
CWD=""
RESUME_ID=""
TIMEOUT=0
ANY_AUTH=0
PROMPT_FILE=""
# Seconds between SIGTERM and SIGKILL when a run is stopped.
readonly KILL_GRACE=5

usage() {
  cat <<'USAGE'
Usage: gemini-run.sh -m MODEL [options] <prompt_file>

Options:
  -m, --model MODEL       Model id (required; no default)
  -a, --approval MODE     plan|default|auto_edit|yolo (default: plan — read-only
                          tools; web search is available in plan)
  -C, --cwd DIR           Directory gemini runs in. Sessions are stored per
                          directory, so pass the same DIR again when resuming
  -S, --session-id UUID   Resume this session (a UUID this script printed).
                          Without -S a new session starts under a fresh UUID
  -t, --timeout SECONDS   Stop the run after SECONDS; exit 124 (default: none)
      --any-auth          Run even when a settings file selects an auth method
                          other than the API key (see references/auth.md)
  -h, --help              Show this help

The prompt file is fed to gemini on stdin. Requires GEMINI_API_KEY in the
environment, and `gemini` and `node` on PATH.

Output (stdout):
  the model's answer
  TOKENS <model>: <the CLI's token counts for that model, as JSON>
  SESSION_ID: <uuid>       only after a successful run whose session was stored;
                           a failed or timed-out run prints none
Exit status: gemini's own when it fails, 1 when it exits 0 but reports an
error, 124 on timeout, 128+N when this script is stopped by signal N.
USAGE
  exit "${1:-0}"
}

need() { [[ $# -ge 2 && -n "$2" ]] || { echo "Error: $1 requires a non-empty value" >&2; usage 1; }; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--model) need "$@"; MODEL="$2"; shift 2 ;;
    -a|--approval) need "$@"; APPROVAL="$2"; shift 2 ;;
    -C|--cwd) need "$@"; CWD="$2"; shift 2 ;;
    -S|--session-id) need "$@"; RESUME_ID="$2"; shift 2 ;;
    -t|--timeout) need "$@"; TIMEOUT="$2"; shift 2 ;;
    --any-auth) ANY_AUTH=1; shift ;;
    -h|--help) usage 0 ;;
    -*) echo "Unknown option: $1" >&2; usage 1 ;;
    *) [[ -z "$PROMPT_FILE" ]] || { echo "Error: only one prompt file is accepted" >&2; usage 1; }; PROMPT_FILE="$1"; shift ;;
  esac
done

[[ -n "$MODEL" ]] || { echo "Error: -m MODEL is required" >&2; usage 1; }
[[ -n "$PROMPT_FILE" && -f "$PROMPT_FILE" ]] || { echo "Error: prompt file not found: ${PROMPT_FILE:-<none>}" >&2; exit 1; }
[[ "$TIMEOUT" =~ ^[0-9]+$ ]] || { echo "Error: --timeout takes whole seconds" >&2; exit 1; }
TIMEOUT=$((10#$TIMEOUT))
readonly UUID_RE='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
[[ -z "$RESUME_ID" || "$RESUME_ID" =~ $UUID_RE ]] || { echo "Error: -S takes a session UUID" >&2; exit 1; }
[[ -n "${GEMINI_API_KEY:-}" ]] || { echo "Error: GEMINI_API_KEY is not set" >&2; exit 1; }

# Resolve everything path-like before the cd below, so a relative PATH entry or
# prompt path cannot re-resolve against the new directory.
abs_bin() { local p; p="$(command -v "$1")" || return 1; [[ "$p" == /* ]] || p="$PWD/$p"; printf '%s' "$p"; }
GEMINI_BIN="$(abs_bin gemini)" || { echo "Error: gemini not found on PATH" >&2; exit 1; }
NODE_BIN="$(abs_bin node)" || { echo "Error: node not found on PATH" >&2; exit 1; }
PROMPT_FILE="$(cd -P -- "$(dirname -- "$PROMPT_FILE")" && pwd -P)/$(basename -- "$PROMPT_FILE")"
[[ -n "$CWD" ]] && cd -P -- "$CWD"

STATE_DIR="${GEMINI_CLI_HOME:-$HOME}/.gemini"

# Fail closed on auth: in headless mode an auth method selected in a settings
# file wins over GEMINI_API_KEY, and a cached sign-in then succeeds silently
# under that account. Check each settings file the CLI documents.
if [[ "$ANY_AUTH" == 0 ]]; then
  if [[ "$(uname)" == Darwin ]]; then
    SYSTEM_SETTINGS="${GEMINI_CLI_SYSTEM_SETTINGS_PATH:-/Library/Application Support/GeminiCli/settings.json}"
  else
    SYSTEM_SETTINGS="${GEMINI_CLI_SYSTEM_SETTINGS_PATH:-/etc/gemini-cli/settings.json}"
  fi
  MISMATCH="$("$NODE_BIN" -e '
    const fs = require("fs");
    for (const f of process.argv.slice(1)) {
      let t; try { t = fs.readFileSync(f, "utf8"); } catch (_) { continue; }
      const m = t.match(/"selectedType"\s*:\s*"([^"]+)"/);
      if (m && m[1] !== "gemini-api-key") console.log(f + ": " + m[1]);
    }' "$STATE_DIR/settings.json" "$PWD/.gemini/settings.json" "$SYSTEM_SETTINGS")"
  if [[ -n "$MISMATCH" ]]; then
    echo "Error: a settings file selects an auth method other than the API key, which would override GEMINI_API_KEY:" >&2
    echo "$MISMATCH" >&2
    echo "See references/auth.md, or pass --any-auth to run with it anyway." >&2
    exit 1
  fi
fi

if [[ -n "$RESUME_ID" ]]; then
  SESSION="$(printf '%s' "$RESUME_ID" | tr 'A-Z' 'a-z')"
  SESSION_ARGS=(--resume "$SESSION")
else
  SESSION="$(uuidgen 2>/dev/null || "$NODE_BIN" -e 'console.log(require("crypto").randomUUID())')"
  SESSION="$(printf '%s' "$SESSION" | tr 'A-Z' 'a-z')"
  SESSION_ARGS=(--session-id "$SESSION")
fi

# The CLI stores a session under its state dir; only a stored one resumes.
session_stored() {
  local f
  while IFS= read -r f; do
    grep -q -- "$SESSION" "$f" 2>/dev/null && return 0
  done < <(find "$STATE_DIR/tmp" -type f -name "*${SESSION:0:8}*" 2>/dev/null)
  return 1
}
print_session() { if session_stored; then echo "SESSION_ID: $SESSION"; fi; }

OUT="$(mktemp)"; ERR="$(mktemp)"
PID=""
stop_group() {
  [[ -n "$PID" ]] || return 0
  kill -TERM -- "-$PID" 2>/dev/null || true
  local i
  for ((i = 0; i < KILL_GRACE * 10; i++)); do
    kill -0 -- "-$PID" 2>/dev/null || return 0
    sleep 0.1
  done
  kill -KILL -- "-$PID" 2>/dev/null || true
}
trap 'stop_group; rm -f "$OUT" "$ERR"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# Job control gives gemini and everything it spawns a process group of their
# own, so a stop reaches the whole tree. The prompt goes in on stdin and -p
# carries nothing: no prompt text is read as an option or placed in argv.
set -m
"$GEMINI_BIN" --skip-trust --approval-mode "$APPROVAL" -m "$MODEL" -o json \
  "${SESSION_ARGS[@]}" -p "" <"$PROMPT_FILE" >"$OUT" 2>"$ERR" &
PID=$!
set +m

TIMED_OUT=0
if (( TIMEOUT > 0 )); then
  START=$SECONDS
  while kill -0 "$PID" 2>/dev/null; do
    if (( SECONDS - START >= TIMEOUT )); then TIMED_OUT=1; stop_group; break; fi
    sleep 1
  done
fi
set +e; wait "$PID" 2>/dev/null; STATUS=$?; set -e
stop_group
PID=""

if [[ "$TIMED_OUT" == 1 ]]; then
  echo "Error: timed out after ${TIMEOUT}s" >&2
  exit 124
fi

set +e
"$NODE_BIN" -e '
const fs = require("fs");
const [out, err, status] = process.argv.slice(1);
const raw = fs.readFileSync(out, "utf8");
let d = null;
try { d = JSON.parse(raw); } catch (_) {
  const i = raw.search(/^\{/m);
  if (i >= 0) { try { d = JSON.parse(raw.slice(i)); } catch (_) {} }
}
const failed = !d || d.error || Number(status) !== 0;
if (failed) {
  process.stderr.write(fs.readFileSync(err, "utf8"));
  process.stderr.write(d && d.error ? JSON.stringify(d.error) + "\n" : raw);
}
if (d && d.response) console.log(d.response);
const models = (d && d.stats && d.stats.models) || {};
for (const [m, s] of Object.entries(models)) console.log("TOKENS " + m + ": " + JSON.stringify(s.tokens || s));
process.exit(Number(status) !== 0 ? Number(status) : failed ? 1 : 0);
' "$OUT" "$ERR" "$STATUS"
RC=$?
set -e
if [[ "$RC" == 0 ]]; then print_session; fi
exit "$RC"
