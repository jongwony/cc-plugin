#!/usr/bin/env bash
# rc-pool — self-restarting, project-singleton keep-alive for a `claude remote-control
# --spawn worktree` POOL HOST (capacity N on-demand worktree sessions), one singleton
# per project. The singleton is keyed by the project's canonical path (tmux session
# `rcpool-<sanitized path>`); the [name] is the host's display name only.
#
# WHY THIS SCRIPT STILL EXISTS. Spawning a single worker no longer needs a script — a
# backgrounded `claude --bg --worktree ... --remote-control ...` is app-reachable and
# message-addressable on its own. Two jobs survive here, and only these two:
#   1. Keep-alive. A backgrounded session has no restart-on-crash; the re-exec loop below
#      is the only thing that brings the host back.
#   2. Session ORIGINATION without a CLI. The pool host is what lets a new session be
#      opened from the phone. Everything else starts from a shell.
# Cost of job 2: the host's children run as `sdk-cli` and get no messaging socket, so they
# can send but cannot RECEIVE a task or a reply. Work that needs supervising must be
# spawned by the supervisor session, not opened through the pool.
#
# Subcommands:
#   up     <dir> [name] [capacity]   start the singleton pool host (idempotent)
#   down   <name|dir>                graceful stop (SIGTERM host -> children flush -> drop);
#                                    a name resolves through the running hosts' @rcpool_name
#   toggle <dir> [name] [capacity]   up if down, down if up (used by the /rc-pool skill)
#   status <name|dir>                report running/stopped
#   _run   <dir> <name> <capacity> <key>   INTERNAL: tmux pane foreground re-exec loop
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

# Canonicalize this script's own path BEFORE any cwd change: `up` launches the tmux pane with
# `-c "$dir"` and `_run` does `cd "$dir"`, so a relative $0 (e.g. the documented
# `bash scripts/rc-pool.sh up <dir>`) would no longer resolve once the cwd flips to <dir> — the
# pane's re-exec would fail and exit instantly while `up` had already printed STARTED-POOL.
# Resolve to an absolute path once, here, while cwd is still the invocation dir.
SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"

sanitize() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '-' | sed 's/--*/-/g; s/^-//; s/-$//'; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "ERROR: '$1' not found on PATH (required by rc-pool)" >&2; return 127; }; }

# The singleton key is the project's canonical path, sanitized. Two projects sharing a
# basename therefore get two hosts, and one project gets one host whatever name it runs under.
# tmux rewrites `.` and `:` in a session name to `_` on creation, which would make the name
# created differ from the name looked up, so the key maps both to `-` as well.
key_of_dir() { sanitize "$(cd "$1" && pwd)" | tr '.:' '--' | sed 's/--*/-/g; s/^-//; s/-$//'; }

# Resolve a <dir|name> argument to a tmux session name. A dir resolves through its key. A
# name is matched against the @rcpool_name option each running host carries: exactly one
# match -> that session; several -> error (the caller must pass the dir); none -> the legacy
# session `rcpool-<name>` from before path keying, so an older host can still be brought down.
resolve_sess() {
  local a="$1" n matches
  if [ -d "$a" ]; then printf 'rcpool-%s' "$(key_of_dir "$a")"; return 0; fi
  n="$(sanitize "$a")"
  [ -n "$n" ] || return 2
  matches="$(tmux list-sessions -F '#{session_name} #{@rcpool_name} #{@rcpool_dir}' 2>/dev/null \
    | awk -v n="$n" '$2 == n { print $1 " " $3 }')"
  case "$(printf '%s\n' "$matches" | grep -c .)" in
    0) printf 'rcpool-%s' "$n";;
    1) printf '%s' "${matches%% *}";;
    *) echo "ERROR: several pool hosts are named '$n' — pass the project dir instead:" >&2
       printf '%s\n' "$matches" | awk '{ print "  " $2 }' >&2
       return 3;;
  esac
}

up() {
  local dir="$1" name="$2" cap="${3:-5}"
  [ -n "$dir" ] || { echo "usage: rc-pool.sh up <dir> [name] [capacity]" >&2; return 2; }
  dir="$(cd "$dir" 2>/dev/null && pwd)" || { echo "ERROR: no such dir: $1" >&2; return 1; }
  [ -n "$name" ] || name="$(basename "$dir")"
  name="$(sanitize "$name")"
  [ -n "$name" ] || { echo "ERROR: name resolves to empty — pass an explicit name" >&2; return 2; }
  case "$cap" in *[!0-9]*|'') echo "ERROR: capacity must be a positive integer: $cap" >&2; return 2;; esac
  [ "$cap" -ge 1 ] 2>/dev/null || { echo "ERROR: capacity must be a positive integer (>= 1): $cap" >&2; return 2; }
  need tmux || return 127
  need claude || return 127
  git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || { echo "ERROR: $dir is not a git work tree (--spawn worktree needs one)" >&2; return 1; }
  # The remote-control subcommand HARD-ERRORS (no interactive prompt) on an untrusted
  # workspace -> the loop would crash-loop. Verify trust up front; do NOT auto-trust.
  python3 - "$dir" <<'PY' || { echo "ERROR: workspace not trusted — run 'claude' in $dir once, accept the trust dialog, then retry" >&2; return 1; }
import json, os, sys
# `.claude.json` does NOT go through the usual config-dir resolver. Its resolver is
# `path.join(CLAUDE_CONFIG_DIR || homedir(), ".claude.json")` — the base is the RAW
# variable falling back to $HOME, NOT to $HOME/.claude. `or` matches `||`, which falls
# back on an empty string too (unlike the `??` used for paths inside the config dir).
base = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~")
d = json.load(open(os.path.join(base, ".claude.json")))
sys.exit(0 if d.get("projects", {}).get(sys.argv[1], {}).get("hasTrustDialogAccepted") else 1)
PY
  local key sess; key="$(key_of_dir "$dir")"; sess="rcpool-$key"
  if tmux has-session -t "$sess" 2>/dev/null; then
    echo "ALREADY-RUNNING $name  (dir: $dir)  attach: $ATTACH_ENV tmux attach -t $sess"; return 0
  fi
  # Build the pane command with printf %q so a SELF or dir path containing spaces or quotes
  # can't break tmux's shell parse or inject syntax before _run. name is sanitized and cap is
  # numeric, but quote them uniformly. tmux runs this string via its shell, re-entering _run.
  local cmd; cmd="$(printf 'bash %q _run %q %q %q %q' "$SELF" "$dir" "$name" "$cap" "$key")"
  if ! tmux new-session -d -s "$sess" -x 220 -y 55 -c "$dir" "$cmd"; then
    echo "ERROR: failed to launch tmux session $sess" >&2; return 1
  fi
  tmux set-option -t "$sess" @rcpool_name "$name"
  tmux set-option -t "$sess" @rcpool_dir "$dir"
  echo "STARTED-POOL $name  (dir: $dir, capacity: $cap, spawn: worktree, permissions: bypass, self-restarting)"
  echo "  -> reachable in the Claude app once Ready; on-demand sessions get isolated worktrees"
  echo "  -> attach: $ATTACH_ENV tmux attach -t $sess   |   stop: rc-pool.sh down $dir"
}

_run() {
  local dir="$1" name="$2" cap="$3" key="$4"
  local log="$TMUX_TMPDIR/rcpool-$key.log"
  cd "$dir" || exit 1
  echo "[$(date '+%F %T')] rcpool-$key host starting (name=$name capacity=$cap spawn=worktree permission-mode=bypassPermissions)" >> "$log"
  claude remote-control --name "$name" --spawn worktree --capacity "$cap" --permission-mode bypassPermissions
  echo "[$(date '+%F %T')] rcpool-$key host exited (code $?) — reloading from disk in 3s" >> "$log"
  sleep 3
  exec bash "$SELF" _run "$dir" "$name" "$cap" "$key"
}

down() {
  [ -n "$1" ] || { echo "usage: rc-pool.sh down <name|dir>" >&2; return 2; }
  need tmux || return 127
  local sess name; sess="$(resolve_sess "$1")" || return $?
  if ! tmux has-session -t "$sess" 2>/dev/null; then echo "NOT-RUNNING $1"; return 0; fi
  name="$(tmux show-option -t "$sess" -qv @rcpool_name)"; name="${name:-$1}"
  # Graceful: SIGTERM the host first (children flush, no orphans), then drop the session inside
  # the loop's 3s pre-re-exec window so it can't relaunch behind us. Resolve the target ONLY
  # through THIS session's own tmux pane — never a global `ps | grep`, which would also match
  # any unrelated claude process that happens to share this name. The pane runs `bash … _run`, so the
  # claude host is its child — but during the 3s restart window the child is `sleep 3`, not
  # claude; signaling that would only let _run re-exec a throwaway host. So pick the child
  # actually running remote-control; if none is live (restart window or already exited), signal
  # the pane shell itself so the loop stops without relaunching, before the hard kill-session.
  local ppid pid c
  ppid="$(tmux list-panes -t "$sess" -F '#{pane_pid}' 2>/dev/null | head -1)"
  if [ -n "$ppid" ]; then
    pid=""
    for c in $(pgrep -P "$ppid" 2>/dev/null); do
      case "$(ps -p "$c" -o command= 2>/dev/null)" in *remote-control*) pid="$c"; break;; esac
    done
    [ -n "$pid" ] || pid="$ppid"
    kill -TERM "$pid" 2>/dev/null && echo "SIGTERM -> pool host pid $pid ($name)"
    for _ in $(seq 1 50); do ps -p "$pid" >/dev/null 2>&1 || break; sleep 0.1; done
  fi
  tmux kill-session -t "$sess" 2>/dev/null && echo "dropped tmux $sess"
  echo "STOPPED $name"
}

toggle() {
  local dir="$1" name="$2" cap="$3"
  [ -d "$dir" ] || { echo "usage: rc-pool.sh toggle <dir> [name] [capacity]" >&2; return 2; }
  if tmux has-session -t "$(resolve_sess "$dir")" 2>/dev/null; then
    down "$dir"
  else
    up "$dir" "$name" "$cap"
  fi
}

status() {
  [ -n "$1" ] || { echo "usage: rc-pool.sh status <name|dir>" >&2; return 2; }
  need tmux || return 127
  local sess name dir; sess="$(resolve_sess "$1")" || return $?
  if tmux has-session -t "$sess" 2>/dev/null; then
    name="$(tmux show-option -t "$sess" -qv @rcpool_name)"; dir="$(tmux show-option -t "$sess" -qv @rcpool_dir)"
    echo "RUNNING ${name:-$1}  (dir: ${dir:-?})  attach: $ATTACH_ENV tmux attach -t $sess"
  else
    echo "STOPPED $1"
  fi
}

case "${1:-}" in
  up)     up "${2:-}" "${3:-}" "${4:-}";;
  down)   down "${2:-}";;
  toggle) toggle "${2:-}" "${3:-}" "${4:-}";;
  status) status "${2:-}";;
  _run)   _run "${2:-}" "${3:-}" "${4:-}" "${5:-}";;
  *) echo "usage: rc-pool.sh {up <dir> [name] [cap] | down <name|dir> | toggle <dir> [name] [cap] | status <name|dir>}" >&2; exit 2;;
esac
