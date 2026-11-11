---
name: residue
description: |
  This skill should be used when the user asks "남은 작업 있어?", "남은 거
  뭐야", "열린 거 정리해줘", "what's left", "anything still open", or runs
  /residue — typically before a compaction, a handoff, or the end of a unit of
  work. Reads the session's record and the unit's chart afresh, pulls out
  everything the session still holds open, settles with the user what can be
  settled now, and sorts the rest into what stays in the session, what is
  proposed for the chart, and what needs the user's decision. Writes nothing
  to Linear itself.
---

# Residue — what a session still holds open

A session opens things as it works: acts it said it would take, questions no
one answered, things it noticed on the way to something else. They live in the
conversation and go with it when it is compacted or ends. This skill reads
them out on request and sorts them. It reports and proposes; the only writes
it leads to are `/unfold`'s, after the user agrees.

## Invocation

`/residue` — no arguments. It covers this session and the one unit of work the
session is on.

## Procedure

0. **Read; do not answer from recall.**
   - The session's record. Where the conversation was compacted or resumed, the
     summary names items without their turns: read the transcript it points to
     for those turns.
   - The unit's chart, where the session has one — the root issue of the
     unit's Linear project: its Open questions section, its decision comments,
     and its status, as they are now. A session with no chart skips this and
     says so.
1. **Pull out everything this session opened or took on and has not closed**,
   unfiltered, in three kinds:
   - **Owed** — an act the session said it would take, or was given. Whether it
     is done is read from where the work landed, not from the session's own
     earlier statement.
   - **Unanswered** — a question either side asked that no turn or source
     settled.
   - **Found** — something noticed along the way that the request did not ask
     for.

   The chart's own open questions are the chart's; they are not listed as this
   session's.
2. **Mark each item against the chart**: already there (name the section or
   the comment), or only in the conversation. An item already on the chart is
   reported as there and is not remaining work — except an owed act, which
   stays owed until it is done.
3. **Settle what can be settled now.** An item a citable record answers is
   answered with that source. Items that turn on a value the user holds are
   asked together, in one round.
4. **Sort what is still open**, one disposition per item:
   - **Stays in the session** — with the next act named.
   - **Proposed for the chart** — a settled direction through `/unfold decide`,
     the open set through `/unfold group`, once the user agrees to the move. A
     chart whose status shows the unit closed takes no write: say it is closed
     and leave the destination to the user. An item with a deadline is proposed
     with what brings it back before that date.
   - **Needs the user's decision** — whether it leaves the session is itself
     undecided: say the decision is needed and what it turns on.
5. **Report once**, one line per item: its kind, the item in plain words, the
   turn or file it came from, whether it is on the chart, and its disposition.
   Where nothing is open, say so in one line with what was read — the stretch
   of the record and the chart as of when.
