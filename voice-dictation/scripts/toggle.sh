#!/bin/bash
# Toggle the voice-dictation push-to-talk daemon as a background process.
# Output: STARTED or STOPPED
#
# Signature-based (not PID-based): `uv run` re-parents into a child python
# process, so the uv launcher PID is a dead pointer. We pgrep/pkill by the
# on-disk daemon script path signature instead, matching clawd-toggle.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAEMON="$SCRIPT_DIR/dictation_daemon.py"
SIG="dictation_daemon.py"
LOGFILE="/tmp/voice-dictation.log"

if pgrep -f "$SIG" >/dev/null 2>&1; then
  pkill -TERM -f "$SIG" 2>/dev/null
  sleep 1
  pkill -KILL -f "$SIG" 2>/dev/null
  echo "STOPPED"
else
  if [[ ! -f "$DAEMON" ]]; then
    echo "ERROR: daemon not found: $DAEMON" >&2
    exit 1
  fi
  nohup uv run "$DAEMON" </dev/null >"$LOGFILE" 2>&1 &
  disown 2>/dev/null
  echo "STARTED"
fi
