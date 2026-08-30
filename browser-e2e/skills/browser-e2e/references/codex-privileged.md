# codex-only: raw CDP and network response bodies

Outside the shared operation set — Claude has no equivalent. Attempt only when the
situation allows; on failure, solve the step within the shared set (SKILL.md).

**Currently blocked.** Read this before spending a run on it.

## Why this path exists at all

The codex path has **no high-level network API**. `api.json`'s `dev` namespace
contains `logs()` and nothing else (measured) — no request list, no response
bodies, no timing. Anything network-shaped on this path has to come from raw CDP.

The Claude path has `read_network_requests` instead and does not need this
(`claude-only.md`). The two vendors solve the same need on opposite mechanisms,
which is precisely why neither is in the shared set.

## The capability and the block

```js
tab.capabilities.get("cdp");   // acquirable — measured
cdp.send(/* … */);             // every call blocked — measured
```

The capability is acquirable. Every `cdp.send()` is then rejected by a **saved
per-origin permission** — a stored decision, not a live prompt, so nothing appears
on screen to approve and retrying changes nothing.

Local config at `~/.codex/browser/config.toml` reads
`approval_mode = "never_ask"` with `full_cdp_access_enabled = true`. Those settings
did **not** unblock the calls in the measurement, so the saved per-origin
permission takes precedence over both. Whether clearing that saved permission
would unblock it, and where it is stored, is **unmeasured**.

## Unverified: the permitted-command allowlist

CDP access on this path is reported to be limited to an allowlist of **20
methods**. That allowlist has **never been measured** — its membership, and
whether it would even apply once the per-origin block is cleared, are both open.

Do not plan a flow around a specific CDP method being permitted. Two things would
have to hold, and neither has been shown:

1. the saved per-origin permission no longer denies `cdp.send()`, and
2. the method is on the allowlist.

Closing this needs one deliberate measurement session against a disposable origin,
not an opportunistic attempt in the middle of someone's E2E run. **Do not measure
it as a side effect of a task run** — it touches a saved permission that governs
the user's real profile.

## If a flow needs response bodies

The honest options, in order:

1. **Read it off the page instead.** If the response is rendered, `domSnapshot()`
   or `get_page_text` reaches the same information inside the shared set. An E2E
   assertion is usually about what the user sees, and the rendered value is the
   better assertion anyway.
2. **Assert on console.** `tab.dev.logs({})` is in the shared set; an app that
   logs its own request outcomes exposes them there.
3. **Report the gap.** If the flow genuinely needs a body the page never renders,
   say that this path cannot reach it and name why. Do not switch to the Claude
   executor to get `read_network_requests` — that is the fallback the design
   rules out, and the user chose the executor.
