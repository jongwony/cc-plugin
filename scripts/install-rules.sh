#!/bin/bash
# Install choi's rules for a Claude Code cloud session: each file that
# scripts/install-rules.manifest lists is written to <config>/rules/, where
# <config> is $CLAUDE_CONFIG_DIR when set and ~/.claude otherwise. Claude Code
# loads every rule there at session start. scripts/cloud-setup.sh runs it; run
# it on its own to pin a version.
#
# The manifest lists repository paths, one per line; `#` starts a comment and
# blank lines are skipped. Every file is fetched before any is written, so a
# failed fetch leaves the installed set as it was and exits non-zero. A file an
# earlier run installed and the manifest no longer lists is removed. Only
# raw.githubusercontent.com is fetched: a cloud session's GitHub proxy refuses
# API and archive requests for repositories not attached to the session.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/install-rules.sh | bash
# Pin a version:
#   curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/install-rules.sh | CC_RULES_REF=<sha-or-tag> bash

set -eo pipefail

REPO="jongwony/cc-plugin"
REF="${CC_RULES_REF:-main}"
RAW="https://raw.githubusercontent.com/$REPO/$REF"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
DEST="$CLAUDE_DIR/rules"
STATE="$CLAUDE_DIR/.cc-plugin-rules"

command -v curl >/dev/null 2>&1 || { echo "Error: curl not found." >&2; exit 1; }

manifest=$(curl -fsSL "$RAW/scripts/install-rules.manifest")
paths=()
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%%#*}"
  line="${line//$'\r'/}"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  if [ -n "$line" ]; then paths+=("$line"); fi
done <<< "$manifest"
[ "${#paths[@]}" -gt 0 ] || { echo "Error: no rule files found at $REPO@$REF" >&2; exit 1; }

mkdir -p "$DEST"
stage=$(mktemp -d "$CLAUDE_DIR/.install-rules.XXXXXX")
trap 'rm -rf "$stage"' EXIT

names=()
for p in "${paths[@]}"; do
  n="${p##*/}"
  case " ${names[*]} " in *" $n "*) echo "Error: two manifest entries install as $n" >&2; exit 1 ;; esac
  names+=("$n")
  curl -fsSL "$RAW/$p" -o "$stage/$n"
  [ -s "$stage/$n" ] || { echo "Error: $p is empty at $REPO@$REF" >&2; exit 1; }
done

for n in "${names[@]}"; do mv -f "$stage/$n" "$DEST/$n"; done

if [ -f "$STATE" ]; then
  while IFS= read -r old || [ -n "$old" ]; do
    case $old in ""|*/*) continue ;; esac
    case " ${names[*]} " in *" $old "*) ;; *) rm -f "$DEST/$old" ;; esac
  done < "$STATE"
fi
printf '%s\n' "${names[@]}" > "$stage/state"
mv -f "$stage/state" "$STATE"

echo "Installed ${#names[@]} rule files from $REPO@$REF into $DEST"
