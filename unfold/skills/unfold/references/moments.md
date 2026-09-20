# Unfold — Per-Moment Procedures

Detailed execution for `decide` and `close`. Both read Linear as the source of
truth for structure and current issue state; live-system facts (image in a
registry, deploy applied) are never read from Linear — go to their source.

## Shared: read the chart before writing

A line cannot be laid on a chart whose contents are unknown. Before either
write moment, read the selected root issue's description (the five sections:
Problem, Proposed outcome, Affected, Constraints, Open questions) and its
decision comments in order, since the sections are not rewritten and the
decision lines are where the current direction lives. This is the one chart
loaded, and every other issue stays metadata-only. The restriction is on
charts: a body a write is about to change — the runbook `close` updates — is
read in that write's own step.

## decide — decision log (write, one comment)

The only recurring hand-write. Template (one line, plus optional basis):

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
