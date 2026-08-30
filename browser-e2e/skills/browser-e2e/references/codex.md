# codex executor — the default path

How a `/browser-e2e <task>` run reaches Chrome. Everything here is the **default**
branch; the Claude branch is `claude.md`, and neither substitutes for the other
(SKILL.md, *No fallback*).

## ⚠️ Two readers, and they must not swap roles

This file is read by both sides of the delegation, and they need different parts.
Check which one you are before acting on anything here.

| If you are… | Read | Do **not** act on |
|---|---|---|
| **the orchestrator** (Claude Code, holding the user's `/browser-e2e` request) | *Settings*, *Invoking*, *Diagnostics* | — |
| **the codex run itself** (already inside codex, given this file) | everything **except** *Invoking* | *Invoking* — you are already the run |

**Measured 2026-08-30**: handed this whole file, a codex run read *Invoking* as an
instruction addressed to itself and executed `codex exec` **again**, nesting a
second codex inside the first. The nested process died at
`failed to initialize in-process app-server client: Operation not permitted`, and
the run then reported that error as the browser path's failure — which it was not.
Do not remove this table.

## ⚠️ Check which `codex` you are running

**The single most likely reason this path appears broken.** `codex` on `PATH` may
be a wrapper that redirects `CODEX_HOME` to a project-isolated codex home, and an
isolated home does not carry the bundled marketplace the chrome plugin lives in.
Nothing about Chrome, the extension, the sandbox or the model is wrong when this
happens — the run is simply reading a different codex installation.

Check before blaming anything else:

```bash
command -v codex                    # is this the real binary, or a wrapper?
codex plugin marketplace list       # openai-bundled must appear
```

Measured 2026-08-30 on this machine: `command -v codex` resolved to
`…/hermeneutic-assistant/data/opencodex/bin/codex`, a two-line shell wrapper that
sources an `env.sh` setting `CODEX_HOME` to a project-local directory before
exec'ing `/opt/homebrew/bin/codex`. Under that home, `plugin marketplace list`
shows only `openai-curated` and no run gets a browser capability. Under the real
home it lists `openai-bundled` and the capability appears.

The symptom is easy to misread as a browser problem, because it is not one:

| What you see | What it means |
|---|---|
| No chrome/browser tool in the run's inventory | wrong `CODEX_HOME`, most likely |
| All four diagnostics exit 0 | true and irrelevant — they are shell `node` scripts, not plugin tools, so they pass under either home |
| `config.toml` says `[plugins."chrome@openai-bundled"] enabled = true` | you are reading `~/.codex/config.toml` while the run reads another one |

That last row is the trap worth naming: reading the real home's config while
running a wrapper's home makes every check agree that the plugin is enabled while
every run disagrees. Confirm the two are the same home before drawing any
conclusion.

Run against an explicit home when in doubt:

```bash
CODEX_HOME="$HOME/.codex" /opt/homebrew/bin/codex exec …
```

**Ruled out by measurement**, so do not re-check them: the Chrome extension
(installed and enabled, native host manifest correct, and a probe with a tab open
by hand changed nothing), sandbox mode, working directory, project trust, and the
`browser_use` / `plugins` / `in_app_browser` feature flags.

## How the JS actually runs

The calls in *Operations* are JavaScript, and codex evaluates them through the
**`mcp__node_repl__js`** tool — the REPL the chrome plugin exposes. Measured
2026-08-30 under the real `CODEX_HOME`; the tool is absent under the wrapper's
home, which is what makes its absence the diagnostic signal above.

A prompt that names the operations but not the tool leaves the run to discover
the mechanism for itself. Name the tool.

## Settings

| Setting | Value | Why fixed |
|---------|-------|-----------|
| model | `gpt-5.6-luna` | codex's own registry describes it as a fast, affordable agentic coding model; it is the cost-efficient pick for browser / computer-use runs |
| reasoning effort | `xhigh` | an E2E flow is a long sequence of stateful steps where a single misread page costs the whole run |
| sandbox | `workspace-write` with network access | the default; read-only has no network at all in codex |

## Invoking

> **Orchestrator only.** If you are the codex run reading this file, skip this
> section entirely — see the two-readers table above. Acting on it nests a second
> codex inside yourself, which has been measured to fail.

Write the task to a prompt file, then hand it to `codex exec`. Run it in the
background with output redirected to a file so codex's banner and step-by-step
output stay out of this conversation — only the outcome comes back.

```bash
CODEX_HOME="$HOME/.codex" /opt/homebrew/bin/codex exec --skip-git-repo-check \
  -m gpt-5.6-luna \
  --config model_reasoning_effort=xhigh \
  --sandbox workspace-write \
  --config sandbox_workspace_write.network_access=true \
  --output-last-message "$OUT" < "$PROMPT"
```

The explicit home and absolute binary are not belt-and-braces: a bare `codex` may
resolve to a `PATH` wrapper pointing at a different home, which silently costs the
run its browser capability (see the check at the top of this file). Drop them only
once `command -v codex` and `codex plugin marketplace list` have both been read.

codex prints `session id: <uuid>` to stderr. Capture it verbatim — it is the only
handle for resuming the same flow (`codex exec resume <uuid>`), which matters when
an E2E run needs a follow-up turn against browser state it already established.

Read `$OUT` for codex's final message rather than relying on the subagent's
summary; an E2E verdict is exactly the part a summary flattens.

**Measured 2026-08-30**: this invocation starts a run cleanly under
`gpt-5.6-luna` / `xhigh` / `workspace-write` with network — the banner reports all
three back, `--output-last-message` captures the final message, and the
`session id: <uuid>` line appears on stderr as described. Under the explicit
`CODEX_HOME` the run also carries `mcp__node_repl__js`, the tool the browser calls
are evaluated through; without it, it does not.

## The browser handle

**Bootstrap first — `agent` does not exist yet.** A fresh `mcp__node_repl__js`
environment exposes only `nodeRepl`; evaluating `agent.browsers…` straight away
raises `ReferenceError: agent is not defined` (measured 2026-08-30). Import the
plugin's browser client and call `setupBrowserRuntime()` before anything else.
The client lives beside the diagnostics:

```
$HOME/.codex/plugins/cache/openai-bundled/chrome/latest/scripts/browser-client.mjs
```

**Everything is async.** `browsers.get()` and every tab method return Promises.
The snippets below elide `await` for readability — a real run needs it on each
call, and a dropped `await` surfaces later as an unrelated-looking failure.

```js
const chrome = await agent.browsers.get("chrome");   // explicit, always
await chrome.nameSession("browser-e2e ✅");           // BEFORE opening or claiming tabs
```

Naming the browser explicitly is not optional bookkeeping — the default is machine
state that changes underneath the skill, and the plugin supports Chrome.

An earlier note here claimed the system default was Dia. **That is not what the
machine reports.** `installed-browsers.js --check --json`, run 2026-08-30, gives
`default_browser` as `com.google.chrome` for both `http` and `https`, and lists
exactly one installed browser: Google Chrome 151.0.7922.174. Dia does not appear
in the inventory at all.

The instruction stands and the old reason for it does not. Keep naming `"chrome"`
because a default is not a guarantee, not because of what the default happens to
be today — and if `browsers.get()` ever does resolve to something unexpected, read
the inventory rather than trusting either claim.

`chrome.nameSession(name)` is Chrome-specific and must be called before the
session opens or claims tabs. The name it sets is what Chrome renders on the tab
group, which makes it the on-screen marker the last-resort human ask depends on
(SKILL.md, preflight step 4) — so choose something recognizable at a glance and
distinct from any group already open.

## Operations

Exercised end to end 2026-08-30 under a known `CODEX_HOME`. `await` elided.

```js
const tab = chrome.tabs.new();          // default target: a new tab
chrome.tabs.list();                     // this session's tabs only — verified
tab.goto(url);

tab.playwright.domSnapshot();           // -> string
const el = tab.playwright.locator(sel);
el.click();                             // -> undefined
el.type(text);                          // -> undefined; see the detachment race
tab.screenshot();                       // -> Uint8Array of PNG bytes
tab.dev.logs({});                       // -> [{ level, message, timestamp, url }]
tab.close();                            // -> undefined
```

### Return shapes

Most calls return `undefined` and are used for effect — `nameSession`, `click`,
`type`, `markDeliverable`, `markHandoff`, `close`. Do not test them for success;
verify the effect instead (read the page back, list the tabs).

The three that return data:

| Call | Returns | Observed |
|---|---|---|
| `domSnapshot()` | string | 232 chars / 5 lines for `example.com` — compact, not a DOM dump |
| `screenshot()` | `Uint8Array` | 14,206 bytes of PNG — **bytes, not a path or handle**; write them yourself if a file is wanted |
| `dev.logs({})` | array of objects | `{ level, message, timestamp, url }`; captured a live page `TypeError` |

### ⚠️ The detachment race — the gap a real flow hits first

**Measured.** Typing into a field immediately after `goto()` fails with
`Detached while handling command`. The locator resolved against the pre-navigation
document and the navigation invalidated it.

`waitForLoadState({ state: "load" })` does **not** prevent it. And `networkidle`
is not available at all:

```
playwright_wait_for_load_state does not support networkidle
```

What worked: `waitForTimeout(500)`, then build a **fresh** locator. Re-using the
old one after the wait still fails — the wait alone is not the fix; re-targeting
is.

```js
tab.goto(url);
tab.playwright.waitForTimeout(500);
tab.playwright.locator("#username").type("…");   // fresh locator, after the wait
```

Treat every navigation as invalidating every locator held across it. `click()`
that triggers navigation is the same hazard for whatever comes next.

### ⚠️ `dom_cua.scroll()` did not scroll

**Measured, and this one is a defect rather than a caveat.**
`tab.dom_cua.scroll({x, y})` returned `undefined` — the success shape — while
`scrollY` stayed `0`, and screenshots and snapshots were unchanged. Both positive
and negative values were tried. The runtime's own reference describes the
arguments as deltas.

Because the call reports success, **a flow that scrolls and then asserts will read
a stale page as a real one.** Until this is understood, verify any scroll by
reading `scrollY` back rather than trusting the return.

Whether the scroll row survives in the shared operation set depends on one more
measurement — this run used
`the-internet.herokuapp.com/infinite_scroll`, whose own JS may interact with it.
Re-test on a plain long document before deciding. The row stays in SKILL.md's
table for now, flagged there.

### The `dev` namespace

`tab.dev.logs({})` is the **only** member — confirmed by enumeration: `tab.dev`
has no enumerable own members, and its prototype exposes `logs` and `constructor`
and nothing else. There is no high-level network API on this path. Response
bodies require raw CDP: `codex-privileged.md`.

### Enumerating and claiming beyond this session

```js
chrome.user.openTabs();      // -> [{ id, lastOpened, providerTabId, tabGroup, title, url }]
chrome.user.claimTab(entry); // attach; works on a tab this session did not create
```

`openTabs()` is **confirmed**: 11 entries on a live profile, fields exactly
`id`, `lastOpened`, `providerTabId`, `tabGroup`, `title`, `url` — no more, no
fewer. Note the contrast with `chrome.tabs.list()`, which returned only the
session's own single tab: `list()` is session-scoped, `openTabs()` is not.

`claimTab` remains **unmeasured** — deliberately not exercised, since claiming
takes over a tab the user is browsing. It is the codex-only attach route and an
**exception path**, not a default — `attach.md` states when it is warranted.

### Deliverable and handoff markers

```js
tab.markDeliverable();
tab.markHandoff();
```

Both return `undefined` in 1–2 ms and produced **no observable effect** within the
session — the tab listing did not change, and nothing visible marked the tab
(measured). So a single session cannot tell a working marker from a no-op.

**Unverified**: `markHandoff()`'s lifetime across sessions — whether a handoff
marked in one codex run remains meaningful to a later run, or is scoped to the
session that set it. The in-session silence above makes this harder to close, not
easier: there is no local signal to check against. Do not build a multi-run flow
that depends on a handoff surviving; if a later run needs the same tab,
re-establish it through `openTabs()` / `claimTab()`.

### Teardown

`tab.close()` returned in ~42 ms, after which `chrome.tabs.list()` returned an
empty array. **The API cannot distinguish a removed tab group from an empty one**
— both read as `[]`. If a flow needs to know which happened, it needs a signal
from outside this API.

## Diagnostics

When `agent.browsers.get("chrome")` fails, the bundled chrome plugin ships four
Node diagnostics. Run them and name **which** precondition is unmet.

```bash
D="$HOME/.codex/plugins/cache/openai-bundled/chrome/latest/scripts"
```

| Script | Flags | Exit codes |
|--------|-------|------------|
| `installed-browsers.js` | `[--check] [--json]` | `1` = **`--check` only** — no browser installed; `2` = runtime error; `0` otherwise |
| `chrome-is-running.js` | `[--browser chrome\|edge] [--check] [--json]` | `1` = **`--check` only** — not running; `2` = bad flag / runtime error; `0` otherwise |
| `check-extension-installed.js` | `[--browser chrome\|edge] [--json]` | `0` installed **and** enabled; `1` installed **not** enabled; `2` not installed; `3` runtime error |
| `check-native-host-manifest.js` | `[--browser chrome\|edge] [--json]` | `0` manifest correct; `1` missing or incorrect; `2` bad flag / runtime error |

Exit-code semantics read off the installed scripts (`latest` is a floating version
directory, so re-read them if a codex upgrade changes behaviour).

**Measured 2026-08-30**: all four ran from inside a `codex exec` run, accepted the
flags exactly as documented, and exited `0` on a healthy machine — Chrome
installed (151.0.7922.174) and running, extension installed and enabled in the
Default profile, native-host manifest correct. Their `--json` output is a full
object, not a status line, so quote the field that decides rather than the whole
blob. **Negative exit codes remain unmeasured**: no precondition was deliberately
broken, so the `1` / `2` / `3` rows above are still read-off-the-source, not
observed.

**Pass `--check`.** The first two scripts report their finding on stdout but exit
`0` regardless without it — a run that branches on the exit code alone would read
"no browser installed" as success. The last two carry their finding in the exit
code unconditionally.

Each accepts `--json`; prefer it, so the failing precondition can be quoted
precisely to the user rather than paraphrased from a text report.

Reporting shape: *"Chrome is installed and running, but the codex extension is
installed and not enabled (`check-extension-installed.js` exit 1)."* Naming the
unmet precondition is the whole point — a generic "browser unavailable" leaves the
user to re-derive what this already knows.
