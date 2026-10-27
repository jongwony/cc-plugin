#!/bin/bash
# Write the portable rules in rules/ into ~/.claude/CLAUDE.md for a Claude Code
# cloud session, which reads neither the local ~/.claude/rules nor claude.ai
# profile instructions. Paste the Usage line into the cloud environment's
# setup script.
#
# The rules go between two marker lines; anything else in ~/.claude/CLAUDE.md
# stays. Re-running replaces the block, so the result is idempotent.
# rules/manifest lists the files to install, one per line; README.md is for
# people and is not listed. Only raw.githubusercontent.com is fetched: a cloud
# session's GitHub proxy refuses API and archive requests for repositories not
# attached to the session.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/install-rules.sh | bash
# Pin a version:
#   curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/install-rules.sh | CC_RULES_REF=<sha-or-tag> bash

set -eo pipefail

REPO="jongwony/cc-plugin"
REF="${CC_RULES_REF:-main}"
TARGET="${CC_RULES_TARGET:-$HOME/.claude/CLAUDE.md}"
BEGIN="<!-- cc-plugin rules: begin -->"
END="<!-- cc-plugin rules: end -->"

command -v curl >/dev/null 2>&1 || { echo "Error: curl not found." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Error: python3 not found." >&2; exit 1; }

names=$(curl -fsSL "https://raw.githubusercontent.com/$REPO/$REF/rules/manifest" | grep -v '^[[:space:]]*$')
[ -n "$names" ] || { echo "Error: no rule files found at $REPO@$REF" >&2; exit 1; }

block=$(mktemp)
trap 'rm -f "$block"' EXIT
{
  echo "$BEGIN"
  echo "<!-- source: https://github.com/$REPO/tree/$REF/rules -->"
  for n in $names; do
    echo
    curl -fsSL "https://raw.githubusercontent.com/$REPO/$REF/rules/$n"
  done
  echo
  echo "$END"
} > "$block"

mkdir -p "$(dirname "$TARGET")"
touch "$TARGET"
python3 - "$TARGET" "$block" "$BEGIN" "$END" <<'PY'
import sys
target, block, begin, end = sys.argv[1:5]
text = open(target, encoding="utf-8").read()
new = open(block, encoding="utf-8").read().rstrip("\n") + "\n"
i, j = text.find(begin), text.find(end)
if i != -1 and j != -1 and j > i:
    text = text[:i] + new + text[j + len(end):].lstrip("\n")
else:
    text = (text.rstrip("\n") + "\n\n" if text.strip() else "") + new
open(target, "w", encoding="utf-8").write(text)
PY

echo "Installed $(echo "$names" | wc -l | tr -d ' ') rule files from $REPO@$REF into $TARGET"
