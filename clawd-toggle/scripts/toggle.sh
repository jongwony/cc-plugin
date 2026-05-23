#!/bin/bash
# Toggle clawd-on-desk (Electron desktop pet) as a background process.
# Output: STARTED or STOPPED
#
# Detection is signature-based, not launcher-PID-based: `npm start` only
# bootstraps the app — the node launcher exits once electron is up, and
# electron re-parents into its own process group. Tracking the launcher PID
# leaves a dead pointer and orphans the real electron tree, so we instead
# pgrep/pkill the running electron processes by their on-disk path.
#
# Config: CLAWD_ON_DESK_DIR env var (default: repo path below)

CLAWD_DIR="${CLAWD_ON_DESK_DIR:-/Users/choi/Downloads/github/oss/clawd-on-desk}"
LOGFILE="/tmp/clawd-on-desk.log"

# Path signature shared by the main electron process and all its helpers.
SIG="$CLAWD_DIR/node_modules/electron"

if pgrep -f "$SIG" >/dev/null 2>&1; then
  # Terminate the whole tree (main + helpers); SIGKILL any stragglers.
  pkill -TERM -f "$SIG" 2>/dev/null
  sleep 1
  pkill -KILL -f "$SIG" 2>/dev/null
  echo "STOPPED"
else
  if [[ ! -d "$CLAWD_DIR" ]]; then
    echo "ERROR: clawd-on-desk dir not found: $CLAWD_DIR" >&2
    exit 1
  fi
  cd "$CLAWD_DIR" || exit 1
  nohup npm start </dev/null >"$LOGFILE" 2>&1 &
  disown 2>/dev/null
  echo "STARTED"
fi
