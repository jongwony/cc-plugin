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
  왔지" / "roadmap" (roadmap). Reads auto-derived state from Linear via MCP;
  writes ONLY structure and decisions (never status). Invoked as
  /unfold [moment] [project].
---

# Unfold — Linear Loop Moment Router

Route a recurring cognitive moment to the right Linear read or minimal write.
The substrate premise: the whole picture (workstreams, dependency DAG, gates,
runbook) lives in Linear as structure; state (issue status, milestone %,
blocked-relations) is auto-derived by Linear and the GitHub integration.
Unfold READS that picture on demand instead of reconstructing it from memory,
and confines WRITES to the two moments where a human hand belongs: decisions
and structure deltas.

## Core rule — pace layering

- **Read freely**: issue status, milestone progress %, blocked/unblocked sets
  are system-maintained. Pull them; never cache-and-trust stale copies.
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
  and automation owns the state from then on.

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

## Project resolution

Resolve the target Linear project in this order; never hardcode project IDs:

1. Explicit `[project]` argument (name, ID, or slug).
2. Infer from the working repo: take the git repo directory name (and, if
   present, the current worktree/branch's issue identifier like `FD-123`) and
   query Linear (`list_projects` with a name query, or `get_issue` on the
   identifier and read its project).
3. Ambiguous or no match: list the user's in-progress lead projects and ask
   once. Reuse the resolved project for the rest of the session.

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
| `open` | project, milestones (%), open issues + relations, documents | — | current gate + % · unblocked next actions · runbook pointer |
| `next` | open issues + relations | — | unblocked list only, ranked |
| `deploy` | runbook document | — | ordering invariants section only |
| `decide` | the target issue | `save_comment` | one-line decision log (draft → confirm → write) |
| `close` | this session's work | `save_issue` / `save_document` | structure-delta checklist → minimal writes |
| `roadmap` | initiative, member projects, milestones, decision comments | — (path decisions route to `decide`) | gate timeline + open path decisions |

## Output discipline

- Keep the readout compact: the moment's decision-relevant slice only —
  current gate, its %, and the unblocked set are almost always the payload.
  Do not dump full issue lists or document bodies.
- Every write moment shows a draft first and writes only on user confirmation
  (a decision comment and a structure delta are outward, team-visible acts).
- When a read reveals stale structure (an edge or runbook contradicting
  reality), surface it as a proposed structure fix — do not silently rewrite.

## Additional Resources

- **`references/moments.md`** — per-moment procedures: MCP call sequences,
  the unblocked-derivation algorithm, decision-comment and structure-delta
  templates, roadmap aggregation.
