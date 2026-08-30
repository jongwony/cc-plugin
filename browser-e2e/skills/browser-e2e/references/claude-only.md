# Claude-only: network reading and GIF recording

Outside the shared operation set — codex has no equivalent for either. Attempt
only when the situation allows; on failure, solve the step within the shared set
(SKILL.md).

Both are **unmeasured**: known from their tool descriptions in this session's
surface, not from a run on 2026-08-30.

## `read_network_requests`

The asymmetry is total rather than a matter of degree. codex's `dev` namespace
contains `logs()` and nothing else (measured) — no request list at all, and
response bodies there need raw CDP, which is currently blocked
(`codex-privileged.md`). On the Claude path the capability is a plain tool call.

Reach for it when the flow's assertion is genuinely about the request: a status
code the page never renders, a payload shape, a call that should *not* have
fired.

When it fails or returns nothing useful, fall back **inside the shared set**, not
to the other executor:

- assert on what the page rendered (`read_page` / `get_page_text`) — for an E2E
  flow this is usually the better assertion anyway, since it is what the user sees
- assert on `read_console_messages`, when the app logs its own request outcomes

## `gif_creator`

Records a multi-step interaction as a GIF. Claude-only; there is no codex
equivalent, and no shared-set substitute — the closest is a sequence of
screenshots, which is a different artifact.

Use it when the user wants to **review or share** the run rather than just read
its verdict — a reproduction to attach to a bug report, a demo of a flow.

When recording:

- capture extra frames before and after each action, so playback is legible
  rather than a jump cut between states
- name the file for what it shows (`checkout_flow_failure.gif`), not for the run

## Reporting

Both tools sit outside the shared set, so a run that used either **did not behave
identically to the codex branch**. Say so in the result: name which step used a
Claude-only capability, so the user knows that step would need a different
approach if the same flow is later run on the default executor.

The reverse also holds and is the more common trap: never quietly switch a run to
the Claude executor in order to reach these. The user picks the executor, and
reaching a capability is not a reason to override that (SKILL.md, *No fallback*).
