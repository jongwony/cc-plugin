#!/usr/bin/env bash
# PreToolUse guard for ocu GUI tools: deny with the cause when the macOS
# session is locked and Locked Use cannot serve the call. Any other state,
# or a status that cannot be read, lets the call through.
status=$(open-computer-use locked-use status --json 2>/dev/null) || exit 0
field() { printf '%s' "$status" | plutil -extract "$1" raw -o - - 2>/dev/null; }
state=$(field session.state) || exit 0
available=$(field available) || available=false
[ "$state" = "locked" ] && [ "$available" != "true" ] || exit 0

blocker=$(field blockers.0) || blocker=""
reason="The Mac session is locked, so Open Computer Use cannot reach any app window (its GUI calls fail with NSPOSIXErrorDomain Code=2 in this state). Unlocking the Mac at the machine itself, or enabling Locked Use (ocu locked-use enable, the user's act), restores it. Stop GUI work and report this cause.${blocker:+ Locked Use: $blocker}"
reason=${reason//\\/\\\\}
reason=${reason//\"/\\\"}
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
