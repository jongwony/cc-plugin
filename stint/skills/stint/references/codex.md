# When Codex is on either end

Read this when a Codex session is the creator, or when a Claude session must
reach a Codex thread. SKILL.md is written for a Claude Code creator; this file
carries what changes when the creator holds shell but no tool.

- **What divides the boundary is tool versus shell.** A tool is Claude Code's
  alone; a CLI command is not. `ListAgents`, `SendMessage` and `RemoteTrigger`
  are tools. The spawn line, `--remote-control`, `claude agents --json`, `logs`,
  `attach`, `stop`, `rm`, `claude --cloud` and reading the session registry are
  shell, and Codex reaches them.
- **From Codex, reach an independent session through `claude --cloud`.** It
  takes a description, a session id or a claude.ai/code URL, so it both creates
  and re-attaches. That covers the self-round wake, whose only requirement is a
  session that runs.
- **A Codex-driven launch is fire-and-forget.** Drop the handshake clause from
  the brief — the creator is not a peer and the worker has no one to ACK.
- **Verify the launch on the surface that carries it, and they differ by
  route.** A background spawn is verified with `claude agents --json`: the row
  under the returned jobId is live and carries the expected name. A
  `claude --cloud` session is not in that listing at all — it lists local
  sessions only — so verify that one by opening the claude.ai/code link it
  prints. Either check replaces the ACK.
- **Never open a session's messaging socket.** `/tmp/cc-socks/<pid>.sock`
  accepts any same-uid connection and speaks nothing first; it is unpublished,
  the registry advertises a negotiated `peerProtocol`, and no negotiator is
  published for a non-Claude process. `references/harness.md` carries what a
  connect attempt does and does not establish.
- **Claude reaches a Codex thread on a published surface.** `codex queue
  --thread <id> --message <text>` needs no token and no `--remote`, and persists
  against a thread that is not running.
