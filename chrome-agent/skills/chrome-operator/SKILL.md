---
name: chrome-operator
description: "The procedure the chrome-operator subagent follows to drive Google Chrome through the Claude in Chrome extension — claim a tab surface, navigate, read and act on the page, tear down, report. It is preloaded into that agent and belongs there: browser work goes to the chrome-operator agent, which is what keeps screenshots and DOM out of the calling conversation."
user-invocable: false
---

# Chrome Operator — procedure

The task arrives in the delegation message.

## Prerequisite

The Claude in Chrome extension is connected to this session: `tabs_context_mcp`
returns a tab group rather than an error. No Chrome launch flag is involved —
the extension drives the running Chrome and its real profile.

**If the tools are absent from this context entirely** — `ToolSearch` finds no
`mcp__claude-in-chrome__*` at all — this run cannot recover it: a subagent's
tool set is fixed when it launches, so a browser connection completed after
that never reaches here. Stop and report that, naming `/chrome` as where the
connection is made, so the caller connects first and delegates again. Do not
retry, and do not substitute a different way of reaching the page — a result
from another surface is that surface's, not this task's.

If the `mcp__claude-in-chrome__*` tools are deferred, load the set in **one**
`ToolSearch` call:

```
select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__find,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__browser_batch,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__read_console_messages
```

Add `read_network_requests`, `gif_creator`, or `javascript_tool` to the same
call only when the task already calls for them (see *Operate*).

## 1. Claim the surface

`tabs_context_mcp` with `createIfEmpty: true`. The session's binding to its
tab group expires on its own while the group and its tabs stay on screen, so
finding no group is the ordinary opening move — create and continue.

## 2. Target — a fresh tab

`createIfEmpty` already produced an empty tab in the group — **navigate that
one** rather than opening another. `tabs_create_mcp` is for the second tab
onward, when the flow genuinely needs more than one. A task that says to open
the page "in a new tab" is asking for the fresh-tab start this already is, and
is satisfied without a second tab. `navigate` also opens a tab in a fresh
group on its own when no surface exists yet (measured), so what to hold to is
one tab per target and a teardown that closes whatever appeared — not which
call put it there.

A fresh tab in a fresh group inherits the profile's auth (measured:
`github.com` loaded already logged in), so needing to be logged in is reached
by navigating.

**Attach is the exception**, for in-tab state a navigation cannot reproduce:
an unsubmitted form, a live WebSocket or SSE mid-conversation, in-memory SPA
state with no restoring URL, a consumed one-time URL, a render that depends on
a POST that cannot be replayed. This session has no call that reaches a tab
outside its group, so attach is a human step — stop and report:

- name the precondition: *the tab holding the state is outside this
  session's group*;
- ask for the tab to be dragged into the group, identifying the group by its
  on-screen name **quoted exactly, prefix characters included** — two groups
  named `Claude` and `✅Claude` once coexisted and the tab went into the
  wrong one;
- after the move, `tabs_context_mcp` confirms the tab is listed. If it is
  not, say which group was meant rather than repeating the request.

If the state turns out reproducible after all, restart from a fresh tab and
report which part of the original state was not carried.

## 3. Operate

| Operation | Tool |
|-----------|------|
| list this session's tabs | `tabs_context_mcp` |
| open / close a tab | `tabs_create_mcp` / `tabs_close_mcp` |
| navigate | `navigate` |
| read page structure / rendered text | `read_page` / `get_page_text` |
| locate an element | `find` |
| click, scroll, key, wait, screenshot | `computer` |
| several actions in one call | `browser_batch` |
| type into a field | `form_input` |
| read console | `read_console_messages` (use `pattern` to filter) |
| read requests | `read_network_requests` |
| run page script | `javascript_tool` |
| record the run | `gif_creator` |

- **Re-read after every navigation.** A navigating click or a `navigate`
  leaves element references from before it stale; locate again (`find`,
  `read_page`) before the next action.
- **Batch a run whose middle you do not need to see.** `browser_batch` carries
  several actions in one call and the harness recommends it, but an E2E flow
  earns its verdict from what it observed between steps. Batch a stretch that
  is settled in advance — a form's fields, a known click path — and keep a
  separate call wherever the next action depends on what the last one
  rendered.
- **A page that is not ready yet** is `computer` with `wait`, then re-read;
  that is the one retry the errors rule allows.
- **Assert on what rendered.** `get_page_text` / `read_page` is the assertion
  for an end-to-end flow — it is what the user sees. Reach for
  `read_network_requests` when the assertion is genuinely about a request: a
  status the page never renders, a payload shape, a call that should not have
  fired. Reach for `read_console_messages` when the app logs its own outcomes.
- **Page state that is not rendered** comes through `javascript_tool`;
  surface it with `console.log` and read it back with `read_console_messages`
  rather than through any dialog.
- **Recording** is for a run the user wants to review or share. Capture
  frames before and after each action so playback is legible, and name the
  file for what it shows.

## 4. Teardown

Close every tab this run brought onto the screen with `tabs_close_mcp` —
whichever call created it, and including one that arrived as a side effect
rather than from `tabs_create_mcp`, since the run is what caused it to exist. Closing the group's last tab removes the group and its window; no
separate step. A tab the user moved in stays open.

## 5. Report

- **Verdict** — pass / fail / blocked, one line, with the entry URL.
- **Steps** — numbered; each names the tool and the observation that settled it.
- **Evidence** — on-screen text quoted exactly, console or network lines,
  filenames of any recording.
- **Open** — what was not done and why; where a choice is the user's, the
  question with its candidates.
