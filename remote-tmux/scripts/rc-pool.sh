#!/usr/bin/env bash
# rc-pool — self-restarting, project-singleton keep-alive for a `claude remote-control
# --spawn worktree` POOL HOST. Sibling of rc-spawn.sh: rc-spawn spawns one fixed
# remote-control session per dir; rc-pool keeps a pool HOST alive (capacity N on-demand
# worktree sessions) for a project, one singleton per project.
#
# Subcommands:
#   up     <dir> [name] [capacity]   start the singleton pool host (idempotent)
#   down   <name|dir>                graceful stop (SIGTERM host -> children flush -> drop)
#   toggle <dir> [name] [capacity]   up if down, down if up (used by the /rc-pool skill)
#   status <name|dir>                report running/stopped
#   _run   <dir> <name> <capacity>   INTERNAL: tmux pane foreground re-exec loop
#
# WHY tmux (not nohup/launchd): the remote-control host is an interactive TUI that needs a
# live PTY — under script/nohup it reads EOF on stdin and exits immediately; a tmux pane
# keeps the PTY open. A tmux server launched from Terminal/iTerm also inherits that app's
# TCC grant, so the host can run under ~/Downloads etc. (launchd gets "Operation not
# permitted"). Login-session resilient by design; no launchd autostart.
#
# WHY re-exec (not a while-loop): the restart at the end of _run is `exec bash "$0" _run ...`,
# reloading this script from disk every cycle so on-disk edits take effect — same rationale
# as the martin supervisor loop. A while-loop would pin the parsed body in memory.

export TMUX_TMPDIR="${TMUX_TMPDIR:-$HOME/.tmux-sockets}"
mkdir -p "$TMUX_TMPDIR"
unset TMUX
ATTACH_ENV="TMUX_TMPDIR=$TMUX_TMPDIR"

sanitize() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '-' | sed 's/--*/-/g; s/^-//; s/-$//'; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found on PATH (required by rc-pool)" >&2; return 127; }; }

# Resolve a <dir|name> argument to a sanitized singleton name: an existing dir -> its
# basename; otherwise treat the argument as a name already.
resolve_name() {
  local a="$1"
  if [ -d "$a" ]; then sanitize "$(basename "$(cd "$a" && pwd)")"; else sanitize "$a"; fi
}

up() {
  local dir="$1" name="$2" cap="${3:-5}"
  [ -n "$dir" ] || { echo "usage: rc-pool.sh up <dir> [name] [capacity]" >&2; return 2; }
  dir="$(cd "$dir" 2>/dev/null && pwd)" || { echo "ERROR: no such dir: $1" >&2; return 1; }
  [ -n "$name" ] || name="$(basename "$dir")"
  name="$(sanitize "$name")"
  [ -n "$name" ] || { echo "ERROR: name resolves to empty — pass an explicit name" >&2; return 2; }
  case "$cap" in *[!0-9]*|'') echo "ERROR: capacity must be a positive integer: $cap" >&2; return 2;; esac
  need tmux || return 127
  need claude || return 127
  git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || { echo "ERROR: $dir is not a git work tree (--spawn worktree needs one)" >&2; return 1; }
  # The remote-control subcommand HARD-ERRORS (no interactive prompt) on an untrusted
  # workspace -> the loop would crash-loop. Verify trust up front; do NOT auto-trust.
  python3 - "$dir" <<'PY' || { echo "ERROR: workspace not trusted — run 'claude' in $dir once, accept the trust dialog, then retry" >&2; return 1; }
import json, os, sys
d = json.load(open(os.path.expanduser("~/.claude.json")))
sys.exit(0 if d.get("projects", {}).get(sys.argv[1], {}).get("hasTrustDialogAccepted") else 1)
PY
  local sess="rcpool-$name"
  if tmux has-session -t "$sess" 2>/dev/null; then
    echo "ALREADY-RUNNING $name  attach: $ATTACH_ENV tmux attach -t $sess"; return 0
  fi
  if ! tmux new-session -d -s "$sess" -x 220 -y 55 -c "$dir" "bash '$0' _run '$dir' '$name' '$cap'"; then
    echo "ERROR: failed to launch tmux session $sess" >&2; return 1
  fi
  echo "STARTED-POOL $name  (dir: $dir, capacity: $cap, spawn: worktree, self-restarting)"
  echo "  -> reachable in the Claude app once Ready; on-demand sessions get isolated worktrees"
  echo "  -> attach: $ATTACH_ENV tmux attach -t $sess   |   stop: rc-pool.sh down $name"
}

_run() {
  local dir="$1" name="$2" cap="$3"
  local log="$TMUX_TMPDIR/rcpool-$name.log"
  cd "$dir" || exit 1
  echo "[$(date '+%F %T')] rcpool-$name host starting (capacity=$cap spawn=worktree)" >> "$log"
  claude remote-control --name "$name" --spawn worktree --capacity "$cap"
  echo "[$(date '+%F %T')] rcpool-$name host exited (code $?) — reloading from disk in 3s" >> "$log"
  sleep 3
  exec bash "$0" _run "$dir" "$name" "$cap"
}

down() {
  local name; name="$(resolve_name "$1")"
  [ -n "$name" ] || { echo "usage: rc-pool.sh down <name|dir>" >&2; return 2; }
  need tmux || return 127
  local sess="rcpool-$name"
  if ! tmux has-session -t "$sess" 2>/dev/null; then echo "NOT-RUNNING $name"; return 0; fi
  # Graceful: SIGTERM the host first (children flush, no orphans), then drop the session
  # inside the loop's 3s pre-re-exec window so it can't relaunch behind us.
  local rname="${name//./\\.}" pid
  pid="$(ps -Ao pid,command | grep -E "remote-control --name ${rname}([[:space:]]|\$)" | grep -v grep | awk '{print $1}' | head -1)"
  if [ -n "$pid" ]; then
    kill -TERM "$pid" 2>/dev/null && echo "SIGTERM -> pool host pid $pid ($name)"
    for _ in $(seq 1 50); do ps -p "$pid" >/dev/null 2>&1 || break; sleep 0.1; done
  fi
  tmux kill-session -t "$sess" 2>/dev/null && echo "dropped tmux $sess"
  echo "STOPPED $name"
}

toggle() {
  local dir="$1" name="$2" cap="$3" rn
  rn="$(resolve_name "${name:-$dir}")"
  if [ -n "$rn" ] && tmux has-session -t "rcpool-$rn" 2>/dev/null; then
    down "$rn"
  else
    up "$dir" "$name" "$cap"
  fi
}

status() {
  local name; name="$(resolve_name "$1")"
  [ -n "$name" ] || { echo "usage: rc-pool.sh status <name|dir>" >&2; return 2; }
  local sess="rcpool-$name"
  if tmux has-session -t "$sess" 2>/dev/null; then
    echo "RUNNING $name  attach: $ATTACH_ENV tmux attach -t $sess"
  else
    echo "STOPPED $name"
  fi
}

case "${1:-}" in
  up)     up "${2:-}" "${3:-}" "${4:-}";;
  down)   down "${2:-}";;
  toggle) toggle "${2:-}" "${3:-}" "${4:-}";;
  status) status "${2:-}";;
  _run)   _run "${2:-}" "${3:-}" "${4:-}";;
  *) echo "usage: rc-pool.sh {up <dir> [name] [cap] | down <name|dir> | toggle <dir> [name] [cap] | status <name|dir>}" >&2; exit 2;;
esac
