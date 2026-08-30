# Claude executor — the named path

Taken **only** when the user's argument starts with the literal token `claude`.
It is never selected because the codex path was unavailable (SKILL.md, *No
fallback*).

## What runs

This session's own `mcp__claude-in-chrome__*` tools, in this conversation — there
is no subprocess and no separate model. Reasoning tier is this session's, which is
why the branch is named rather than defaulted: it costs the main context directly.

If those tools are deferred, load them in **one** `ToolSearch` call rather than
one per tool:

```
select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__read_console_messages
```

That set covers the whole shared operation set. Add `read_network_requests` or
`gif_creator` to the same call only when the flow already calls for them
(`claude-only.md`).

## The tab group is the whole world

The session is bound to **one** tab group, which it owns. It cannot enumerate or
address anything outside that group: a valid Chrome tabId from outside returns
`Couldn't determine which page this action targets`. This is the structural fact
that shapes every other behaviour on this path.

Three consequences, all measured 2026-08-30:

1. **A missing group at start is normal.** The session-to-group binding expires on
   its own while the group and its tabs remain visible on screen. Checking for a
   group and finding none is the ordinary opening move, not a fault to report —
   `tabs_context_mcp{createIfEmpty: true}` and continue silently.
2. **Closing the group's last tab removes the group.** The next
   `tabs_context_mcp{createIfEmpty: true}` starts a fresh one. Teardown therefore
   needs no separate group-deletion step.
3. **Attach needs a human.** There is no programmatic route to a tab outside the
   group, so putting one in requires a person to move it. That is why attach is
   out of the shared set on this side — `attach.md`.

## Profile auth is inherited

**Measured**: a *new* tab in a *new* group loaded `github.com` already logged in
(`loggedIn: true`, `signInLinkVisible: false`). No attach, no cookie transfer, no
launch flag — the extension drives the real Chrome profile.

This is the evidence behind the default target in SKILL.md preflight step 3. Open
a new tab and navigate; reach for attach only when the flow needs in-tab state a
fresh navigation cannot reproduce.

## Operations

| Shared-set operation | Tool | Evidence |
|----------------------|------|----------|
| claim / name the surface | `tabs_context_mcp{createIfEmpty: true}` | measured |
| open a tab | `tabs_create_mcp` | measured |
| list this session's tabs | `tabs_context_mcp` | measured |
| navigate | `navigate` | measured |
| read page structure | `read_page` / `get_page_text` | unmeasured |
| locate an element | `find` | unmeasured |
| click, scroll, screenshot | `computer` | unmeasured |
| type into a field | `form_input` | unmeasured |
| read console | `read_console_messages` | unmeasured |
| close a tab | `tabs_close_mcp` | measured |

**Unmeasured** means the tool is present in this session's surface and described
there, but the operation was not exercised on 2026-08-30. It is expected to work;
if it does not, report that rather than routing around it.

Also present on this path but outside the shared set: `javascript_tool`,
`browser_batch`, `resize_window`, `file_upload`, `upload_image`,
`read_network_requests`, `gif_creator`. The last two are covered in
`claude-only.md`; the rest are unmeasured and undocumented here — reach for one
only when the flow already needs it, and say so when reporting the run.

## Do not open a dialog

`alert` / `confirm` / `prompt` and browser modals block every subsequent event, so
a triggered dialog ends the run's ability to act at all and needs a human to
dismiss it in Chrome. In an E2E flow this matters most at destructive controls —
a Delete button behind a confirm. When the flow's own steps require crossing one,
say so before acting rather than discovering it mid-run.

## Naming the group for the human ask

The group's on-screen name is the only marker a person can act on at preflight
step 4. A real incident: two groups named `Claude` and `✅Claude` were open at
once and the tab went into the wrong one — the checkmark marked the active
session's group. When asking, quote the exact on-screen string including any
prefix character, and say which of the visible groups is meant.
