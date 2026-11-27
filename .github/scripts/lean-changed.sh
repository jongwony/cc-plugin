#!/usr/bin/env bash
# Usage: lean-changed.sh <base-sha> <head-sha>
# Prints a JSON array of the Lean package directories (<plugin>/lean, one per
# <plugin>/lean/extract.sh at head) that need building between base and head.
# A package builds when anything under it changed, when the ```lean block of its
# plugin's skills/*/SKILL.md differs between the two revisions, or when this gate
# or the Lean workflow changed. An all-zero or unreachable base builds every package.
set -euo pipefail
base="$1"
head="$2"

block() { # <rev> <path>: the first ```lean fenced block, read as extract.sh reads it
  git show "$1:$2" 2>/dev/null | awk '/^```lean$/{on=1; next} on && /^```$/{exit} on{print}'
}

changed() { # <path>...: anything under these paths changed between base and head
  [ -n "$(git diff --name-only "$base" "$head" -- "$@")" ]
}

packages=$(git ls-tree -r --name-only "$head" | grep -E '^[^/]+/lean/extract\.sh$' | sed 's#/extract\.sh$##' || true)

all=false
if [[ "$base" =~ ^0+$ ]] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  all=true
elif changed .github/workflows/lean.yml .github/scripts/lean-changed.sh; then
  all=true
fi

out=()
for pkg in $packages; do
  plugin="${pkg%/lean}"
  if $all || changed "$pkg"; then
    out+=("$pkg")
    continue
  fi
  for skill in $(git ls-tree -r --name-only "$head" -- "$plugin/skills" | grep -E '/SKILL\.md$' || true); do
    if [ "$(block "$base" "$skill")" != "$(block "$head" "$skill")" ]; then
      out+=("$pkg")
      break
    fi
  done
done

printf '['
sep=''
for p in "${out[@]+"${out[@]}"}"; do
  printf '%s"%s"' "$sep" "$p"
  sep=','
done
printf ']\n'
