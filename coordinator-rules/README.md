# coordinator-rules

Gives a claude.ai project coordinator its rules, through a SessionStart hook: a small always-loaded core, and the rest read when its moment comes. Any other session gets nothing from this plugin.

## Why

Claude Code loads every file in `<config>/rules/` at session start. The Mac links those files, and a cloud environment that runs `scripts/cloud-setup.sh` writes them (see `scripts/install-rules.md`). A project coordinator runs outside any cloud environment, so no setup script reaches it. It still gets the plugins enabled on the claude.ai account.

The coordinator does not need the full set. It does no code work itself: it reports to choi, notifies, and coordinates threads, and the threads do the code work. About half of the full set is code-work rules, and some rules name tools the coordinator does not have (`ntfy-checkpoint`, `aiward-send`, `residue`); a coordinator notifies through aiward and ntfy MCP servers instead. Linear is the threads' to write, so `cloud-rules/` stays out.

## Layout

| Path | Loaded | Holds |
|---|---|---|
| `roles/coordinator.md` | every context epoch, coordinator only | the core: read points, person and language, gate or relay, delegation, consent, notifications, open work (about 5,000 characters) |
| `references/notification.md` | read before a push or an end-of-work report | which sender each case takes (the aiward and ntfy MCP servers), and what to do where neither is connected |
| `references/delegation.md` | read before `start_thread` | what a brief carries and leaves out, receiving a result |
| `rules/` | read at the core's read points | copies of the repository's `rules/` files the core indexes, and only those |

## How

- `scripts/session-rules.mjs` runs at startup, resume, clear and compact, as one hook entry: the core is one string under the host's 10,000-character cap.
- **Coordinator:** `CLAUDE_CODE_TERMINAL_MCP_TOOLS` names `mcp__hearthbot__start_thread`. The hook emits `roles/coordinator.md` with `{{root}}` made absolute. An indexed path that does not resolve is named in one line under it.
- **Unknown:** a projects session (`CLAUDE_CODE_ENTRYPOINT=remote_projects`) without `CLAUDE_CODE_TERMINAL_MCP_TOOLS`. Nothing is loaded, and one line says so.
- **Any other session:** nothing.
- `scripts/thread-brief.mjs` runs after `mcp__hearthbot__start_thread` and adds one line: a slash command found at the start of a brief line (it does not run there), and a pointer to `references/delegation.md` for anything to send with `message_thread`.
- Every path exits 0.

`CLAUDE_CODE_TERMINAL_MCP_TOOLS` is an undocumented product value, observed on 2026-11-18 to differ between a coordinator and its threads. `CLAUDE_CODE_ENTRYPOINT` and `CLAUDE_CODE_COORDINATOR_EXTRA_TOOLS` hold the same values in both. If the product changes it, the coordinator falls to the unknown path and says so.

## Editing a shared rule

The `rules/` files here are copies, because account sync delivers a plugin as a plain directory and is not known to carry symlinks. The repository's `rules/` stays the source, and the set copied is exactly the `{{root}}/rules/…` paths the role cores name. After editing one of those rules, or a core's read points, run `node coordinator-rules/scripts/sync-shared.mjs`, bump this plugin's version, and commit both; the `coordinator-rules` workflow fails a PR whose copies differ.

Requires Node.js on `PATH`. Tests: `node --test coordinator-rules/scripts/coordinator-rules.test.mjs`.

## Adding a role

A role is a session kind with its own core. To add one (the Mac-resident aiward session is the next candidate):

1. Write `roles/<role>.md`, indexing shared files by `{{root}}/...`, and run `sync-shared.mjs`.
2. Add its marker to `detectRole` in `scripts/session-rules.mjs`, and a test.
3. Put files only that role reads in `references/`.

## Install

Enable the plugin on the claude.ai account (the account marketplace), so it syncs to project coordinators. Account sync follows what is enabled there, not this repository's `main`. A coordinator picks it up at its next session start.

To check a coordinator, look for the plugin under `<config>/plugins/synced/`, and for `# Project coordinator` in the session-start context. A shared file missing from the copy shows in the core's last line.
