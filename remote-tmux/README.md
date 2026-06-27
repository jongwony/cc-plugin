# remote-tmux

A tmux-tracked `claude remote-control` toolkit, reachable from the Claude app
(claude.ai/code + mobile). No Telegram, no bridge — the running session *is* the aperture;
voice input comes from the app's own dictation. It ships two skills:

- **`remote-spawn`** — spawn one fixed `claude --remote-control` session per directory (below).
- **`rc-pool`** — keep a self-restarting `--spawn worktree --capacity N` pool host alive per
  project (see the `rc-pool` section at the end).

## remote-spawn — spawn one session

Spawn a backgrounded `claude --remote-control` session in **any directory**, tracked as a
tmux session and reachable from the Claude app.

```bash
bash scripts/rc-spawn.sh spawn ~/projects/foo        # -> rc-foo, now in the app
bash scripts/rc-spawn.sh spawn ~/projects/foo api    # custom name -> rc-api
bash scripts/rc-spawn.sh resume ~/projects/foo foo <session-id|search-term>  # relaunch a STOPPED session by id or search-term
bash scripts/rc-spawn.sh list                        # running rc-* sessions + dirs
bash scripts/rc-spawn.sh kill foo                     # SIGTERM + drop tmux session
```

One tmux session per name (`rc-<name>`), idempotent. The session lives until its claude
exits (no auto-restart by design).

On a fresh spawn the script generates the new session's id (a lowercased UUID, passed
to claude as `--session-id`) and prints it as a `SESSION <uuid>` line right after
`STARTED`. An initial prompt, when given, is passed after a `--` end-of-options separator
(`claude --remote-control --name <name> --session-id <uuid> -- "<prompt>"`) so an
arbitrary prompt can never be misparsed as a flag.

## Why tmux + ps/SIGTERM
- **tmux, not nohup/launchd** — `claude --remote-control` is an interactive TUI that wants
  a PTY, and a tmux server launched from your terminal inherits its TCC grant, so sessions
  work under TCC-protected dirs (`~/Downloads`, `~/Documents`, `~/Desktop`) where launchd
  gets `Operation not permitted`.
- **`ps` + SIGTERM on kill, not `pkill`** — on macOS `pkill -f` can't read claude's full
  arg string and silently no-ops; `ps -o command` sees it. SIGTERM (not `-9`) lets
  SessionEnd hooks (e.g. anamnesis memory) flush before exit.

First launch in a never-opened directory may show a one-time folder-trust prompt inside the
session — `tmux attach -t rc-<name>`, press Enter, detach with `Ctrl-b d`.

## rc-pool — keep a pool host alive

The `rc-pool` skill keeps a **self-restarting, project-singleton** keep-alive for a `claude
remote-control --spawn worktree --capacity N` pool host — one host per project, hosting a
pool of on-demand, worktree-isolated sessions in the app. Sibling of `remote-spawn` (which
spawns one fixed session per dir).

```bash
bash scripts/rc-pool.sh toggle <project-dir> [name] [capacity]   # up if down, down if up
bash scripts/rc-pool.sh up     <project-dir> [name] [capacity]   # default capacity 5
bash scripts/rc-pool.sh down   <name|dir>                        # graceful SIGTERM + drop
bash scripts/rc-pool.sh status <name|dir>
```

The host re-execs this script from disk each cycle (on-disk edits take effect on restart)
and runs in a tmux pane for the live PTY. The `remote-control` subcommand hard-errors on an
untrusted workspace, so trust the project once (`claude` in the dir, accept the dialog)
before `up`.
