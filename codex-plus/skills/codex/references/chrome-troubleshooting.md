# codex + Chrome — when it misbehaves

Load this only after a codex browser run has actually failed. Setup, the
operation surface and the symptom index are in `chrome.md`; nothing here is
needed to start a run.

Each entry is a failure whose signal points somewhere other than its cause.

## No browser tool in the run's inventory → wrong `CODEX_HOME`

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

Three probes all reporting "no browser capability" is one fault reproduced three
times when every probe goes through the same `PATH` wrapper. Vary what sits
*below* the suspected cause, not beside it.

## `scroll()` returned success and the page did not move

**Not an API defect.** Measured 2026-09-01 on a plain static document
(`scrollHeight: 145039`): `tab.dom_cua.scroll({x: 0, y: 600})` moved `scrollY`
from `0` to `600`, and `y: -600` restored it. The call works.

What fails is a page that manages its own scroll position. The earlier
measurement (2026-08-30) used an infinite-scroll page, where the same call
returned `undefined` while `scrollY` stayed `0` and screenshots and snapshots
were unchanged, in both directions.

The call returns the success shape either way, so **a flow that scrolls and then
asserts can read a stale page as a real one.** Read `scrollY` back rather than
trusting the return whenever the page does anything of its own with scrolling.

## `Detached while handling command` on `type()`

**The cause is not a stale locator, and the wait-then-retarget recipe does not
work.** Both were disproven 2026-09-01 on
`https://the-internet.herokuapp.com/login`:

- In a **pristine tab**, with a locator built fresh *after* the wait, `type()`
  failed at both 500 ms and 2000 ms.
- The locator was not the problem. Diagnostics reported
  `{"kind":"action_failed","matchCount":1,"visibleCount":1}` — it matched exactly
  one visible `<input>` — and the field read back `""`.
- Running it first in a tab that had already failed once changes only the
  diagnostic (`no_matches` instead of `action_failed`), not the outcome.

The same recipe was reported working on 2026-08-30. It did not reproduce.

So the honest state is: **`playwright.locator().type()` did not enter text on the
one page measured, and no wait length repairs it.** Do not spend turns on waits or
re-targeting — that path is already measured out. Report the failing step with the
locator diagnostics.

Two things this does *not* establish, and one of them has already caught us once:
the failure may be specific to this page, exactly as the `scroll()` failure turned
out to be. And the other input namespaces on the tab (`cua`, `dom_cua`) were never
tried. Before concluding that typing is broken, try one on a different page.

## `browsers.get("chrome")` fails → name the unmet precondition

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
