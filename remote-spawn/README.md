# remote-spawn

Spawn a backgrounded `claude --remote-control` session in **any directory**, tracked as a
tmux session and reachable from the Claude app (claude.ai/code + mobile). No Telegram, no
bridge — the running session *is* the aperture; voice input comes from the app's own
dictation.

```bash
bash scripts/rc-spawn.sh spawn ~/projects/foo        # -> rc-foo, now in the app
bash scripts/rc-spawn.sh spawn ~/projects/foo api    # custom name -> rc-api
bash scripts/rc-spawn.sh list                        # running rc-* sessions + dirs
bash scripts/rc-spawn.sh kill foo                     # SIGTERM + drop tmux session
```

One tmux session per name (`rc-<name>`), idempotent. The session lives until its claude
exits (no auto-restart by design).

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
