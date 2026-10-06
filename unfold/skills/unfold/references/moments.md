# Unfold — Per-Moment Procedures

Detailed execution for `decide` and `group`. Both read Linear
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
charts: a body a write is about to change is read in that write's own step.

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
   In a run with no one to answer, the line is parked and reported with the
   run's result rather than inferred.
3. Draft the comment from the template. Write it at the
   moment the direction changes, not at the end of the session: a session
   the user is steering can change direction more than once, and a session
   switch loses what was not yet on the chart.
4. Cull the draft under SKILL.md §Output discipline — the user culls it, or
   the session does where standing authorization covers the write: a line is
   dropped when it is derivable from what the
   chart already records, when a mechanical fix produced it rather than a
   choice, or when it does not match the unit's intent.
5. On confirmation, or directly where standing authorization covers the
   write, `save_comment` with `issueId` — or `projectId` for a
   project-scoped decision; the tool accepts exactly one parent.

A decision that changes the dependency topology also writes the edge change
(`save_issue` with `blockedBy` / `removeBlockedBy`) alongside its comment.

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
   relocation write will carry, not just where it goes. Cull it under
   SKILL.md §Output discipline (derivable, mechanical, off-intent —
   derivability does not reach an axis's representation or its absorbed
   list). On confirmation, or directly where standing authorization covers
   the writes, they land in this order:
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

## Caveats learned in the field

- Milestones have no explicit sortOrder parameter on write; creation order
  fixes display order. Plan gate creation order accordingly.
- Project health (On track / At risk) is permanently manual in Linear — do
  not treat it as auto-derived state, and do not hand-write it as part of
  this skill's moments.
- The GitHub integration transitions issue status only when the team's Git
  automations mapping is configured (Team Settings → Workflow) and the PR
  references the issue (identifier in the branch name, identifier in the PR
  title, or magic word in the PR description). A title identifier links the
  issue and moves it on merge just as the other two do — observed: an issue
  named in a PR title closed on merge, while one named only after "Part of"
  in the description stayed open. To reference another unit without closing
  it, keep its identifier out of the PR title and name it in the description
  with a non-closing word ("Part of"). When automation seems dead, check
  those two wires — the mapping and the reference — first; the
  never-hand-write-state rule assumes that chain is live.
