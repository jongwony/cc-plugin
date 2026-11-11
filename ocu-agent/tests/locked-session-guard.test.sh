#!/usr/bin/env bash
# Pipe test for scripts/locked-session-guard.sh: stub ocu, pgrep, caffeinate,
# ioreg and sleep on PATH, feed PreToolUse JSON on stdin, assert on the
# decision printed and on which stubs were called.
# Usage: locked-session-guard.test.sh [path/to/guard.sh]

here=$(cd "$(dirname "$0")" && pwd)
guard=${1:-"$here/../scripts/locked-session-guard.sh"}
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/bin-no-ocu"

cat >"$T/bin/ocu" <<'EOF'
#!/bin/bash
echo "$*" >>"$STUB_LOG/ocu"
[ "${STUB_OCU_RC:-0}" = 0 ] || exit "$STUB_OCU_RC"
cat "$STUB_STATUS"
EOF
cat >"$T/bin/pgrep" <<'EOF'
#!/bin/bash
echo "$*" >>"$STUB_LOG/pgrep"
exit "${STUB_PGREP_RC:-1}"
EOF
cat >"$T/bin/caffeinate" <<'EOF'
#!/bin/bash
echo "$*" >>"$STUB_LOG/caffeinate"
EOF
cat >"$T/bin/sleep" <<'EOF'
#!/bin/bash
echo "$*" >>"$STUB_LOG/sleep"
EOF
cat >"$T/bin/ioreg" <<'EOF'
#!/bin/bash
echo "    \"DCPPowerState\" = ${STUB_DISPLAY:-0}"
EOF
chmod +x "$T"/bin/*
for s in pgrep caffeinate sleep ioreg; do cp "$T/bin/$s" "$T/bin-no-ocu/$s"; done

status_json() {
  printf '{"available":%s,"blockers":[%s],"session":{"state":"%s"}}' "$2" "$3" "$1" >"$T/status.json"
}
event_mcp()   { printf '{"session_id":"s","hook_event_name":"PreToolUse","tool_name":"mcp__plugin_ocu-agent_ocu__%s","tool_input":{"app":"Finder"}}' "$1"; }
event_bash()  { printf '{"session_id":"s","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"%s"}}' "$1"; }
event_agent() { printf '{"session_id":"s","hook_event_name":"PreToolUse","tool_name":"Agent","tool_input":{"subagent_type":"%s","prompt":"read the Finder window"}}' "$1"; }

run() {
  rm -rf "$T/log"; mkdir -p "$T/log"
  out=$(printf '%s' "$1" | STUB_LOG="$T/log" STUB_STATUS="$T/status.json" PATH="${BIN:-$T/bin}:/usr/bin:/bin" "$guard")
  rc=$?
  for _ in 1 2 3 4 5 6 7 8 9 10; do [ -e "$T/log/caffeinate" ] && break; /bin/sleep 0.05; done
}
calls() { [ -e "$T/log/$1" ] && wc -l <"$T/log/$1" | tr -d ' ' || echo 0; }
decision() { printf '%s' "$out" | plutil -extract hookSpecificOutput.permissionDecision raw -o - - 2>/dev/null; }

fails=0
check() {
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected [$3], got [$2]"; fails=$((fails + 1)); fi
}

status_json unlocked true ''
run "$(event_mcp query)"
check "unlocked: silent allow"            "$rc|$out|$(calls ocu)|$(calls caffeinate)" "0||1|0"

status_json locked true ''
STUB_DISPLAY=0 STUB_PGREP_RC=1 run "$(event_mcp query)"
check "locked+available, display off: wake and settle" "$rc|$out|$(cat "$T/log/caffeinate" 2>/dev/null)|$(cat "$T/log/sleep" 2>/dev/null)" "0||-u -t 120|2"
check "locked+available: pgrep names the -u caffeinate" "$(cat "$T/log/pgrep")" "-qf caffeinate -u"

STUB_DISPLAY=4 STUB_PGREP_RC=0 run "$(event_mcp query)"
check "locked+available, wake already running: nothing started" "$rc|$out|$(calls caffeinate)|$(calls sleep)" "0||0|0"

status_json locked false '"client \"claude\" is not approved"'
run "$(event_mcp get_app_state)"
check "locked+unavailable: deny"           "$rc|$(decision)|$(calls caffeinate)" "0|deny|0"
reason=$(printf '%s' "$out" | plutil -extract hookSpecificOutput.permissionDecisionReason raw -o - - 2>/dev/null)
case "$reason" in *'ocu locked-use enable'*'client "claude" is not approved'*) r=cause ;; *) r="missing: $reason" ;; esac
check "deny carries the user's act and the blocker" "$r" "cause"

run "$(event_mcp list_apps)"
check "list_apps: no status read"          "$rc|$out|$(calls ocu)" "0||0"

BIN="$T/bin-no-ocu" run "$(event_mcp query)"
check "ocu missing: allow"                 "$rc|$out" "0|"

STUB_OCU_RC=1 run "$(event_mcp query)"
check "status call fails: allow"           "$rc|$out" "0|"

printf 'not json' >"$T/status.json"
run "$(event_mcp query)"
check "status unreadable: allow"           "$rc|$out" "0|"

status_json locked false ''
run "$(event_bash 'git status')"
check "Bash without ocu: no status read"   "$rc|$out|$(calls ocu)" "0||0"
run "$(event_bash './host-tools/ocu-call.sh jongwony < step.js')"
check "Bash ocu-call.sh: no status read"   "$rc|$out|$(calls ocu)" "0||0"
run "$(event_bash 'ocu js step.js')"
check "Bash ocu js, locked+unavailable: deny" "$rc|$(decision)" "0|deny"
run "$(event_bash 'cat step.js | ocu js -')"
check "Bash piped into ocu: deny"          "$rc|$(decision)" "0|deny"
run "$(event_bash 'cd /tmp\nocu js step.js')"
check "Bash ocu after a newline: deny"     "$rc|$(decision)" "0|deny"
run "$(event_bash 'ocu locked-use status --json')"
check "Bash ocu locked-use, unavailable: not denied" "$rc|$out|$(calls ocu)" "0||1"

status_json locked true ''
STUB_DISPLAY=0 STUB_PGREP_RC=1 run "$(event_bash 'ocu locked-use status --json')"
check "Bash ocu locked-use, available: wake" "$rc|$out|$(cat "$T/log/caffeinate" 2>/dev/null)" "0||-u -t 120"

status_json locked false ''
run "$(event_agent 'Explore')"
check "Agent, another type: no status read" "$rc|$out|$(calls ocu)" "0||0"
run "$(event_agent 'ocu-agent:ocu-operator')"
check "Agent ocu-operator, unavailable: deny" "$rc|$(decision)" "0|deny"
status_json locked true ''
STUB_DISPLAY=0 STUB_PGREP_RC=1 run "$(event_agent 'ocu-agent:ocu-operator')"
check "Agent ocu-operator, available: wake" "$rc|$out|$(cat "$T/log/caffeinate" 2>/dev/null)" "0||-u -t 120"

run '{"tool_name":"Read","tool_input":{"file_path":"ocu js"}}'
check "another tool: no status read"       "$rc|$out|$(calls ocu)" "0||0"

echo "---"
if [ "$fails" -eq 0 ]; then echo "all passed"; else echo "$fails failed"; exit 1; fi
