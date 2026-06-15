#!/usr/bin/env bash
# Enforce per-plugin version bumps. Single source of truth for both the
# pre-commit hook (index mode) and CI (range mode).
#
# Rule (see CLAUDE.md "버전 업데이트"): when a plugin's semantic files change,
# its {plugin}/.claude-plugin/plugin.json "version" VALUE must change in the same
# change-set. Re-emitting the same version line (reformat / key reorder) does NOT
# count. Non-semantic top-level files (README.md, README_ko.md, LICENSE,
# .gitignore, .gitattributes) and .claude-plugin/ meta do not require a bump.
# A new plugin (no prior plugin.json) is satisfied by having a version at all.
#
# Modes:
#   (default)       index mode — compare staged index vs HEAD   (pre-commit hook)
#   --base <ref>    range mode — compare HEAD vs <ref>           (CI: <ref> = PR base)
#
# Port of epistemic-protocols' checkVersionStaleness; pure bash (no node/jq),
# bash 3.2-compatible. Bypass the local hook with `git commit --no-verify`.
set -euo pipefail

base=""
if [ "${1:-}" = "--base" ]; then
  base="${2:-}"
  [ -n "$base" ] || { echo "check-version-bump: --base requires a ref" >&2; exit 2; }
fi

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
cd "$(git rev-parse --show-toplevel)"

# Skip during conflict states (diff is unreliable). `git rev-parse --git-path`
# resolves correctly even in linked worktrees / submodules, where .git is a file
# and the real heads live under .git/worktrees/<name>/.
for h in MERGE_HEAD REBASE_HEAD CHERRY_PICK_HEAD; do
  p=$(git rev-parse --git-path "$h" 2>/dev/null) || p=""
  if [ -n "$p" ] && [ -e "$p" ]; then
    echo "→ version-bump check: $h present — skipping"
    exit 0
  fi
done

# Blob-ref prefixes per mode. ":" is the staged index.
if [ -n "$base" ]; then
  old_prefix="$base:"; new_prefix="HEAD:"
else
  old_prefix="HEAD:"; new_prefix=":"
fi

# Changed files, NUL-delimited so paths with spaces/newlines/non-ASCII survive
# intact (-z already disables path quoting; core.quotePath=false is belt-and-braces).
changed=()
while IFS= read -r -d '' f; do
  changed+=("$f")
done < <(
  if [ -n "$base" ]; then
    git -c core.quotePath=false diff --name-only -z --diff-filter=ACMRD "$base...HEAD"
  else
    git -c core.quotePath=false diff --cached --name-only -z --diff-filter=ACMRD
  fi
)
[ "${#changed[@]}" -eq 0 ] && exit 0

# Discover plugin dirs (any dir holding .claude-plugin/plugin.json).
plugins=()
while IFS= read -r -d '' pj; do
  plugins+=("${pj#./}")
done < <(find . \( -name node_modules -o -name .git \) -prune -o \
  -name plugin.json -path '*/.claude-plugin/plugin.json' -print0 2>/dev/null)
[ "${#plugins[@]}" -eq 0 ] && exit 0

# Extract the "version" value from plugin.json content on stdin (empty if absent).
# sed reads all of stdin (no early-exit reader) so the upstream `git show` never
# gets SIGPIPE — keeps the pipeline well-behaved under `set -o pipefail`.
extract_version() {
  sed -nE 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/p'
}

violations=0
for pj in "${plugins[@]}"; do
  pdir=${pj%/.claude-plugin/plugin.json}

  content=0
  for f in "${changed[@]}"; do
    case "$f" in "$pdir"/*) ;; *) continue ;; esac           # under this plugin
    case "$f" in "$pdir"/.claude-plugin/*) continue ;; esac   # skip .claude-plugin/ meta
    rel=${f#"$pdir"/}
    case "$rel" in
      */*) : ;;                                               # nested file → semantic content
      README.md|README_ko.md|LICENSE|.gitignore|.gitattributes) continue ;;  # top-level non-semantic
    esac
    content=$((content + 1))
  done
  [ "$content" -eq 0 ] && continue

  old_ver=$(git show "${old_prefix}${pj}" 2>/dev/null | extract_version) || old_ver=""
  new_ver=$(git show "${new_prefix}${pj}" 2>/dev/null | extract_version) || new_ver=""
  # A changed value — or a new plugin (no old blob) — satisfies the rule.
  if [ -n "$new_ver" ] && [ "$new_ver" != "$old_ver" ]; then
    continue
  fi

  pname=${pdir:-root}
  echo "✗ plugin \"$pname\": $content semantic file(s) changed, but version not bumped in $pj"
  violations=$((violations + 1))
done

if [ "$violations" -gt 0 ]; then
  echo ""
  echo "Bump the \"version\" value in each plugin's .claude-plugin/plugin.json (see CLAUDE.md 버전 업데이트)."
  [ -z "$base" ] && echo "Bypass once with: git commit --no-verify"
  exit 1
fi
exit 0
