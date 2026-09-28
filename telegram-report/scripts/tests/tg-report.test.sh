#!/usr/bin/env bash
# tg-report.sh against a local fake Bot API. Run: bash telegram-report/scripts/tests/tg-report.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../tg-report.sh"
TMP="$(mktemp -d)"
FAILS=0
ok()  { echo "ok   $1"; }
bad() { echo "FAIL $1"; FAILS=$((FAILS + 1)); }

PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
cat > "$TMP/fake.py" <<'PY'
import http.server, json, sys, urllib.parse
log = sys.argv[2]
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        form = urllib.parse.parse_qs(body)
        with open(log, "a") as f:
            f.write(json.dumps({"path": self.path, "form": form}) + "\n")
        if form.get("chat_id") == ["bad"]:
            code, out = 400, {"ok": False, "description": "Bad Request: chat not found"}
        else:
            code, out = 200, {"ok": True, "result": {"message_id": 42}}
        data = json.dumps(out).encode()
        self.send_response(code); self.send_header("Content-Length", str(len(data))); self.end_headers()
        self.wfile.write(data)
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
PY
python3 "$TMP/fake.py" "$PORT" "$TMP/requests.log" &
FAKE=$!
trap 'kill $FAKE 2>/dev/null; rm -rf "$TMP"' EXIT
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$PORT" -X POST 2>/dev/null && break; sleep 0.1; done
: > "$TMP/requests.log"

TOK="123456:SECRET-token-value"
run() { env -i PATH="$PATH" TG_API_BASE="http://127.0.0.1:$PORT" "$@"; }

# success
OUT="$(run TELEGRAM_BOT_TOKEN="$TOK" TELEGRAM_CHAT_ID=-100 bash "$SCRIPT" 2862 "hello" 2>&1)"; RC=$?
[ "$RC" -eq 0 ] && [ "$OUT" = "sent thread=2862 message_id=42" ] && ok "success" || bad "success rc=$RC out=$OUT"
grep -q '"message_thread_id": \["2862"\]' "$TMP/requests.log" && ok "thread id sent" || bad "thread id"

# text from stdin
OUT="$(printf 'from stdin' | run TELEGRAM_BOT_TOKEN="$TOK" TELEGRAM_CHAT_ID=-100 bash "$SCRIPT" 2862 - 2>&1)"; RC=$?
[ "$RC" -eq 0 ] && tail -1 "$TMP/requests.log" | grep -q '"text": \["from stdin"\]' && ok "stdin text" || bad "stdin rc=$RC"

# over-long text is cut to 4096
LONG="$(python3 -c 'print("x"*5000, end="")')"
run TELEGRAM_BOT_TOKEN="$TOK" TELEGRAM_CHAT_ID=-100 bash "$SCRIPT" 2862 "$LONG" >/dev/null 2>&1
LEN="$(tail -1 "$TMP/requests.log" | python3 -c 'import json,sys; print(len(json.loads(sys.stdin.read())["form"]["text"][0]))')"
[ "$LEN" -eq 4096 ] && ok "truncated to 4096" || bad "length $LEN"

# missing creds
OUT="$(run TELEGRAM_CHAT_ID=-100 bash "$SCRIPT" 2862 "x" 2>&1)"; RC=$?
[ "$RC" -eq 3 ] && ok "exit 3 without token" || bad "missing token rc=$RC"
OUT="$(run TELEGRAM_BOT_TOKEN="$TOK" bash "$SCRIPT" 2862 "x" 2>&1)"; RC=$?
[ "$RC" -eq 3 ] && ok "exit 3 without chat" || bad "missing chat rc=$RC"

# usage
OUT="$(run TELEGRAM_BOT_TOKEN="$TOK" TELEGRAM_CHAT_ID=-100 bash "$SCRIPT" "routine: x" "x" 2>&1)"; RC=$?
[ "$RC" -eq 2 ] && ok "exit 2 on non-numeric thread" || bad "usage rc=$RC"

# API error: description only, token absent
OUT="$(run TELEGRAM_BOT_TOKEN="$TOK" TELEGRAM_CHAT_ID=bad bash "$SCRIPT" 2862 "x" 2>&1)"; RC=$?
[ "$RC" -eq 5 ] && printf '%s' "$OUT" | grep -q 'HTTP 400: Bad Request: chat not found' && ok "exit 5 with description" || bad "api error rc=$RC out=$OUT"

# unreachable API
OUT="$(env -i PATH="$PATH" TG_API_BASE="http://127.0.0.1:1" TELEGRAM_BOT_TOKEN="$TOK" TELEGRAM_CHAT_ID=-100 bash "$SCRIPT" 2862 "x" 2>&1)"; RC=$?
[ "$RC" -eq 5 ] && ok "exit 5 when unreachable" || bad "unreachable rc=$RC"

# token never in any output
ALL="$(run TELEGRAM_BOT_TOKEN="$TOK" TELEGRAM_CHAT_ID=-100 bash "$SCRIPT" 2862 "x" 2>&1; run TELEGRAM_BOT_TOKEN="$TOK" TELEGRAM_CHAT_ID=bad bash "$SCRIPT" 2862 "x" 2>&1)"
case "$ALL" in *SECRET*) bad "token leaked to output" ;; *) ok "token absent from output" ;; esac

[ "$FAILS" -eq 0 ] && echo "all tg-report cases PASS" || { echo "$FAILS case(s) FAILED"; exit 1; }
