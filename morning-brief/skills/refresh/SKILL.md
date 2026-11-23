---
name: refresh
description: Refreshes today's morning brief at a checkpoint the user picks — re-reads every item at its source, checks what newly became the user's to-do, and lays the day's movement over the morning text on the same page and in the same day's file. Use when the user asks to refresh or update today's brief ("브리프 갱신", "브리프 다시 읽어줘", "where does today's brief stand"), once today's brief exists.
model: opus
effort: medium
---

# Morning brief, refresh

A refresh is a checkpoint on today's brief, made when the user asks for one. It reads the day's movement and lays it over the morning text; it does not rewrite the brief. The `morning-brief` skill's Dependency and Boundaries hold here unchanged. `references/…` below names that skill's files: `${CLAUDE_PLUGIN_ROOT}/skills/morning-brief/references/`, the `morning-brief` folder beside this skill's own.

## Settings

- `<dir>`: `${user_config.output_dir}` where the host substituted a non-empty value for it; otherwise `${CLAUDE_PLUGIN_DATA}` — the directory the `morning-brief` skill saves to.
- `<language>`: `${user_config.language}` on the same test; otherwise the language of today's brief.

```lean
/-!
How to read this block. It is core Lean 4 and elaborates as written, and you are the model it is
written for: you read it, and by inference over the context you settle each element it leaves
open. Every `axiom` is one of those judgments — a black box to the contract, yours to make from
the material in front of you; its doc comment says what you judge there, and nothing in this
block decides it for you. Every `def`, `inductive`, and `structure` is fixed by the contract.
The block fixes which acts a refresh takes and in what order; how each act is carried out is the
prose below.
-/

namespace MorningBriefRefresh

noncomputable section

/-- The session's context at the moment of the request: the conversation, today's saved brief
    with any earlier checkpoints, the live page at `<dir>/artifact-url` where one exists, and the
    connected tools. -/
axiom Context : Type

/-- An item: an entry under the morning brief's To-dos, Push forward, Open, not today, or Updates,
    or an arrival an earlier checkpoint of this skill added. The opening, Today, Ahead and Closing
    are not items; their lines follow the items they restate. -/
axiom Item : Type

/-- What the session observes by a read: `briefSaved` — today's `<dir>/<YYYY-MM-DD>.md` exists;
    `requested` — the user asked for this refresh in their own turn; `pageable` — the host has an
    artifact tool and the page at `<dir>/artifact-url` carries a record dated today. -/
structure Observed where
  briefSaved : Bool
  requested  : Bool
  pageable   : Bool

/-- When an item entered the brief; kept apart from where it stands now. -/
inductive Arrival
  /-- the morning brief carried it -/
  | morning
  /-- a refresh added it, at that checkpoint's time in the reader's zone -/
  | atCheckpoint (time : String)
  deriving DecidableEq

/-- Where an item stands now, read against the morning brief. -/
inductive Standing
  /-- the act the item names is done, by the user or by anyone; for an update, the state it
      reported has ended or its dated change has landed -/
  | done
  /-- part is done, or the item moved, and something is still owed or still holds -/
  | doneWithRemainder
  /-- no record shows it moved since the morning brief -/
  | unchanged
  /-- the act is no longer the user's or no longer owed: reassigned, cancelled, or withdrawn -/
  | noLongerOwed
  /-- the act's completion would leave no trace in any record, and none speaks to it -/
  | noRecord
  deriving DecidableEq

/-- **Your judgment**: when each item entered, read from today's file and its checkpoints. -/
axiom arrival : Context → Item → Arrival

/-- **Your judgment**: each item's standing, read from its source record to that record's latest
    activity — the record that owns the act, as `references/selection.md` §Verified names it. Where
    the act would leave no trace in any record (reading a report, say) and the user has not
    reported it, the standing is `noRecord`; what did move around it, such as the report landing,
    is shown beside it. -/
axiom standing : Context → Item → Standing

/-- **Your judgment**: candidates not yet in the brief that could be the user's open act, or an
    update, gathered as `references/gathering.md` states — open asks read with no date bound. The
    latest earlier checkpoint's read-start time, or the morning brief's as-of time where none
    exists, only dates what is new. -/
axiom arrivals : Context → List Item

/-- **Your judgment**: a candidate passed the three conditions of `references/selection.md`
    §To-do in a fresh-context check that read its record to the latest activity. Arrivals that
    could be a to-do, and existing items whose record moved, both take it. -/
axiom checked : Context → Item → Bool

/-- **Your judgment**: the item's morning wording now states, as fact or as estimate, something
    its record contradicts, so leaving it would mislead. Done items are struck through, not
    reworded; every other wording stays as the morning wrote it. -/
axiom misleads : Context → Item → Bool

inductive Act
  /-- say why nothing runs: no brief today yet, or no request -/
  | decline
  /-- re-read every item of the brief at its source, and the day's calendar -/
  | reread
  /-- the full three-condition check on every arrival that could be a to-do and on every existing
      item whose record moved -/
  | checkArrivals
  /-- the page's record of items: read from the live page, this checkpoint merged into it -/
  | updateRecord
  /-- the whole page redrawn from that record: the top, then each item in place -/
  | redraw
  /-- re-read what is about to go out against `references/visual.md` and the morning-brief
      skill's step 5: times from the clock, every link to a record this run read -/
  | selfCheck
  /-- republish the page at its address -/
  | publish
  /-- append the timestamped checkpoint block to today's file -/
  | appendCheckpoint
  | reply

/-- One refresh. Nothing runs before today's brief exists or without the user's request. -/
def refresh (o : Observed) : List Act :=
  if !o.briefSaved || !o.requested then [.decline]
  else
    let page := if o.pageable then [.updateRecord, .redraw, .publish] else []
    [.reread, .checkArrivals] ++ page.take 2 ++ [.selfCheck] ++ page.drop 2 ++
      [.appendCheckpoint, .reply]

/-- An arrival enters the to-dos only through the check. -/
def admitsAsToDo (c : Context) (i : Item) : Bool := checked c i

/-- A done item, or one no longer owed, is struck through and recedes in place, and is listed in
    the top's fold; every other standing keeps full weight in place. -/
def recedes : Standing → Bool
  | .done | .noLongerOwed => true
  | _                     => false

end

end MorningBriefRefresh
```

## When

- Only on the user's request, at a moment they pick — about once or twice a day. Nothing schedules it.
- Only once today's brief file exists. Before the morning brief, there is nothing to refresh.
- Each refresh is one checkpoint. Refreshes stack through the day. The next morning's brief is a full new run; its Continuity reads the latest checkpoint only as candidates, and nothing carries over without that day's check.
- A checkpoint is the block that opens with the marker `<!-- morning-brief:checkpoint HH:MM -->` (read start, reader's zone); any other block in today's file is read as a carrier pointing to records, and a checkpoint marked superseded is read only as candidates.

## Reading

- Re-read every item at its source to the latest activity, through the connected tools directly, and the user's calendars for the rest of the day. Gathering the arrivals follows `references/gathering.md` whole, open asks with no date bound, through `/inquire` where it is installed. Accuracy outranks cost: no read is shortened and no check is skipped to save time.
- An arrival that could be the user's open act, and an existing item whose record moved, get the full fresh-context check of `references/selection.md` §To-do; an item that now passes moves to To-dos, and one that no longer holds takes `noLongerOwed`. Only an arrival whose three conditions held is shown as a to-do; any other arrival is placed in the section its verdict gives it, and a dropped arrival appears only in the checkpoint block with its reason.
- A standing is the record's, as `references/selection.md` §Verified states. Who acted and when come from the record that owns the act.

## The page

Where the host has an artifact tool and `<dir>/artifact-url` holds today's page, read the record of items that page carries (`references/visual.md` §Figures); where its date is not today, the page is not today's and is not merged into, merge this checkpoint into it — each item's arrival and standing, times, actors — and redraw the whole page from that record: the morning wording and figures are rendered again from it, never patched as HTML fragments. Republish at the same address. After a refusal that hands back a newer live page, merge into that page's record and redraw again. Without a page, the refresh lives in the saved file and the reply. `references/visual.md` governs figures, colors and density.

- **Top.** A day axis: one lane per item that moved or is still owed, updates included where they moved; a mark at the brief's time and at this checkpoint's; a mark or span where each item moved; and a lane for the day's occasions as the calendar now shows them. Below it, a summary bar with one cell per item in its standing, beside a legend that names each standing with its glyph; what is still owed leads, and the done items are listed under a collapsed "끝난 일 N개" (in the brief's language).
- **Items.** Each item stays where the morning put it, in its morning wording. Where `recedes` holds, the item shrinks to its struck-through title and one standing line, at low weight, so a finished item is never shown at full weight twice; any other item keeps its weight, with its current standing written beneath it as one group: the label, the time, who acted, and what remains. An arrival goes into the section its verdict gives it, marked with its arrival time; one an earlier checkpoint added stays where that checkpoint put it.
- **Wording.** The morning text is kept as it was, because a reader who meets their morning words again recalls where they left the work. Only where `misleads` holds is a line reworded, on the page alone. Opening and Closing lines that restate an item take that item's strike or standing.

## The saved file

Append a block that opens with the marker `<!-- morning-brief:checkpoint HH:MM -->`, HH:MM the clock when the reads start, followed by the heading "HH:MM 갱신" in the brief's language, to today's `<dir>/<YYYY-MM-DD>.md`. It lists, without checkboxes, each item's arrival and standing as labels with time and actor, the arrivals with their verdicts (dropped ones with their reason), and closing lines: the as-of time, how far back each read went, what could not be reached, and questions for the user. The morning brief above it is not edited; its checkboxes stay unticked as §Continuity states.

## Reply

The checkpoint's summary — counts by standing, what remains owed today, the arrivals — and the page link.
