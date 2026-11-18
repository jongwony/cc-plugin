# coordinator-rules

Gives a claude.ai project coordinator its role core through a SessionStart hook. The core holds only what the coordinator role adds. Any other session gets nothing from this plugin.

## Why

A project coordinator runs outside any cloud environment, so `scripts/cloud-setup.sh` never installs choi's rules into its `<config>/rules/`. It does get the plugins enabled on the claude.ai account, and it already has three other sources of instructions:

- the product's own instructions: the inbox, replies, decision cards, timers, project memory, approvals;
- the premise layer, which the `route` plugin delivers: relay or gate, decision tiering, judgment across delegation;
- the account's preferences: the person, the language, first person.

The core restates none of these. What is left is what only this role needs:

- Code, repositories and Linear stay with the thread doing the work.
- A slash command inside a brief does not run.
- Notifications go through the aiward and ntfy MCP servers, in the order the core gives, with a fallback when neither is connected.

## Layout

| Path | Loaded | Holds |
|---|---|---|
| `roles/coordinator.md` | every context epoch (startup, resume, clear, compact), coordinator only | the role core |
| `scripts/session-rules.mjs` | SessionStart | role detection, and emitting the core |
| `scripts/thread-brief.mjs` | PostToolUse on `mcp__hearthbot__start_thread` | one line when a brief line opens with a slash command |

## Role detection

| Session | Detected by | Gets |
|---|---|---|
| Project coordinator | `CLAUDE_CODE_TERMINAL_MCP_TOOLS` names `mcp__hearthbot__start_thread` | the core |
| Projects session without that variable | `CLAUDE_CODE_ENTRYPOINT=remote_projects` | one line saying no rules were loaded |
| Any other session | — | nothing |

`CLAUDE_CODE_TERMINAL_MCP_TOOLS` is an undocumented product value. On 2026-11-18 it was observed to differ between a coordinator and its threads, while `CLAUDE_CODE_ENTRYPOINT` and `CLAUDE_CODE_COORDINATOR_EXTRA_TOOLS` held the same values in both. If the product changes this value, the coordinator falls to the second row and gets the one line. Every path exits 0.

Requires Node.js on `PATH`. Tests: `node --test coordinator-rules/scripts/coordinator-rules.test.mjs`.

## Adding a role

A role is a session kind with its own core. The Mac-resident aiward session is the next candidate. To add one:

1. Write `roles/<role>.md` with only what that role adds over its other instruction sources.
2. Add its marker to `detectRole` in `scripts/session-rules.mjs`, and a test.

## Install

Enable the plugin on the claude.ai account marketplace. Account sync follows what is enabled there, not this repository's `main`. A coordinator picks the plugin up at its next session start.

To check a coordinator:

- the plugin is under `<config>/plugins/synced/`;
- the session-start context contains `# Project coordinator`.
