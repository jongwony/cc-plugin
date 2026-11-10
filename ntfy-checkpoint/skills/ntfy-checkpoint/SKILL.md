---
name: ntfy-checkpoint
description: Compose a phone push to the user and send it through aiward — a handoff that goes out at once, or a one-shot check the user must make at a set minute (a cutover step, a first run, a reset to confirm), scheduled ahead. Use when the user asks to be alerted at a time to check something, when work hands them a check that falls at a known minute, or when the user's notification rule calls for a push.
---

# ntfy checkpoint

A checkpoint is one check at one minute, pushed to the phone ahead of time so nothing waits in a visible list. This skill holds what a push carries, when it goes out, how it is sent, and how it is changed or cancelled once sent.

## Scope

- A checkpoint is scheduled from a background session: `$CLAUDE_JOB_DIR` is set, and its basename is the session's short id, the one `claude attach` takes. A session without it schedules no checkpoint; it says so and names `claude --bg --resume <session id>` to continue in the background.
- A check due at a set minute, once → a checkpoint.
- A push the user's notification rule calls for at once → composed as below, with no delay.
- A block of 30 minutes or more → the user's calendar.
- Work that is done, or stopped short of a handoff → a report, the `aiward:report` skill's; no push is composed here.

## Sender

- `aiward-send` on PATH → it is the one sender, and the `ntfy_*` tools are not called. Not on PATH → **Without aiward**, below.
- `--area`, on every call: work-area tasks → `work`; personal ones → `personal`. The user's own area rules decide which side a task is on.
- **A handoff** goes out at once, as written, with no judgment in between:
  `aiward-send --severity blocked --area <work|personal> --title "<title>" --click "<owning session link>" session "<body>"`
  `--title` and `--click` are refused under any other severity. `--event-id` is left out, so each handoff is its own event.
- **A checkpoint** is a request the aiward session schedules — an ordinary event, never `blocked`:
  `aiward-send --area <work|personal> --event-id "cp-<sequence id, lowercased>-$(date +%s)" session "<request line>"`
  The request line carries all the aiward session needs, since it sends the push itself: `push at <local time> <zone> (Unix <seconds>) · sequence_id <sequence id> · title: <title> · <body>`.
- **A change to a checkpoint** — moved, settled early, dropped, superseded — is another such event under the same sequence id, its line opening with the new state: `move to <local time> <zone> (Unix <seconds>)`, `settled: <evidence>`, `dropped`, or `supersede:` and the new title and body.
- Every checkpoint event carries its own event id, as above. An event sent under the id of one still pending is answered `duplicate` and dropped, and the `aiward:report` skill's report already holds the session's own id.

## Message

- Title: the check, in a few words.
- Body: one line of what to check, then a pointer — `claude attach <short id>`, the session's `$CLAUDE_CODE_SESSION_ID` and the checkpoint's sequence id — so the user can wake the owning session, or collect the rest with `/recollect` or `/inquire`.
- Click: the owning session's link, `https://claude.ai/code/$CLAUDE_CODE_BRIDGE_SESSION_ID`, present when that variable is set; `--click` takes no other address, and a checkpoint's request line names the link for the aiward session to pass on. Where the user's notification rule lands the tap on a page, the owning session holds that page's address.
- Nothing past that pointer: ntfy.sh stores the body in plaintext, and the pointer carries no meaning without the session record.
- Title and body are each at most 1 KB.
- Sequence id: `<short id>-<step>` — the scheduling session's short id and the step label, chosen at scheduling, from letters, digits, `_` and `-`, at most 64 characters. It names the checkpoint for its whole life: every reschedule, update and settled state reuses it.
- The session the short id names owns the checkpoint. Another session changes it through the owner — `claude attach <short id>`, or `claude --bg --resume <session id>` once the owner has stopped — and never sends under its sequence id.

## Timing

- When work hands the user a check at a known minute, schedule the push without asking first, then report in the session each scheduled push's local time and title, with one line that the user can ask to change it.
- The push minute and any window it names come from the act's real latencies: the user's response after the push lands (minutes, never zero), the act's own lead time (a merge's rollout, a deploy), and slack before the moment it must be done by.
- A window narrower than those latencies is not handed to the user: push earlier by the lead time, move to a moment where acting late is still safe, or widen the window; the body says what acting late costs.
- The time in a request is at most 3 days ahead and more than 10 seconds away: the aiward session's `notify` refuses any other.

## Record

- The scheduling session's transcript is the checkpoint's record; the pointer in the body reaches it. Each change to a checkpoint is one line in the session's reply, and the latest line for a sequence id is its current state:
  `checkpoint <sequence id> · <minute> <zone> · <what to check> · <state> · next: <next action>`
- Write the line with state `intent` before the send, and a new line with the outcome after it.
- State is one of the following; each is recorded on its own evidence and none implies the next:
  - `intent` — about to send.
  - `queued <event id>` — `aiward-send` printed `ok <event id>`: aiward holds the event. For a handoff its push is queued with it and retried until ntfy takes it. For a checkpoint only the request is held: the push exists once the aiward session has read the request and scheduled it.
  - `scheduled: <the aiward session's words>` — a message from the aiward session says it scheduled or changed the push. Without such a message the state stays `queued`.
  - `accepted direct` — `aiward-send` printed `direct`: no channel was listening and ntfy took a handoff from the sender itself.
  - `unsent: <reason>` — `aiward-send` exited 1 or 3 and nothing took it. Reported in the session with its minute. Exit 1 names what to fix in the event. Exit 3 on a checkpoint → send it through **Without aiward** under the same sequence id.
  - `checked: <evidence>` — the user or the session did the check; the evidence is what showed it.
- `duplicate <event id>` → an event with that id is still pending and this one was dropped: send again under a fresh id.
- Nothing sent through aiward says the push reached ntfy or the phone: the session reads no ntfy history, so a `delivered` state is not recorded.
- Exit 2 → the call was malformed: fix it and send again. Exit 4 → this session is aiward itself, which pushes with its own `notify` tool.

## After scheduling

- The session keeps no wake for a push — no background command, sleep or poller. The pending message is the user's check; the user opens a session from it when it lands.
- When a later turn changes what a push covers — its minute moves, its check is settled early, its step is dropped, its text is superseded — the latest Record line for its sequence id says what is pending, and the change goes out as a new event under that sequence id (Sender); record each as a new line.
  - Delivered, superseded → the aiward session sends the new state under the same sequence id; the phone replaces the notification.
  - Pending, minute moves → it schedules the replacement under the same sequence id; ntfy drops the pending message, and only the replacement is delivered.
  - Pending, no longer needed → it sends the settled state under the same sequence id, now, at priority 1; the pending message is dropped and never delivered, and the phone receives that one min-priority notification (no sound or vibration) in its place.

## Without aiward

Where `aiward-send` is not on PATH, the push goes out through this plugin's own ntfy servers; Scope, Message, Timing and After scheduling hold as written, with these in place of Sender and the Record states:

- Work-area tasks → `ntfy-work`; personal ones → `ntfy-personal`. Publish without `topic`: each server's default topic is the user's subscription for that area. The `ntfy_*` tools and their server's `ntfy-guide` resource own how a message is scheduled, replaced, and read back.
- Click and `view` action: where the user's notification rule says a tap lands.
- `delay` takes a Unix timestamp; a bare clock time is read in the server's zone, UTC on ntfy.sh.
- States: `intent`; `accepted <message id>` — the publish result, or a confirming fetch, returned this message; `unconfirmed` — the outcome stays unknown after the confirming fetch; `delivered` — past its minute, the message appears in a fetch without `scheduled`; `checked: <evidence>`.
- A publish result is the receipt: record `accepted` and fetch nothing (`ntfy-guide` Gate 4). A publish that returns an error instead of a result may have gone out: in the same turn, wait a few seconds, fetch with `scheduled: true`, and look for the sequence id: found → `accepted` with that message's id; not found, or the fetch fails too → `unconfirmed`, reported in the session with its minute.
- A fetch with `scheduled: true` returns delivered messages as well as pending ones; only a fetch without it tells `delivered` from pending. An empty fetch settles no state: ntfy.sh keeps messages about 12 hours.
- A change to a sent push reads the pending messages (`ntfy_fetch_messages` with `scheduled: true`) and republishes with `ntfy_publish_message` under its sequence id, resending every field the push keeps (`ntfy-guide` Gate 3). `ntfy_manage_message` (clear, delete) is not used.

## Prerequisites

- With aiward: the `aiward` plugin, which puts `aiward-send` on PATH, on the machine where the aiward session runs.
- Without it: Node.js with `npx` (the servers run `npx -y ntfy-mcp-server`), and `claude plugin configure ntfy-checkpoint` to fill `work_topic` and `personal_topic`; the ntfy app on the phone subscribes to both.
