# Selection

Read at steps 0 and 3–5 of the procedure. Covers how a candidate is verified, which section it belongs in, and how the brief is written.

## Verify to the latest state

A candidate is verified only after its source has been read to its most recent activity: the last reply in the thread, the current review and merge state of the pull request, the current status of the issue, the latest comments on the page. A notification, an inbox row or a preview shows the original ask, not its current state. A source counts as opened when this run read the record itself — the page, or the record through an API or MCP read — and its link in the brief is the canonical URL that read returned.

Where one read is blocked, reach the same state another way — the channel instead of the search, the page instead of its notification, another tool for the same system. Leave the candidate out only when every route is blocked, and list it among the unverified items with what was tried.

## Independent check of each to-do

Send each to-do candidate to a fresh-context subagent (Agent tool with `model: opus`, one call per candidate, all in parallel) whose job is to disqualify it. Every candidate gets its check, however long the checks take. Give it the candidate's title, source URL, the person who asked, and why it looks open. It answers four questions with tool reads and returns `{"verdict": "keep" | "drop", "evidence": "..."}`:

1. Is the work already done — the pull request merged or closed, the issue resolved, the document updated?
2. Has the user already acted on it — replied, delivered, handed it to someone else — here or in another tool?
3. Is it the user's to do — asked of them, not of someone else or of the group?
4. Has it gone stale — no movement from anyone for more than five days, or the project moved on?

A candidate the check drops stays out of the to-dos, whatever this run believes. Where the check corrects the candidate's next action, the correction replaces the candidate's wording. Where it reframes the candidate into a different successor action, that successor gets its own independent check before it is listed.

## Drop or move rules

Apply to every candidate after verification:

- **Done or handed off** by the user, in the source or in an adjacent tool → drop. A reaction, an acknowledgement or a reply about something else is not completion.
- **Resolved at the source** — merged, closed, marked done, cancelled → drop.
- **Answered by anyone** → drop the answered part; keep only an action the latest state still shows the user owes. A promise to do it later does not complete it.
- **Past its time** — the meeting already happened, the deadline passed → drop, or reframe as follow-through ("anything to send after the 1:1?"). Compare against the current time, item by item.
- **Not addressed to the user** (a list, a broadcast, an FYI) → not a to-do; it may be an update.
- **Not due today** → leave for the day it is due, except on Monday, when the brief also looks at the week. An item with no date belongs to today when someone is verifiably blocked on the user now; its body says there is no fixed deadline rather than inventing one.
- **Optional or no-rush** → drop unless a verified deadline or dependency makes it today's. A small or ad-hoc request still owed today is not optional, however minor it looks.

A standing duty the user owns stays even without an explicit ask, until a source shows it finished or owned by someone else.

## Sections

- **Push forward** — the work this user is best placed to move today, tied to a top project, that this assistant can concretely advance (a draft, a synthesis across threads, a preparation for a named meeting), and whose full context this run can explain — who asked, why, what has to happen. Frame it as the next step for a real occasion. Omit the section rather than fill it with a reminder.
- **Top to-dos** — every verified open action owed by the user today, however many there are, ranked by impact; the order carries priority, and urgent wording in a source does not raise an item's rank by itself. Always present; for each top project and each meeting that needs preparation, list each distinct next step that held up under verification. A meeting needs preparation only when the source shows the user's role in it (organizer, presenter, owner) or material they owe; attendance alone creates no to-do.
- **New updates** — things the user would learn from: news they did not cause, all collected in this section. Drop anything the user authored or did themselves. Keep an incident, a cause someone proposed and a confirmed cause distinct. High bar: it should change how the user sees the day.
- **Your day** — today's calendar split into morning and afternoon, each meeting with a note where this run has useful context. Always present; an empty day is stated as one.
- **Looking ahead** — one or two sentences on the shape of tomorrow.

Every verified item is shown; no section has a fixed count. Every item carries an area label — the project it belongs to, or a working area when it has none — written in the brief's language like every other label.

The brief opens with a greeting of one or two sentences. It comments on the shape of the day — how full the calendar is, where the open time sits — warmly, without listing items and without urgency. The sections follow it in this order: push forward, top to-dos, new updates, your day, looking ahead. An empty section is left out, except top to-dos and your day, which say that they are empty. A closing line states the brief's as-of time (the local time it was composed) and names the sources read, any that failed, and the unverified items.

## Writing an item

- The title names the action or the news in a short phrase. For a to-do, it names the next action given the current state — after what the user has already done — and the person it concerns, joined to the trigger it is due to (the meeting, the deadline or the person) where the source shows one.
- The body adds what the title does not, and its length follows the item's importance and complexity: a simple item may be its title and link alone; an important or tangled one gets what it needs — who is waiting, on what, why today, where it stands. "Why today" is the actual deadline, dependency or person waiting as the source shows it, stated without urgency adjectives. The body does not restate the title.
- Each item ends with a link to its original conversation or item, named for the tool it lives in.
- The text states only what the source states: "X asked …" needs a source that shows X asking. A proposed fix is written as proposed, and a suspected cause as suspected.

## No repetition

Before writing, each source URL appears in exactly one section, and the same commitment or the same news appears once even under different URLs. Keep the item where it serves best.

## Previous brief

The previous brief is the newest dated file in `<dir>` before the brief's date. Its to-dos are a checklist; a checked box means the user or a downstream marked it done.

- A checked to-do is not listed again unless new activity reopened it.
- An unchecked to-do is re-read at its source for a later reply or state that discharges it before it is carried over. One still open is listed again with where it now stands — the current blocker and the next action — and since when it has been open, rather than in the previous brief's wording.
- An update the previous brief already carried is not repeated unless its state changed; then say what changed.
