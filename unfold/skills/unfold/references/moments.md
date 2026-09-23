# Unfold — Per-Moment Procedures

Detailed execution for `decide`, `group`, and `close`. All three read Linear
as the source of truth for structure and current issue state; live-system
facts (image in a registry, deploy applied) are never read from Linear — go to
their source.

## Shared: read the chart before writing

A line cannot be laid on a chart whose contents are unknown. Before any write
moment, read the selected root issue's description (the five sections:
Problem, Proposed outcome, Affected, Constraints, Open questions) and its
decision comments in order, since the sections are rewritten only by `group`
and the decision lines are where the current direction lives. This is the one
chart loaded, and every other issue stays metadata-only. The restriction is on
charts: a body a write is about to change — the runbook `close` updates — is
read in that write's own step.

## decide — decision log (write, one comment)

Written each time the direction changes. Template (one line, plus optional
basis):

> 결정: <chosen path>. 이유: <one-line why>. 배제: <rejected alternative — why not>.

1. Identify the anchor the decision belongs to: the workstream issue whose
   path was chosen (default), or the project itself when the decision spans
   workstreams. Ambiguous → ask which issue or project anchors the decision.
2. A slot the session cannot fill from what the user actually settled — the
   `이유:` a path was taken, the `배제:` it displaced — is asked, not
   inferred. Ask before drafting that line (`/inquire` where that protocol
   is loaded; a direct question where it is not) and draft from the answer.
3. Draft the comment from the template; show the draft. Write it at the
   moment the direction changes, not at the end of the session: a session
   the user is steering can change direction more than once, and a session
   switch loses what was not yet on the chart.
4. The user culls: a line is dropped when it is derivable from what the
   chart already records, when a mechanical fix produced it rather than a
   choice, or when it does not match the unit's intent.
5. On confirmation, `save_comment` with `issueId` — or `projectId` for a
   project-scoped decision; the tool accepts exactly one parent.

A decision that changes the dependency topology is not just a comment — it is
also a `close`-style structure delta (edge change). Do both.

## group — collapse the open set into axes (write, open-set regroup)

The Open questions section accumulates: each item was written at a different
moment, from a different source, and stands on its own. This moment rewrites
how the open set is carried — it is the one moment that rewrites a description
section, and it changes no direction.

0. **Read the chart's open items and its decision comments, in order** — the
   same pre-write read the other moments require. A decision already known to
   be pending is written as its own `decide` line before this read, so the
   read includes it. A collapse performed against a stale reading of the open
   set produces axes for questions a decision comment has already settled.
1. **Draw the axes.** An axis is one independent question the unit must
   decide. Items that differ only in when or where they surfaced belong to one
   axis; a source (an open question, an immediate repair, a design sketch) is
   not an axis.
2. **Every axis names what it absorbed.** Under each axis, list the original
   items it took. The absorbed list is written to the chart, not just shown
   in the draft.
3. **Classify every item that is not an axis by *why* it is not, and give the
   two kinds different dispositions:**
   - **Projection onto another axis** — it looked independent but is
     determined once another axis is fixed. It stays on the chart, written as
     a *value* of that axis rather than as an item of its own.
   - **A different object** — an axis of something other than what this unit
     must decide (how the investigation came to know things, how the work is
     run). It leaves the Open questions section, and where each of its
     contents goes — which section, which issue, which document — is stated
     per item.
4. **A grouping is not a decision.** A collapse that changed the direction —
   an axis resolved while being drawn, an option ruled out — carries a
   separate `decide` line; the two moments compose rather than substitute.
   Which case it is fixes where that line goes: a decision known to be
   pending before the collapse starts is written before step 0 (above); a
   decision discovered while drawing axes is written now, and the regrouping
   then restarts from step 0 against the chart that line is on. A rewritten
   section must not carry a settled axis as open.
5. Draft the rewritten Open questions section — axes with their absorbed
   lists, projections as values of the axis that determines them, departures
   with their per-item destinations — together with the content each
   relocation write will carry, not just where it goes. The user culls
   (derivable, mechanical, off-intent — derivability does not reach an
   axis's representation or its absorbed list). On confirmation, the writes
   land in this order:
   - a departure to another section of the same root description rides in the
     same `save_issue` as the rewritten Open questions;
   - a departure to another issue or document is its own `save_issue` /
     `save_document`, its body read immediately before it is changed, and it
     lands **before** the root rewrite removes the item;
   - the root `save_issue` last. Nothing leaves the chart before it has
     landed somewhere.

Write template for one axis:

> **축 N — <the question this axis decides>**
> 흡수: <original item>; <original item>; <original item>
> 값: <projection written as a value of this axis>
>
> 이 단위의 물음이 아님: <item> → <where its contents went>

## close — span-close structure delta (write)

Checklist the session against the structure in Linear; write only deltas:

0. **Read current structure first** — `list_issues` scoped to the project
   (non-archived; `includeRelations` on candidates) and `list_documents`.
   A delta exists only against this read: an issue, edge, or runbook line
   already present in Linear is not a delta, and re-writing it creates
   duplicates or clobbers edits made outside this session.

1. **New workstream emerged?** → `save_issue` (team, project, milestone,
   `blockedBy`/`blocks` edges, PR links as `links`). State: let automation
   own it. Backfill exception (mirrors the SKILL.md core rule): an issue
   created for work finished before it existed gets its state set once at
   creation — no PR event will ever fire for it; a one-time creation fact,
   not ongoing state mirroring.
2. **Dependency changed?** → `save_issue` on the existing issue with
   `blockedBy`/`removeBlockedBy` etc.
3. **Runbook stale?** (order/invariant changed this session) →
   `save_document` update — structure and order only, never current status.
4. **Distilled handoff produced?** (a cold, self-contained runbook for a
   fresh session) → `save_document` as a project document.
5. **Unit closing?** The close is an explicit act, never inferred from the
   last merge. → `save_comment` on the unit's root issue: a closing note
   saying what landed (the commit and PR locators that carry the
   then-record) and what is still open. A follow-up issue born here is
   never an orphan: `save_issue` with `relatedTo` (or `blockedBy`) the root
   issue and one pointer line to the closing note in its description — a
   locator, not a restatement of the intent — so the fresh context that
   picks it up starts from the chart rather than from someone's recall.
6. Everything else (progress, status, percentages) — explicitly NOT written.

Show the delta list as a draft; the user culls it (derivable, mechanical, or
off-intent lines drop); write each surviving item on confirmation.

## intake — sort the Triage inbox (act, then report)

The Triage state is where findings from any surface land: an issue created by
a team member bypasses the inbox, so an emitter sets `state: Triage`
explicitly. `intake` sorts that inbox into the charts it belongs to. It is the
one moment that acts before reporting, so it takes only acts that are both
reversible and plain, and leaves everything else where it is.

0. **Read** the team's issues in the Triage state (`list_issues` with
   `state: Triage`), then the catalog — the project root issues, as in
   Project resolution step 3.
1. **Classify each item**, first match wins:
   - **Chart root** — its description opens by declaring itself a unit's
     chart. It is not an intake item: move it to Backlog.
   - **Plain duplicate** — the same finding as an existing open issue, by
     its described observation, not by a shared topic: set `duplicateOf`.
   - **Single plain match** — exactly one root issue in the catalog is the
     chart this item's finding bears on, by that chart's Problem or Open
     questions: set its `project` to the chart's project, add `relatedTo`
     the root issue, move it to Backlog.
   - **Otherwise** — no match, several, or a match that is itself a
     judgment (the item would change a chart's direction, or opens a unit
     of its own): leave it in Triage.
2. **Write only those fields** — state, `project`, `relatedTo`,
   `duplicateOf`. No description, comment, Open-questions rewrite or new
   issue: those stay with `decide`, `group` and `close`, where the user
   culls a draft.
3. **Report once, after acting**, one line per item: what it was, what moved
   and why (the chart or the duplicate it matched, with the sentence that
   matched), and how to undo it (the prior state and fields). Items left in
   Triage are listed with their candidate charts and what kept each from
   being plain.

Run on a clock with `/loop 1d /unfold intake`; each firing is the same
single pass.

## Caveats learned in the field

- Milestones have no explicit sortOrder parameter on write; creation order
  fixes display order. Plan gate creation order accordingly.
- Project health (On track / At risk) is permanently manual in Linear — do
  not treat it as auto-derived state, and do not hand-write it as part of
  this skill's moments.
- The GitHub integration transitions issue status only when the team's Git
  automations mapping is configured (Team Settings → Workflow) and the PR
  references the issue (identifier in branch name, or magic word in the PR
  description). When automation seems dead, check those two wires first —
  the never-hand-write-state rule assumes that chain is live.
