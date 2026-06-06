---
name: remote-spawn
description: >
  This skill should be used when the user asks to "spawn a remote-control session",
  "open this repo/folder in the Claude app", "remote control here", "띄워줘",
  "이 디렉터리에서 remote-control 켜줘", or to list/kill those sessions. It launches
  `claude --remote-control` in a chosen directory as a backgrounded tmux session
  (`rc-<name>`) reachable from claude.ai/code and the mobile app — no Telegram bridge.
---

# Remote-Control Spawner

Spawn, list, and kill backgrounded `claude --remote-control` sessions — one per
directory, each a tmux session `rc-<name>` reachable from the Claude app.

Run the script and report the result concisely:

```bash
# Spawn in a directory (name defaults to the dir's basename)
bash "${CLAUDE_PLUGIN_ROOT}/scripts/rc-spawn.sh" spawn <dir> [name]

# List running sessions
bash "${CLAUDE_PLUGIN_ROOT}/scripts/rc-spawn.sh" list

# Kill one by name
bash "${CLAUDE_PLUGIN_ROOT}/scripts/rc-spawn.sh" kill <name>
```

- `STARTED <name>` → a remote-control session is now live in `<dir>` and appears in
  the Claude app. Relay the attach/kill hints from the output.
- `ALREADY-RUNNING <name>` → idempotent; a session for that name already exists.
- `NOT-FOUND <name>` → nothing matched on kill.

Notes to pass on when relevant:
- The session lives until its claude exits (no auto-restart by design).
- First launch in a directory Claude has never opened may show a one-time
  folder-trust prompt **inside** the tmux session — `tmux attach -t rc-<name>`,
  press Enter, then detach with `Ctrl-b d`.
- tmux is used (not nohup/launchd) so sessions work under TCC-protected dirs
  (`~/Downloads`, `~/Documents`, `~/Desktop`); kill uses `ps`+SIGTERM so SessionEnd
  hooks (e.g. anamnesis memory) flush before exit.
