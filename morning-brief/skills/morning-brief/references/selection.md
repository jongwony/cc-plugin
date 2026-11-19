# Selection

Read at steps 0 and 3–5 of the procedure. Says when a candidate is verified, when it is a to-do, how the brief is shaped and written, and how it continues from the previous one.

## Verified

A candidate is verified when this run has read its source record to its most recent activity. What announces an item — a notification, a preview, a list row — shows the ask, not its state.

Where the record cannot be read one way, reach the same state by another route: another record, never a command (`SKILL.md` §Boundaries). Where the owning record lies outside the connected tools, the latest record that relays it is used, and the state is stated as of that relay, with its time and source. A candidate whose state no route could read stays out of the sections and is named in the closing line with what was tried. Where reads conflict on a fact, the record that owns the fact decides, read again; the recency of a claim does not.

## To-do

A to-do is listed only while all of these hold at its source's current state:

1. **Open.** The action is not yet done, resolved or answered — by the user or by anyone, in this record or in an adjacent tool. Completion is the thing delivered, decided or handed over; an acknowledgement, a reaction or a promise is not. Where part is discharged, only the part still owed remains.
2. **The user's.** It was asked of them, or they committed to it, or a record assigns it to them as a duty — an assignment, a rota, a role the record shows, a meeting they convened — which needs no ask. Something sent to a group, or owned by someone else, is not theirs; it may be an update. An occasion makes a to-do only where the record shows what the user owes to it — their role in it, or material they are to bring; attending is not owing.
3. **Owed today.** It is due today; or it is past due and still open; or someone is blocked on the user now; or a later step that is itself owed today, the user's or another's, cannot proceed until it is done. The record's current state shows which, not the age of an old ask or how large or small the request is. A relative date in a record resolves against that record's own timestamp and is the record's deadline. Against the brief's as-of time, an occasion already past leaves only what the user still owes after it.

Each to-do or push-forward candidate gets an independent check; candidates from one record may share one, and a push-forward candidate is checked on the first two conditions. A fresh-context subagent is given who the user is and their team, the brief's as-of time, the candidate with its source, and the candidates it depends on. It reads the records and tries to disqualify the candidate. It returns, for each condition, held, failed or unreached, with the link of the record it read and that record's latest-activity time, and the action it confirmed. The checks run in parallel, and none is skipped to save time. A candidate is listed only where every condition held, as the action its check confirmed; one with a condition unreached is named in the closing line. An action that surfaces any other way, including out of another candidate's check, is a new candidate with its own check.

## Shape

The brief opens with the actions to take first today, one line each, their detail left to the items below. They are drawn only from the checked items below: the ones whose value is lost if they wait past the day's next fixed point — someone blocked, a deadline, an occasion they prepare for. Where there are none, one line says nothing is owed today. Where the shape of the day changes a priority, that is said with the action it changes. Then, in this order:

- **Push forward** — work the user is best placed to move today, on one of their top projects, that this assistant can advance by producing something, and whose context this run can fully explain: who asked, why, and what has to happen. It is framed as the next step toward what the record shows it serves, and says so where no date or person is waiting. Without such work the section is left out; a reminder does not fill it.
- **To-dos** — every to-do that passed, as a checklist, in order of impact on what the user is responsible for; the steps of one chain keep their order. An item on a top project outranks a larger one on a side matter, and urgent wording in a source raises nothing.
- **Open, not today** — every ask addressed to the user personally, and every commitment of theirs, that is open but not owed today: one line each, with the fact that keeps it out of the to-dos — no deadline, nobody waiting, how long it has been open.
- **Updates** — news that is not the user's own act or message and that they would see their day differently for knowing. A measured state of something the user is responsible for that has crossed a line it was held to, a target date or a threshold, is news while it stays crossed.
- **Today** — the day's occasions from the user's own calendar, in time order, with a note where this run has context that helps. A conflict among them is stated with the choice it forces.
- **Ahead** — from the same calendar, the shape of the next day; on the first brief of a working week, judged by the saved briefs, the rest of that week; and the occasions the user's open work leads to.

Today and Ahead are read from the calendar and carry no verdicts; another person's state, such as an absence, appears only beside an item that depends on that person. Each item carries the project or area it belongs to. Each source appears in one place only, and the same commitment or news appears once even where several records carry it. An empty section is left out, except to-dos and today, which say that they are empty. A closing line gives the brief's as-of time, how far back the read went, the sources read — with what was covered where one was too large to read whole — any that failed, what ran without a dependency a step names, and what could not be verified.

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

- A claim keeps the standing its source gives it: proposed as proposed, suspected as suspected, confirmed as confirmed. A statement of what someone said, asked or decided needs a record that shows it. A record is only as reliable on a fact as the way it was produced: a name, an owner or a number from a transcript or a machine summary is settled against the record that owns it before it is used, and unsettled it is quoted as heard and marked an estimate.
- A reading of this run's own is written only where it changes today's action or says which of the user's work a piece of news touches. Placing facts together so that a relation no source states follows from them is such a reading. It is marked as an estimate in `<language>`, and sits beside the observed facts and the source link it rests on — a checkable source, not a longer explanation. One held weakly says what would settle it.
- An inferred owner, cause, duty, deadline or commitment is never written as fact, and never makes a to-do by itself. Authorship, team membership or shared ownership only infer a duty.

## Continuity

The previous brief is the latest one saved in `<dir>` dated on or before the brief's date. Its items are candidates again: nothing carries over without today's check. What the user added to that file is their input to this run, and replacing the file never drops their words.

- A tick is the user's report, not the record. A ticked to-do returns only where its source still shows it owed, saying that it was ticked and what the record shows.
- A note is carried into the new file beside its item, or in a closing section where the item has left.
- A to-do still open is listed with where it stands now — what blocks it, the next action, and since when it has been open — not in the previous wording. One that no longer holds is accounted for once: what closed it, or what changed its premise.
- An update already given returns only when its state changed, and says what changed.
