# Tab Recovery Deep Guide

Moved out of `SKILL.md` to keep the per-invocation quick reference lean. Covers discriminating
a lifecycle-frozen (hidden/backgrounded) tab from a wedged renderer, and the helper-tab routing
workaround for the frozen case.

## Frozen (Hidden) Tab — Network Calls Suspended

Chromium freezes hidden/backgrounded tabs (observed in Dia browser, Chrome 149): fetch/XHR/timers are suspended, so `evaluate --await` network calls hang silently — the promise never settles — while synchronous main-thread JS still executes (DOM reads work). Verified non-recoveries: `Page.bringToFront` does not unfreeze the renderer, and `Page.setWebLifecycleState "active"` does not stick — Chromium implements it as a one-shot transition (the same `SetPageFrozen` call the browser's own freezing policy uses), not a persistent override: the tab remains hidden, so the freezing policy simply re-freezes it at its next decision point (verified in Chromium source: `page_handler.cc` `SetWebLifecycleState`, `freezing_policy.cc`).

**Recognition test**: synchronous `v1 evaluate "1"` returns instantly, but a short `--await` fetch hangs. (Contrast with a wedged renderer, where even the synchronous evaluate times out — see `SKILL.md` Error Handling.)

**Workaround — helper-tab routing** (reducible to existing primitives; no dedicated command, same rationale as the virtualized-tables fallback in `references/network.md`):

```
1. v1 evaluate "..."            → (if needed) read same-origin DOM state from the
                                  frozen tab synchronously first (e.g. a CSRF token)
2. v2 new_page <same-origin-url> → Fresh tabs start unfrozen; cookies are shared
3. v1 evaluate --await "..."    → Run the fetch/XHR from the helper tab
4. v2 close_page                → Close the helper tab when done
```

> **Note**: `v1 revive` also works (the reopened tab starts unfrozen) but discards renderer state unnecessarily — a frozen tab is not wedged; prefer helper-tab routing.
