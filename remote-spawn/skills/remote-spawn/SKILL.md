---
name: remote-spawn
description: >
  This skill should be used when the user asks to "spawn a remote-control session",
  "open this repo/folder in the Claude app", "remote control here", "띄워줘",
  "이 디렉터리에서 remote-control 켜줘", or to list/kill those sessions. It launches
  a backgrounded `claude --remote-control` session in a fresh git worktree via
  Claude Code's native background-fleet recipe (`claude --bg --remote-control
  --worktree`), reachable from claude.ai/code and the mobile app — no tmux, no
  Telegram bridge.
---

# Remote-Control Spawner

Spawn, list, and kill backgrounded `claude --remote-control` sessions — one per
git worktree, each reachable from the Claude app. A thin wrapper over Claude
Code's native background-fleet recipe (no tmux).

Run the script and report the result concisely:

```bash
# Spawn for a directory's repo (name defaults to the dir's basename). The session
# runs in a fresh worktree at <repo>/.claude/worktrees/<name>, not in <dir> itself.
bash "${CLAUDE_PLUGIN_ROOT}/scripts/rc-spawn.sh" spawn <dir> [name]

# Spawn WITH an initial task — the session's first message. To pass a prompt you
# must also pass a name (it is the 3rd positional arg). The prompt is passed to
# claude after a `--` separator (claude --bg --remote-control --worktree <name> -- "<prompt>").
bash "${CLAUDE_PLUGIN_ROOT}/scripts/rc-spawn.sh" spawn <dir> <name> "<prompt>"

# List running worktree-backed background sessions
bash "${CLAUDE_PLUGIN_ROOT}/scripts/rc-spawn.sh" list

# Kill one by name (graceful stop -> delete session + worktree -> prune branch)
bash "${CLAUDE_PLUGIN_ROOT}/scripts/rc-spawn.sh" kill <name>
```

## Mechanism

| verb  | native command(s)                                                    |
|-------|----------------------------------------------------------------------|
| spawn | `claude --bg --remote-control --worktree <name> -- "<prompt>"`       |
| list  | `claude agents --json` (filtered to worktree-backed bg sessions)     |
| kill  | `claude stop <id>` → `claude rm <id>` → `git branch -D worktree-<name>` |

- `--bg` runs the session headless and returns immediately; `--remote-control`
  makes it app-reachable; `--worktree <name>` creates the worktree + branch.
- `kill` is graceful: `claude stop` routes through SessionEnd so memory hooks
  (e.g. anamnesis) flush before exit, then `claude rm` drops the session and its
  worktree dir. `claude rm` leaves the `worktree-<name>` branch behind, so the
  script prunes it with `git branch -D`.

## Output

- `STARTED <name>` → a session is now live in the worktree and appears in the
  Claude app. The `SESSION <id>` line is its native short id; relay the
  `logs`/`attach`/`kill` hints from the output.
- `ALREADY-RUNNING <name>` → idempotent; a live session for that name already exists.
- `NOT-FOUND <name>` → no live session matched on kill.

## Notes to pass on when relevant

- The session runs in a **fresh worktree** (`<repo>/.claude/worktrees/<name>`),
  not in `<dir>` itself — `<dir>` only selects which repo to branch from, so it
  must be inside a git repo. Native worktrees always land under the repo root's
  `.claude/worktrees/`, regardless of where `<dir>` sits in the tree.
- The session lives until it exits or is killed (no auto-restart by design — the
  daemon only re-adopts RUNNING sessions across restarts; a stopped session stays
  stopped).
- No tmux: the native daemon already holds a TCC grant, so sessions run under
  TCC-protected dirs (`~/Downloads`, `~/Documents`, `~/Desktop`) with no special
  setup. To peek inside a running session, use `claude logs <id>` or
  `claude attach <id>` (e.g. if a one-time folder-trust prompt is blocking it).
- `--bg` and the fleet verbs (`stop`/`rm`/`logs`/`attach`/`respawn`) are an
  undocumented fast-path; assumes Claude Code >= 2.1.x. Requires `jq`.
