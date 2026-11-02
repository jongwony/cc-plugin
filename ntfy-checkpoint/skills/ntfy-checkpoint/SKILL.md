---
name: ntfy-checkpoint
description: Schedule a phone push for a one-shot check the user must make at a set minute — a cutover step, a first run, a reset to confirm — through the ntfy-work or ntfy-personal server. Use when the user asks to be alerted at a time to check something, or when work hands them a check that falls at a known minute.
---

# ntfy checkpoint

A checkpoint is one check at one minute, pushed to the phone ahead of time so nothing waits in a visible list. The `ntfy_*` tools and their server's `ntfy-guide` resource own how a message is scheduled, replaced, and read back; this skill holds which push goes where and what it carries.

## Scope

- A check due at a set minute, once → a checkpoint.
- A block of 30 minutes or more → the user's calendar.
- Claude's own notices that a task finished or needs input → the harness's notification channel, so a checkpoint is never mistaken for one.

## Server

- Work-area tasks → `ntfy-work`; personal ones → `ntfy-personal`. The user's own area rules decide which side a task is on.
- Publish without `topic`: each server's default topic is the user's subscription for that area.

## Message

- Title: the check, in a few words.
- Body: one line of what to check, then a pointer — the scheduling session's `$CLAUDE_CODE_SESSION_ID` and the run or step label — so the user's next session can collect the rest with `/recollect` or `/inquire`.
- Nothing past that pointer: ntfy.sh stores the body in plaintext, and the pointer carries no meaning without the session record.
- Sequence id: the step label, chosen at scheduling.

## At fire time

- When the scheduling session is still running at that minute and has observed the state, publish the observed state under the same sequence id with no delay; it takes the pending message's place.
- In a run the user is not watching, leave a pending message to fire rather than deleting it: a delete asks for confirmation the run cannot give.

## Prerequisites

- Node.js with `npx` (the servers run `npx -y ntfy-mcp-server`).
- `claude plugin configure ntfy-checkpoint` fills `work_topic` and `personal_topic`; the ntfy app on the phone subscribes to both.
