# When Codex is on either end

Read this when a Codex session is the creator, or when a Claude session must
reach a Codex thread. SKILL.md is written for a Claude Code creator; this file
carries what changes when the creator holds shell but no tool.

- **What divides the boundary is tool versus shell.** A tool is Claude Code's
  alone; a CLI command is not. `ListAgents`, `SendMessage` and `RemoteTrigger`
  are tools — and `RemoteTrigger` is also off inside any cloud session. The
  spawn line, `--remote-control`, `claude agents --json`, `logs`, `attach`,
  `stop`, `rm`, `claude -p --cloud` and reading the session registry are shell,
  and Codex reaches them.
- **From Codex, the independent-session route is the `--bg` spawn line.** It
  needs no terminal, and it covers the self-round wake, whose only requirement
  is a session that runs. `claude --cloud` cannot create a session from Codex:
  creating one requires an interactive terminal.
- **`claude -p "<msg>" --cloud <session_id|url>` sends one message to a cloud
  session that already exists** and returns without waiting for the reply.
  `claude -p "<task>" --environment <ccpool_…>` creates one headlessly, but only
  on a self-hosted pool.
- **A Codex-driven launch is fire-and-forget.** Drop the handshake clause from
  the brief — the creator is not a peer and the worker has no one to ACK.
- **Verify the launch with `claude agents --json`**: the row under the returned
  jobId is live and carries the expected name. That check replaces the ACK.
- **Codex reaches a Claude session through the CLI.** `claude -p "<task>"`
  starts new headless work, and `claude --resume <sessionId> -- "<msg>"`
  continues a session that has stopped. Those cover what a Codex creator
  needs, so a session's messaging socket (`/tmp/cc-socks/<pid>.sock`) stays
  with the `SendMessage` tool that speaks it.
- **A running Claude session has no clean way in from Codex yet.** Resuming one
  starts a copy rather than reaching it (SKILL.md §Resuming). Wait for it to
  stop and resume it, or start new work with `claude -p`.
- **Claude reaches a Codex thread through the CLI too.** `codex queue
  --thread <id> --message <text>` needs no token and no `--remote`, and persists
  against a thread that is not running.
