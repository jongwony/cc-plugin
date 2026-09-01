# codex + Chrome

Read this before delegating a browser or computer-use task to codex. It covers
the codex side only — this session's own `mcp__claude-in-chrome__*` tools need no
reference and are not described here.

## Setup

Two steps, in order. Neither is discoverable from the task, so name both in the
prompt.

**1. The browser calls are JavaScript, evaluated through `mcp__node_repl__js`** —
the REPL the bundled `chrome` plugin exposes. The client throws
`Browser use requires a trusted Node REPL browser service` when `globalThis.nodeRepl`
is missing, so that tool is the required channel, not a preference.

**2. `setupBrowserRuntime()` *returns* the agent — it creates no global.** A fresh
REPL exposes only `nodeRepl`, and reaching for `agent.browsers…` raises
`ReferenceError: agent is not defined`. Import the client (its only export) and
bind what it hands back:

```js
const { setupBrowserRuntime } = await import(
  `${process.env.HOME}/.codex/plugins/cache/openai-bundled/chrome/latest/scripts/browser-client.mjs`
);
const agent = await setupBrowserRuntime();

const chrome = await agent.browsers.get("chrome");   // always by name
await chrome.nameSession("codex ✅");                 // BEFORE any tab
```

Name the browser explicitly because a system default is machine state that
changes underneath the caller, not because of what the default happens to be.
Give the session a name that reads well on screen: Chrome renders it on the tab
group, and it is the only marker a person can act on if the run has to ask for
help.

## Operations

**Every call is async, and the `await` below is load-bearing** — omit it on
`tabs.new()` and the next line fails as `TypeError: <promise>.goto is not a
function`, which reads like a wrong API rather than a missing keyword.

```js
const tab = await chrome.tabs.new();      // default target: a new tab
await chrome.tabs.list();                 // this session only; [{ id, title, url }]
await tab.goto(url);

await tab.playwright.domSnapshot();       // -> string; size scales with the page
await tab.playwright.locator(sel).click();
await tab.playwright.locator(sel).type(text);
await tab.dom_cua.scroll({ x: 0, y: 600 });     // verify by reading scrollY back
await tab.screenshot();                   // -> Uint8Array of image bytes, not a path
await tab.dev.logs({});                   // -> [{ level, message, timestamp, url }]
await tab.playwright.evaluate(js);        // -> the value; this is how you verify an effect
await tab.close();
```

Two return shapes are worth knowing before you call them:

- **`domSnapshot()` is not small.** 232 chars on `example.com`, but 805,388 chars
  across 4,545 lines on a book-length page (measured 2026-09-01). "Accessibility
  text, not a DOM dump" describes its *form*, not its size — do not call it blind
  on an unknown page. `tab.ax` and `tab.content` are separate namespaces on the
  same tab and may be cheaper; both are unmeasured.
- **`screenshot()` returned JPEG, not PNG** — header `FF D8 FF E0`, 179,736 bytes
  (measured 2026-09-01). Sniff the header rather than assuming a format, and note
  it takes `{ fullPage, clip }` options.

`playwright` mirrors Playwright's own surface — `locator`, the `getBy*` family,
the `waitFor*` family, `evaluate` — plus `elementInfo`, `elementScreenshot` and
`expectNavigation`. `cua` and `dom_cua` are the alternate input paths
(`click`, `type`, `keypress`, `scroll`, `drag`); reach for them only when the
`playwright` path has actually failed, since they are not cheaper.

`logs` is the **only** member of `dev` — there is no network API on this path, and
response bodies need raw CDP. Every call that is not listed above as returning
data returns `undefined` and is used for effect: do not test the return for
success, verify by reading the page back or listing the tabs.

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
| Scrolled, then asserted, and the page looks unchanged | the page manages its own scrolling; `scroll()` returns the success shape either way |
| `Detached while handling command` on an input | page-specific; every input path fails on that page, and no wait repairs it |
| `browsers.get("chrome")` fails | one of four preconditions; the diagnostics name which |

Anything else: report the failing step with its evidence rather than working
around it.
