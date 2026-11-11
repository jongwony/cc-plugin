#!/usr/bin/env bash
# PreToolUse guard: deny an ocu call with the cause while the Mac session is
# locked and Locked Use cannot serve it. Exit 0 with no output lets the call
# through.

input=""
IFS= read -r -d '' input || true

name_re='"tool_name"[[:space:]]*:[[:space:]]*"([^"]*)"'
tool=""
[[ $input =~ $name_re ]] && tool=${BASH_REMATCH[1]}

case "$tool" in
  mcp__plugin_ocu-agent_ocu__list_apps) exit 0 ;;
  mcp__plugin_ocu-agent_ocu__*) ;;
  Bash)
    ocu_re='(\\[nt]|[^[:alnum:]_.-])ocu[[:space:]]'
    [[ $input =~ $ocu_re ]] || exit 0
    diag_re='ocu[[:space:]]+locked-use'
    [[ $input =~ $diag_re ]] && exit 0
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
[ "$available" = "true" ] && exit 0

blocker=$(field blockers.0) || blocker=""
reason="The Mac session is locked and Locked Use is not available, so Open Computer Use cannot reach any app window. Enabling Locked Use (ocu locked-use enable) is the user's act. Make no ocu call and report this cause.${blocker:+ Locked Use blocker: $blocker}"
reason=${reason//\\/\\\\}
reason=${reason//\"/\\\"}
reason=${reason//$'\n'/ }
reason=${reason//$'\t'/ }
printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}\n' "$reason"
