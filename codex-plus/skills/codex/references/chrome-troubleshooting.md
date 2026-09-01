# codex + Chrome — when it misbehaves

Load this after a browser run has failed. Setup, the operation surface and the
symptom index are in `chrome.md`.

Each entry is a failure that reports a cause other than its own.

## No browser tool in the run's inventory → wrong `CODEX_HOME`

The most likely reason this path looks broken, and it is not a browser problem.
`codex` on `PATH` may be a wrapper that redirects `CODEX_HOME` to a
project-isolated home, which carries no bundled marketplace — so the chrome plugin
never loads. `scripts/codex-run.sh` resolves the binary with `command -v codex`
and pins no home, so **the check is the caller's, before the run**:

```bash
command -v codex                 # a wrapper, or the real binary?
codex plugin marketplace list    # openai-bundled must appear
```

Two signals mislead here:

- **All four diagnostics still exit `0`.** They are shell `node` scripts, not
  plugin tools, so they pass under either home.
- **`config.toml` says the plugin is enabled.** You are reading
  `~/.codex/config.toml` while the run reads another one.

Do not re-check these — they are ruled out: the Chrome extension, its native-host
manifest, sandbox mode, working directory, project trust, and the `browser_use` /
`plugins` / `in_app_browser` flags.

## `scroll()` returned success and the page did not move

A page that manages its own scroll position can swallow the scroll while the call
still returns the success shape. Read `scrollY` back rather than trusting the
return.

## `Detached while handling command` on an input

Page-specific, not an API defect — ordinary form pages take input fine. On a page
that does this, **every input path fails the same way**: `locator.type`,
`locator.fill`, `locator.pressSequentially`, `cua.type`, `cua.keypress`,
`dom_cua.type`, `dom_cua.keypress`. Coordinate focus still succeeds, so the field
is reachable; the write is what fails. No wait length repairs it, and the locator
is not stale — diagnostics report a match on one visible input.

`locator.press()` is the one to watch: it can return **no error** and still leave
the field empty. A call completing is not evidence that anything landed.

Report it with the locator diagnostics and solve the flow another way rather than
spending turns on the input call.

## `browsers.get("chrome")` fails → name the unmet precondition

Four bundled diagnostics say which one. **Pass `--check` to the first two** — they
report on stdout but exit `0` regardless without it, so branching on the exit code
alone reads "no browser installed" as success.

```bash
D="$HOME/.codex/plugins/cache/openai-bundled/chrome/latest/scripts"
node "$D/installed-browsers.js"        --check --json   # 1 = no browser installed
node "$D/chrome-is-running.js"         --check --json   # 1 = Chrome not running
node "$D/check-extension-installed.js"         --json   # 1 = installed not enabled; 2 = not installed
node "$D/check-native-host-manifest.js"        --json   # 1 = manifest missing or incorrect
```

Report which precondition is unmet, quoting the `--json` field that decides it. A
generic "browser unavailable" leaves the user to re-derive what this already
knows.

`latest` is a floating version directory — re-read the exit codes off the scripts
after a codex upgrade.
