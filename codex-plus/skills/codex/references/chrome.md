# codex + Chrome

Read this before delegating a browser or computer-use task to codex. It covers
the codex side only — this session's own `mcp__claude-in-chrome__*` tools need no
reference and are not described here.

Run on `gpt-5.6-luna` at `xhigh` (SKILL.md, *Running a Task* step 1).

## Setup

Two steps, in order. Neither is discoverable from the task, so name both in the
prompt.

**1. The browser calls are JavaScript, evaluated through `mcp__node_repl__js`** —
the REPL the bundled `chrome` plugin exposes. A run given only the operations has
to rediscover the mechanism for itself.

**2. `agent` does not exist until the client is imported.** A fresh REPL exposes
only `nodeRepl`; reaching for `agent.browsers…` raises
`ReferenceError: agent is not defined`. Import the plugin's browser client and
call `setupBrowserRuntime()` before anything else:

```
$HOME/.codex/plugins/cache/openai-bundled/chrome/latest/scripts/browser-client.mjs
```

Then, in this order — `nameSession` must precede opening or claiming any tab:

```js
const chrome = await agent.browsers.get("chrome");   // always by name
await chrome.nameSession("codex ✅");                 // BEFORE any tab
```

Name the browser explicitly because a system default is machine state that
changes underneath the caller, not because of what the default happens to be.
Give the session a name that reads well on screen: Chrome renders it on the tab
group, and it is the only marker a person can act on if the run has to ask for
help.

## Operations

Everything is async. A dropped `await` surfaces later as an unrelated-looking
failure.

```js
const tab = chrome.tabs.new();          // default target: a new tab
chrome.tabs.list();                     // this session's tabs only
tab.goto(url);

tab.playwright.domSnapshot();           // -> string; compact, not a DOM dump
tab.playwright.locator(sel).click();
tab.playwright.locator(sel).type(text); // rebuild the locator after any navigation
tab.screenshot();                       // -> Uint8Array of PNG bytes, not a path
tab.dev.logs({});                       // -> [{ level, message, timestamp, url }]
tab.close();
```

`logs` is the **only** member of `dev` — there is no network API on this path, and
response bodies need raw CDP. Every other call returns `undefined` and is used for
effect: do not test the return for success, verify by reading the page back or
listing the tabs.

`chrome.user.openTabs()` lists the whole profile (unlike session-scoped
`tabs.list()`) and `chrome.user.claimTab(entry)` attaches to a tab this session
did not open. Both are an exception path: claiming takes over a tab the user is
browsing, and it stays unmeasured for that reason. A fresh tab inherits the real
profile's auth, so "the flow needs me logged in" does not justify claiming.

## When something fails

Four known failures report a cause other than their own. Match the symptom, then
load [`chrome-troubleshooting.md`](chrome-troubleshooting.md) — it is diagnosis
material and nothing in it is needed to start a run.

| Symptom | Actually |
|---|---|
| No browser tool in the run's inventory; the four diagnostics all exit `0` | `codex` on `PATH` is a wrapper with its own `CODEX_HOME` |
| Scrolled, then asserted, and the page looks unchanged | `dom_cua.scroll()` returns the success shape without scrolling |
| `Detached while handling command` on `type()` or `click()` | a navigation invalidated the locator; waiting does not fix it |
| `browsers.get("chrome")` fails | one of four preconditions; the diagnostics name which |

Anything else: report the failing step with its evidence rather than working
around it.
