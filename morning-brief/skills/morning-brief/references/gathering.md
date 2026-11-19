# Gathering

Read at step 1 and step 2 of the procedure. Establishing what is the case — which sources are connected, what each holds now — is `/inquire`'s; this file names only what the brief needs established and in what order it looks for candidates.

## What `/inquire` establishes for the brief

Invoke `/inquire` with these targets, as of the brief's date and time. A subagent launched for this collection runs with `model: opus`.

- **The user**: role and team.
- **What the organization is pushing on now**: launches, migrations, deadlines.
- **The user's top two or three projects, ranked.** The ranking settles only after every connected source has been read once; the busiest source is not the most important one.
- **Each connected source, over these windows**:
  - calendar: today and tomorrow;
  - mail, code host, issue tracker, documents: the last two to three days;
  - chat: the last three days, with mentions, direct messages and the top projects' channels;
  - meeting notes: recent meetings tied to the top projects.
  On Monday, widen every window by three days so Friday is covered.
- **The candidates in the section below**, each with its source URL.

Of what `/inquire` hands back as the user's, an open decision the user owns becomes a to-do candidate naming the decision and who is waiting on it; what stayed unreached goes in the brief's closing line with what was tried. The run continues past both; in an unattended run no turn waits on `/inquire`'s relay to the user.

An item tied to a top project outranks a larger item on a side topic throughout the brief.

## Candidates

A candidate is anything that might be a to-do or an update. Keep a candidate ledger — in the harness's task tool or a scratch file — with one row per candidate as `<short description> — <source url>`, and give each a verdict before writing the brief: to-do, update, push-forward, or drop, with the reason. Only an item with a verdict of to-do, update or push-forward reaches the brief, and it goes in the section its verdict names.

Look for candidates in this order:

1. **What the user committed to**: their own recent messages that say they will do something, follow up, send, review or fix.
2. **What others asked of the user**: mentions, direct messages, review requests, assignments, mail addressed to them. A request aimed at the user personally outranks broadcast, CC and digest traffic. Unread outranks read.
3. **What today's meetings need**: preparation, an RSVP owed, a follow-through from the previous occurrence.
4. **Standing duties** the user owns without anyone asking: a rotation, a release, an owned process visible in their own activity.
5. **News beyond the user's own work**: what other teams shipped, decided, learned or broke that bears on the user's projects or the organization's priorities.

A candidate that links elsewhere — a thread to a document, a mail to a pull request, a notification to an issue — takes the linked item as its source.
