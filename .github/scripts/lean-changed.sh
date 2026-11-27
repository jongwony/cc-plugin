#!/usr/bin/env bash
# Usage: lean-changed.sh <base-sha> <head-sha>
# Prints a JSON array of the Lean package directories (<plugin>/lean, one per
# <plugin>/lean/extract.sh in the head tree, the tree the build compiles) that need
# building between base and head. A package builds when anything under it changed,
# when the ```lean block of a skills/*/SKILL.md of its plugin differs between the
# two revisions (a SKILL.md present on one side only counts as differing), or when
# this gate or the Lean workflow changed. An all-zero or unreachable base builds
# every package. An unresolvable head, or a package directory name outside
# [A-Za-z0-9._-], fails the gate.
set -euo pipefail
base="$1"
head="$2"

git cat-file -e "${head}^{commit}" 2>/dev/null || { echo "lean-changed.sh: head $head does not resolve" >&2; exit 1; }

exists() { # <rev> <path>
  git cat-file -e "$1:$2" 2>/dev/null
}

block() { # <rev> <path>: the first ```lean fenced block, read as extract.sh reads it
  git show "$1:$2" 2>/dev/null | awk '/^```lean$/{on=1; next} on && /^```$/{exit} on{print}'
}

changed() { # <path>...: anything under these paths changed between base and head
  [ -n "$(git diff --name-only "$base" "$head" -- "$@")" ]
}

skills() { # <rev> <plugin>: that plugin's skills/*/SKILL.md paths at rev
  git ls-tree -r --name-only "$1" -- "$2/skills" 2>/dev/null | grep -E '^[^/]+/skills/[^/]+/SKILL\.md$' || true
}

packages=()
while IFS= read -r pkg; do
  [[ "$pkg" =~ ^[A-Za-z0-9._-]+/lean$ ]] || { echo "lean-changed.sh: package name not allowed: $pkg" >&2; exit 1; }
  packages+=("$pkg")
done < <(git ls-tree -r --name-only "$head" | grep -E '^[^/]+/lean/extract\.sh$' | sed 's#/extract\.sh$##' || true)

all=false
if [[ "$base" =~ ^0+$ ]] || ! git cat-file -e "${base}^{commit}" 2>/dev/null; then
  all=true
elif changed .github/workflows/lean.yml .github/scripts/lean-changed.sh; then
  all=true
fi

out=()
for pkg in "${packages[@]+"${packages[@]}"}"; do
  plugin="${pkg%/lean}"
  if $all || changed "$pkg"; then
    out+=("$pkg")
    continue
  fi
  for skill in $( { skills "$base" "$plugin"; skills "$head" "$plugin"; } | sort -u); do
    if ! exists "$base" "$skill" || ! exists "$head" "$skill" \
       || [ "$(block "$base" "$skill")" != "$(block "$head" "$skill")" ]; then
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
