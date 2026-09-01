# codex + Chrome

Read this before delegating a browser or computer-use task to codex. Codex side
only — this session's own `mcp__claude-in-chrome__*` tools need no reference.

## Setup

Two steps, in order. Name both in the prompt; neither is discoverable from the
task.

**1. The browser calls are JavaScript, evaluated through `mcp__node_repl__js`.**
That tool is required, not preferred.

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

**Every `await` below is load-bearing** — omitting one surfaces as a wrong-API
error rather than a missing keyword.

```js
const tab = await chrome.tabs.new();      // default target: a new tab
await chrome.tabs.list();                 // this session only; [{ id, title, url }]
await tab.goto(url);

await tab.dom_cua.get_visible_dom();      // visible nodes; the default page read
await tab.playwright.evaluate(js);        // read anything specific; also how you verify an effect
await tab.playwright.domSnapshot();       // semantic outline; scales with the document
await tab.playwright.locator(sel).click();
await tab.playwright.locator(sel).type(text);
await tab.dom_cua.scroll({ x: 0, y: 600 });
await tab.screenshot();                   // -> Uint8Array of image bytes, not a path
await tab.dev.logs({});                   // -> [{ level, message, timestamp, url }]
await tab.close();
```

**Read the DOM; a screenshot is the visual fallback, not the page-reading path.**
Three readers, in the order to reach for them:

- `dom_cua.get_visible_dom()` — visible nodes carrying `node_id`, and it stays
  bounded: a book-length page comes back around 3k characters where
  `domSnapshot()` gives 805k. Start here when the question is what can be
  interacted with.
- `playwright.evaluate(js)` — arbitrary reads, scoped to what you ask for. The
  cheapest way to get one element:

  ```js
  await tab.playwright.evaluate(
    `document.querySelector(${JSON.stringify(sel)})?.value ??
     document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`
  );
  ```

- `domSnapshot()` — accessibility outline. Good for semantic structure, but size
  tracks the document. Do not call it blind on an unknown page.

`screenshot()` returns image bytes, JPEG as observed — sniff the header rather
than assuming a format. It takes `{ fullPage, clip }`.

Anything not named above as returning data returns `undefined` and is used for
effect. Verify with `evaluate` or by listing tabs; do not test the return.

`logs` is the only member of `dev` — no network API here, and response bodies need
raw CDP. `playwright` mirrors Playwright's own surface plus `elementInfo`,
`elementScreenshot` and `expectNavigation`. `cua` and `dom_cua` carry the input
paths (`click`, `type`, `keypress`, `scroll`, `drag`). There is no `tab.ax`, and
`tab.content` only exports Google Workspace and YouTube pages — neither is a route
to the DOM.

`chrome.user.openTabs()` lists the whole profile, unlike session-scoped
`tabs.list()`, and `chrome.user.claimTab(entry)` attaches to a tab this session
did not open. Claiming takes over a tab the user is browsing, so it is an
exception path — and a fresh tab inherits the real profile's auth, so needing a
login does not justify it.

## When something fails

Match the observed string, then act. The last four need
[`chrome-troubleshooting.md`](chrome-troubleshooting.md); the rest are fixed here.

- **`ReferenceError: agent is not defined`** — the client was never imported. Go
  back to Setup step 2 and bind what `setupBrowserRuntime()` returns.
- **`TypeError: <promise>.goto is not a function`** — a missing `await`, not a
  wrong API. Add it.
- **`Browser use requires a trusted Node REPL browser service`** — the code is not
  running under `mcp__node_repl__js`. Nothing else can evaluate these calls.
- **A browser other than Chrome answered** — `browsers.get()` was called without a
  name. Always pass `"chrome"`.
- **A call returned cleanly and the effect is absent** — expected: most calls
  return `undefined` and are used for effect. Confirm with `evaluate` rather than
  reading the return.
- **No browser tool in the run's inventory, and all four diagnostics exit `0`** —
  `codex` on `PATH` is a wrapper carrying its own `CODEX_HOME`.
- **`browsers.get("chrome")` throws** — one of four preconditions is unmet; the
  bundled diagnostics name which.
- **`Detached while handling command` on an input** — the page refuses every input
  path there is. Do not try the others.
- **`scrollY` unchanged after `scroll()` returned** — the page manages its own
  scroll position, and the call reports success either way.

Anything else: report the failing step with its evidence rather than working
around it.
