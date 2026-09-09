# Codex browser and native-app control

Read before delegating a browser or native-app task. This reference governs the
Codex run; the caller's own computer-use tools are a separate surface.

## Discover the execution surface

Carry the target app or browser, intended effects, and existing user constraints
into the prompt. Ask the actual delegated run to inspect its callable tools and
follow their returned documentation. Availability depends on that run's host,
configuration, and connections; the caller's inventory and an installed plugin
alone do not establish access.

When `mcp__cua_repl.js` is exposed, use its documented CUA entry point. For an
inventory, the first call is exactly `await cua.getState();`. For a known target,
use the matching entry point specified by the tool instructions. Read the returned
documentation before further calls; discover any additional API there. This
surface provides its own initialization, so it needs no separate browser-client
import or hard-coded plugin cache path.

If another control surface is exposed, use its own initialization and API
contract. Report missing capability when no suitable tool is available. Native
control through CUA and Codex desktop-app tools are distinct capabilities; a
resumed conversation is not evidence that either is exposed in the new runtime.

## Operate and verify

- Select the user's requested browser or app using the documented entry point.
  Resolve existing tabs from the current inventory. For isolated work, create a
  new tab with a recognizable session name where supported; for native tests,
  create a new document and confirm it is the target before writing.
- CUA entry points include `cua.createBrowserTab(...)`, `cua.getTab(...)`, and
  `cua.getApp(...)`. Use the arguments and supported backends from the current
  tool documentation. App or tab selection can automatically return UI content.
- After input or clicks, read `getAXState()` before choosing the next action and
  derive element indices from that fresh state. Use screenshots when the task
  needs visual verification or accessibility text leaves the target unclear.
- Verify the requested effect in the resulting UI. For text entry, compare the
  actual value with the intended string, including punctuation and non-ASCII
  characters; a completed typing call can still lose characters. Use another
  documented input method if needed, then verify again.
- Close only the test tabs or documents created by the run, observing any discard
  dialog before acting. Report anything left for the user to handle.

A capability test must distinguish tool exposure, successful UI observation, and
verified interaction. Report the tested host, launch path, browser/app, and effect.
A direct `codex exec` run from the desktop app does not establish that a run
through Claude Code and `codex-run.sh` has the same environment. Test that launch
path before claiming equivalent access there.

## Return evidence without unrelated UI content

Ask the delegated run to return the decisive state change, exact failing call
when applicable, and cleanup status. Bound observations and retained output to
what the task needs. A native app's initial automatic snapshot may contain an
existing document; omit unrelated content from the returned summary and retained
logs. For subsequent observations, use documented output suppression and emit
only the relevant values when available.

The session ID resumes conversation history. Re-select targets and initialize
CUA according to the resumed runtime's instructions before relying on old
JavaScript bindings or element indices.

## When a run fails

Read [computer-use-troubleshooting.md](computer-use-troubleshooting.md). Report
which stage failed and its evidence; keep the error message separate from a
hypothesis about its cause.
