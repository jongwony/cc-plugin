#!/bin/bash
# Toggle smart caffeinate (sleep prevention + battery/network monitoring)
# Output: STARTED or STOPPED

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="/tmp/caffeinate-smart.pid"

# Check if smart daemon is running (verify it's actually our process)
PID=$(cat "$PIDFILE" 2>/dev/null)
if [[ -n "$PID" ]] && ps -p "$PID" -o command= 2>/dev/null | grep -q "smart-caffeinate"; then
  kill "$PID" 2>/dev/null
  sudo -n pmset -b disablesleep 0 2>/dev/null
  echo "STOPPED"
else
  rm -f "$PIDFILE"
  nohup bash "$SCRIPT_DIR/smart-caffeinate.sh" </dev/null >/dev/null 2>&1 &
  disown
  echo "STARTED"
fi
