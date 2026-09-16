#!/bin/bash
# test-codex-run.sh — argv/stdin contract tests for codex-run.sh.
#
# A stub `codex` on PATH records the argv it received, its stdin and its cwd,
# so every case asserts what the wrapper hands to codex without calling the
# real binary. Run: bash codex-plus/scripts/test-codex-run.sh

set -euo pipefail

HERE="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
RUN="$HERE/codex-run.sh"
T="$(mktemp -d "${TMPDIR:-/tmp}/codex-run-test.XXXXXX")"
trap 'rm -rf -- "$T"' EXIT

# Stub codex: argv one per line, stdin verbatim, cwd; banner on stderr, one
# line on stdout — the channels the real binary uses.
mkdir -p "$T/bin" "$T/out"
cat > "$T/bin/codex" <<'STUB'
#!/bin/bash
printf '%s\n' "$@" > "$STUB_OUT/argv"
cat > "$STUB_OUT/stdin"
pwd -P > "$STUB_OUT/cwd"
echo "session id: 00000000-0000-0000-0000-000000000000" >&2
echo "final message"
STUB
chmod +x "$T/bin/codex"
export PATH="$T/bin:$PATH"
export STUB_OUT="$T/out"
export TMPDIR="$T/tmp"
mkdir -p "$TMPDIR"

# Scratch repo: main, then a feature branch one commit ahead.
REPO="$T/repo"
git init -q -b main "$REPO"
git -C "$REPO" -c user.email=t@t -c user.name=t commit -q --allow-empty -m base
BASE_SHA="$(git -C "$REPO" rev-parse HEAD)"
git -C "$REPO" checkout -qb feat
git -C "$REPO" -c user.email=t@t -c user.name=t commit -q --allow-empty -m change
FEAT_SHA="$(git -C "$REPO" rev-parse HEAD)"

PROMPT="$T/prompt.txt"
printf 'Look hardest at the Lua.\nSecond line.\n' > "$PROMPT"

failures=0
pass() { echo "ok   - $1"; }
fail() { echo "FAIL - $1"; failures=$((failures + 1)); }
assert_eq() { # name expected actual
  if [[ "$2" == "$3" ]]; then pass "$1"; else fail "$1"; printf '  expected: %s\n  actual:   %s\n' "$2" "$3"; fi
}
argv() { tr '\n' ' ' < "$STUB_OUT/argv" | sed 's/ $//'; }
reset() { rm -f "$STUB_OUT"/*; }

# 1. exec mode is unchanged.
reset
"$RUN" "$PROMPT" > /dev/null 2>&1
assert_eq "exec argv" \
  'exec --skip-git-repo-check -m gpt-6-astra --config model_reasoning_effort=medium --sandbox workspace-write --config sandbox_workspace_write.network_access=true' \
  "$(argv)"
assert_eq "exec stdin is the prompt" "$(cat "$PROMPT")" "$(cat "$STUB_OUT/stdin")"

# 2. review: scope + prompt composes one custom target on stdin.
reset
"$RUN" --review -b main -r high -C "$REPO" "$PROMPT" > /dev/null 2>&1
assert_eq "review argv (scope + prompt)" \
  'review -c model="gpt-6-astra" -c model_reasoning_effort="high" -c sandbox_mode="workspace-write" -c sandbox_workspace_write.network_access=true -' \
  "$(argv)"
assert_eq "review cwd" "$(cd -P "$REPO" && pwd -P)" "$(cat "$STUB_OUT/cwd")"
expected_stdin="$(printf "Review the code changes against the base branch 'main'. The merge base commit for this comparison is %s. Run \`git diff %s\` to inspect the changes relative to main. Provide prioritized, actionable findings.\n\n%s" "$BASE_SHA" "$BASE_SHA" "$(cat "$PROMPT")")"
assert_eq "review stdin = scope sentence + blank + prompt" "$expected_stdin" "$(cat "$STUB_OUT/stdin")"
assert_eq "composed stdin file removed" "" "$(ls "$TMPDIR")"

# 3. review: scope alone passes the flag through, nothing on stdin.
reset
"$RUN" --review -b main -C "$REPO" > /dev/null 2>&1
assert_eq "review argv (scope alone)" \
  'review -c model="gpt-6-astra" -c model_reasoning_effort="medium" -c sandbox_mode="workspace-write" -c sandbox_workspace_write.network_access=true --base main' \
  "$(argv)"
assert_eq "review stdin empty (scope alone)" "" "$(cat "$STUB_OUT/stdin")"

# 4. review: prompt alone is the custom target as written.
reset
"$RUN" --review -s read-only "$PROMPT" > /dev/null 2>&1
assert_eq "review argv (prompt alone, read-only)" \
  'review -c model="gpt-6-astra" -c model_reasoning_effort="medium" -c sandbox_mode="read-only" -' \
  "$(argv)"
assert_eq "review stdin = prompt" "$(cat "$PROMPT")" "$(cat "$STUB_OUT/stdin")"

# 5. review: commit + title + prompt.
reset
"$RUN" --review --commit "$FEAT_SHA" --title "change" -C "$REPO" "$PROMPT" > /dev/null 2>&1
assert_eq "commit+title first line" \
  "Review the code changes introduced by commit $FEAT_SHA (\"change\"). Provide prioritized, actionable findings." \
  "$(head -1 "$STUB_OUT/stdin")"

# 6. review: uncommitted + prompt.
reset
"$RUN" --review --uncommitted -C "$REPO" "$PROMPT" > /dev/null 2>&1
assert_eq "uncommitted first line" \
  "Review the current code changes (staged, unstaged, and untracked files) and provide prioritized findings." \
  "$(head -1 "$STUB_OUT/stdin")"

# 7. review: -o captures stdout, and stdout still reaches the caller.
reset
out="$("$RUN" --review -b main -C "$REPO" -o "$T/answer.md" "$PROMPT" 2>/dev/null)"
assert_eq "-o file = final message" "final message" "$(cat "$T/answer.md")"
assert_eq "stdout still printed" "final message" "$out"

# 8. review: base with no merge base falls back to codex's backup wording.
reset
"$RUN" --review -b no-such-branch -C "$REPO" "$PROMPT" > /dev/null 2>&1
case "$(head -1 "$STUB_OUT/stdin")" in
  "Review the code changes against the base branch 'no-such-branch'. Start by finding the merge diff"*) pass "backup wording without merge base" ;;
  *) fail "backup wording without merge base"; head -1 "$STUB_OUT/stdin" ;;
esac

# 9. rejected shapes exit non-zero without reaching codex.
reject() { # name args...
  local name="$1"; shift
  reset
  if "$RUN" "$@" > /dev/null 2>&1; then fail "$name (accepted)"; elif [[ -e "$STUB_OUT/argv" ]]; then fail "$name (reached codex)"; else pass "$name"; fi
}
reject "reject: --review with -S" --review -S 00000000-0000-0000-0000-000000000000 "$PROMPT"
reject "reject: two scopes" --review -b main --commit "$FEAT_SHA" -C "$REPO" "$PROMPT"
reject "reject: --title without --commit" --review --title t -C "$REPO" "$PROMPT"
reject "reject: --review with nothing" --review -C "$REPO"
reject "reject: scope without --review" -b main "$PROMPT"
reject "reject: exec without prompt" -C "$REPO"

echo
if [[ "$failures" -eq 0 ]]; then echo "all passed"; else echo "$failures failed"; exit 1; fi
