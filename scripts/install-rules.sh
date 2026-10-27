#!/bin/bash
# Write the portable rules in rules/ into ~/.claude/CLAUDE.md for a Claude Code
# cloud session, which reads neither the local ~/.claude/rules nor claude.ai
# profile instructions. Paste the Usage line into the cloud environment's
# setup script.
#
# The rules go between two marker lines; anything else in ~/.claude/CLAUDE.md
# stays. Re-running replaces the block, so the result is idempotent.
# rules/manifest lists the files to install, one per line; `#` starts a
# comment and blank lines are skipped. README.md is for people and is not listed. Only raw.githubusercontent.com is fetched: a cloud
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

manifest=$(curl -fsSL "https://raw.githubusercontent.com/$REPO/$REF/rules/manifest")
names=()
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%%#*}"
  line="${line//$'\r'/}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  if [ -n "$line" ]; then names+=("$line"); fi
done <<< "$manifest"
[ "${#names[@]}" -gt 0 ] || { echo "Error: no rule files found at $REPO@$REF" >&2; exit 1; }

block=$(mktemp)
trap 'rm -f "$block"' EXIT
{
  echo "$BEGIN"
  echo "<!-- source: https://github.com/$REPO/tree/$REF/rules -->"
  for n in "${names[@]}"; do
    echo
    curl -fsSL "https://raw.githubusercontent.com/$REPO/$REF/rules/$n"
  done
  echo
  echo "$END"
} > "$block"

mkdir -p "$(dirname "$TARGET")"
touch "$TARGET"
python3 - "$TARGET" "$block" "$BEGIN" "$END" <<'PY'
import os, shutil, sys, tempfile


def main():
    target, block, begin, end = sys.argv[1:5]
    target = os.path.realpath(target)
    text = open(target, encoding="utf-8").read()
    new = open(block, encoding="utf-8").read().rstrip("\n") + "\n"
    i, j = -1, text.find(end)
    while j != -1:
        i = text.rfind(begin, 0, j)
        if i != -1:
            break
        j = text.find(end, j + len(end))
    if i != -1 and j != -1:
        text = text[:i] + new + text[j + len(end):].lstrip("\n")
    else:
        text = (text.rstrip("\n") + "\n\n" if text.strip() else "") + new
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(target), prefix=".install-rules.")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        shutil.copymode(target, tmp)
        os.replace(tmp, target)
    except BaseException:
        os.unlink(tmp)
        raise


main()
PY

echo "Installed ${#names[@]} rule files from $REPO@$REF into $TARGET"
