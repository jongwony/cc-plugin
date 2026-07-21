#!/bin/bash
# Toggle smart caffeinate (sleep prevention + battery/network monitoring)
# Output: STARTED or STOPPED

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="${HOME}/.cache/caffeinate-smart.pid"

# Check if smart daemon is running (verify it's actually our process)
PID=$(cat "$PIDFILE" 2>/dev/null)
if [[ -n "$PID" ]] && ps -p "$PID" -o command= 2>/dev/null | grep -q "smart-caffeinate"; then
  PIDS="$PID"
else
  # Pidfile unreadable — scan instead, so a daemon orphaned by a lost pidfile
  # (the pre-fix /tmp location, pruned after 3 days) stays stoppable. Without
  # this the toggle falls through to the start branch and stacks a duplicate.
  PIDS=$(pgrep -f 'smart-caffeinate\.sh')
fi

if [[ -n "$PIDS" ]]; then
  # Kill every match — duplicates may already have stacked up before this fix
  kill $PIDS 2>/dev/null
  sudo -n pmset -b disablesleep 0 2>/dev/null
  echo "STOPPED"
else
  rm -f "$PIDFILE"
  nohup bash "$SCRIPT_DIR/smart-caffeinate.sh" </dev/null >/dev/null 2>&1 &
  disown
  echo "STARTED"
fi
