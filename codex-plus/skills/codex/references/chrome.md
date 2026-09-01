# codex + Chrome

Read this before delegating a browser or computer-use task to codex. Codex side
only — this session's own `mcp__claude-in-chrome__*` tools need no reference.

## Setup

Two steps, in order. Name both in the prompt; neither is discoverable from the
task.

**1. The browser calls are JavaScript, evaluated through `mcp__node_repl__js`.**
The client throws `Browser use requires a trusted Node REPL browser service`
without it, so that tool is required, not preferred.

**2. `setupBrowserRuntime()` returns the agent — it creates no global.** A fresh
REPL exposes only `nodeRepl`, and `agent.browsers…` raises
`ReferenceError: agent is not defined`. Import the client (its only export) and
bind what it returns:

```js
const { setupBrowserRuntime } = await import(
  `${process.env.HOME}/.codex/plugins/cache/openai-bundled/chrome/latest/scripts/browser-client.mjs`
);
const agent = await setupBrowserRuntime();

const chrome = await agent.browsers.get("chrome");   // always by name
await chrome.nameSession("codex ✅");                 // BEFORE any tab
```

Pass `"chrome"` explicitly: a system default is machine state. Give the session a
name that reads well on screen — Chrome renders it on the tab group, which is the
only marker a person can act on if the run has to ask for help.

## Operations

**Every `await` below is load-bearing.** Drop it on `tabs.new()` and the next line
fails as `TypeError: <promise>.goto is not a function`, which reads like a wrong
API rather than a missing keyword.

```js
const tab = await chrome.tabs.new();      // default target: a new tab
await chrome.tabs.list();                 // this session only; [{ id, title, url }]
await tab.goto(url);

await tab.playwright.domSnapshot();       // -> string; size scales with the page
await tab.playwright.locator(sel).click();
await tab.playwright.locator(sel).type(text);
await tab.dom_cua.scroll({ x: 0, y: 600 });
await tab.screenshot();                   // -> Uint8Array of image bytes, not a path
await tab.dev.logs({});                   // -> [{ level, message, timestamp, url }]
await tab.playwright.evaluate(js);        // -> the value; how you verify an effect
await tab.close();
```

- **`domSnapshot()` is not small.** It is accessibility text rather than a DOM
  dump, but size tracks the page and can pass 800k chars. Do not call it blind on
  an unknown page.
- **`screenshot()` returns image bytes, JPEG as observed.** Sniff the header
  rather than assuming a format. Takes `{ fullPage, clip }`.
- Anything not listed above as returning data returns `undefined` and is used for
  effect. Verify with `evaluate` or by listing tabs; do not test the return.

`logs` is the only member of `dev` — no network API here, and response bodies need
raw CDP. `playwright` mirrors Playwright's own surface plus `elementInfo`,
`elementScreenshot` and `expectNavigation`. `cua` and `dom_cua` carry alternate
input paths (`click`, `type`, `keypress`, `scroll`, `drag`).

`chrome.user.openTabs()` lists the whole profile, unlike session-scoped
`tabs.list()`, and `chrome.user.claimTab(entry)` attaches to a tab this session
did not open. Claiming takes over a tab the user is browsing, so it is an
exception path — and a fresh tab inherits the real profile's auth, so needing a
login does not justify it.

## When something fails

Match the symptom, then load
[`chrome-troubleshooting.md`](chrome-troubleshooting.md). Nothing in it is needed
to start a run.

| Symptom | Actually |
|---|---|
| No browser tool in the run's inventory; the four diagnostics all exit `0` | `codex` on `PATH` is a wrapper with its own `CODEX_HOME` |
| Scrolled, then asserted, and the page looks unchanged | the page manages its own scroll position |
| `Detached while handling command` on an input | page-specific; every input path fails on that page |
| `browsers.get("chrome")` fails | one of four preconditions; the diagnostics name which |

Anything else: report the failing step with its evidence rather than working
around it.
