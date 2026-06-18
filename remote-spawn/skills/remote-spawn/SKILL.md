---
name: remote-spawn
description: >
  Spawn, list, or kill a backgrounded `claude --remote-control` session in a git
  worktree, reachable from the Claude app. Use when the user asks to "spawn a
  remote-control session", "open this repo in the Claude app", "remote control
  here", "띄워줘", "remote-control 켜줘", or to list/kill those sessions.
---

# Remote-Control Spawner

A thin wrapper over Claude Code's native background-fleet recipe: one
`claude --remote-control` session per git worktree, reachable from the Claude app.

Run the script and report the result:

```bash
# Spawn (name defaults to <dir>'s basename; runs in a fresh worktree, not <dir>).
# To pass an initial prompt, also pass a name — it is the 3rd arg.
bash "${CLAUDE_PLUGIN_ROOT}/scripts/rc-spawn.sh" spawn <dir> [name] [prompt]

bash "${CLAUDE_PLUGIN_ROOT}/scripts/rc-spawn.sh" list
bash "${CLAUDE_PLUGIN_ROOT}/scripts/rc-spawn.sh" kill <name>
```

Output: `STARTED <name>` + `SESSION <id>` (live, in the app) · `ALREADY-RUNNING`
(idempotent no-op) · `NOT-FOUND` (kill matched nothing). Relay the
`logs`/`attach`/`kill` hints the script prints.

Notes:
- The session runs in a fresh worktree at `<repo>/.claude/worktrees/<name>`, so
  `<dir>` must be inside a git repo. `kill` stops it gracefully, deletes the
  session + worktree, and prunes the `worktree-<name>` branch.
- Requires `jq` and Claude Code >= 2.1.x (uses the undocumented `--bg` flag and
  fleet verbs). Mechanism details live in the script header.
