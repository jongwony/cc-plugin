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
#   list                 list running rc-* sessions and their dirs
#   kill  <name>         SIGTERM the claude session, then drop its tmux session
#
# WHY tmux (not nohup/launchd): claude --remote-control runs an interactive TUI
# that wants a PTY, and a tmux server launched from the user's terminal inherits
# that terminal's TCC grant — so a session can live under TCC-protected dirs
# (~/Downloads, ~/Documents, ~/Desktop) where launchd/nohup gets
# "Operation not permitted". (Lesson carried over from the martin supervisor.)
#
# WHY ps+SIGTERM on kill (not pkill): on macOS pkill/pgrep can't read claude's
# full arg string (KERN_PROCARGS), so `pkill -f "remote-control --name X"`
# silently matches nothing. `ps -o command` does see it. SIGTERM (not -9) lets
# SessionEnd hooks (e.g. anamnesis memory write) flush before exit.

export TMUX_TMPDIR="${TMUX_TMPDIR:-$HOME/.tmux-sockets}"
mkdir -p "$TMUX_TMPDIR"
unset TMUX  # target the tmux daemon, not a nested client, if invoked from inside tmux

# Reduce a path/name to a tmux- and shell-safe token: [A-Za-z0-9._-], no runs of '-'.
sanitize() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '-' | sed 's/--*/-/g; s/^-//; s/-$//'; }

spawn() {
  local dir="$1" name="$2" prompt="$3"
  [ -n "$dir" ] || { echo "usage: rc-spawn.sh spawn <dir> [name] [prompt]" >&2; return 2; }
  dir="$(cd "$dir" 2>/dev/null && pwd)" || { echo "ERROR: no such dir: $1" >&2; return 1; }
  [ -n "$name" ] || name="$(basename "$dir")"
  name="$(sanitize "$name")"
  [ -n "$name" ] || { echo "ERROR: name resolves to empty (dir basename has no usable chars) — pass an explicit name" >&2; return 2; }
  local sess="rc-$name"
  if tmux has-session -t "$sess" 2>/dev/null; then
    # report the dir the session is ACTUALLY running in (not the one just asked for),
    # and flag a basename collision so it isn't a silent no-op.
    local rdir; rdir="$(tmux display-message -p -t "$sess" '#{session_path}' 2>/dev/null)"
    echo "ALREADY-RUNNING $name  (running in: ${rdir:-?})  attach: tmux attach -t $sess"
    [ "$rdir" = "$dir" ] || echo "  note: requested $dir but rc-$name already runs in ${rdir:-?} — pass an explicit name to run a second session"
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
  tmux new-session -d -s "$sess" -x 220 -y 55 -c "$dir" "$cmd"
  echo "STARTED $name  (dir: $dir)"
  echo "SESSION $sid"
  [ -n "$prompt" ] && echo "  -> initial prompt queued (auto-submits once the session is ready)"
  echo "  -> now reachable in the Claude app (claude.ai/code + mobile)"
  echo "  -> attach: tmux attach -t $sess   |   kill: rc-spawn.sh kill $name"
  echo "  note: first launch in a never-opened dir shows a one-time folder-trust prompt"
  echo "        inside the session (any queued prompt waits behind it) — attach once,"
  echo "        press Enter, detach (Ctrl-b d); the prompt then submits."
}

list() {
  local out
  out="$(tmux list-sessions -F '#{session_name}'$'\t''#{session_path}' 2>/dev/null \
        | awk -F'\t' '$1 ~ /^rc-/ {printf "  %-22s %s\n", substr($1,4), $2}')"
  if [ -n "$out" ]; then
    echo "running remote-control sessions:"; printf '%s\n' "$out"
  else
    echo "(no rc-* sessions running)"
  fi
}

kill_one() {
  local name; name="$(sanitize "$1")"
  [ -n "$name" ] || { echo "usage: rc-spawn.sh kill <name>" >&2; return 2; }
  local sess="rc-$name" pids pid found=0 i
  # sanitize() allows '.', the only ERE metachar a name can carry — escape it so
  # `kill my.proj` can't also match `--name myXproj` (a different session).
  local rname="${name//./\\.}"
  # SIGTERM every matching claude, not just the first: a collision or a half-finished
  # earlier teardown can leave more than one process on the same name.
  pids="$(ps -Ao pid=,command= | grep -E "remote-control --name ${rname}([[:space:]]|\$)" | grep -v grep | awk '{print $1}')"
  for pid in $pids; do
    kill "$pid" 2>/dev/null && { echo "SIGTERM -> claude pid $pid ($name)"; found=1; }
  done
  # claude exiting cleanly ends its own tmux session (see spawn), so wait for that
  # instead of racing it — gives SessionEnd hooks (anamnesis) time to flush. Only
  # hard-drop the session if it outlives the bounded wait (~15s).
  if [ "$found" = 1 ]; then
    for i in $(seq 1 30); do
      tmux has-session -t "$sess" 2>/dev/null || break
      sleep 0.5
    done
  fi
  if tmux has-session -t "$sess" 2>/dev/null; then
    tmux kill-session -t "$sess" 2>/dev/null && { echo "dropped tmux $sess"; found=1; }
  fi
  [ "$found" = 0 ] && echo "NOT-FOUND $name"
  return 0
}

case "${1:-}" in
  spawn) spawn "${2:-}" "${3:-}" "${4:-}";;
  list)  list;;
  kill)  kill_one "${2:-}";;
  *) echo "usage: rc-spawn.sh {spawn <dir> [name] [prompt] | list | kill <name>}" >&2; exit 2;;
esac
