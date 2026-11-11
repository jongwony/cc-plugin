#!/usr/bin/env bash
# PreToolUse guard: before an ocu call on a locked Mac, wake the display when
# Locked Use can serve the call and deny with the cause when it cannot.
# Exit 0 with no output lets the call through.

input=""
IFS= read -r -d '' input || true

name_re='"tool_name"[[:space:]]*:[[:space:]]*"([^"]*)"'
tool=""
[[ $input =~ $name_re ]] && tool=${BASH_REMATCH[1]}

may_deny=1
case "$tool" in
  mcp__plugin_ocu-agent_ocu__list_apps) exit 0 ;;
  mcp__plugin_ocu-agent_ocu__*) ;;
  Bash)
    ocu_re='(\\[nt]|[^[:alnum:]_.-])ocu[[:space:]]'
    [[ $input =~ $ocu_re ]] || exit 0
    diag_re='ocu[[:space:]]+locked-use'
    [[ $input =~ $diag_re ]] && may_deny=0
    ;;
  Agent)
    agent_re='"subagent_type"[[:space:]]*:[[:space:]]*"ocu-agent:ocu-operator"'
    [[ $input =~ $agent_re ]] || exit 0
    ;;
  *) exit 0 ;;
esac

status=$(ocu locked-use status --json 2>/dev/null) || exit 0
field() { printf '%s' "$status" | plutil -extract "$1" raw -o - - 2>/dev/null; }
state=$(field session.state) || exit 0
[ "$state" = "locked" ] || exit 0
available=$(field available) || available=false

if [ "$available" = "true" ]; then
  ioreg -r -c AppleDCPExpert -d1 -w0 2>/dev/null | grep -q '"DCPPowerState" = 4' && display_on=1 || display_on=0
  pgrep -qf 'caffeinate -u' || { nohup caffeinate -u -t 120 </dev/null >/dev/null 2>&1 & }
  [ "$display_on" = 1 ] || sleep 2
  exit 0
fi

[ "$may_deny" = 1 ] || exit 0

blocker=$(field blockers.0) || blocker=""
reason="The Mac session is locked and Locked Use is not available, so Open Computer Use cannot reach any app window. Enabling Locked Use (ocu locked-use enable) is the user's act. Make no ocu call and report this cause.${blocker:+ Locked Use blocker: $blocker}"
reason=${reason//\\/\\\\}
reason=${reason//\"/\\\"}
reason=${reason//$'\n'/ }
reason=${reason//$'\t'/ }
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
