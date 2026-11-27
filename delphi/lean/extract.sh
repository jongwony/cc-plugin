#!/usr/bin/env bash
# Generate the contract module from the SKILL.md Lean block, then build the
# theorems against it. The SKILL.md block is the one source; .contract/ is
# generated and gitignored. Needs elan (lean + lake), pinned by lean-toolchain.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
skill="$here/../skills/delphi/SKILL.md"
out="$here/.contract/Contract/Delphi.lean"
mkdir -p "$(dirname "$out")"
awk '/^```lean$/{on=1; next} on && /^```$/{exit} on{print}' "$skill" > "$out"
[ -s "$out" ] || { echo "extract.sh: no lean block in $skill" >&2; exit 1; }
cd "$here"
lake build --wfail
