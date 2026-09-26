---
name: intake
description: |
  This skill should be used when the user asks to "sort the triage inbox",
  "process triage", "트리아지 처리", "수신함 정리", or runs /intake, alone or
  on a clock (/loop 1d /intake). Sorts a Linear team's Triage issues into the
  charts they belong to: acts only where the move is reversible and plain,
  leaves the rest in Triage, and reports once afterward with an undo per item.
---

# Intake — sorting the Triage inbox

The Triage state is where findings from any surface land. An issue a team
member creates bypasses the inbox, so an emitter sets `state: Triage`
explicitly. This skill sorts that inbox into the units of work it belongs to.
It acts first and reports after, so it takes only moves that are both
reversible and plain, and leaves everything else where it is.

## Scope

- **Writes** exactly four fields on existing issues: state, `project`,
  `relatedTo`, `duplicateOf`.
- **Writes nothing else** — no description, comment, section rewrite, or new
  issue. An item that needs a new unit of work opened for it stays in Triage;
  opening that unit is a drafted write the user culls, outside this skill.
- Accepting an item out of Triage is a decision carried out, not progress
  mirrored: status that PR events maintain is never set here.

## Invocation

`/intake [team]` — team optional. Absent, resolve it from the working repo's
Linear project, or ask once when that gives nothing. Linear tools are usually
deferred: load `list_issues`, `get_issue`, `list_projects` and `save_issue`
through ToolSearch before the first call.

## Procedure

0. **Read** the team's issues in the Triage state (`list_issues` with
   `state: Triage`), then the catalog: the root issue of each of the user's
   projects — the one whose description declares itself that unit's chart —
   in-progress projects first.
1. **Classify each item**, first match wins:
   - **Chart root** — its own description opens by declaring itself a unit's
     chart. It is not an inbox item: move it to Backlog.
   - **Plain duplicate** — the same finding as an existing open issue, by the
     observation each describes, not by a shared topic: set `duplicateOf`.
   - **Single plain match** — exactly one catalog chart is the unit this
     item's finding bears on, read against that chart's Problem and Open
     questions: set `project` to the chart's project, add `relatedTo` the
     chart's root issue, move to Backlog.
   - **Otherwise** — no match, several, or a match that is itself a judgment
     (the item would change a chart's direction, or opens a unit of its
     own): leave it in Triage.
2. **Report once, after acting**, one line per item: what it was, what moved
   and why (the chart or duplicate it matched, with the sentence that
   matched), and the undo (its prior state and fields). Items left in Triage
   are listed with their candidate charts and what kept each from being
   plain. Where two or more of them would open the same new unit of work —
   the same finding, by the observation each describes, not a shared topic
   or label — name them together as one candidate unit, with the sentence
   from each that grounds it; the grouping is reported, never written.

Each firing on a clock is the same single pass.
