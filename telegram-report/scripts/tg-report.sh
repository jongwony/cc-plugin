#!/usr/bin/env bash
# Post one message into a fixed forum topic of the Telegram group.
#
#   tg-report.sh <thread-id> <text>      text "-" reads stdin
#
# SEND ONLY: never creates a topic and never reads updates (the group's resident bridge is
# the bot's only reader). The thread id comes from the caller — a routine file records it.
#
# Environment:
#   TELEGRAM_BOT_TOKEN   required
#   TELEGRAM_CHAT_ID     required
#   TG_API_BASE          Bot API base URL (default https://api.telegram.org)
#
# Exit: 0 sent · 2 usage · 3 credentials missing · 5 send failed.
# The token never reaches argv or output: the URL goes to curl on stdin (-K -), and a
# failure reports only the HTTP status and Telegram's own `description` field.

set -uo pipefail

API_BASE="${TG_API_BASE:-https://api.telegram.org}"
MAX_TEXT=4096

die() { echo "tg-report: $2" >&2; exit "$1"; }

[ "$#" -eq 2 ] || die 2 "usage: tg-report.sh <thread-id> <text|->"
THREAD="$1"
TEXT="$2"
case "$THREAD" in ''|*[!0-9]*) die 2 "thread id must be digits: '$THREAD'" ;; esac
[ "$TEXT" = "-" ] && TEXT="$(cat)"
[ -n "$TEXT" ] || die 2 "empty text"
[ "${#TEXT}" -le "$MAX_TEXT" ] || TEXT="${TEXT:0:$((MAX_TEXT - 1))}…"

TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHAT="${TELEGRAM_CHAT_ID:-}"
[ -n "$TOKEN" ] && [ -n "$CHAT" ] || die 3 "TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID missing from the environment"

raw="$(printf 'url = "%s/bot%s/sendMessage"\n' "$API_BASE" "$TOKEN" \
  | curl -s --connect-timeout 5 --max-time 20 -K - -w '\n%{http_code}' \
      --data-urlencode "chat_id=$CHAT" --data-urlencode "message_thread_id=$THREAD" \
      --data-urlencode "text=$TEXT" 2>/dev/null)"
rc=$?
[ "$rc" -eq 0 ] || die 5 "sendMessage failed (curl exit $rc)"
HTTP="${raw##*$'\n'}"
BODY="${raw%$'\n'*}"

# Telegram's own fields only — never the raw body, which a proxy's error page could fill
# with the requested URL and so with the token.
field() {
  printf '%s' "$BODY" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
v = d.get("description") if sys.argv[1] == "description" else (d.get("result") or {}).get("message_id")
print("" if v is None else v)' "$1" 2>/dev/null
}

case "$HTTP" in
  2??) echo "sent thread=$THREAD message_id=$(field message_id)" ;;
  *)   desc="$(field description)"; die 5 "sendMessage failed (HTTP ${HTTP:-none}: ${desc:-no description})" ;;
esac
