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
tab.playwright.locator(sel).type(text); // see the detachment race below
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

## When it misbehaves

Read this section only when something is wrong. Each entry is a failure whose
signal points somewhere other than its cause.

### No browser tool in the run's inventory → wrong `CODEX_HOME`

The most likely reason this path looks broken, and it is not a browser problem.
`codex` on `PATH` may be a wrapper that redirects `CODEX_HOME` to a
project-isolated home, and an isolated home carries no bundled marketplace — so
the chrome plugin never loads and no run gets a browser capability.
`scripts/codex-run.sh` resolves the binary with `command -v codex` and pins no
home, so it inherits whatever the caller's `PATH` gives it. **The check is the
caller's, before the run:**

```bash
command -v codex                 # a wrapper, or the real binary?
codex plugin marketplace list    # openai-bundled must appear
```

Measured 2026-08-30: `command -v codex` resolved to a two-line shell wrapper that
sourced an `env.sh` setting a project-local `CODEX_HOME`; under that home
`plugin marketplace list` showed only `openai-curated`, and no run got a browser
capability. Under the real home it lists `openai-bundled` and the capability
appears.

Two things make this hard to see:

- **All four diagnostics still exit `0`** — true and irrelevant. They are shell
  `node` scripts, not plugin tools, so they pass under either home.
- **`config.toml` says the plugin is enabled** — you are reading
  `~/.codex/config.toml` while the run reads another one. Confirm both are the
  same home before drawing any conclusion.

Ruled out by measurement, so do not re-check them: the Chrome extension
(installed, enabled, native-host manifest correct), sandbox mode, working
directory, project trust, and the `browser_use` / `plugins` / `in_app_browser`
feature flags.

### `scroll()` reports success and does not scroll

`tab.dom_cua.scroll({x, y})` returns `undefined` — the success shape — while
`scrollY` stays `0` and screenshots and snapshots are unchanged. Measured
2026-08-30 with both positive and negative values. Because the call reports
success, **a flow that scrolls and then asserts will read a stale page as a real
one**: read `scrollY` back rather than trusting the return.

Still open: that run used an infinite-scroll page whose own JS may interact with
the call. One re-test on a plain long document decides whether this is a defect or
a page interaction.

### `type()` right after `goto()` → `Detached while handling command`

The locator resolved against the pre-navigation document and the navigation
invalidated it. `waitForLoadState({ state: "load" })` does not prevent it, and
`networkidle` is unsupported. The wait alone is not the fix — re-targeting is:

```js
tab.goto(url);
tab.playwright.waitForTimeout(500);
tab.playwright.locator("#username").type("…");   // fresh locator, after the wait
```

Treat every navigation as invalidating every locator held across it. A `click()`
that triggers navigation is the same hazard for whatever comes next.

### `browsers.get("chrome")` fails → name the unmet precondition

Four bundled diagnostics say which one it is. **Pass `--check` to the first two**:
they report their finding on stdout but exit `0` regardless without it, so a run
branching on the exit code alone reads "no browser installed" as success. The last
two carry their finding in the exit code unconditionally.

```bash
D="$HOME/.codex/plugins/cache/openai-bundled/chrome/latest/scripts"
node "$D/installed-browsers.js"        --check --json   # 1 = no browser installed
node "$D/chrome-is-running.js"         --check --json   # 1 = Chrome not running
node "$D/check-extension-installed.js"         --json   # 1 = installed not enabled; 2 = not installed
node "$D/check-native-host-manifest.js"        --json   # 1 = manifest missing or incorrect
```

Report which precondition is unmet, quoting the `--json` field that decides it — a
generic "browser unavailable" leaves the user to re-derive what this already
knows.

Exit-code semantics were read off the installed scripts under `latest`, a floating
version directory: re-read them after a codex upgrade. The non-zero rows are
read-off-the-source rather than observed — no precondition was deliberately broken
when they were measured.
