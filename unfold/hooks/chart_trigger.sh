#!/bin/bash
# unfold's write-intent trigger, delivered at the moment it names, and reset at
# every context epoch.
#
# SKILL.md states the trigger; a skill description is matched against an
# utterance, so on its own it never reaches the turn where a session is already
# past deciding and about to write. This does.
#
# Two events, one script:
#
#   PreToolUse (edit tools) — inject the trigger, behind two guards:
#     - Owner gate: silent outside a repository whose charts this plugin routes
#       to. The owners come from UNFOLD_CHART_OWNERS (comma-separated),
#       defaulting to the marketplace author's own. A session in an unrelated
#       repository pays one `git remote` call and nothing else.
#     - Once per epoch: the reminder belongs before the FIRST write. An empty
#       marker file, keyed on the session id and living in the temp directory
#       the OS reclaims, makes the second and later writes silent, so a long
#       editing run is not lined with copies of it.
#
#   SessionStart — remove the marker, so the next write re-injects.
#     The harness fires this at every context epoch (startup, resume, clear,
#     compact, fork). Compaction is the one that matters: it drops the injected
#     line out of context, and a marker that outlived it would leave the rest of
#     the session with no trigger at all. Resetting here is correct whether or
#     not the session id survives an epoch, which the hook docs do not settle.
#
# Any fault — unreadable payload, a payload without the fields this hook was
# written against, no git, no writable temp dir — exits 0 and injects nothing.
# Guessing from $PWD would fire the reminder from whatever directory the harness
# happened to run the hook in. A hook that blocks an edit is worse than one that
# routes less.

set -u

INPUT=$(cat 2>/dev/null) || exit 0

# Field extraction without jq: the payload is one flat JSON object and every
# field this hook reads is a plain string. A miss leaves the variable empty.
extract() {
  printf '%s' "$INPUT" \
    | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" \
    | head -1
}

SESSION=$(extract session_id)
[ -n "$SESSION" ] || exit 0
MARKER="${TMPDIR:-/tmp}/unfold-chart-${SESSION//[^A-Za-z0-9_-]/_}"

if [ "$(extract hook_event_name)" = "SessionStart" ]; then
  rm -f "$MARKER" 2>/dev/null
  exit 0
fi

CWD=$(extract cwd)
[ -n "$CWD" ] && [ -d "$CWD" ] || exit 0

ORIGIN=$(git -C "$CWD" remote get-url origin 2>/dev/null) || exit 0
[ -n "$ORIGIN" ] || exit 0

OWNERS=${UNFOLD_CHART_OWNERS:-jongwony}
MATCH=0
IFS=','
for owner in $OWNERS; do
  owner=${owner## }; owner=${owner%% }
  [ -n "$owner" ] || continue
  case "$ORIGIN" in
    *"/$owner/"*|*":$owner/"*) MATCH=1; break ;;
  esac
done
unset IFS
[ "$MATCH" -eq 1 ] || exit 0

[ -e "$MARKER" ] && exit 0
: > "$MARKER" 2>/dev/null || true

cat << 'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "[unfold] This turn writes to a repository. If this unit's chart is not open yet, open it before the write: invoke the unfold skill's `open` moment, which matches the intent against the catalog of project root issues — in progress first — and loads that one chart, reading its five sections and its decision comments. Load no chart the intent did not select. If the chart for this unit is already open, or the write belongs to no tracked unit, carry on without it."
  }
}
JSON
