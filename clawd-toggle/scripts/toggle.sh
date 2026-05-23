#!/bin/bash
# Toggle clawd-on-desk (Electron desktop pet) as a background process.
# Output: STARTED or STOPPED
#
# `npm start` spawns a node -> electron child tree. We launch it in its own
# process group (perl setpgrp) and track that PID, so STOP can kill the whole
# group instead of orphaning the electron windows.
#
# Config: CLAWD_ON_DESK_DIR env var (default: repo path below)

CLAWD_DIR="${CLAWD_ON_DESK_DIR:-/Users/choi/Downloads/github/oss/clawd-on-desk}"
PIDFILE="/tmp/clawd-on-desk.pid"
LOGFILE="/tmp/clawd-on-desk.log"

# Check if our process is running (verify the tracked PID is still the launcher).
PID=$(cat "$PIDFILE" 2>/dev/null)
if [[ -n "$PID" ]] && ps -p "$PID" -o command= 2>/dev/null | grep -qiE 'npm|electron|clawd'; then
  # Negative PID targets the whole process group; fall back to single PID.
  kill -TERM "-$PID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null
  rm -f "$PIDFILE"
  echo "STOPPED"
else
  rm -f "$PIDFILE"
  if [[ ! -d "$CLAWD_DIR" ]]; then
    echo "ERROR: clawd-on-desk dir not found: $CLAWD_DIR" >&2
    exit 1
  fi
  cd "$CLAWD_DIR" || exit 1
  # setpgrp makes the launcher its own group leader (PID == PGID) so the entire
  # npm -> node -> electron tree is killable via the negative-PID group signal.
  nohup perl -e 'setpgrp; exec @ARGV' npm start </dev/null >"$LOGFILE" 2>&1 &
  echo $! > "$PIDFILE"
  disown 2>/dev/null
  echo "STARTED"
fi
