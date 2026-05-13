---
name: cdp-bootstrap
description: |
  This skill should be used when the user explicitly asks to
  "bootstrap CDP on Linux", "start Chromium for cdp-attach on a headless box",
  "set up Xvfb for CDP", or "make cdp-attach work in this sandbox".
  Launches Playwright-bundled Chromium under Xvfb with --remote-debugging-port
  so the existing cdp-attach skill passes its headed-browser guard. Linux-only;
  user-invoked only (does not auto-trigger from cdp-attach errors).
user_invocable: true
argument-hint: "[--port N] [--display N] [--chrome PATH]"
---

# cdp-bootstrap

Bring up a visible-to-CDP Chromium instance on a headless-Linux sandbox so the existing `cdp-attach` skill can connect. Lifecycle is **start-only** — teardown and restart are the user's responsibility.

## Scope

**WILL**
- Start an Xvfb virtual display, then launch Playwright-bundled Chromium on top of it with `--remote-debugging-port`
- Poll `/json/version` until reachable
- Print a next-step hint (`v1 select 0`)

**WILL NOT**
- Defeat the guard with `--headless=new` (no real visibility — violates the policy)
- Stop or restart Xvfb / Chromium (use `pkill -f` manually)
- Run on macOS (use the native launch command documented in `cdp-attach`)
- Install missing packages — if `xvfb`, `uv`, or chromium are absent, abort with a hint

## Execution

```bash
bash .claude/skills/cdp-bootstrap/scripts/bootstrap.sh
bash .claude/skills/cdp-bootstrap/scripts/bootstrap.sh --port 9333 --display 100
bash .claude/skills/cdp-bootstrap/scripts/bootstrap.sh --chrome /opt/google/chrome/chrome
```

> This skill lives in the project-local `.claude/skills/` tree, so the project root is the natural base for invocation.

## Preflight Checks

The bootstrap fails fast on five conditions:

| Check | Failure message |
|---|---|
| `uname -s` == `Linux` | "macOS — use cdp-attach's native launch" |
| `command -v Xvfb` | "apt install xvfb" hint |
| `command -v uv` | uv install link |
| Chromium binary found (`--chrome` or `/opt/pw-browsers/.../chrome`) | "set --chrome PATH" |
| Port free (`curl /json/version` fails) | On 200 response: idempotent skip → exit 0 |

## Idempotency

If `curl -sf http://127.0.0.1:${PORT}/json/version` returns 200, the script **does nothing and exits 0**, protecting any instance that is already running.

## Verification

After bootstrap succeeds, confirm `cdp-attach` can connect:

```bash
V1="uv run --quiet --script cdp-attach/scripts/v1_core.py"
$V1 select 0
$V1 doctor
```

If `v1 doctor` reports 7/7 PASS, you're done. On any failure, inspect the last 50 lines of `/tmp/chrome-logs/xvfb.log` and `/tmp/chrome-logs/chrome.log`.

## Invocation Note (cdp-attach scripts)

`cdp-attach/scripts/*.py` use the PEP 723 `#!/usr/bin/env -S uv run --quiet --script` shebang, which works on both Linux and macOS, so direct execution is fine:

```bash
./cdp-attach/scripts/v1_core.py <subcommand>
```

`uv run --quiet --script <path> <subcommand>` is equivalent and avoids needing the executable bit.

## Argument Dispatch

| Arg | Default | Effect |
|---|---|---|
| `--port N` | `9222` | `--remote-debugging-port=N` |
| `--display N` | `99` | Xvfb `:N`; skipped if the socket already exists |
| `--chrome PATH` | auto-detected under `/opt/pw-browsers/chromium-*/chrome-linux/chrome` | Override Chromium binary |

## State

- Xvfb log: `/tmp/chrome-logs/xvfb.log`
- Chromium log: `/tmp/chrome-logs/chrome.log`
- Chromium profile: `/tmp/chrome-profile/` (persisted across restarts)
- CDP endpoint: `http://127.0.0.1:9222/json/version`
