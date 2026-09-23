---
name: unfold
description: |
  This skill should be used at the three moments in multi-PR / multi-project
  work where a hand belongs on the unit's chart in Linear: "이 길로 가는 이유
  기록" / "결정 남겨줘" / "log this decision" (decide), "열린 것들 축으로
  묶어줘" / "축 정리" / "collapse the open questions" (group), "세션 정리" /
  "구조 변경 반영" / "이 단위 닫자" / "wrap up the unit" (close), "수신함 정리"
  / "triage 처리" / "process the triage inbox" (intake). Also applies
  without being named: when the accumulated context and the utterance show an
  intent to write to a repository, the unit's chart is read before the first
  write — matched against the catalog of project root issues, that one chart
  and nothing beside it. Writes ONLY structure and decisions, never progress.
  Invoked as /unfold [moment] [project].
---

# Unfold — Writing the unit's chart in Linear

A unit of work has a chart outside the codebase: its project's root issue in
Linear, whose five sections say what is wanted, why, under which constraints,
and what is still open, and whose decision comments say where the direction
stands now. This skill covers the three moments where a human hand belongs on
that chart — a decision, a regrouping of the open set, and a structure delta —
and the one moment where none does: sorting the Triage inbox into the charts
it belongs to.

Reading the chart on its own is outside this skill; the adopting host carries
that on its always-loaded surface. What is here is the convention for writing
— the shape of a decision line, what the user culls, the state/structure
boundary, the closing note and the letter of introduction it hands a
follow-up — and the read each write needs first.

## Core rule — pace layering

- **Write only structure and decisions**: new workstream issues, `blockedBy`
  edges, runbook documents, one-line decision comments, a regrouped Open
  questions section and the relocation of an item that regrouping releases —
  into another section of the same root description, or into the issue or
  document that item belongs to.
- **Read at need, never cache-and-trust**: issue status and milestone progress
  % are system-maintained. Dependency edges are not — they are stored
  structure, written by hand under the bullet above. A write reads what it is
  about to change, immediately before changing it.
- **Never hand-write state**: do not set issue status, milestone completion,
  or live-system facts (deploy/image existence) in Linear. Status flows from
  PR events; live facts are read from their source (CI, registry, ArgoCD)
  at need. Hand-mirrored state drifts, and stale state read back as "the
  whole picture" pollutes downstream judgment. Sole exception: the initial
  state of a backfilled issue — one created for work finished before the
  issue existed — is set once at creation, because no PR event will ever
  fire for it; this is a one-time creation fact, not ongoing mirroring,
  and automation owns the state from then on. The unit's explicit close is
  the other: a root issue has no PR of its own to complete it, so enacting
  the user's closure decision sets its terminal state once, together with
  the closing note — a decision carried out, not progress mirrored. Triage
  acceptance is the third: an issue leaving the Triage state is admitted to
  a workflow no PR has touched yet, so `intake` moves it once, as the sort
  it carries out.

## Invocation

`/unfold [moment] [project]` — both arguments optional.

| Moment | Aliases (EN / KO) | Kind |
|---|---|---|
| `decide` | decision, path, 결정, 왜 이 순서 | **write** (one comment) |
| `group` | axes, collapse, regroup, 축 정리, 정렬, 묶기 | **write** (open-set regroup) |
| `close` | span-close, wrap-up, 세션 정리, 구조 반영 | **write** (structure delta) |
| `intake` | triage, inbox, 수신함, 분류 | **act, then report** (inbox sort) |

- No moment argument: infer from the utterance. A direction being chosen is
  `decide`; an accumulated open set being collapsed into axes is `group`; a
  unit's structure or its end is `close`; issues waiting in the Triage state
  are `intake`. Genuinely ambiguous → name the
  candidates and ask once.
- Korean voice input is expected — match aliases semantically, not literally.
- **Write-intent trigger.** When the accumulated context and the utterance
  show an intent to write to a repository — an edit, a branch, a worktree, a
  spawn — and no chart is open for that unit yet, the unit's chart is read
  before the first write, resolved by catalog match (below). Recognizing that
  intent is the work, so the trigger belongs where the intent forms, not where
  a write executes: this skill states the trigger and delivers it nowhere, and
  a host that wants it to fire unasked binds it on an always-loaded surface of
  its own.

## Project resolution

Resolve the target Linear project in this order; never hardcode project IDs:

1. Explicit `[project]` argument (name, ID, or slug).
2. Infer from the working repo: take the git repo directory name (and, if
   present, the current worktree/branch's issue identifier like `FD-123`) and
   query Linear (`list_projects` with a name query, or `get_issue` on the
   identifier and read its project).
3. **Catalog match** (the write-intent path, and the fallback when 1–2 give
   nothing): the catalog is the root issues of the user's projects — the
   in-progress projects first, plus a root issue the accumulated context and
   utterance make plainly relevant even though its project is not in
   progress. Match the intent against that catalog; one match opens that
   chart. No match: propose a new root issue for the unit as a `close`-style
   structure write, draft first — never open a neighbour's chart instead.
4. Still ambiguous: list the candidates and ask once. The resolved chart is
   reused while the write target and the intent stay the same unit; a switch
   to another repository or another unit re-runs the match, because a chart
   that is open is not thereby the chart this write belongs to.

## Tool loading

Linear MCP tools are deferred in most sessions. Before the first call, load
schemas via ToolSearch, e.g.
`select:mcp__claude_ai_Linear__list_projects,mcp__claude_ai_Linear__list_issues,mcp__claude_ai_Linear__get_issue,mcp__claude_ai_Linear__list_comments,mcp__claude_ai_Linear__list_documents,mcp__claude_ai_Linear__save_comment,mcp__claude_ai_Linear__save_issue,mcp__claude_ai_Linear__save_document`
(load only what the moment needs; exact server prefix may differ — discover
with a keyword search on "linear" first when unsure).

## Moment routing (summary)

Detailed per-moment procedures and write templates live in
`references/moments.md` — consult it when executing a moment. Summary:

| Moment | Reads | Writes | Emit |
|---|---|---|---|
| `decide` | the chart (root issue description + decision comments), then the anchor the decision belongs to | `save_comment` | one-line decision log, at the moment the direction changes (draft → user culls → write) |
| `group` | the chart's open items and its decision comments, in order, plus the body of each relocation destination before changing it | `save_issue` (root description) / `save_issue` or `save_document` (a released item's destination) | axes each naming what it absorbed + every non-axis classified as projection or different-object, with its disposition → user culls → rewritten Open questions |
| `close` | the chart, then current structure (issues + relations, documents) | `save_issue` / `save_document` / `save_comment` | structure-delta checklist + closing note on the root issue + a relation and one pointer on each follow-up → user culls → minimal writes |
| `intake` | the team's Triage issues, then the catalog of root issues | `save_issue` (state, project, `relatedTo`, `duplicateOf`) only | reversible, plain sorts done directly → one after-the-fact report with each item's undo |

## Output discipline

- Every write moment except `intake` shows a draft first and writes only on
  user confirmation (a decision comment, a regrouped open set, and a structure delta are all
  outward, team-visible acts). The user culls the draft, and three reasons
  drop a line: it is derivable by reasoning from what is already recorded, it
  is the product of a mechanical fix rather than a choice, or it does not
  match the unit's intent. Derivability drops an assertion, never a
  representation a moment is required to produce: a `group` axis and the list
  of what it absorbed are derivable from the originals by construction, and
  that is what they are for. Only the slow layer is written — structure and
  decisions — never a state the next read would refresh anyway.
- `intake` inverts that order because every act it may take is reversible
  and plain: it acts, then reports once. An item whose sort is either
  irreversible or a judgment stays in Triage for the user; nothing the user
  would cull is written by it.
- When the pre-write read reveals stale structure (an edge or runbook
  contradicting reality), surface it as a proposed structure fix — do not
  silently rewrite.

## Additional Resources

- **`references/moments.md`** — the pre-write chart read, the `decide`,
  `group`, `close`, and `intake` procedures, decision-comment, axis-collapse, and
  structure-delta templates, and the field caveats that bound what may be
  written.
