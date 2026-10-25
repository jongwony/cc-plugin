#!/usr/bin/env bash
# PreToolUse guard for ocu GUI tools while the macOS session is locked.
# Locked Use unavailable: deny with the cause. Locked Use available: keep the
# display on for the run (Guardian cannot observe input with it off) and, if it
# was off, give it time to come up before the call. Any other state, or a
# status that cannot be read, lets the call through.
status=$(open-computer-use locked-use status --json 2>/dev/null) || exit 0
field() { printf '%s' "$status" | plutil -extract "$1" raw -o - - 2>/dev/null; }
state=$(field session.state) || exit 0
[ "$state" = "locked" ] || exit 0
available=$(field available) || available=false

if [ "$available" = "true" ]; then
  # Any display coprocessor at power state 4 means a display is on.
  ioreg -r -c AppleDCPExpert -d1 -w0 2>/dev/null | grep -q '"DCPPowerState" = 4' && display_on=1 || display_on=0
  pgrep -qf 'caffeinate -u -t 120' || { nohup caffeinate -u -t 120 </dev/null >/dev/null 2>&1 & }
  [ "$display_on" = 1 ] || sleep 2
  exit 0
fi

blocker=$(field blockers.0) || blocker=""
reason="The Mac session is locked, so Open Computer Use cannot reach any app window (its GUI calls fail with NSPOSIXErrorDomain Code=2 in this state). Unlocking the Mac at the machine itself, or enabling Locked Use (ocu locked-use enable, the user's act), restores it. Stop GUI work and report this cause.${blocker:+ Locked Use: $blocker}"
reason=${reason//\\/\\\\}
reason=${reason//\"/\\\"}
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
