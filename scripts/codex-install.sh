#!/bin/bash
# Install this marketplace's Codex-facing plugins for the OpenAI Codex CLI.
#
# Codex reads the same .claude-plugin/marketplace.json this repo already
# publishes, and it will happily install any plugin listed there. So the
# question this script answers is not "which plugins CAN Codex install" — all of
# them can — but "which ones are MEANT for Codex". That opt-in is marked by a
# {plugin}/.codex-plugin/plugin.json, which also carries the richer manifest
# Codex's own interface reads. Drop that file into a plugin and the next run
# picks it up; there is no list here to keep in step.
# Idempotent: safe to re-run.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jongwony/cc-plugin/main/scripts/codex-install.sh | bash

set -eo pipefail

REPO="jongwony/cc-plugin"
MARKETPLACE="cc-plugin"

command -v codex >/dev/null 2>&1 || { echo "Error: codex CLI not found. Install the OpenAI Codex CLI first." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "Error: python3 not found." >&2; exit 1; }

# `add` fails when the marketplace is already configured, which is the common
# case on a re-run; `upgrade` is what refreshes an existing git snapshot. Run
# both and let each be the no-op the other's state makes it.
echo "Adding marketplace..."
codex plugin marketplace add "https://github.com/$REPO" < /dev/null 2>/dev/null || true
codex plugin marketplace upgrade "$MARKETPLACE" < /dev/null 2>/dev/null || true

# Codex clones the marketplace to a root of its own choosing, and reports it.
root=$(codex plugin marketplace list --json 2>/dev/null \
  | python3 -c "
import json, sys
want = sys.argv[1]
data = json.load(sys.stdin)
for m in data.get('marketplaces', []):
    if m.get('name') == want:
        print(m.get('root', ''))
        break
" "$MARKETPLACE")

if [[ -z "$root" || ! -d "$root" ]]; then
  echo "Error: codex did not report a root for marketplace '$MARKETPLACE'." >&2
  echo "Check 'codex plugin marketplace list' and re-run." >&2
  exit 1
fi

# The manifest owns the names, the .codex-plugin marker owns the opt-in. Reading
# both from the root Codex resolved means this never disagrees with what Codex
# itself will act on.
read_plugins() {  # $1 = "codex" | "other"
  python3 -c "
import json, os, sys
root, want = sys.argv[1], sys.argv[2]
manifest = os.path.join(root, '.claude-plugin', 'marketplace.json')
with open(manifest, encoding='utf-8') as fh:
    data = json.load(fh)
for p in data.get('plugins', []):
    name, source = p.get('name'), p.get('source', '')
    if not name or not isinstance(source, str):
        continue
    marker = os.path.join(root, source, '.codex-plugin', 'plugin.json')
    kind = 'codex' if os.path.isfile(marker) else 'other'
    if kind == want:
        print(name)
" "$root" "$1"
}

codex_plugins=$(read_plugins codex)
other_plugins=$(read_plugins other)

if [[ -z "$codex_plugins" ]]; then
  echo "No plugin in $MARKETPLACE carries a .codex-plugin/plugin.json — nothing to install."
  exit 0
fi

# `codex plugin add` exits 0 when it reinstalls a plugin that is already
# present, so there is no benign nonzero status to absorb here: every failure is
# a real one. Let its stderr through and carry the failure to this script's own
# exit status — an installer that reports success while installing nothing is
# how a missing plugin gets discovered later, by its absence.
installed=0
failed=0
for p in $codex_plugins; do
  if codex plugin add "$p@$MARKETPLACE" < /dev/null; then
    installed=$((installed + 1))
  else
    status=$?
    echo "  Failed: $p (codex plugin add exited $status)" >&2
    failed=$((failed + 1))
  fi
done

echo ""
echo "Installed $installed plugin(s) for Codex."
for p in $other_plugins; do
  echo "Not selected for Codex installation (no .codex-plugin marker): $p"
done
echo "Each plugin's SKILL.md states the prerequisite it needs, if any."

if [[ $failed -gt 0 ]]; then
  echo "" >&2
  echo "Error: $failed plugin(s) failed to install." >&2
  exit 1
fi
