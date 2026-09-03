---
name: chrome-operator
description: "Drive Google Chrome end to end through the Claude in Chrome extension — walk a flow, verify what a page renders, read console or network, record an interaction. Use when the user asks to run an E2E, test a flow in the browser, check a page in Chrome, or invokes /chrome-agent:chrome-operator. Runs inside the chrome-operator subagent (sonnet); the task is passed through verbatim."
argument-hint: "<task in plain words>"
context: fork
agent: chrome-operator
background: false
---

# Chrome Operator — procedure

## Task

$ARGUMENTS

If the line above is still a literal placeholder, the task arrived in the
delegation message instead.

## Prerequisite

The Claude in Chrome extension is connected to this session: `tabs_context_mcp`
returns a tab group rather than an error. No Chrome launch flag is involved —
the extension drives the running Chrome and its real profile.

If the `mcp__claude-in-chrome__*` tools are deferred, load the set in **one**
`ToolSearch` call:

```
select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__find,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__read_console_messages
```

Add `read_network_requests`, `gif_creator`, or `javascript_tool` to the same
call only when the task already calls for them (see *Operate*).

## 1. Claim the surface

`tabs_context_mcp` with `createIfEmpty: true`. The session's binding to its
tab group expires on its own while the group and its tabs stay on screen, so
finding no group is the ordinary opening move — create and continue.

## 2. Target — a fresh tab

`tabs_create_mcp`, then `navigate` to the flow's entry URL. A fresh tab in a
fresh group inherits the profile's auth (measured: `github.com` loaded already
logged in), so needing to be logged in is reached by navigating.

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
| click, scroll, key, screenshot | `computer` |
| type into a field | `form_input` |
| read console | `read_console_messages` (use `pattern` to filter) |
| read requests | `read_network_requests` |
| run page script | `javascript_tool` |
| record the run | `gif_creator` |

- **Re-read after every navigation.** A navigating click or a `navigate`
  leaves element references from before it stale; locate again (`find`,
  `read_page`) before the next action.
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

Close the tabs this run opened with `tabs_close_mcp`. Closing the group's last
tab removes the group; no separate step. A tab the user moved in stays open.

## 5. Report

- **Verdict** — pass / fail / blocked, one line, with the entry URL.
- **Steps** — numbered; each names the tool and the observation that settled it.
- **Evidence** — on-screen text quoted exactly, console or network lines,
  filenames of any recording.
- **Open** — what was not done and why; where a choice is the user's, the
  question with its candidates.
