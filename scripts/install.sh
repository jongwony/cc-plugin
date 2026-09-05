#!/bin/bash
# Install every plugin in the cc-plugin marketplace for Claude Code.
# The plugin list is derived from the marketplace manifest, so adding or
# retiring a plugin needs no edit here.
# Idempotent: safe to re-run when new plugins are added.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/install.sh | bash

set -eo pipefail

REPO="jongwony/cc-plugin"
MARKETPLACE="cc-plugin"
MANIFEST_URL="https://raw.githubusercontent.com/$REPO/main/.claude-plugin/marketplace.json"

command -v claude >/dev/null 2>&1 || { echo "Error: claude CLI not found. Install Claude Code first." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Error: python3 not found." >&2; exit 1; }

echo "Adding marketplace..."
claude plugin marketplace add "https://github.com/$REPO" < /dev/null 2>/dev/null || true

echo "Fetching plugin list..."
plugins=$(curl -fsSL "$MANIFEST_URL" \
  | python3 -c "import json,sys; [print(p['name']) for p in json.load(sys.stdin)['plugins']]")

installed=0
skipped=0

for p in $plugins; do
  if claude plugin install "$p@$MARKETPLACE" < /dev/null 2>/dev/null; then
    installed=$((installed + 1))
    # Install does not guarantee activation: a plugin that was already
    # installed and later disabled reports "already installed" and stays off.
    # `enable` auto-detects the scope that disabled it; it exits non-zero
    # when the plugin is already enabled, which is the common case.
    claude plugin enable "$p@$MARKETPLACE" < /dev/null 2>/dev/null || true
  else
    echo "  Skipped: $p"
    skipped=$((skipped + 1))
  fi
done

echo ""
echo "Installed $installed plugin(s)."
[[ $skipped -gt 0 ]] && echo "$skipped skipped (already installed or unavailable)."
echo "Each plugin's SKILL.md states the prerequisite it needs, if any."
