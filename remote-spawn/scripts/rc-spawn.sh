#!/usr/bin/env bash
# Spawn / list / kill backgrounded `claude --remote-control` sessions — one per
# directory, each tracked as a tmux session `rc-<name>` and reachable from the
# Claude app (claude.ai/code + mobile). No Telegram, no bridge.
#
# Subcommands:
#   spawn <dir> [name]   start a remote-control session in <dir> (idempotent)
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
  local dir="$1" name="$2"
  [ -n "$dir" ] || { echo "usage: rc-spawn.sh spawn <dir> [name]" >&2; return 2; }
  dir="$(cd "$dir" 2>/dev/null && pwd)" || { echo "ERROR: no such dir: $1" >&2; return 1; }
  [ -n "$name" ] || name="$(basename "$dir")"
  name="$(sanitize "$name")"
  local sess="rc-$name"
  if tmux has-session -t "$sess" 2>/dev/null; then
    echo "ALREADY-RUNNING $name  (dir: $dir)  attach: tmux attach -t $sess"
    return 0
  fi
  # Detached tmux session running claude directly; when claude exits the session ends.
  tmux new-session -d -s "$sess" -x 220 -y 55 -c "$dir" "claude --remote-control --name $name"
  echo "STARTED $name  (dir: $dir)"
  echo "  -> now reachable in the Claude app (claude.ai/code + mobile)"
  echo "  -> attach: tmux attach -t $sess   |   kill: rc-spawn.sh kill $name"
  echo "  note: first launch in a never-opened dir may show a one-time folder-trust"
  echo "        prompt inside the session — attach once, press Enter, detach (Ctrl-b d)."
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
  local sess="rc-$name" pid found=0
  pid="$(ps -Ao pid=,command= | grep -E "remote-control --name ${name}([[:space:]]|\$)" | grep -v grep | awk '{print $1}' | head -1)"
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null && { echo "SIGTERM -> claude pid $pid ($name)"; found=1; sleep 1; }
  fi
  if tmux has-session -t "$sess" 2>/dev/null; then
    tmux kill-session -t "$sess" 2>/dev/null && { echo "dropped tmux $sess"; found=1; }
  fi
  [ "$found" = 0 ] && echo "NOT-FOUND $name"
  return 0
}

case "${1:-}" in
  spawn) spawn "${2:-}" "${3:-}";;
  list)  list;;
  kill)  kill_one "${2:-}";;
  *) echo "usage: rc-spawn.sh {spawn <dir> [name] | list | kill <name>}" >&2; exit 2;;
esac
