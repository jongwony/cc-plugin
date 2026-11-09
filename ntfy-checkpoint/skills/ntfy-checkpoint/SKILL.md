---
name: ntfy-checkpoint
description: Schedule a phone push for a one-shot check the user must make at a set minute — a cutover step, a first run, a reset to confirm — through the ntfy-work or ntfy-personal server. Use when the user asks to be alerted at a time to check something, when work hands them a check that falls at a known minute, or when the user's notification rule calls for a push.
---

# ntfy checkpoint

A checkpoint is one check at one minute, pushed to the phone ahead of time so nothing waits in a visible list. The `ntfy_*` tools and their server's `ntfy-guide` resource own how a message is scheduled, replaced, and read back; this skill holds which push goes where and what it carries, and how a push is changed or cancelled once sent (After scheduling), in place of the guide's delete.

## Scope

- A checkpoint is scheduled from a background session: `$CLAUDE_JOB_DIR` is set, and its basename is the session's short id, the one `claude attach` takes. A session without it schedules no checkpoint; it says so and names `claude --bg --resume <session id>` to continue in the background.
- A check due at a set minute, once → a checkpoint.
- A push the user's notification rule calls for at once → composed as below, with no delay.
- A block of 30 minutes or more → the user's calendar.

## Server

- Work-area tasks → `ntfy-work`; personal ones → `ntfy-personal`. The user's own area rules decide which side a task is on.
- Publish without `topic`: each server's default topic is the user's subscription for that area.

## Message

- Title: the check, in a few words.
- Body: one line of what to check, then a pointer — `claude attach <short id>`, the session's `$CLAUDE_CODE_SESSION_ID` and the checkpoint's sequence id — so the user can wake the owning session, or collect the rest with `/recollect` or `/inquire`.
- Click and `view` action: where the user's notification rule says a tap lands. The owning session's link is `https://claude.ai/code/$CLAUDE_CODE_BRIDGE_SESSION_ID`, present when that variable is set.
- Nothing past that pointer: ntfy.sh stores the body in plaintext, and the pointer carries no meaning without the session record.
- Sequence id: `<short id>-<step>` — the scheduling session's short id and the step label, chosen at scheduling. It names the checkpoint for its whole life: every reschedule, update and settled state reuses it, while each publish gets its own message `id`.
- The session the short id names owns the checkpoint. Another session changes it through the owner — `claude attach <short id>`, or `claude --bg --resume <session id>` once the owner has stopped — and never publishes under its sequence id.

## Timing

- When work hands the user a check at a known minute, schedule the push to the user's own topic without asking first, then report in the session each scheduled push's local time and title, with one line that the user can ask to change it.
- The push minute and any window it names come from the act's real latencies: the user's response after the push lands (minutes, never zero), the act's own lead time (a merge's rollout, a deploy), and slack before the moment it must be done by.
- A window narrower than those latencies is not handed to the user: push earlier by the lead time, move to a moment where acting late is still safe, or widen the window; the body says what acting late costs.
- `delay` takes a Unix timestamp; a bare clock time is read in the server's zone, UTC on ntfy.sh.

## Record

- The scheduling session's transcript is the checkpoint's record; the pointer in the body reaches it. Each change to a checkpoint is one line in the session's reply, and the latest line for a sequence id is its current state:
  `checkpoint <sequence id> · <minute> <zone> · <what to check> · <state> · next: <next action>`
- Write the line with state `intent` before the publish, and a new line with the outcome after it.
- State is one of the following; each is recorded on its own evidence and none implies the next:
  - `intent` — about to publish.
  - `accepted <message id>` — the publish result, or a confirming fetch, returned this message.
  - `unconfirmed` — the outcome stays unknown after the confirming fetch.
  - `delivered` — past its minute, the message appears in a fetch without `scheduled`.
  - `checked: <evidence>` — the user or the session did the check; the evidence is what showed it.
- A fetch with `scheduled: true` returns delivered messages as well as pending ones; only a fetch without it tells `delivered` from pending.
- An empty fetch settles no state: ntfy.sh keeps messages about 12 hours (`expires` in each result), and the line in the transcript stands after the cache drops the message.

## Publish outcome

- A publish result is the receipt: record `accepted` and fetch nothing (`ntfy-guide` Gate 4).
- A publish that returns an error instead of a result may have gone out: the tool retries before it reports, and its error reads the same whether or not a request reached the server. In the same turn, wait a few seconds, fetch with `scheduled: true`, and look for the sequence id: found → `accepted` with that message's id; not found, or the fetch fails too → `unconfirmed`, reported in the session with its minute.
- The confirming fetch belongs to the active turn; the session leaves no later wake to confirm it.
- An update carries only the fields it sets: resend title, tags and every other field the push keeps (`ntfy-guide` Gate 3).

## After scheduling

- The session keeps no wake for a push — no background command, sleep or poller. The pending message is the user's check; the user opens a session from it when it lands.
- When a later turn changes what a push covers — its minute moves, its check is settled early, its step is dropped, its text is superseded — read the pending messages from the server (`ntfy_fetch_messages` with `scheduled: true`) and change the push with `ntfy_publish_message` under its own sequence id; record each as a new line. `ntfy_manage_message` (clear, delete) is not used for this.
  - Delivered, superseded → publish the new state under the same sequence id; the phone replaces the notification.
  - Pending, minute moves → publish the replacement with the new `delay` under the same sequence id; the server deletes the pending message, and only the replacement is delivered.
  - Pending, no longer needed → publish the settled state under the same sequence id with no delay and `priority: 1`; the pending message is deleted and never delivered, and the phone receives that one min-priority notification (no sound or vibration) in its place.

## Prerequisites

- Node.js with `npx` (the servers run `npx -y ntfy-mcp-server`).
- `claude plugin configure ntfy-checkpoint` fills `work_topic` and `personal_topic`; the ntfy app on the phone subscribes to both.
