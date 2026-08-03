---
name: agent-device-preflight
description: |
  This skill should be used when the user asks to "connect my phone to agent-device",
  "attach a device to agent-device", "why can't agent-device see my iPhone/iPad", "why
  can't agent-device see my Pixel/Android phone", "agent-device doctor passes but open
  fails", "developer disk image could not be mounted", "No Account for Team", "this
  provisioning profile cannot be installed on this device", "xcodebuild
  build-for-testing failed", "No Android devices found", "adb says unauthorized",
  "agent-device snapshot times out", "Daemon request timed out", "agent-device is
  targeting the simulator instead of my phone", "the same signing error repeats after I
  fixed it", or is setting up agent-device against a physical iOS or Android device for
  the first time. Resolves the environment prerequisites that must hold before
  `agent-device open` can attach; hands command-level work back to the CLI. Pass the
  user's request verbatim — this skill reads a free-form request, not a subcommand.
user_invocable: true
---

# agent-device Preflight

Bring the local environment to the state `agent-device` needs, then get out of the way.

## Scope Guard

This skill covers **attachment prerequisites only** — what must hold before `agent-device open`
can reach a device. Some of it is one-time setup (toolchain, signing, developer mode); the rest
is per-run state that goes stale on its own — lock state, session identity, ownership claims,
and the daemon's captured environment.

It deliberately holds **no post-attachment command catalog**. The few commands here exist to
establish or inspect the preconditions themselves. Once preflight passes, defer to
`agent-device help <topic>`. Do not duplicate the command surface here — it moves faster
than any static copy.

Three reasons this layer exists rather than being covered by what already ships:

- `agent-device doctor` covers almost none of the platform checks — on iOS it reaches only
  the CLI's own presence.
- The MCP server does not expose the connection surface, so a shell must drive attachment.
- Failures in this set are reported with actively misleading text on both platforms. iOS
  blames the screen for a signing failure; Android reports "no devices found" for a
  device that is connected and listed. Following either wastes the session.

## Platform

Run the shared checks below, then read **exactly one** platform file:

| Target | Read |
|---|---|
| Physical iPhone or iPad | `references/ios-preflight.md` |
| Physical Android device | `references/android-preflight.md` |

Read only the one you need, and do not carry conclusions across. The two platforms
disagree at nearly every corresponding step — which selector works, whether signing
exists at all, how a locked device announces itself, what a slow first snapshot means.
Applying an iOS habit on Android (or the reverse) produces failures whose error text
points somewhere else entirely.

## Shared checks

### CLI present and recent enough

```bash
agent-device --version   # must be >= 0.20.0
```

Missing or older than 0.20.0 → **stop.** Do not run `npm install -g agent-device@latest` or
`npx -y agent-device@latest` autonomously, and do not put a version or upgrade command in a
plan — upstream's own skill forbids both. Ask the user to upgrade their trusted install, or to
approve an exact-version command they run themselves. Requires Node 22.12+ (24+ for web).

### A matching `version` field does not mean matching code

`package.json` keeps the last released version until the next bump, so a `main` checkout and
an installed npm build can both read `0.20.3` and differ. Verify behaviour against the
installed `dist/`, not the repository, when the two could disagree.

### Sessions are named from the working directory

With no `--session`, the default session name derives from a hash of the current directory
(`cwd:<hash>:default`). The same command run from a different directory therefore targets a
*different* session, and `doctor` will say so:

```
- session: No active session named cwd:<hash>:default. Doctor will use device inventory only.
```

Pass `--session <name>` explicitly for any multi-step run, so the session does not move when
the shell does.

Device ownership claims can also outlive their owner:

```bash
agent-device device status            # summarises; hides stale entries
agent-device device status --stale    # shows them, e.g. owner-process-dead
```

A dead-owner claim from an earlier session lingers in this state. It is advisory, so it does
not block on its own — but read it before concluding that something else is holding the device.

### The daemon captures the environment it was spawned with

The daemon starts lazily on the first command and keeps the environment it was spawned with.
Exporting a corrected `AGENT_DEVICE_*` value into your shell does nothing for an
already-running daemon.

```bash
agent-device daemon stop   # there is no `daemon start`; the next command respawns it
```

`references/ios-preflight.md` item 7 covers which variables this actually bites on there, and
how to confirm what the daemon used. Android sets none of the `AGENT_DEVICE_*` variables this
matters for, so its file carries no counterpart.

### Sandbox

The daemon binds to localhost, and in one sandboxed agent shell that failed with
`listen EPERM`. Because `doctor` starts the daemon too, the failure strands everything
downstream of it.

It is not a property of every sandbox — a full run has since gone through one untouched. So
treat `listen EPERM` as the signal to re-run that shell unsandboxed, rather than moving all
agent-device work out of the sandbox pre-emptively.

## Handoff

Each platform file contains a Verify step. The snapshot is the real gate — `doctor` passing
proves considerably less. Once it passes, hand off: `agent-device help workflow`.

## Scope not covered

Web, the remote/cloud lease providers, and `proxy` are outside this preflight on every
platform. Platform-specific exclusions are named in each platform file, alongside the
verification domain that file's evidence actually ranged over.
