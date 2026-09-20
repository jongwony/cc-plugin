---
name: unfold
description: |
  This skill should be used when the user asks to "unfold" the current work
  picture or hits one of six recurring moments in multi-PR / multi-project
  work tracked in Linear: "전체 그림" / "지금 상태 펼쳐줘" / "whole picture"
  (span-open orient), "다음 뭐 하지" / "뭐가 unblocked" / "next action"
  (next), "배포 순서" / "머지 전 확인" / "deploy order" (deploy), "이 길로
  가는 이유 기록" / "결정 남겨줘" / "log this decision" (decide), "세션 정리"
  / "구조 변경 반영" / "wrap up the span" (close), "로드맵" / "게이트 어디까지
  왔지" / "roadmap" (roadmap). Also fires without being named: when the
  accumulated context and the utterance show an intent to write to a
  repository, open the unit's chart first — match that intent against the
  catalog of project root issues and load that one chart, nothing else.
  Reads current state from Linear via MCP; writes ONLY structure and
  decisions (never status). Invoked as /unfold [moment] [project].
---

# Unfold — Linear Loop Moment Router

Route a recurring cognitive moment to the right Linear read or minimal write.
The substrate premise: the whole picture (workstreams, dependency DAG, gates,
runbook) lives in Linear as structure; issue status and milestone % are
auto-derived by Linear and the GitHub integration. Current blocked/unblocked
sets are derived on read from those statuses and stored dependency edges.
Unfold READS that picture on demand instead of reconstructing it from memory,
and confines WRITES to the two moments where a human hand belongs: decisions
and structure deltas.

## Core rule — pace layering

- **Read freely**: issue status and milestone progress % are system-maintained;
  blocked/unblocked sets are derived on read from current statuses and stored
  dependency edges. Never cache-and-trust stale copies.
- **Write only structure and decisions**: new workstream issues, `blockedBy`
  edges, runbook documents, one-line decision comments.
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
  the closing note — a decision carried out, not progress mirrored.

## Invocation

`/unfold [moment] [project]` — both arguments optional.

| Moment | Aliases (EN / KO) | Kind |
|---|---|---|
| `open` | span-open, orient, 전체 그림, 지금 상태 | read |
| `next` | unblocked, next-action, 다음 뭐, 다음 액션 | read |
| `deploy` | pre-deploy, merge-check, 배포 순서, 머지 전 | read |
| `decide` | decision, path, 결정, 왜 이 순서 | **write** (one comment) |
| `close` | span-close, wrap-up, 세션 정리, 구조 반영 | **write** (structure delta) |
| `roadmap` | gates, timeline, 로드맵, 경로 선택 | read |

- No moment argument: infer from the utterance; when nothing matches,
  default to `open` (the most common moment).
- Korean voice input is expected — match aliases semantically, not literally.
- **Write-intent trigger.** When the accumulated context and the utterance
  show an intent to write to a repository — an edit, a branch, a worktree, a
  spawn — and no chart is open for that unit yet, `open` fires before the
  first write, by catalog match (below). The unit's chart is its project's root issue: what
  is wanted, why, under which constraints, and what is still open. Load that
  one chart and nothing beside it; a chart the intent did not select is
  contamination, not context. This plugin ships a PreToolUse hook that carries
  this trigger to the edit tools once per session, staying silent outside the
  repositories whose charts it routes to (`UNFOLD_CHART_OWNERS`). A host that
  loads plugin hooks delivers the trigger without a reader having reached this
  bullet; a host that does not is why the bullet is here.

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
`select:mcp__claude_ai_Linear__list_issues,mcp__claude_ai_Linear__get_issue,mcp__claude_ai_Linear__list_projects,mcp__claude_ai_Linear__list_milestones,mcp__claude_ai_Linear__get_project,mcp__claude_ai_Linear__list_documents,mcp__claude_ai_Linear__get_document,mcp__claude_ai_Linear__list_comments,mcp__claude_ai_Linear__save_comment,mcp__claude_ai_Linear__save_issue,mcp__claude_ai_Linear__save_document,mcp__claude_ai_Linear__get_initiative,mcp__claude_ai_Linear__list_initiatives`
(load only what the moment needs; exact server prefix may differ — discover
with a keyword search on "linear" first when unsure).

## Moment routing (summary)

Detailed per-moment procedures, the unblocked-derivation algorithm, and write
templates live in `references/moments.md` — consult it when executing a
moment. Summary:

| Moment | Reads | Writes | Emit |
|---|---|---|---|
| `open` | project, milestones (%), open issues + relations + blocker statuses, documents | — | current gate + % · unblocked next actions · runbook pointer |
| `next` | open issues + relations + blocker statuses | — | unblocked list only, ranked |
| `deploy` | runbook document | — | ordering invariants section only |
| `decide` | the target issue | `save_comment` | one-line decision log, at the moment the direction changes (draft → user culls → write) |
| `close` | this session's work | `save_issue` / `save_document` / `save_comment` | structure-delta checklist + closing note on the root issue + a relation and one pointer on each follow-up → user culls → minimal writes |
| `roadmap` | initiative, member projects, milestones, decision comments | — (path decisions route to `decide`) | gate timeline + open path decisions |

## Output discipline

- Keep the readout compact: the moment's decision-relevant slice only —
  current gate, its %, and the unblocked set are almost always the payload.
  Do not dump full issue lists or document bodies.
- Every write moment shows a draft first and writes only on user confirmation
  (a decision comment and a structure delta are outward, team-visible acts).
  The user culls the draft, and three reasons drop a line: it is derivable by
  reasoning from what is already recorded, it is the product of a mechanical
  fix rather than a choice, or it does not match the unit's intent. Only the
  slow layer is written — structure and decisions — never a state the next
  read would refresh anyway.
- When a read reveals stale structure (an edge or runbook contradicting
  reality), surface it as a proposed structure fix — do not silently rewrite.

## Additional Resources

- **`references/moments.md`** — per-moment procedures: MCP call sequences,
  the unblocked-derivation algorithm, decision-comment and structure-delta
  templates, roadmap aggregation.
- **`references/catalog.md`** — the design record behind the moments: the
  cognitive-job → representation-form → Linear-realization mapping table,
  the span-coupled habit loop, pinned views, and the prototype evidence.
  Consult when the utterance names a Linear view or representation need
  rather than a clear moment, or when deciding which form a readout should
  take.
