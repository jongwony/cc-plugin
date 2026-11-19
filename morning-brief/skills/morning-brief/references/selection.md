# Selection

Read at steps 0 and 3–5 of the procedure. Says when a candidate is verified, when it is a to-do, how the brief is shaped and written, and how it continues from the previous one.

## Verified

A candidate is verified when this run has read its source record to its most recent activity. What announces an item — a notification, a preview, a list row — shows the ask, not its state.

- A fact is used as fact only from the record that owns it. Any other carrier — a relay, a transcript, a summary, someone's mention — points there and, unsettled, stays attributed to that carrier, with its time. A schedule's owning record is the latest statement by whoever decides it.
- Where the record cannot be read one way, it is reached through another record, never by a command (`SKILL.md` §Boundaries). A candidate whose state no route could read stays out of the sections.

## To-do

A to-do is listed only while all three hold at its source's current state:

1. **Open.** The action is not yet done, resolved or answered — by the user or by anyone, in this record or in an adjacent tool. Completion is the thing delivered, decided or handed over; an acknowledgement, a reaction or a promise is not. Where part is discharged, only the part still owed remains.
2. **The user's.** They were asked, or they committed, or a record names them for the act, which needs no ask. A record naming a group, or their authorship, only infers it. An occasion makes a to-do only where the record shows what the user owes to it; attending is not owing.
3. **Owed today.** The record shows what waiting past today costs: a deadline that falls today; a person or agent whose next step cannot proceed without the user's act — a required approval, a stated wait, a dated promise made to them; or a later step owed today that stalls on it. Being past due is stated as a fact and does not by itself make an item today's. A relative date resolves against its record's timestamp. Against the as-of time, an occasion already past leaves only what the user still owes after it.

Every to-do or push-forward candidate gets an independent check: a fresh-context subagent that tries to disqualify it on all three conditions. Candidates from one record may share a check. The checks run in parallel, and none is skipped to save time.

- **Hand-off**: the three conditions and the read-to-latest-activity criterion; who the user is and their team; the current time; the candidate with its source, its history and any mark the user left on it; and the chain it belongs to, upstream and downstream.
- **Return**: for each condition, held, failed or unreached, with the link of the record read and that record's latest-activity time; and the action confirmed.
- **Reception**: a return counts only as far as it shows the source record read to its latest activity; the rest is unreached. All three held makes a to-do, listed as the action confirmed. Open and the user's but not owed today makes push forward where it is on one of the user's top projects and this assistant can advance it by producing something, and otherwise open, not today. An action that surfaces any other way, another check included, is a new candidate with its own check.

## Shape

In this order:

- **Opening** — the to-dos to start first, one line each, the one whose cost runs out soonest first. Where none must start first, one line says so. Where the shape of the day changes a priority, that is said with the act it changes.
- **To-dos** — every to-do, as a checklist, in order of impact on what the user is responsible for. A chain's steps keep their order, and urgent wording in a source raises nothing.
- **Push forward** — each framed as the next step toward what the record shows it serves, with who asked, why, and what has to happen.
- **Open, not today** — every other ask addressed to the user personally, and commitment of theirs, that is still open: one line each, with the fact that keeps it out of the to-dos.
- **Updates** — news that is not the user's own act or message, shown while it still changes the reader's day or has changed since it was last told: a state while it holds, an event once. A measured state of the user's that has crossed a line it was held to is such a state.
- **Today** — the day's occasions from the user's own calendar, in time order, with a note where this run has context that helps. A conflict among them is stated with the choice it forces.
- **Ahead** — the next day's shape; on the week's first brief, the rest of the week; and the occasions the user's open work leads to.
- **Closing** — the as-of time; how far back each read went, and what was covered of a source too large to read whole; the sources that failed, with what was tried; what ran without a dependency a step names; what no route could read or no check could reach; questions for the user; and, once, what left the previous brief with no current item, with the user's notes on it.

Today and Ahead carry no verdicts; another person's state, such as an absence, appears only beside an item that depends on that person. Each item appears once and carries the project or area it belongs to. An empty section is left out, except to-dos and today, which say that they are empty.

## Writing

- An item opens with its point in a short title: an update with what changed; a to-do with the next act given the current state, the person it concerns, and what it is due to where the record shows it. An item the reader can judge from that ends there, with its link.
- A premise that changed since the last brief, and whose decision now remains, head the item, once.
- The body carries what changes the reader's next choice — the order of acts, the exception that would reverse it — beside the act it bears on, and ends where that choice stops changing. Reference figures and history stay behind the link; compared quantities go to the figure.
- What makes an item today's is given as the fact, never as an urgency adjective.
- Wherever an item is restated — the opening, a title, another item, a figure — it names the same act, the same owner of the remaining decision, and the same standing. A decision left to the user is not rewritten as an instruction, and a claim gains no certainty by being repeated.
- A list holds only parallel entries that answer one question, numbered where their order matters. A course of events the reader must follow stays a short paragraph that keeps cause with result.
- A thing is called by its name in `<language>`; an identifier sits beside the name where the reader needs it to act, and never replaces it.
- Each item ends with a link to its source record.

## Statement and estimate

The brief keeps what a source states apart from this run's own reading, in three standings: stated, proposed, estimate.

- A claim keeps the standing its source gives it. What someone said, asked or decided needs a record that shows it.
- A reading of this run's own is written only where it changes today's act or says which of the user's work a piece of news touches. Placing facts together so that a relation no source states follows from them is such a reading. It is marked as an estimate in `<language>`, beside the observed facts and the source link it rests on, not a longer explanation. One held weakly says what would settle it.
- An inferred owner, cause, duty, deadline or commitment is never written as fact, and never makes a to-do by itself.

## Continuity

The previous brief is the latest one saved in `<dir>` dated on or before the brief's date. Its items are candidates again: nothing carries over without today's check.

- What the user wrote in that file, a tick or a note, is their report; the record decides. A tick the record confirms needs no line, and a ticked to-do its source still shows owed returns, saying so. A note is shown beside its item, marked as theirs.
- A to-do still open is listed as it stands now — what blocks it, the next act, and since when it has been open — not in the previous wording.
