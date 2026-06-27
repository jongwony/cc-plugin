#!/usr/bin/env bash
# Spawn / list / kill backgrounded `claude --remote-control` sessions — one per
# directory, each tracked as a tmux session `rc-<name>` and reachable from the
# Claude app (claude.ai/code + mobile). No Telegram, no bridge.
#
# Subcommands:
#   spawn <dir> [name] [prompt]   start a remote-control session in <dir> (idempotent);
#                                 [prompt], if given, is auto-submitted as the first
#                                 message (passed positionally to claude). To pass a
#                                 prompt you must also pass a name.
#   resume <dir> <name> <session-id|search-term>   relaunch an EXISTING (stopped) session by a
#                                 session-id or name/search term — `claude --remote-control
#                                 --resume <value>`, no new id minted. For the occupancy-aware
#                                 continuation policy's resume branch (under-knob, related follow-up).
#   list                 list running rc-* sessions and their dirs
#   kill  <name>         SIGTERM the claude session, then drop its tmux session
#
# WHY tmux (not nohup/launchd): claude --remote-control runs an interactive TUI
# that wants a PTY, and a tmux server launched from the user's terminal inherits
# that terminal's TCC grant — so a session can live under TCC-protected dirs
# (~/Downloads, ~/Documents, ~/Desktop) where launchd/nohup gets
# "Operation not permitted". (Lesson carried over from the martin supervisor.)
#
# WHY pane-scoped SIGTERM on kill: kill resolves the target through the session's own
# tmux pane (`list-panes -F '#{pane_pid}'`), not a global `ps`/`pkill` match — so rc-spawn
# and rc-pool only ever stop their own sessions even when both share a name. SIGTERM (not
# -9) lets SessionEnd hooks (e.g. anamnesis memory write) flush before exit.

export TMUX_TMPDIR="${TMUX_TMPDIR:-$HOME/.tmux-sockets}"
mkdir -p "$TMUX_TMPDIR"
unset TMUX  # target the tmux daemon, not a nested client, if invoked from inside tmux

# Copy-paste hint prefix. The user's interactive shell does NOT inherit the
# relocated TMUX_TMPDIR above, so a bare `tmux attach`/`tmux ls` targets the
# default socket and fails ("no server running"). Printed hints carry the socket.
ATTACH_ENV="TMUX_TMPDIR=$TMUX_TMPDIR"

# Reduce a path/name to a tmux- and shell-safe token: [A-Za-z0-9._-], no runs of '-'.
sanitize() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '-' | sed 's/--*/-/g; s/^-//; s/-$//'; }

# Preflight a required binary: fail with an actionable error if it is not on PATH,
# instead of letting a later command fail mid-flight (or, worse, printing success).
need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found on PATH (required by rc-spawn)" >&2; return 127; }; }

spawn() {
  local dir="$1" name="$2" prompt="$3"
  [ -n "$dir" ] || { echo "usage: rc-spawn.sh spawn <dir> [name] [prompt]" >&2; return 2; }
  dir="$(cd "$dir" 2>/dev/null && pwd)" || { echo "ERROR: no such dir: $1" >&2; return 1; }
  [ -n "$name" ] || name="$(basename "$dir")"
  name="$(sanitize "$name")"
  [ -n "$name" ] || { echo "ERROR: name resolves to empty (dir basename has no usable chars) — pass an explicit name" >&2; return 2; }
  # Preflight AFTER arg validation (a usage error still exits 2, not 127), before any
  # work: tmux runs the session, claude runs inside it — missing either fails loudly here.
  need tmux || return 127
  need claude || return 127
  local sess="rc-$name"
  if tmux has-session -t "$sess" 2>/dev/null; then
    # report the dir the session is ACTUALLY running in (not the one just asked for),
    # and flag a basename collision so it isn't a silent no-op.
    local rdir; rdir="$(tmux display-message -p -t "$sess" '#{session_path}' 2>/dev/null)"
    echo "ALREADY-RUNNING $name  (running in: ${rdir:-?})  attach: $ATTACH_ENV tmux attach -t $sess"
    [ "$rdir" = "$dir" ] || echo "  note: requested $dir but rc-$name already runs in ${rdir:-?} — pass an explicit name to run a second session"
    # A prompt can't be injected into a live session from here — warn instead of
    # silently dropping it, so the caller doesn't believe it was queued.
    [ -n "$prompt" ] && echo "  warning: prompt NOT delivered — rc-$name is already running; attach and send it, or kill + re-spawn" >&2
    return 0
  fi
  # Fresh session id, minted only once we're actually spawning (below the
  # idempotency guard, so the ALREADY-RUNNING path stays untouched). Claude Code
  # validates --session-id as a UUID and stores the session file lowercase, but
  # uuidgen emits uppercase — lowercase it; bail if it comes back empty.
  local sid; sid="$(uuidgen | tr 'A-Z' 'a-z')"
  [ -n "$sid" ] || { echo "ERROR: failed to generate a session id (is uuidgen available?)" >&2; return 1; }
  # Build the claude command. name is sanitized to [A-Za-z0-9._-] so it needs no
  # quoting; an optional prompt is arbitrary text, so single-quote it for the
  # `sh -c` that tmux runs. Escape embedded ' as '\'' via bash expansion (no sed).
  local cmd="claude --remote-control --name $name --session-id $sid"
  if [ -n "$prompt" ]; then
    # Escape each ' as '\'' in a standalone assignment (embedding the expansion
    # inside the double-quoted cmd "...'${p//.../...}'..." mangles the backslashes).
    # '--' ends option parsing so an arbitrary prompt can't be misread as a flag
    # or as the `--remote-control [name]` optional positional.
    local esc=${prompt//\'/\'\\\'\'}
    cmd="$cmd -- '$esc'"
  fi
  # Detached tmux session running claude directly; when claude exits the session ends.
  # Guard the launch: if new-session fails (server can't start, geometry rejected, a
  # racing same-name spawn won), do NOT print STARTED — the caller relays STARTED as a
  # live, reachable session, so a false success sends them chasing one that never was.
  if ! tmux new-session -d -s "$sess" -x 220 -y 55 -c "$dir" "$cmd"; then
    echo "ERROR: failed to launch tmux session $sess (tmux server unavailable, or '$sess' already taken)" >&2
    return 1
  fi
  echo "STARTED $name  (dir: $dir)"
  echo "SESSION $sid"
  [ -n "$prompt" ] && echo "  -> initial prompt queued (auto-submits once the session is ready)"
  echo "  -> now reachable in the Claude app (claude.ai/code + mobile)"
  echo "  -> attach: $ATTACH_ENV tmux attach -t $sess   |   kill: rc-spawn.sh kill $name"
  echo "  note: first launch in a never-opened dir shows a one-time folder-trust prompt"
  echo "        inside the session (any queued prompt waits behind it) — attach once,"
  echo "        press Enter, detach (Ctrl-b d); the prompt then submits."
}

# Relaunch an EXISTING (stopped) session by a session-id or name/search term — no new id minted. Used by
# the occupancy-aware worker-continuation policy's RESUME branch (a related follow-up
# whose old session is under the distill knob): cheapest, lossless continuation.
resume() {
  local dir="$1" name="$2" sid="$3"
  [ -n "$dir" ] && [ -n "$name" ] && [ -n "$sid" ] || { echo "usage: rc-spawn.sh resume <dir> <name> <session-id|search-term>" >&2; return 2; }
  dir="$(cd "$dir" 2>/dev/null && pwd)" || { echo "ERROR: no such dir: $1" >&2; return 1; }
  name="$(sanitize "$name")"
  [ -n "$name" ] || { echo "ERROR: name resolves to empty (pass an explicit name)" >&2; return 2; }
  need tmux || return 127
  need claude || return 127
  local sess="rc-$name"
  # resume targets a STOPPED session (its on-disk session file). A live rc-<name> cannot
  # be resumed — that would double-process the same session file — so report instead of
  # clobbering it. (The policy reaches resume only for a worker whose process has ended.)
  if tmux has-session -t "$sess" 2>/dev/null; then
    local rdir; rdir="$(tmux display-message -p -t "$sess" '#{session_path}' 2>/dev/null)"
    echo "ALREADY-RUNNING $name  (running in: ${rdir:-?})  attach: $ATTACH_ENV tmux attach -t $sess"
    echo "  note: resume targets a STOPPED session — rc-$name is live; kill it first to re-resume"
    return 0
  fi
  # User-confirmed composition: the `--remote-control` FLAG composes with `--resume <id>`
  # (the `claude remote-control` SUBCOMMAND would reject channel flags). `--name` is
  # deliberately OMITTED — only `--remote-control --resume` is confirmed to compose, and
  # a resume restores the session's stored name anyway. The tmux session is still
  # `rc-<name>`, so liveness (isWorkerSessionAlive) and `list` keep working; `kill <name>`
  # falls back to its tmux-pane path (its ps-grep on `--name` won't match a resumed proc).
  # --resume takes a session id OR a name/search term, so single-quote it for the sh -c
  # tmux runs (spawn()'s prompt-escaping idiom) — keeps any value safe from word-splitting.
  local esid=${sid//\'/\'\\\'\'}
  local cmd="claude --remote-control --resume '$esid'"
  if ! tmux new-session -d -s "$sess" -x 220 -y 55 -c "$dir" "$cmd"; then
    echo "ERROR: failed to launch tmux session $sess (tmux server unavailable, or '$sess' already taken)" >&2
    return 1
  fi
  echo "RESUMED $name  (dir: $dir)"
  echo "SESSION $sid"
  echo "  -> resuming session $sid in the Claude app (claude.ai/code + mobile)"
  echo "  -> attach: $ATTACH_ENV tmux attach -t $sess   |   kill: rc-spawn.sh kill $name"
}

list() {
  need tmux || return 127
  local out
  out="$(tmux list-sessions -F '#{session_name}'$'\t''#{session_path}' 2>/dev/null \
        | awk -F'\t' '$1 ~ /^rc-/ {printf "  %-22s %s\n", substr($1,4), $2}')"
  if [ -n "$out" ]; then
    echo "running remote-control sessions:"; printf '%s\n' "$out"
    echo "  attach: $ATTACH_ENV tmux attach -t rc-<name>   |   ls: $ATTACH_ENV tmux ls"
  else
    echo "(no rc-* sessions running)"
  fi
}

kill_one() {
  local name; name="$(sanitize "$1")"
  [ -n "$name" ] || { echo "usage: rc-spawn.sh kill <name>" >&2; return 2; }
  need tmux || return 127
  local sess="rc-$name" pid found=0 i
  # Resolve the target ONLY through THIS session's own tmux pane — never a global `ps | grep`,
  # which would also match a coexisting rc-pool `rcpool-<name>` host that shares this name
  # (`claude remote-control --name …`, the subcommand form). Scoping the kill to the pane keeps
  # rc-spawn and rc-pool independent by construction. The pane runs claude directly (see spawn /
  # resume), so the pane's process IS the claude host — SIGTERM it. The hard kill-session below
  # plus the wait still cover every live session (a clean exit ends the session on its own).
  # (Tradeoff: this drops the old global sweep of same-name claudes orphaned OUTSIDE the pane —
  # a rare half-finished-teardown edge — in exchange for tool independence.)
  if tmux has-session -t "$sess" 2>/dev/null; then
    pid="$(tmux list-panes -t "$sess" -F '#{pane_pid}' 2>/dev/null | head -1)"
    [ -n "$pid" ] && kill "$pid" 2>/dev/null && { echo "SIGTERM -> claude pid $pid ($name)"; found=1; }
  fi
  # claude exiting cleanly ends its own tmux session (see spawn), so wait for that
  # instead of racing it — gives SessionEnd hooks (anamnesis) time to flush. Gate the
  # wait on the session still being live, not on `found`, so a live-but-ps-unreadable
  # session still gets its grace period. Poll at 0.1s so a clean exit returns promptly;
  # 150 ticks keep the ~15s ceiling before the hard drop below.
  if tmux has-session -t "$sess" 2>/dev/null; then
    for i in $(seq 1 150); do
      tmux has-session -t "$sess" 2>/dev/null || break
      sleep 0.1
    done
  fi
  if tmux has-session -t "$sess" 2>/dev/null; then
    tmux kill-session -t "$sess" 2>/dev/null && { echo "dropped tmux $sess"; found=1; }
  fi
  [ "$found" = 0 ] && echo "NOT-FOUND $name"
  return 0
}

case "${1:-}" in
  spawn)  spawn "${2:-}" "${3:-}" "${4:-}";;
  resume) resume "${2:-}" "${3:-}" "${4:-}";;
  list)   list;;
  kill)   kill_one "${2:-}";;
  *) echo "usage: rc-spawn.sh {spawn <dir> [name] [prompt] | resume <dir> <name> <session-id|search-term> | list | kill <name>}" >&2; exit 2;;
esac
