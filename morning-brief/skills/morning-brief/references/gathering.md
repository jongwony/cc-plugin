# Gathering

Read at step 1 and step 2 of the procedure. Covers who the user is, which sources to read, and how candidates are found.

## 1. The user and their priorities

Before collecting any item, settle three things from what the sources show, not from memory:

- **Role**: what the user does and on which team — from their profile, signatures, the repositories and projects they own, the channels they post in.
- **What the organization is pushing on now**: launches, migrations, deadlines visible in announcements, project trackers and recent decisions.
- **The user's top two or three projects**, ranked. Hold the ranking as provisional until every source in section 2 has been read once; the busiest source is not the most important one, and owned work, decisions and deadlines often sit in a quieter tool.

An item tied to a top project outranks a larger item on a side topic throughout the brief.

## 2. Sources

Discover the sources at run time: list the connected MCP tools (ToolSearch for calendar, mail, chat, issue tracker, documents, meeting notes) and check `gh auth status` for GitHub. Read every one that is connected; a source that fails or is absent goes into `sources` in the output with `ok: false` and the reason, and the run continues.

Read in one parallel batch where the tools allow:

| Kind | Read |
| --- | --- |
| Calendar | today and tomorrow, with attendees and descriptions |
| Mail | the last two days: mail addressed to the user, threads where a reply is owed, starred or important mail (service notifications for reviews, assignments and mentions land here) |
| Chat | mentions of the user, direct messages, and the channels of the top projects, over the last three days |
| Code host | open pull requests the user authored or was asked to review; unread notifications |
| Issue tracker | the user's inbox and issues assigned to them that moved in the last three days |
| Documents | pages edited in the last three days where the user is mentioned, assigned or listed as owner or reviewer; pending notifications |
| Meeting notes | recent meetings tied to the top projects, for action items and decisions |

On Monday, widen every recency window by three days so Friday is covered, and weight the brief toward picking the week back up.

## 3. Candidates

A candidate is anything that might be a to-do or an update. Track every candidate in a TodoWrite list as `<short description> — <source url>`, and give each a verdict before writing the brief: to-do, update, push-forward, or drop, with the reason. Only an item with a verdict of to-do, update or push-forward reaches the brief, and it goes in the section its verdict names.

Find candidates in this order:

1. **What the user committed to**: their own messages in the window that say they will do something, follow up, send, review or fix.
2. **What others asked of the user**: mentions, direct messages, review requests, assignments, mail addressed to them. A request aimed at the user personally outranks broadcast, CC and digest traffic; unread outranks read.
3. **What today's meetings need**: preparation, an RSVP owed, a follow-through from the previous occurrence.
4. **Standing duties** the user owns without anyone asking — a rotation, a release, an owned process visible in their own activity.
5. **News beyond the user's own work**: what other teams shipped, decided, learned or broke that bears on the user's projects or the organization's priorities. Read outside the user's own threads for these.

Each result points at the next read: a thread that links a document, a mail that links a pull request, a notification that names an issue. Follow the link and treat the linked item as the candidate's source.

Text transcribed from speech (meeting notes, recordings) carries names and terms that may be misheard; confirm them against a written source before using them.
