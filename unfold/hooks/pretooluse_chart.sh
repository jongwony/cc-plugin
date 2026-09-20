#!/bin/bash
# PreToolUse hook for unfold: the write-intent trigger, delivered at the moment
# it names. SKILL.md states the trigger; a skill description is matched against
# an utterance, so on its own it never reaches the turn where a session is
# already past deciding and about to write. This does.
#
# Two guards keep it cheap, and each fails open:
#   - Owner gate: silent outside a repository whose charts this plugin routes
#     to. The owners come from UNFOLD_CHART_OWNERS (comma-separated), defaulting
#     to the marketplace author's own. A session in an unrelated repository
#     pays one `git remote` call and nothing else.
#   - Once per session: the reminder belongs before the FIRST write. A marker
#     keyed on the session id makes the second and later writes silent, so a
#     long editing run is not lined with copies of it. The marker files are
#     empty and live in the temp directory the OS reclaims.
#
# Any fault — unreadable payload, no git, no writable temp dir — exits 0 and
# injects nothing. A hook that blocks an edit is worse than one that routes less.

set -u

INPUT=$(cat 2>/dev/null) || exit 0

# Field extraction without jq: the payload is one flat JSON object and both
# fields are plain strings. A miss leaves the variable empty and the fallbacks
# below take over.
extract() {
  printf '%s' "$INPUT" \
    | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" \
    | head -1
}

# Both fields are standard in a PreToolUse payload. A miss means the payload is
# not the one this hook was written against, and guessing from $PWD would fire
# the reminder from whatever directory the harness happened to run the hook in.
# Injecting nothing is the stated failure, so take it.
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

# Without a session id there is nothing to key the once-per-session marker on,
# and a reminder repeated at every write is read once and skipped thereafter.
SESSION=$(extract session_id)
[ -n "$SESSION" ] || exit 0
MARKER="${TMPDIR:-/tmp}/unfold-chart-${SESSION//[^A-Za-z0-9_-]/_}"
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
