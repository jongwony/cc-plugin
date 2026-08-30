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

## ⛔ Blocker: `codex exec` does not expose the chrome plugin

**Measured 2026-08-30, codex-cli 0.150.1.** A `codex exec` run's tool inventory
contains no chrome plugin, no browser plugin, and no JS/Node REPL through which
`agent.browsers.get("chrome")` could be evaluated. Confirmed twice, from the
worktree and from the trust-listed parent repository, so it is neither a
`trust_level` nor a sandbox effect. `codex exec --help` offers no flag that
enables a plugin for the run.

This holds **even though** `~/.codex/config.toml` carries
`[plugins."chrome@openai-bundled"]` with `enabled = true`. Config enablement and
exec-surface exposure are separate things.

Everything in *Operations* below was measured through some codex surface, but
**not through `codex exec`** — the invocation in *Invoking* is therefore
unconfirmed as a route to the browser API, and the operations are recorded here as
what that other surface showed. Which surface reaches them (the interactive
`codex` TUI, the Codex desktop app — `config.toml` carries
`BROWSER_USE_CODEX_APP_VERSION` and a `codex-app-tools@openai-bundled` plugin — or
an exec configuration not yet found) is **open**, and is the one thing this path
needs settled before it can be the default in practice.

The four *Diagnostics* below are unaffected: they are plain `node` scripts and ran
correctly from inside `codex exec`.

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

> **Unconfirmed as a route to the browser API** — see the blocker above. The flags
> below are the correct codex invocation and the run starts cleanly; what has not
> been shown is that the resulting run can reach Chrome.

Write the task to a prompt file, then hand it to `codex exec`. Run it in the
background with output redirected to a file so codex's banner and step-by-step
output stay out of this conversation — only the outcome comes back.

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

**Measured 2026-08-30**: this exact invocation starts a run cleanly under
`gpt-5.6-luna` / `xhigh` / `workspace-write` with network — the banner reports all
three back, `--output-last-message` captures the final message, and the
`session id: <uuid>` line appears on stderr as described. What the run does *not*
get is the browser API (see the blocker above).

## The browser handle

```js
const chrome = agent.browsers.get("chrome");   // explicit, always
chrome.nameSession("browser-e2e ✅");           // BEFORE opening or claiming tabs
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
