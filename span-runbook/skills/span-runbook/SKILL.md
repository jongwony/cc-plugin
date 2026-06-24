---
name: span-runbook
description: >
  This skill should be used when authoring or running a Span Runbook — a reusable,
  resumable stage contract for a backgrounded worker (a "Span": a remote-spawn
  `claude --remote-control` session whose scope exceeds one context lifecycle).
  Trigger when the user asks to "write a Span Runbook", "author a runbook for this
  worker", "make this span resumable/observable", "Span Runbook 작성", "이 작업
  재개 가능하게 런북으로", or when scoping long-horizon work that must stay observable
  and resumable across session boundaries. Not for sub-Span work that fits one context
  lifecycle — that is a subagent and needs no runbook.
---

# Span Runbook

A **Span Runbook** is a reusable stage contract for resumable, externally observed
execution. It fixes what a Span does, when to gate out, and what capsule each stage
leaves behind — while every run's state lives OUTSIDE the document. The Runbook is the
durable recipe; a run is its live instance.

A **Span** is a backgrounded worker (a `remote-spawn` `claude --remote-control`
session) reserved for work whose scope exceeds one context lifecycle. Sub-Span work
that fits a single session goes to a subagent and needs no Runbook. Spans may chain
(one hands off to the next, linear) but never nest — a worker does not spawn or
supervise sub-workers; only the supervisor holds that role, capping the graph at one
supervised level.

This is the first codified subtype of a more general Runbook idea (any reusable, staged
work that stays observable and resumable across session boundaries); the general form is
held in reserve, and the Runbook is deliberately scoped to Spans — it does not swallow
skills, protocols, checklists, or review loops.

## Schemas in, state out

Pace-layer the two. The Runbook is the *slow* layer: schemas, contracts, and policies
only, with no mutable progress written into it. Run state is the *fast* layer kept
outside it:

- The global **TaskList** carries progress status, projecting a *pointer* into the
  sidecar — it is not itself the resume ledger.
- A run **sidecar** holds the checkpoint capsule plus the resume handle and harvest
  pointer. Record **re-queryable `source_refs`** for the resume/harvest schema — sources
  followed on need (e.g. on error), not snapshots transcribed into the slow layer.

## Gate-out policy

A Span resolves ordinary forks in place; it interrupts no one for a decision the circle
can re-absorb. It gates OUT only when a fork would:

1. violate an explicit constraint of its brief,
2. change its scope,
3. change its stop condition, or
4. create new durable substrate beyond its declared state surfaces.

On those four, the Span surfaces the fork instead of resolving it, and the supervisor
relays the block outward to the user rather than deciding it on the Span's behalf.

## Template

Author a Span Runbook against this shape:

```md
# <Name> — Span Runbook
Purpose / When to use
Inputs
Outputs / Stop condition
Authority and gate-out policy
State surfaces (TaskList projection schema · run sidecar/capsule path convention ·
  re-queryable source_refs for the resume/harvest schema — followed on need, not transcribed)
Stages:  goal · tool/protocol invocation · budget · input capsule · output capsule · validation · gate-out triggers
Harvest / Resume contract
References
```

## Resume / Harvest

A run resumes by reading its TaskList pointer → sidecar → following `source_refs` to
re-derive context, then continuing from the last checkpoint capsule. It harvests by
writing its output capsule and harvest pointer back to the sidecar. The Runbook names
where these live (the path convention); each run fills them.
