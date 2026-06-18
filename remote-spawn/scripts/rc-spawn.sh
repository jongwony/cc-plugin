#!/usr/bin/env bash
# Spawn / list / kill backgrounded `claude --remote-control` sessions reachable
# from the Claude app (claude.ai/code + mobile). A thin wrapper over Claude Code's
# native background-fleet recipe — one session per git worktree. No tmux, no bridge.
#
# Subcommands:
#   spawn <dir> [name] [prompt]   start a background remote-control session for
#                                 <dir>'s repo in a fresh worktree (idempotent).
#                                 name defaults to <dir>'s basename; [prompt], if
#                                 given, is the session's first task message. To
#                                 pass a prompt you must also pass a name.
#   list                 list running worktree-backed background sessions
#   kill  <name>         stop the session gracefully, delete it, prune its branch
#
# MECHANISM (Claude Code >= 2.1.x)
#   spawn = claude --bg --remote-control --worktree <name> -- "<prompt>"
#     --bg              background (headless) session; returns immediately
#     --remote-control  makes it app-reachable (claude.ai/code + mobile)
#     --worktree <name> creates a git worktree at <repo>/.claude/worktrees/<name>
#                       on branch worktree-<name>, and runs the session there
#   list  = claude agents --json  (filtered to worktree-backed background sessions)
#   kill  = claude stop <id>      graceful SessionEnd -> hooks flush (e.g. anamnesis)
#           claude rm   <id>      drops the session AND its worktree dir
#           git branch -D worktree-<name>   (rm leaves the branch behind)
#
# WHY no tmux: the native daemon already owns a TCC grant, so background sessions
# run under TCC-protected dirs (~/Downloads, ~/Documents, ~/Desktop) with no
# "Operation not permitted" — the original reason this script used tmux is gone.
#
# WHY address by native id (not pkill/ps): sessions are tracked by the daemon and
# addressed by their short id from `claude agents`, so the old macOS KERN_PROCARGS
# pkill workaround no longer applies. `claude stop` is the graceful path (SIGTERM
# equivalent): it routes through SessionEnd so memory hooks flush before exit.
#
# CAVEATS
# - --bg and the fleet verbs (stop/rm/logs/attach/respawn) are an undocumented
#   fast-path; this script assumes Claude Code >= 2.1.x.
# - Native worktrees always land under the repo's .claude/worktrees/<name>,
#   regardless of where <dir> sits inside the tree.
# - <dir> must be inside a git repo (--worktree needs one).
# - The session lives until it exits or is killed (no auto-restart by design;
#   the daemon only re-adopts RUNNING sessions across restarts).

set -uo pipefail

need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found on PATH (required)" >&2; exit 127; }; }
need claude
need jq

# Reduce a path/name to a worktree- and shell-safe token: [A-Za-z0-9._-], no runs of '-'.
sanitize() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '-' | sed 's/--*/-/g; s/^-//; s/-$//'; }

# Echo the id of the live background session whose cwd is exactly $1 (empty if none).
session_id_for_cwd() {
  claude agents --json 2>/dev/null \
    | jq -r --arg cwd "$1" '.[] | select(.kind=="background" and .cwd==$cwd) | .id' \
    | head -n1
}

spawn() {
  local dir="$1" name="$2" prompt="$3"
  [ -n "$dir" ] || { echo "usage: rc-spawn.sh spawn <dir> [name] [prompt]" >&2; return 2; }
  dir="$(cd "$dir" 2>/dev/null && pwd)" || { echo "ERROR: no such dir: $1" >&2; return 1; }
  local root
  root="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)" \
    || { echo "ERROR: $dir is not inside a git repo (--worktree needs one)" >&2; return 1; }
  [ -n "$name" ] || name="$(basename "$dir")"
  name="$(sanitize "$name")"
  [ -n "$name" ] || { echo "ERROR: name resolves to empty (dir basename has no usable chars) — pass an explicit name" >&2; return 2; }

  local wt="$root/.claude/worktrees/$name"
  # Idempotency: a live background session already in this worktree -> no-op.
  local existing; existing="$(session_id_for_cwd "$wt")"
  if [ -n "$existing" ]; then
    echo "ALREADY-RUNNING $name  (id: $existing, worktree: $wt)"
    echo "  logs: claude logs $existing   |   attach: claude attach $existing   |   kill: rc-spawn.sh kill $name"
    return 0
  fi
  # A leftover worktree dir/branch from an incomplete teardown makes --worktree fail;
  # surface it explicitly instead of letting claude error opaquely.
  if [ -e "$wt" ]; then
    echo "ERROR: worktree dir already exists but no live session: $wt" >&2
    echo "  clean up first: git -C $root worktree remove --force $wt ; git -C $root branch -D worktree-$name" >&2
    return 1
  fi

  # Spawn from the repo root so claude resolves the right worktree root.
  # `--` ends option parsing so an arbitrary prompt can't be read as a flag; the
  # prompt is passed as one argv element directly (no manual quoting dance needed).
  local out rc
  if [ -n "$prompt" ]; then
    out="$(cd "$root" && claude --bg --remote-control --worktree "$name" -- "$prompt" 2>&1)"; rc=$?
  else
    out="$(cd "$root" && claude --bg --remote-control --worktree "$name" 2>&1)"; rc=$?
  fi
  if [ "$rc" -ne 0 ]; then
    echo "ERROR: spawn failed (claude exit $rc):" >&2
    printf '%s\n' "$out" | sed 's/^/  | /' >&2
    return 1
  fi

  # Resolve the new session id (bounded poll; the daemon registers it async).
  local id="" i
  for i in $(seq 1 20); do
    id="$(session_id_for_cwd "$wt")"
    [ -n "$id" ] && break
    sleep 0.5
  done

  echo "STARTED $name  (worktree: $wt)"
  if [ -n "$id" ]; then
    echo "SESSION $id"
    echo "  -> reachable in the Claude app (claude.ai/code + mobile)"
    [ -n "$prompt" ] && echo "  -> initial task queued as the session's first message"
    echo "  -> logs: claude logs $id   |   attach: claude attach $id   |   kill: rc-spawn.sh kill $name"
  else
    echo "  (session not yet listed — check: rc-spawn.sh list)"
    printf '%s\n' "$out" | sed 's/^/  | /'
  fi
}

list() {
  local rows
  rows="$(claude agents --json 2>/dev/null | jq -r '
    .[]
    | select(.kind=="background" and (.cwd | test("/\\.claude/worktrees/")))
    | [ (.cwd | sub(".*/\\.claude/worktrees/"; "")), (.id // "?"), (.status // "?"), (.state // ""), .cwd ]
    | @tsv')"
  if [ -n "$rows" ]; then
    echo "running remote-spawn sessions (worktree-backed, app-reachable):"
    printf '%s\n' "$rows" | awk -F'\t' '{printf "  %-20s id=%-10s %s%s\n       %s\n", $1, $2, $3, ($4!=""?" ("$4")":""), $5}'
    echo "  logs: claude logs <id>   |   attach: claude attach <id>   |   kill: rc-spawn.sh kill <name>"
  else
    echo "(no remote-spawn sessions running)"
  fi
}

kill_one() {
  local name; name="$(sanitize "$1")"
  [ -n "$name" ] || { echo "usage: rc-spawn.sh kill <name>" >&2; return 2; }
  # Match live background sessions whose worktree basename == name (id<TAB>cwd per match).
  # A name can collide across repos; tear down every match, like the old kill-all behavior.
  local matches
  matches="$(claude agents --json 2>/dev/null | jq -r --arg n "$name" '
    .[]
    | select(.kind=="background"
             and (.cwd | test("/\\.claude/worktrees/"))
             and ((.cwd | sub(".*/\\.claude/worktrees/"; "")) == $n))
    | [ .id, .cwd ] | @tsv')"
  if [ -z "$matches" ]; then
    echo "NOT-FOUND $name"
    return 0
  fi
  local id cwd root
  while IFS=$'\t' read -r id cwd; do
    [ -n "$id" ] || continue
    # Graceful stop first so SessionEnd hooks (e.g. anamnesis) flush before teardown.
    if claude stop "$id" >/dev/null 2>&1; then
      echo "stopped $name (id: $id) — SessionEnd ran (hooks flushed)"
    else
      echo "stop skipped for id $id (already exited?)"
    fi
    # rm drops the session and its worktree dir; works on already-exited sessions.
    if claude rm "$id" >/dev/null 2>&1; then
      echo "  removed session + worktree dir (id: $id)"
    else
      echo "  WARN: claude rm $id failed" >&2
    fi
    # claude rm leaves branch worktree-<name> behind; derive the main repo root by
    # stripping the worktree suffix, then prune it.
    root="${cwd%/.claude/worktrees/$name}"
    if [ "$root" != "$cwd" ] && git -C "$root" rev-parse --git-dir >/dev/null 2>&1; then
      git -C "$root" branch -D "worktree-$name" >/dev/null 2>&1 \
        && echo "  pruned branch worktree-$name"
    fi
  done <<< "$matches"
  return 0
}

case "${1:-}" in
  spawn) spawn "${2:-}" "${3:-}" "${4:-}";;
  list)  list;;
  kill)  kill_one "${2:-}";;
  *) echo "usage: rc-spawn.sh {spawn <dir> [name] [prompt] | list | kill <name>}" >&2; exit 2;;
esac
