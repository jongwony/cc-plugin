# coordinator-rules

Gives each Claude Code session the rules its role needs, through a SessionStart hook. A claude.ai project coordinator gets a small always-loaded core and reads the rest when its moment comes. A session with no role and no installed rules gets choi's full rules (`rules/` and `cloud-rules/`, as `scripts/install-rules.manifest` lists them).

## Why

Claude Code loads every file in `<config>/rules/` at session start. The Mac links those files, and a cloud environment that runs `scripts/cloud-setup.sh` writes them (see `scripts/install-rules.md`). A project coordinator runs outside any cloud environment, so no setup script reaches it. A cloud thread whose environment has no setup script starts without the rules too. Both still get the plugins synced from the claude.ai account.

The coordinator does not need the full set. It does no code work itself: it reports to choi, notifies, and coordinates threads, and the threads load the full rules. About half of the full set is code-work rules, and some rules name tools the coordinator does not have (`ntfy-checkpoint`, `aiward-send`, `residue`); a coordinator notifies through aiward and ntfy MCP servers instead.

## Layout

| Path | Loaded | Holds |
|---|---|---|
| `roles/coordinator.md` | every context epoch, coordinator only | the core: read points, person and language, gate or relay, delegation, consent, notifications, open work (about 5,000 characters) |
| `references/notification.md` | read before a push or an end-of-work report | which sender each case takes (the aiward and ntfy MCP servers), and what to do where neither is connected |
| `references/delegation.md` | read before `start_thread` | what a brief carries and leaves out, the Linear chart, receiving a result |
| `rules/`, `cloud-rules/`, `install-rules.manifest` | symlinks to the repository's own | the shared rules; the core indexes the ones it needs by absolute path, and the full-rules path reads the manifest |

## How

- `scripts/session-rules.mjs` runs at startup, resume, clear and compact, once per part (`1/4` is part 1 of 4, because the host caps each injected string at 10,000 characters).
- **Coordinator:** `CLAUDE_CODE_TERMINAL_MCP_TOOLS` names `mcp__hearthbot__start_thread`. Part 1 emits `roles/coordinator.md` with `{{root}}` made absolute; the other parts emit nothing. The core goes out whether or not `<config>/rules/` is installed. An indexed path that does not resolve is named in one line.
- **Unknown:** a projects session (`CLAUDE_CODE_ENTRYPOINT=remote_projects`) without `CLAUDE_CODE_TERMINAL_MCP_TOOLS`. Nothing is loaded, and part 1 says so in one line.
- **No role:** the full rules, packed into parts in manifest order, unless any manifest file name already exists in `<config>/rules/` (then nothing).
- `scripts/thread-brief.mjs` runs after `mcp__hearthbot__start_thread` and adds one line: a slash command found at the start of a brief line (it does not run there), and a pointer to `references/delegation.md` for anything to send with `message_thread`.
- Every path exits 0.

`CLAUDE_CODE_TERMINAL_MCP_TOOLS` is an undocumented product value, observed on 2026-11-18 to differ between a coordinator and its threads. `CLAUDE_CODE_ENTRYPOINT` and `CLAUDE_CODE_COORDINATOR_EXTRA_TOOLS` hold the same values in both. If the product changes it, the coordinator falls to the unknown path and says so.

Requires Node.js on `PATH`. Tests: `node --test coordinator-rules/scripts/coordinator-rules.test.mjs`.

## Adding a role

A role is a session kind with its own core. To add one (the Mac-resident aiward session is the next candidate):

1. Write `roles/<role>.md`, indexing shared files by `{{root}}/...`.
2. Add its marker to `detectRole` in `scripts/session-rules.mjs`, and a test.
3. Put files only that role reads in `references/`.

## Install

Upload the plugin to the claude.ai account, so it syncs to every session, including project coordinators. A coordinator that is already running picks it up once its container syncs plugins again and a SessionStart fires (resume or compact); when that sync happens has not been verified.

To check a session, look for the plugin under `<config>/plugins/synced/` and confirm that `rules/preferences.md` there is a real file, not a missing link. A missing link also shows in the coordinator core's last line.

In Claude Code, for testing:

```
/plugin install coordinator-rules --marketplace jongwony/cc-plugin
```
