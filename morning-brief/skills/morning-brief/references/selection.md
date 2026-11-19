# Selection

Read at steps 0 and 3–5 of the procedure. Says when a candidate is verified, when it is a to-do, how the brief is shaped and written, and how it continues from the previous one.

## Verified

A candidate is verified when this run has read its source record to its most recent activity. What announces an item — a notification, a preview, a list row — shows the ask, not its state.

Where the record cannot be read one way, reach the same state by another route. A candidate whose state no route could read stays out of the sections and is named in the closing line with what was tried. Where reads conflict on a fact, the record that owns the fact decides, read again; the recency of a claim does not.

## To-do

A to-do is listed only while all of these hold at its source's current state:

1. **Open.** The action is not yet done, resolved or answered — by the user or by anyone, in this record or in an adjacent tool. Completion is the thing delivered, decided or handed over; an acknowledgement, a reaction or a promise is not. Where part is discharged, only the part still owed remains.
2. **The user's.** It was asked of them, or they committed to it, or it is a duty they hold, which needs no ask. Something sent to a group, or owned by someone else, is not theirs; it may be an update. An occasion makes a to-do only where the record shows what the user owes to it — their role in it, or material they are to bring; attending is not owing.
3. **Owed today.** It is due today, or someone is blocked on the user now — shown by the record's current state, not by the age of an old ask or by how large or small the request is. Against the brief's as-of time, an occasion already past leaves only what the user still owes after it. The first brief of a working week also shows what is due later that week, with its day.

Each to-do candidate gets an independent check: a fresh-context subagent, given the candidate and its source, reads the records and tries to disqualify it on these conditions, reporting what it found for each. The checks run in parallel, and none is skipped to save time. A candidate is listed only where every condition holds on its check's evidence, and it is listed as the action that check confirmed. An action that surfaces any other way, including out of another candidate's check, is a new candidate with its own check.

## Shape

The brief opens with the actions to take first today, one line each, their detail left to the items below. Where the shape of the day changes a priority, that is said with the action it changes. Then, in this order:

- **Push forward** — work the user is best placed to move today, on one of their top projects, that this assistant can advance by producing something, and whose context this run can fully explain: who asked, why, and what has to happen. It is framed as the next step for a real occasion. Without such work the section is left out; a reminder does not fill it.
- **To-dos** — every to-do that passed, as a checklist, in order of impact on what the user is responsible for. An item on a top project outranks a larger one on a side matter, and urgent wording in a source raises nothing.
- **Updates** — news the user did not cause and would see their day differently for knowing.
- **Today** — the day's calendar in time order, with a note on an occasion where this run has context that helps.
- **Ahead** — the shape of the next day.

Every verified item is shown. Each carries the project or area it belongs to. Each source appears in one place only, and the same commitment or news appears once even where several records carry it. An empty section is left out, except to-dos and today, which say that they are empty. A closing line gives the brief's as-of time, the sources read, any that failed, and what could not be verified.

## Writing

- An item opens with its point in a short title: an update with what changed; a to-do with the next action given the current state, the person it concerns, and the occasion, deadline or person it is due to where the record shows one. An item the reader can judge from that opening ends there, with its link.
- A body adds only what the title does not, and runs as long as the item's importance, its familiarity to the reader, and what they still need to choose the action call for.
- What makes an item today's is given as the fact — the deadline, the dependency, the person waiting — never as an urgency adjective.
- Evidence and exceptions sit beside the action they bear on; an exception that would reverse the action is stated with it.
- A list holds only parallel entries that answer one question, numbered where their order matters. Where the reader must follow a course of events, a short paragraph keeps cause and result together, as every sentence does, however short.
- A thing is called by its name in `<language>`; an identifier sits beside the name where the reader needs it to act, and never replaces it.
- Each item ends with a link to its source record.

## Statement and estimate

The brief keeps what a source states apart from this run's own reading.

- A claim keeps the standing its source gives it: proposed as proposed, suspected as suspected, confirmed as confirmed. A statement of what someone said, asked or decided needs a record that shows it.
- A reading of this run's own is written only where it changes today's action. It is marked as an estimate in `<language>`, and sits beside the observed facts and the source link it rests on — a checkable source, not a longer explanation. One held weakly says what would settle it.
- An inferred owner, deadline or commitment is never written as fact, and never makes a to-do by itself.

## Continuity

The previous brief is the latest one saved in `<dir>`, a file for the brief's own date included. Its items are candidates again: nothing carries over without today's check.

- A to-do the user checked off is not listed again unless its record shows it reopened.
- A to-do still open is listed with where it stands now — what blocks it, the next action, and since when it has been open — not in the previous wording.
- An update already given returns only when its state changed, and says what changed.
