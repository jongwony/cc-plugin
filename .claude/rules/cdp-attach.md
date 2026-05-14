---
paths:
  - "cdp-attach/**"
---

# cdp-attach — Triage-Gated Vendor Harness Realization

`cdp-attach` realizes the **Triage-Gated Vendor Harness** pattern for the Chrome DevTools Protocol vendor. The pattern body and its instance-parameter slots live at `~/.claude/rules/triage-gated-vendor-harness.md`; this rule inscribes CDP-specific parameter values and design notes.

## Instance parameters

| Parameter | Value |
|-----------|-------|
| Vendor target | Chrome / CDP (debug-port WebSocket protocol) |
| Discovery scope | errors only — CDP method failures + WebSocket errors (logged to `~/.cache/cdp-attach/errors.jsonl` via `cdp_client.send()`). Body capture (`network_body`) is a separate concern, not a discovery channel |
| Trigger timing | on-error during PreToolUse-scoped invocation; the hook injects `additionalContext` so the agent files the issue mid-turn |
| Submitter set | agent in-session only (extensible to humans / Devin / Pryden as adoption grows) |
| Concrete substrate | GitHub Issues + `gh` CLI in `jongwony/cc-plugin` |
| Daemon? | **NO** — Chrome itself is the daemon; the wrapper does not add a second layer |

## Two-tier substrate

- **Intra-session** — `state.json` + `~/.cache/cdp-attach/*` (events, bodies, errors). Each foreground command opens a short-lived WebSocket, attaches, acts, detaches. Background collectors are bounded leases (e.g., `network_start` / `network_body` pair), never a permanent process.
- **Inter-session** — GitHub Issues + PRs in `jongwony/cc-plugin`. A PreToolUse hook (`cdp-attach/hooks/hooks.json` → `hooks/pretooluse_context.sh`) injects a one-line `additionalContext` reminder whenever the cdp-attach skill or one of its scripts is about to run; the agent files the issue itself via `gh` if an error occurs during use. Discrimination in the script: matcher covers `Skill|Bash`; script checks `tool_input.skill == "cdp-attach:cdp-attach"` or `tool_input.command` contains `cdp-attach/scripts/`. Triage is a separate session.

## Why CDP-specific design choices

- **No daemon**: a host process would buy WebSocket-handshake latency back but couple the plugin to a permanent runtime and dilute the agent-editable property. Chrome itself is the daemon; the plugin should not add a second layer.
- **Issues over in-session auto-fix**: in-session edits commit the agent's first interpretation without a review gate; across sessions the same root cause produced two distinct cdp-attach bugs over 21 days before triage. The issue gate separates interpretation from commit. Accumulated issues become the learning signal for plugin evolution.

## Extending cdp-attach

- **New tool bugs encountered during use**: rely on the hook to auto-file. If filing manually (different harness or disabled hook), match the title format `[cdp-attach] <category>|<method>|<code-or-kind>` so the dedupe finds it.
- **New primitives holding a CDP-session contract** (like `Network.enable`): follow the `network_body` pattern — fork holds the session, filesystem is the synthesis substrate, foreground commands read filesystem. This is the intra-session realization of the same structure (CDP target ≈ subagent, substrate = filesystem).
- **OOPIF / worker / service-worker absorption** (planned, not yet exposed in v1/v2/v3 — see `SKILL.md` note on cross-origin iframe debugging): when added, follow the same intra-session pattern with `Target.attachToTarget(flatten:true)` + recursive `setAutoAttach`. At that point `sessionId` will be volatile (per invocation), so a durable handle composed of `targetId + type + url` will be required — current code persists bare `targetId` only, via `state.json`.
