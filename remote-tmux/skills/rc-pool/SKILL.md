---
name: rc-pool
description: >
  This skill should be used when the user asks to "start/stop the pool", "toggle the
  remote-control pool", "keep this project's pool alive", "풀 호스트 띄워줘/내려줘", or to
  start, stop, or toggle a self-restarting `claude remote-control --spawn worktree` pool
  host for a project. One singleton per project, tmux-tracked, reachable from the Claude app.
---

# Remote-Control Pool-Host Toggle

Toggle a self-restarting pool host — `claude remote-control --spawn worktree --capacity N
--permission-mode bypassPermissions` — for a project. One singleton per project (tmux session
`rcpool-<name>`); the host hosts a pool of on-demand, worktree-isolated sessions reachable
from claude.ai/code + the mobile app.
Sibling of the `remote-spawn` skill (which spawns one fixed session per dir).

Run the script and report the result concisely:

```bash
# Toggle (up if down, down if up) — the default for "올렸다 내렸다"
bash "${CLAUDE_PLUGIN_ROOT}/scripts/rc-pool.sh" toggle <project-dir> [name] [capacity]

# Or explicit:
bash "${CLAUDE_PLUGIN_ROOT}/scripts/rc-pool.sh" up   <project-dir> [name] [capacity]   # default capacity 5
bash "${CLAUDE_PLUGIN_ROOT}/scripts/rc-pool.sh" down <name|dir>
bash "${CLAUDE_PLUGIN_ROOT}/scripts/rc-pool.sh" status <name|dir>
```

- `STARTED-POOL <name>` → host launched (self-restarting; capacity N; on-demand worktree sessions).
- `STOPPED <name>` → host gracefully stopped (children flushed, tmux session dropped).
- `ALREADY-RUNNING` / `NOT-RUNNING` → the project's singleton was already in that state.

Notes to pass on when relevant:
- **Trust first**: the `remote-control` subcommand hard-errors (no interactive prompt) on an
  untrusted workspace — run `claude` in the project once and accept the trust dialog before `up`.
- **Permissions bypassed**: the host launches every session with `--permission-mode
  bypassPermissions` — this covers the pre-created same-dir session too (not just
  worktree-isolated ones).
- **tmux, not launchd**: the host needs a live pane PTY (it exits on EOF under script/nohup);
  login-session resilient, no autostart — re-run `up` after a reboot.
- One singleton per project; `name` defaults to the project dir's basename.
