#!/bin/bash
# Toggle the voice-dictation push-to-talk daemon as a background process.
# Output: STARTED or STOPPED
#
# Signature-based (not PID-based): `uv run` re-parents into a child python
# process, so the uv launcher PID is a dead pointer. We pgrep/pkill by the
# on-disk daemon script path signature instead, matching clawd-toggle.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAEMON="$SCRIPT_DIR/dictation_daemon.py"
# Full-path signature (matches clawd-toggle): the absolute $DAEMON path appears
# in the `uv run "$DAEMON"` argv, so pgrep/pkill -f tracks exactly this plugin's
# daemon and won't match an unrelated process that merely shares the basename.
SIG="$DAEMON"
LOGFILE="/tmp/voice-dictation.log"

if pgrep -f "$SIG" >/dev/null 2>&1; then
  pkill -TERM -f "$SIG" 2>/dev/null
  sleep 1
  pkill -KILL -f "$SIG" 2>/dev/null
  # The daemon spawns `rec` as a child writing voice_dictation.wav; that child's
  # argv carries the WAV path, not $SIG, so reap it explicitly — otherwise it
  # keeps holding the mic if the daemon is toggled off mid-recording. Send SIGINT
  # (not SIGTERM/KILL) first so sox closes the CoreAudio input device cleanly and
  # releases the mic — an abruptly killed recorder leaves the orange mic indicator
  # stuck on. SIGKILL only as a fallback for a straggler that ignored SIGINT.
  pkill -INT -f "voice_dictation.wav" 2>/dev/null
  sleep 0.3
  pkill -KILL -f "voice_dictation.wav" 2>/dev/null
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
