#!/bin/bash
# Smart caffeinate daemon
# Prevents clamshell sleep via pmset disablesleep + caffeinate -ims
# Auto-stop conditions:
#   1. Battery drops below threshold (default 30%)
#   2. Network connectivity lost (hotspot off — Wi-Fi, USB, or Bluetooth)
#
# Config: CAFFEINATE_BATTERY_THRESHOLD env var (default: 30)
# Requires: passwordless sudo for pmset (/etc/sudoers.d/pmset)

THRESHOLD=${CAFFEINATE_BATTERY_THRESHOLD:-30}
CHECK_INTERVAL=60
GRACE_MAX=2  # consecutive failures before stop
PIDFILE=/tmp/caffeinate-smart.pid

# Own PID file — daemon is the single owner
echo "$$" > "$PIDFILE"

# Prevent clamshell sleep on battery
sudo -n pmset -b disablesleep 1 2>/dev/null

caffeinate -ims </dev/null >/dev/null 2>&1 &
CAFF_PID=$!
NET_FAIL=0

cleanup() {
  sudo -n pmset -b disablesleep 0 2>/dev/null
  kill "$CAFF_PID" 2>/dev/null
  rm -f "$PIDFILE"
}
trap cleanup EXIT

while kill -0 "$CAFF_PID" 2>/dev/null; do
  sleep "$CHECK_INTERVAL" &
  wait "$!"

  BATT=$(pmset -g batt | sed -n 's/.*[[:space:]]\([0-9]*\)%.*/\1/p;q')

  # Network check with grace period (tolerates brief disconnects during handoff)
  if ! route get default >/dev/null 2>&1; then
    NET_FAIL=$((NET_FAIL + 1))
    if [[ "$NET_FAIL" -ge "$GRACE_MAX" ]]; then
      exit 0
    fi
  else
    NET_FAIL=0
  fi
  if [[ -n "$BATT" ]] && [[ "$BATT" -lt "$THRESHOLD" ]]; then
    exit 0
  fi
done
