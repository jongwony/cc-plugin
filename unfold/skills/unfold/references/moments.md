# Unfold — Per-Moment Procedures

Detailed execution for each moment. All reads treat Linear as the source of
truth for structure and auto-derived state; live-system facts (image in a
registry, deploy applied) are never read from Linear — go to their source.

## Shared: unblocked derivation

Linear auto-demotes a `blockedBy` relation to `related` when the blocking
issue completes, so "currently blocked" is live. There is no server-side
"unblocked" filter — derive client-side:

1. `list_issues` scoped to the project, excluding completed/canceled states.
2. For candidates, `get_issue` with `includeRelations: true`.
3. `unblocked(i)` ≡ `relations.blockedBy` is empty ∧ status type is not
   completed/canceled.
4. Rank: In Progress first, then Todo within the earliest un-done milestone
   (gate order = milestone sortOrder), then priority.

Keep calls bounded: derive relations only for issues in the earliest one or
two open gates, not the whole project.

## open — span-open orient

Purpose: start the session from the externalized whole, not from memory.

1. `get_project` — name, target date, initiative.
2. `list_milestones` — gates in sortOrder with auto progress %. The current
   gate = earliest milestone with progress < 100.
3. Unblocked derivation (above) within the current gate.
4. `list_documents` — surface the runbook document title + link (do not load
   its body unless asked).

Emit: one compact block — project · current gate (+%) · unblocked next
actions (issue key + title) · runbook pointer. Three to six lines.

## next — next action

Subset of `open` when orientation is already established: run the unblocked
derivation only and emit the ranked unblocked list. If empty, say which
blocker is holding the front (the blocking issue and its status) — that IS
the next action's location.

## deploy — pre-merge/deploy ordering check

1. `list_documents` → `get_document` on the runbook.
2. Extract and emit ONLY the ordering-invariants section (the runbook's
   sequence rules: what must precede what; parallel-safe sets).
3. Do not emit status; the question at this moment is "is the order I'm
   about to act in legal", not "where are we".

## decide — decision log (write, one comment)

The only recurring hand-write. Template (one line, plus optional basis):

> 결정: <chosen path>. 이유: <one-line why>. 배제: <rejected alternative — why not>.

1. Identify the anchor the decision belongs to: the workstream issue whose
   path was chosen (default), or the project itself when the decision spans
   workstreams (e.g. a roadmap path selection). Ambiguous → ask which issue
   or project anchors the decision.
2. Draft the comment from the template; show the draft.
3. On confirmation, `save_comment` with `issueId` — or `projectId` for a
   project-scoped decision; the tool accepts exactly one parent.

A decision that changes the dependency topology is not just a comment — it is
also a `close`-style structure delta (edge change). Do both.

## close — span-close structure delta (write)

Checklist the session against the structure in Linear; write only deltas:

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
5. Everything else (progress, status, percentages) — explicitly NOT written.

Show the delta list as a draft; write each item on confirmation.

## roadmap — path selection over gates

1. `get_initiative` / `list_initiatives` for the umbrella; `list_projects`
   or the initiative's member projects.
2. Per project: `list_milestones` — gate ladder with %.
3. Decision layer: `list_comments` with `projectId` per member project —
   the project-anchored decision threads `decide` writes — plus open issues
   in a hold/paused-type state (`list_issues` scoped to the project). These
   are the executable sources for pending path decisions and HOLD items.
4. Emit the gate timeline: which gate each project sits at, which gates are
   blocked on which (project dependencies are end-to-start only), and the
   open path decisions from step 3 (pending decision comments, HOLD items).
5. A path decision made here → route to `decide` (comment on the issue or a
   project-level comment via `save_comment` with `projectId`).

## Caveats learned in the field

- Milestones have no explicit sortOrder parameter on write; creation order
  fixes display order. Plan gate creation order accordingly.
- Milestone/Initiative entities are absent from Linear webhooks — any local
  cache of gate % must be pull-based (refresh at session start / on demand).
- Project health (On track / At risk) is permanently manual in Linear — do
  not treat it as auto-derived state, and do not hand-write it as part of
  this skill's moments.
- The GitHub integration transitions issue status only when the team's Git
  automations mapping is configured (Team Settings → Workflow) and the PR
  references the issue (identifier in branch name, or magic word in the PR
  description). When automation seems dead, check those two wires first.
