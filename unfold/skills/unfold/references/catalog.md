# Linear Loop Catalog — cognitive job → representation form → Linear realization

The design record behind the six moments: why each recurring cognitive job gets
the representation form it does, and how that form is realized in Linear. The
skill's per-moment procedures live in `moments.md`; consult this catalog when
the utterance names a *view or representation need* rather than a clear moment,
or when deciding which form a readout should take.

Lineage: a representation-form rubric (which form fits which cognitive job) ×
live verification of the Linear MCP write/read surface × a real-project
prototype (Airflow 2→3 migration, "af3", 2026-07). The evidence section below
records what the prototype proved.

## Core rule — pace layering

**Carry structure, derive state — no hand-mirroring.**

- **SLOW (hand-written once)**: runbook documents (topology, order,
  invariants), milestone gates, the issue tree, `blocks`/`blockedBy`
  dependency edges, decision comments. Updated only when the plan changes.
- **FAST (system-maintained, never touched by hand)**: issue status (the
  GitHub integration transitions it on PR events), milestone progress %
  (auto-computed), blocked relations (Linear auto-demotes them when the
  blocker completes), live facts (image existence, deploy applied — never
  stored in Linear; read from their source).
- Why: manual mirroring leads to missed updates → accumulated error → a stale
  whole-picture read back as truth — context pollution. Making the manual
  surface zero removes that chain entirely.
- Permanently manual in Linear (do not use as state carriers): project health
  (On track / At risk — officially never automated), initiative health,
  closing a milestone itself (only its % is automatic), release stages
  (require their own CI calls).

## Mapping table: cognitive job → rubric form → Linear realization

Rubric rule: **the job axis (why you are looking) picks the form family; the
content-topology axis (graph vs linear) picks prose vs visual.** This is a
pure lookup table — not a convergence loop.

| Cognitive job (why) | Content (topology) | Form the rubric picks | Linear realization (MCP-verified) |
|---|---|---|---|
| Re-see the whole picture, extract actions (review-and-orient) | multi-PR dependencies, parallel (graph) | **visual map** — dependency diagram | `blocks`/`blockedBy` DAG → Linear graph/board views (native, always queryable) |
| What deploys next? what is unblocked? (execute-and-resume / live-monitor) | graph | prose runbook + small dependency view / status board | "unblocked" filtered issue list + milestone gates |
| Runbook distill → fresh session (execute-and-resume) | linear procedure | **cold markdown runbook** (the only cell that routes to authoring protocols) | project `save_document` |
| Where are we right now? (live-monitor) | linear | status board / state readout | `list_*` reads → local cache → a one-line statusline |
| Why this order? path selection (decide) | linear narrative | causal / decision log | issue or project `save_comment` — decision threads |

## Habit loop — coupling to session spans

The shift this catalog encodes: **from reconstructing the whole picture in
your head to reading it from Linear.** The head is reserved for path
selection (decide). The loop couples to a span (one context lifecycle): read
the whole when opening, write back only the part's structural delta when
closing.

| Moment (trigger) | Skill moment | Job | Where to read / write |
|---|---|---|---|
| Opening a span (session start) | `open` | read: current gate + unblocked set, then start | project overview (milestone % + runbook pointer) → unblocked filter |
| "What next?" | `next` | read: ONLY the unblocked set — never scan the whole board | "not done & no blockers" filter (items surface here automatically when blockers complete) |
| Right before deploy/merge | `deploy` | read: ordering invariants (not status) | project runbook document, ordering-invariants section |
| Choosing a path | `decide` | **write (the only recurring hand-write)**: one line on why this path | `save_comment` on the issue (or project) — decision log |
| Closing a span (/clear, distill, worker exit) | `close` | write: structural deltas only — new workstream issues, edge changes, runbook updates; distilled handoffs → project doc | `save_issue` (blockedBy) / `save_document`. State is not written |
| Weekly / roadmap | `roadmap` | read + choose: path decisions over the gate timeline; record choices as comments | initiative timeline + milestone % + decision threads |

Three views worth pinning in the Linear UI: ① project overview (gates +
runbook), ② a saved "unblocked" view (saved once in the UI — views cannot be
created via the API), ③ the initiative timeline. On the terminal side, a
statusline cache can carry the one-line readout (pull-based at session start —
webhooks do not cover milestones).

## Evidence (af3 prototype)

- Structure only was written; the first read-back already showed gate 1 at
  100% and gate 2 at 25%, auto-computed.
- The automatic chain: `PR merge → issue auto-Done → gate % auto-updates →
  successor issue's blocked relation auto-clears → the next action surfaces
  in the unblocked filter` — no hand anywhere in the chain.
- One precondition: the team's Git automations mapping (Team Settings →
  Workflow) must be on for the first link to fire, and the PR must reference
  the issue (identifier in the branch name, or a magic word in the PR body).
