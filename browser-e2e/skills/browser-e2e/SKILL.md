---
name: browser-e2e
description: |
  This skill should be used when the user asks to "run an E2E", "browser E2E",
  "test this flow in the browser", "walk through the signup flow in Chrome",
  "drive Chrome for a test", "check this page end to end", or invokes
  `/browser-e2e`. Runs an end-to-end browser flow in Chrome through one of two
  vendor-separated executors — codex (default) or Claude (only when named).
  Pass the user's request verbatim: the first word may name the executor, and
  everything after it is the task.
user_invocable: true
---

# Browser E2E

Run an end-to-end browser flow in Chrome. Two executors, **one shared operation
set** — whichever one runs, the same operations are available and the run behaves
the same way for the user. There is no automatic switching between them.

## Prerequisites

**Chrome specifically.** Both executors drive Google Chrome, and the browser is
always named explicitly rather than left to the system default — a default is
machine state that changes underneath the skill.

| Path | Needs | Check |
|------|-------|-------|
| codex (default) | `codex` CLI on PATH; the bundled `chrome` plugin's extension **and** native host installed; Chrome running; **plus a codex surface that actually exposes the chrome plugin — see below** | Preflight step 2 below runs the four bundled diagnostics |
| Claude (named) | The Claude in Chrome extension connected to this session | `tabs_context_mcp` returns a tab group instead of an error |

> **⚠️ Check which `codex` you are running, before anything else.** `codex` on
> `PATH` may be a wrapper that redirects `CODEX_HOME` to a project-isolated home,
> and an isolated home has no bundled marketplace — so the chrome plugin never
> loads and no run gets a browser capability. Measured on this machine
> 2026-08-30: that is exactly what `command -v codex` resolved to, and it cost
> three probes before it was noticed.
>
> ```bash
> command -v codex                 # wrapper, or the real binary?
> codex plugin marketplace list    # openai-bundled must appear
> ```
>
> The four diagnostics pass under either home — they are shell `node` scripts, not
> plugin tools — so **a green preflight does not prove the path works.** Details
> and what this rules out: `references/codex.md`.

> **Note**: no Chrome launch flag is required — neither path uses
> `--remote-debugging-port`. Both reach Chrome through their vendor's own
> extension + native-host channel, so they drive **your real Chrome profile**.
> That is the reason most E2E runs start already logged in (see Preflight step 3).

## Invocation

Branch on the **first token of the argument**, not on availability:

```
/browser-e2e <task>            → codex   (default)
/browser-e2e claude <task>     → Claude
```

| Executor | When | Settings | Path detail |
|----------|------|----------|-------------|
| **codex** | Always, unless the user typed `claude` | model `gpt-5.6-luna`, reasoning effort `xhigh` | `references/codex.md` |
| **Claude** | Only when the user's argument starts with `claude` | this session's own `mcp__claude-in-chrome__*` tools | `references/claude.md` |

The literal token `claude` is consumed as the executor name; the rest of the
argument is the task, passed through verbatim. Any other first token is part of
the task — do not guess at an executor from the task's wording.

## No fallback

**A failure is reported, not routed around.** If the chosen executor cannot run,
or fails mid-flow, say which precondition or which step failed and stop. Do not
re-run the task on the other executor, and do not offer to — the user picks the
executor, and silently switching would report a result from a surface they did
not choose.

The shared operation set below exists for **consistency between the branches**,
so the two behave identically for the user. It is not a fallback substrate, and
nothing here should be read as making one path a stand-in for the other.

## Preflight

Run these four in order before the first operation of a flow.

**1. Executor.** Parse it from the argument per *Invocation*. Default is codex.
Do not re-ask when the user already typed one.

**2. Surface.** Establish the executor's own tab surface.

- **Claude** → call `tabs_context_mcp` with `createIfEmpty: true`. The session's
  binding to its tab group expires on its own while the group and its tabs stay
  on screen, so **finding no group here is the normal path, not an error path** —
  create and continue without comment.
- **codex** → `agent.browsers.get("chrome")`, explicitly by name. If that fails,
  run the bundled diagnostics and **name which precondition is unmet** rather than
  reporting a generic browser failure:

  ```bash
  D="$HOME/.codex/plugins/cache/openai-bundled/chrome/latest/scripts"
  node "$D/installed-browsers.js" --check --json          # 1 = no browser installed
  node "$D/chrome-is-running.js" --check --json           # 1 = Chrome not running
  node "$D/check-extension-installed.js" --json           # 1 = installed, disabled; 2 = not installed
  node "$D/check-native-host-manifest.js" --json          # 1 = manifest missing/incorrect
  ```

  Exit codes and the `--check` requirement are detailed in `references/codex.md`.
  Two of the four exit `0` regardless unless `--check` is passed — pass it.

**3. Target — a new tab is the default.** Open a new tab and navigate to the
flow's entry URL. Do **not** attach to a tab the agent did not open. Chrome
profile auth is inherited by a fresh tab, so most E2E runs start already logged
in; a fresh navigation is therefore the cheaper and more reproducible start.

Attach is the **exception path**, taken only when the flow needs in-tab state that
a fresh navigation cannot reproduce — an unsubmitted form, a live WebSocket,
in-memory SPA state, a one-time URL already consumed. Procedure for both
vendors: `references/attach.md`.

**4. Only if nothing works, ask the human.** Name the empty precondition, then
identify the target **by a marker visible on screen** — the tab group's name as
Chrome renders it, not an internal id.

> Real incident: two tab groups named `Claude` and `✅Claude` were open at once,
> and the tab was placed in the wrong one. The checkmark marked the active
> session's group. When two groups could be confused, quote the exact on-screen
> string, including any prefix character.

This is a last resort. The skill discovers, creates, and tears down its own tab
group — `chrome.nameSession(name)` on the codex side, `tabs_context_mcp` on the
Claude side. Give the group a name distinctive enough to be a screen marker at
step 4 before it is needed, and close what it opened when the flow ends.

## The shared operation set

Both executors reach every row below **by an agent call alone**. Same row, same
outcome, whichever branch is running.

| Operation | codex | Claude |
|-----------|-------|--------|
| claim / name the surface | `chrome.nameSession(name)` ᴹ | `tabs_context_mcp{createIfEmpty}` ᴹ |
| open a tab | `chrome.tabs.new()` ᴹ | `tabs_create_mcp` ᴹ |
| list this session's tabs | `chrome.tabs.list()` ᴹ | `tabs_context_mcp` ᴹ |
| navigate | `tab.goto(url)` ᴹ | `navigate` ᴹ |
| read page structure | `tab.playwright.domSnapshot()` ᴹ | `read_page` / `get_page_text` ᵁ |
| locate an element | `tab.playwright.locator(sel)` ᴹ | `find` ᵁ |
| click | `locator.click()` ᴹ | `computer` ᵁ |
| type into a field | `locator.type()` ᴹ | `form_input` ᵁ |
| scroll | `tab.dom_cua.scroll({x,y})` ᴹ | `computer` ᵁ |
| screenshot | `tab.screenshot()` ᴹ | `computer` ᵁ |
| read console | `tab.dev.logs({})` ᴹ | `read_console_messages` ᵁ |
| close a tab | `tab.close()` ᴹ | `tabs_close_mcp` ᴹ |

**ᴹ measured** — exercised and confirmed working, 2026-08-30.
**ᵁ unmeasured** — present in the vendor's tool surface and described there, but
the operation itself was not exercised. Treat a ᵁ cell as expected-to-work, and
if it does not, report that rather than working around it (see *No fallback*).

The codex column's calls are JavaScript, evaluated through the
**`mcp__node_repl__js`** tool. A prompt that names the operations but not the tool
leaves the run to find the mechanism itself — name it.

`chrome.nameSession()` is Chrome-specific and must be called **before** opening or
claiming tabs on the codex side.

### What counts as in the set

> An operation is **in** the shared set when **both** vendors can reach it by an
> agent call alone. If one vendor needs a human to complete it, it is **not** in
> the set — it belongs in `references/`.

Write this test down against every future addition. It is about reachability by
the agent, not about how similar the two APIs look: two calls with different
shapes belong in the same row when both land the same outcome unattended, and a
capability one vendor exposes richly still stays out when the other vendor's
route to it passes through a person.

## Beyond the shared set

Everything outside the table lives in `references/` — attempt it only when the
situation allows, and on failure solve the task within the shared set instead:
[`attach.md`](references/attach.md) (drive a tab the agent did not open, both
vendors) · [`codex-privileged.md`](references/codex-privileged.md) (raw CDP,
network response bodies) · [`claude-only.md`](references/claude-only.md)
(`read_network_requests`, `gif_creator`).

## Error handling

| Error | Cause | Resolution |
|-------|-------|------------|
| codex: `browsers.get("chrome")` fails | One of four preconditions unmet | Run the step-2 diagnostics with `--check --json` and name the failing one; do not switch executors |
| codex: browser resolves to Dia or another app | Browser left to the system default | Always pass `"chrome"` explicitly — Dia is this machine's default and is unsupported |
| codex: `cdp.send()` rejected | A saved per-origin permission denies it | Out of the shared set — `references/codex-privileged.md`; solve the step within the shared set instead |
| Claude: no tab group found | The session-to-group binding expired while the group stayed on screen | Normal — `tabs_context_mcp{createIfEmpty: true}` and continue |
| Claude: `Couldn't determine which page this action targets` | The tab is outside this session's group; a valid Chrome tabId from outside does not address it | The Claude session cannot reach it programmatically — `references/attach.md` |
| Claude: the group vanished | Closing the group's last tab auto-removes the group | Expected — the next `tabs_context_mcp{createIfEmpty}` starts a fresh group |
| Either: needed network response bodies | No shared-set operation covers response bodies | Vendor-specific and asymmetric — `references/claude-only.md` or `references/codex-privileged.md` |
| Either: the flow's step genuinely failed | The page or the app under test | Report the failing step with its evidence. Do not retry on the other executor |

## Unverified

Carried openly so a later session can close them rather than inherit them as
assumptions:

- **The CDP permitted-command allowlist** (reported as 20 methods) has never been
  measured. Detail and current blocker: `references/codex-privileged.md`.
- **Claude-side `find`, `computer`, `read_console_messages`, `gif_creator`** are
  known from their tool descriptions, not from a run. Marked ᵁ above.
- **`tab.markHandoff()` lifetime across sessions** is unknown — whether a handoff
  marked in one codex run is still meaningful to a later one has not been tested.
  `references/codex.md`.
- **The provenance of the codex column's original measurements.** They were handed
  over as measured, but on a surface nobody has since been able to name; the
  session first credited with them has stated it made none. The operations are
  being re-measured under a known `CODEX_HOME` — until that lands, read the codex
  column's ᴹ as unverified-provenance, which is a distinct state from unmeasured
  and from confirmed.

### What a dogfood run already found

An acceptance run on 2026-08-30 (gpt-5.6-luna at xhigh, handed this skill and
`references/codex.md`) reached none of the shared-set operations. Two defects it
exposed are fixed in the files rather than left as notes, and both were failures
of the *writing*, not of the design:

- Handed the whole of `references/codex.md`, the codex run read its *Invoking*
  section as addressed to itself and re-invoked `codex exec`, nesting a second
  codex inside the first. That file now states which reader each section is for.
- The run then reported the nested process's crash as the browser path's failure.
  The real finding — "the browser API is not exposed in this session" — appeared
  once in its working notes and never reached its report. When a delegated run
  names a cause, check its trace against it.

A third lesson came from the investigation rather than the run. Three probes each
returned "no browser capability," and that was counted as three confirmations; it
was one fault reproduced three times, because every probe went through the same
`PATH` wrapper. Varying the working directory and the browser state varied nothing
that mattered — both sit below the wrapper. **Repetition is not independence**, and
one `command -v codex` would have said more than all three.
