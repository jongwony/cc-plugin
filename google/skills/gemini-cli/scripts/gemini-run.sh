#!/bin/bash
# gemini-run.sh — headless Gemini CLI wrapper: one prompt file in, answer +
# session id + token counts out. Run with -h for usage.

set -euo pipefail
CDPATH=

APPROVAL="plan"
MODEL=""
CWD=""
RESUME_ID=""
TIMEOUT=0
PROMPT_FILE=""

usage() {
  cat <<'USAGE'
Usage: gemini-run.sh -m MODEL [options] <prompt_file>

Options:
  -m, --model MODEL       Model id (required; no default)
  -a, --approval MODE     plan|default|auto_edit|yolo (default: plan — read-only
                          tools; web search is available in plan)
  -C, --cwd DIR           Directory gemini runs in. Sessions are stored per
                          directory, so pass the same DIR again when resuming
  -S, --session-id UUID   Resume this session. Without -S a new session starts
                          under a freshly generated UUID
  -t, --timeout SECONDS   Kill the run after SECONDS (default: none)
  -h, --help              Show this help

Requires GEMINI_API_KEY in the environment, and `gemini` and `node` on PATH.

Output (stdout):
  the model's answer
  SESSION_ID: <uuid>
  TOKENS <model>: <the CLI's token counts for that model, as JSON>
Exit status is non-zero when the CLI reports an error or the timeout fires.
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
    -h|--help) usage 0 ;;
    -*) echo "Unknown option: $1" >&2; usage 1 ;;
    *) [[ -z "$PROMPT_FILE" ]] || { echo "Error: only one prompt file is accepted" >&2; usage 1; }; PROMPT_FILE="$1"; shift ;;
  esac
done

[[ -n "$MODEL" ]] || { echo "Error: -m MODEL is required" >&2; usage 1; }
[[ -n "$PROMPT_FILE" && -f "$PROMPT_FILE" ]] || { echo "Error: prompt file not found: ${PROMPT_FILE:-<none>}" >&2; exit 1; }
[[ "$TIMEOUT" =~ ^[0-9]+$ ]] || { echo "Error: --timeout takes whole seconds" >&2; exit 1; }
[[ -n "${GEMINI_API_KEY:-}" ]] || { echo "Error: GEMINI_API_KEY is not set" >&2; exit 1; }
GEMINI_BIN="$(command -v gemini)" || { echo "Error: gemini not found on PATH" >&2; exit 1; }
command -v node >/dev/null || { echo "Error: node not found on PATH" >&2; exit 1; }

PROMPT="$(cat -- "$PROMPT_FILE")"
[[ -n "$CWD" ]] && cd -P -- "$CWD"

if [[ -n "$RESUME_ID" ]]; then
  SESSION_ARGS=(--resume "$RESUME_ID")
  SESSION="$RESUME_ID"
else
  SESSION="$(uuidgen 2>/dev/null || node -e 'console.log(require("crypto").randomUUID())')"
  SESSION="$(printf '%s' "$SESSION" | tr 'A-Z' 'a-z')"
  SESSION_ARGS=(--session-id "$SESSION")
fi

OUT="$(mktemp)"; ERR="$(mktemp)"
trap 'rm -f "$OUT" "$ERR"' EXIT

"$GEMINI_BIN" --skip-trust --approval-mode "$APPROVAL" -m "$MODEL" -o json \
  "${SESSION_ARGS[@]}" -p "$PROMPT" >"$OUT" 2>"$ERR" &
PID=$!
if [[ "$TIMEOUT" -gt 0 ]]; then
  ( sleep "$TIMEOUT" && kill -TERM "$PID" 2>/dev/null && echo "timeout" >"$ERR.timeout" ) &
  WATCH=$!
fi
set +e; wait "$PID"; STATUS=$?; set -e
if [[ -n "${WATCH:-}" ]]; then kill "$WATCH" 2>/dev/null || true; wait "$WATCH" 2>/dev/null || true; fi
if [[ -f "$ERR.timeout" ]]; then
  rm -f "$ERR.timeout"
  echo "Error: timed out after ${TIMEOUT}s" >&2
  echo "SESSION_ID: $SESSION"
  exit 124
fi

# The CLI prints JSON on stdout; anything before the first "{" is startup noise.
node -e '
const fs = require("fs");
const [out, err, session, status] = process.argv.slice(1);
const raw = fs.readFileSync(out, "utf8");
const i = raw.indexOf("{");
let d = null;
try { d = i >= 0 ? JSON.parse(raw.slice(i)) : null; } catch (_) {}
if (!d || d.error || Number(status) !== 0) {
  process.stderr.write(fs.readFileSync(err, "utf8"));
  if (d && d.error) process.stderr.write(JSON.stringify(d.error) + "\n");
  else if (!d) process.stderr.write(raw);
}
if (d && d.response) console.log(d.response);
console.log("SESSION_ID: " + ((d && d.session_id) || session));
const models = (d && d.stats && d.stats.models) || {};
for (const [m, s] of Object.entries(models)) console.log("TOKENS " + m + ": " + JSON.stringify(s.tokens || s));
process.exit(d && !d.error && Number(status) === 0 ? 0 : 1);
' "$OUT" "$ERR" "$SESSION" "$STATUS"
