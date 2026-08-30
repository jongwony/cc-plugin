# codex executor — the default path

How a `/browser-e2e <task>` run reaches Chrome. Everything here is the **default**
branch; the Claude branch is `claude.md`, and neither substitutes for the other
(SKILL.md, *No fallback*).

## Settings

| Setting | Value | Why fixed |
|---------|-------|-----------|
| model | `gpt-5.6-luna` | codex's own registry describes it as a fast, affordable agentic coding model; it is the cost-efficient pick for browser / computer-use runs |
| reasoning effort | `xhigh` | an E2E flow is a long sequence of stateful steps where a single misread page costs the whole run |
| sandbox | `workspace-write` with network access | the default; read-only has no network at all in codex |

## Invoking

Write the task to a prompt file, then hand it to `codex exec`. Delegate the run to
a Bash subagent so codex's banner and step-by-step output stay out of this
conversation — only the outcome comes back.

```bash
codex exec --skip-git-repo-check \
  -m gpt-5.6-luna \
  --config model_reasoning_effort=xhigh \
  --sandbox workspace-write \
  --config sandbox_workspace_write.network_access=true \
  --output-last-message "$OUT" < "$PROMPT"
```

codex prints `session id: <uuid>` to stderr. Capture it verbatim — it is the only
handle for resuming the same flow (`codex exec resume <uuid>`), which matters when
an E2E run needs a follow-up turn against browser state it already established.

Read `$OUT` for codex's final message rather than relying on the subagent's
summary; an E2E verdict is exactly the part a summary flattens.

> **Unverified**: the measured operations below were confirmed working headless
> through `codex exec`, but the sandbox mode in force during that measurement was
> not recorded. The settings above follow the repo's codex default rather than a
> measured requirement for browser control specifically.

## The browser handle

```js
const chrome = agent.browsers.get("chrome");   // explicit, always
chrome.nameSession("browser-e2e ✅");           // BEFORE opening or claiming tabs
```

Naming the browser explicitly is not optional bookkeeping. This machine's system
default browser is Dia, which the plugin does not support, so a `browsers.get()`
that relies on the default resolves to an unsupported app.

`chrome.nameSession(name)` is Chrome-specific and must be called before the
session opens or claims tabs. The name it sets is what Chrome renders on the tab
group, which makes it the on-screen marker the last-resort human ask depends on
(SKILL.md, preflight step 4) — so choose something recognizable at a glance and
distinct from any group already open.

## Operations

Shared-set operations, all measured 2026-08-30:

```js
const tab = chrome.tabs.new();          // default target: a new tab
chrome.tabs.list();                     // this session's tabs
tab.goto(url);

tab.playwright.domSnapshot();           // page structure
const el = tab.playwright.locator(sel);
el.click();
el.type(text);

tab.dom_cua.scroll({ x, y });
tab.screenshot();
tab.dev.logs({});                       // console
tab.close();                            // tear down what the run opened
```

`tab.dev.logs({})` is the **only** member of the `dev` namespace. There is no
high-level network API on this path at all — `api.json`'s `dev` namespace contains
`logs()` and nothing else. Response bodies require raw CDP: `codex-privileged.md`.

### Enumerating and claiming beyond this session

```js
chrome.user.openTabs();      // -> [{ id, lastOpened, providerTabId, tabGroup, title, url }]
chrome.user.claimTab(entry); // attach; works on a tab this session did not create
```

Both measured. `claimTab` is the codex-only attach route and is an **exception
path**, not a default — `attach.md` states when it is warranted.

### Deliverable and handoff markers

```js
tab.markDeliverable();
tab.markHandoff();
```

Both measured as calls. **Unverified**: `markHandoff()`'s lifetime across
sessions — whether a handoff marked in one codex run remains meaningful to a
later run, or is scoped to the session that set it, has not been tested. Do not
build a multi-run flow that depends on a handoff surviving; if a later run needs
the same tab, re-establish it through `openTabs()` / `claimTab()`.

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
