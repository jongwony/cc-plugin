---
name: residue
description: "Use when the user asks what the session still holds open, or runs /residue — or when what another session, named by its id, still holds open is to be read out. Reads the session's record and the unit's chart afresh; the user then sees each item the session opened and has not closed, and where it goes — kept in the session or moved to the chart. Another session's record is read only."
argument-hint: "[session-id]"
skills:
  - epharmoge:contextualize
---

# Residue — what a session still holds open

What a session opens as it works lives in the conversation and goes with it
when the conversation is compacted or ends. This skill reads it out on request
and sorts it. The only writes it leads to are `/unfold`'s.

## Dependency

- **Epharmoge** (`/contextualize`) — called in step 1; the epistemic-protocols
  `epharmoge` plugin must be installed.
- **unfold** (this marketplace) and a Linear MCP — step 4's chart moves are
  written through them; without them the run ends at naming the move.

## Procedure

Whether work that has landed fits what was asked and where it landed is
`/contextualize`'s to check, on its own sheet and with its own question; this
procedure invokes it once and takes what it leaves open. What this procedure
covers is what never became a result — an act not yet taken, a question not
settled, a finding the request did not ask for — and where each one goes.

- **Invoked with a session id** (`/residue <session-id>`) → read
  `references/another-session.md` before step 0. The procedure then runs on
  the session that id names, with the differences that file carries for each
  step, and writes nothing. With no id, the steps run as written, on this
  session.

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
   - **Owed** — an act the session said it would take, or was given, and has
     not taken. For work that has landed, invoke `/contextualize` once over all
     of it; a misfit it leaves open is owed. Its question is the round for
     those items, and step 3 asks only the rest.
   - **Unanswered** — a question either side asked that no turn or source
     settled.
   - **Found** — something noticed along the way that the request did not ask
     for.

   The chart's own open questions are the chart's; they are not listed as this
   session's.
2. **Mark each item against the chart**: handed over (name the turn or the
   decision comment that moved it there), or only in the conversation. An item
   handed over is the chart's and is not remaining work — except an owed act,
   which stays owed until it is done. A chart entry that merely matches an
   item hands nothing over: the item stays in the session's list, marked as
   resembling that entry.
3. **Settle what can be settled now.** An item a citable record answers is
   answered with that source. Items that turn on a value the user holds are
   asked together, in one round.
4. **Sort what is still open**, one disposition per item:
   - **Stays in the session** — with the next act named.
   - **Moved to the chart** — a settled direction through `/unfold decide`,
     the open set through `/unfold group`, written without asking and named in
     the report. A chart whose status is Done or Canceled is closed and takes
     no write: read the status immediately before writing, say the unit is
     closed, and leave the destination to the user.
5. **Report once**, one line per item: its kind, the item in plain words, the
   turn or file it came from, whether it is on the chart, and its disposition.
   Where nothing is open, say so in one line with what was read — the stretch
   of the record and the chart as of when.
