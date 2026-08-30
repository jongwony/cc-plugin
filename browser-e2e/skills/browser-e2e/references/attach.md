# Attach — the exception path

Driving a tab the agent did not open. Both vendors, and they differ in kind: on
codex it is an agent call, on Claude it needs a person. That asymmetry is why
attach is outside the shared operation set — the membership test in SKILL.md
fails on exactly this shape.

## When it is warranted

The default is a new tab plus a navigation. Chrome profile auth is inherited by a
fresh tab (measured: a new tab in a new group loaded `github.com` already logged
in), so **"the flow needs me to be logged in" is not a reason to attach** — that
was the old reason, and it no longer holds.

Attach only when the flow needs **in-tab state a fresh navigation cannot
reproduce**:

- an unsubmitted form the user has already filled
- a live WebSocket or SSE stream mid-conversation
- in-memory SPA state with no URL that restores it (a multi-step wizard past
  step 1, an unsaved editor buffer)
- a one-time URL already consumed — a magic link, a single-use OAuth callback
- a page whose current render depends on a POST that cannot be replayed

If the entry state can be reached by navigating to a URL, navigate. Attach costs
a human on one of the two paths and inherits state nobody can fully describe; a
fresh tab costs neither.

## codex — an agent call

Measured end to end, 2026-08-30.

```js
const chrome = agent.browsers.get("chrome");
chrome.nameSession("browser-e2e ✅");        // before claiming, as before opening

const tabs = chrome.user.openTabs();
// -> [{ id, lastOpened, providerTabId, tabGroup, title, url }]

const entry = tabs.find(t => /* match on url or title */);
chrome.user.claimTab(entry);
```

`chrome.user.claimTab(entry)` works on a tab this session did not create — that is
the verified capability, and it is codex-only.

Pick the entry by `url` first and `title` second. `lastOpened` orders the list but
does not identify anything; two tabs on the same app differ by URL, not recency.
When more than one entry matches, **do not pick one** — which tab to take over is
a user-private choice, and taking the wrong one acts on state the user did not
offer. List the candidates by title and URL and let the user pick.

Claiming makes the tab this session's. Teardown is a judgment: a tab the run
created is the run's to close, and a tab it claimed from the user is not — leave
it open unless the user said otherwise.

## Claude — needs a human, so it is not attach

The session is bound to one tab group and cannot enumerate or address anything
outside it; a valid Chrome tabId from outside returns `Couldn't determine which
page this action targets`. There is no agent call that pulls an external tab in.

The only route is a person dragging the tab into the session's group. That makes
this the last-resort ask from SKILL.md preflight step 4, and it carries that
step's requirement:

- Name the empty precondition first — *the tab holding the state is outside this
  session's group, and this path has no call that reaches it.*
- Identify the destination **by its on-screen name**, quoted exactly, including
  any prefix character. Two groups named `Claude` and `✅Claude` once coexisted
  and the tab went into the wrong one; the checkmark marked the active session's
  group.
- After the move, `tabs_context_mcp` to confirm the tab is now listed. If it is
  not, the tab went into a different group — say which group was meant rather
  than repeating the same request.

Before asking, check whether the state is really irreproducible. A human step is
the most expensive thing this skill can spend, and the list above narrows the
cases that justify it.

## If attach fails

Attach is outside the shared set, so its failure follows the progressive-
disclosure rule rather than the fallback rule: **solve the task within the shared
set instead.** In practice that means restarting the flow from a fresh tab and a
navigation, and reporting which part of the original in-tab state could not be
reproduced.

That is not a vendor fallback and does not license switching executors. The
executor stays as the user named it; only the target changes.
