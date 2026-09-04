---
name: cdp-bootstrap
description: |
  This skill should be used when the user explicitly asks to
  "bootstrap CDP on Linux", "start Chromium on a headless box",
  "set up Xvfb for CDP", or "expose a CDP port in this sandbox".
  Launches Playwright-bundled Chromium under Xvfb with --remote-debugging-port
  so any CDP client can attach to a headed browser. Linux-only; user-invoked only.
user_invocable: true
argument-hint: "[--port N] [--display N] [--chrome PATH] [--ignore-cert-errors]"
---

# cdp-bootstrap

Bring up a headed (Xvfb-backed) Chromium with a CDP port on a headless-Linux sandbox. This is the Linux path: the desktop browser routes (Claude in Chrome extension, codex's bundled chrome plugin) need a real desktop Chrome, and this skill is what stands in for one. Lifecycle is **start-only** — teardown and restart are the user's responsibility.

## Scope

**WILL**
- Start an Xvfb virtual display, then launch Playwright-bundled Chromium on top of it with `--remote-debugging-port`
- Poll `/json/version` until reachable
- Print the curl verification commands as the next step

**WILL NOT**
- Defeat the headed policy with `--headless=new` (no real visibility)
- Stop or restart Xvfb / Chromium (use `pkill -f` manually)
- Run on macOS (use the native launch in `references/cdp-endpoints.md`)
- Install missing packages — if `xvfb` or chromium are absent, abort with a hint

## Execution

```bash
bash .claude/skills/cdp-bootstrap/scripts/bootstrap.sh
bash .claude/skills/cdp-bootstrap/scripts/bootstrap.sh --port 9333 --display 100
bash .claude/skills/cdp-bootstrap/scripts/bootstrap.sh --chrome /opt/google/chrome/chrome
bash .claude/skills/cdp-bootstrap/scripts/bootstrap.sh --ignore-cert-errors
```

> This skill lives in the project-local `.claude/skills/` tree, so the project root is the natural base for invocation.

## Preflight Checks

The bootstrap fails fast on four conditions:

| Check | Failure message |
|---|---|
| `uname -s` == `Linux` | "macOS — see references/cdp-endpoints.md for the native launch" |
| `command -v Xvfb` | "apt install xvfb" hint |
| Chromium binary found (`--chrome` or `/opt/pw-browsers/.../chrome`) | "set --chrome PATH" |
| Port free (`curl /json/version` fails) | On 200 response: idempotent skip → exit 0 |

## Idempotency

If `curl -sf http://127.0.0.1:${PORT}/json/version` returns 200, the script **does nothing and exits 0**, protecting any instance that is already running.

## Verification

After bootstrap succeeds, confirm the endpoint from the client's side:

```bash
curl -sf http://127.0.0.1:9222/json/version   # "Browser" must not contain HeadlessChrome
curl -sf http://127.0.0.1:9222/json/list      # non-empty array with the about:blank tab
```

On any failure, inspect the last 50 lines of `/tmp/chrome-logs/xvfb.log` and `/tmp/chrome-logs/chrome.log`. Endpoint shapes are in `references/cdp-endpoints.md`.

## Argument Dispatch

| Arg | Default | Effect |
|---|---|---|
| `--port N` | `9222` | `--remote-debugging-port=N` |
| `--display N` | `99` | Xvfb `:N`; skipped if the socket already exists |
| `--chrome PATH` | auto-detected under `/opt/pw-browsers/chromium-*/chrome-linux/chrome` | Override Chromium binary |
| `--ignore-cert-errors` | off | Pass `--ignore-certificate-errors` to Chromium. Needed in sandboxes whose CA trust store doesn't include public roots (otherwise navigation to HTTPS sites fails with `ERR_CERT_AUTHORITY_INVALID`). Do **not** use against untrusted endpoints — this is a sandbox workaround, not a general option. |

## State

- Xvfb log: `/tmp/chrome-logs/xvfb.log`
- Chromium log: `/tmp/chrome-logs/chrome.log`
- Chromium profile: `/tmp/chrome-profile/` (persisted across restarts)
- CDP endpoint: `http://127.0.0.1:9222/json/version`
