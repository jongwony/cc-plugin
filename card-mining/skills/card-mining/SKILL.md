---
name: card-mining
description: |
  This skill should be used when the user asks to "mine cards from my sessions",
  "make Anki cards about <topic> from my history", "mine flashcards", "card-mine
  <topic>", or wants to harvest spaced-repetition cards from their cross-project
  Claude session archive about some topic or vague recall. It runs ONE
  user-attended Span: recall the relevant sessions, gather evidence, abstract
  patterns, let the user select, render selected items into cards, and push them
  to Anki (TEST deck first). Composes the epistemic protocols and the srs push
  tool — it does NOT reimplement them. Distinct from `srs` (which drafts cards
  from material you point at directly); card-mining is the archive-mining Span.
argument-hint: "<topic> [--dry-run] | resume <run-id> | harvest <run-id>"
---

# Card-Mining Span

Mine flashcards from your **cross-project Claude session archive** by composing
existing capability. This skill is an **orchestration recipe**, not an engine:
the epistemic protocols do the thinking, a thin helper holds the run state, and
the sibling `srs` plugin does the Anki push. Respond in the user's language.

> **State lives outside this doc.** Two surfaces:
> - **TaskList** — project each stage to a Task (`pending`/`in_progress`/`blocked`/`completed`) so progress is visible in ClaudePanel.
> - **Run sidecar** — `~/.claude/srs/runs/<run-id>/run.json`, the resume ledger (per-stage checkpoint capsules + source_refs + resume handle). Written through the helper. TaskList *points* here; it is not the ledger.

## Tools this Span composes

| Role | What | How to reference |
|------|------|------------------|
| Sidecar + selection renderer (this plugin) | `card_mining.py` — `init` / `capsule` / `status` / `render` | `uv run ${CLAUDE_PLUGIN_ROOT}/skills/card-mining/scripts/card_mining.py` |
| Anki push (sibling `srs` plugin) | `srs.py` — `add` / `push` | the `srs` plugin's `skills/srs/scripts/srs.py` (install it from this marketplace; it carries its own plugin root via `/srs:srs`) |
| Protocols (installed skills) | `/ascend` `/inquire` `/induce` `/elicit` | invoked at run time — **never reimplement them here** |

Set once per run for the commands below:

```bash
CM="uv run ${CLAUDE_PLUGIN_ROOT}/skills/card-mining/scripts/card_mining.py"
SRS="uv run <path-to-srs-plugin>/skills/srs/scripts/srs.py"   # the sibling srs plugin
```

## Prerequisites

- The protocol skills (`/ascend` `/inquire` `/induce` `/elicit`) installed.
- The sibling **`srs`** plugin installed (push step), and for a live push, **Anki running with the AnkiConnect addon** (`open -a Anki`).
- Session archive at `~/.claude/projects/<project-slug>/` (`hypomnesis/` summaries + `<session-uuid>.jsonl` raw), cross-project.

## Authority and gate-out policy

- This Span **resolves ORDINARY forks in place** — which evidence spans to read, induce refinements, card phrasing.
- **Gate OUT to the user** (relay the fork, do not decide it) when a step: contradicts an explicit constraint here · changes scope or the stop condition · or creates new durable substrate (a new skill, a write to a non-TEST Anki deck).
- **Selection (stage 5)** and any **live push (stage 7)** are *always* user gates, answered by the user directly.

## Run lifecycle

```bash
# start a run (prints run-id on line 1, sidecar path on line 2)
RUN=$($CM init "<topic>" | head -1)          # add --dry-run for selection-table-only
$CM status "$RUN"                            # per-stage status + resume handle
```

After each stage, checkpoint to the sidecar **and** update the matching Task.
A capsule is a small, source-backed JSON patch piped on stdin
(`in`/`out`/`source_refs`/`status`), e.g.:

```bash
echo '{"out": {...stage output...}, "source_refs": ["projects/<slug>/<sess>.jsonl#L120-160"]}' \
  | $CM capsule "$RUN" --stage 2 --status completed
```

## Stages

Each stage: **goal · protocol invocation · budget · checkpoint · validation · gate-out.**

1. **Recall** — `/ascend <topic>` → a session group. Budget: 1× ascend.
   Checkpoint stage 1: `out` = recognized unit + per-deposit source/resume handles; `source_refs` ≥ 1.
   Validate: ≥ 1 source handle. **Gate-out:** the recognized unit is ambiguous.
2. **Gather** — `/inquire` over the session group → bounded evidence. Budget: bounded source spans only (read raw `~/.claude/projects/<slug>/<session>.jsonl` only for those spans; cross-project `rg` only as a fallback).
   Checkpoint stage 2: `out` = evidence items, **each with `source_refs`**.
   Validate: every item has source_refs. **Gate-out:** the `rg` fallback exceeds budget.
3. **Abstract** — `/induce` → patterns. Budget: max 5 refine cycles.
   Checkpoint stage 3: `out` = patterns + source_refs. Validate: each pattern traces to sources.
4. **Sharpen** — `/elicit` **only if** the carding intent is axis-undetermined; else **skip**.
   Checkpoint: `--status skipped` (or `completed` with the sharpened axis). Skipped stages do not block resume.
5. **Select** — emit **ONE table**, classified from the induce output + source_refs (not prose):

   | id | claim/pattern | source_refs | bucket | confidence | proposed | reason |
   |----|---------------|-------------|--------|------------|----------|--------|

   `bucket ∈ {memorize, continuous_cognition, layout_only}` — **only `memorize` becomes a card.**
   Store the table as the stage-5 capsule, then **gate to the user** for the picked ids:
   ```bash
   echo '{"out": {"table": [ {"id":"c1","claim":"...","source_refs":["..."],"bucket":"memorize","confidence":"high","proposed":true,"reason":"..."}, ... ]}, "status":"completed"}' \
     | $CM capsule "$RUN" --stage 5
   ```
   Validate: reject source-less candidates (the renderer enforces this too). **Gate-out:** user selection (always).
6. **Render** — selected ids → card notes. Card front/back **drafting is your heuristic job** (one idea per card; the front prompts recall, the back gives the answer plus the "aha" link). The helper does the deterministic join: it keeps only picked **memorize** rows, rejects source-less ones, pulls `source_refs` from the table, and stamps a staleness tag (`mining-run::<run-id>`, `mined-as-of::<date>`). Pipe your drafted bodies in (keyed by row id), pipe the rendered card JSONL straight into `srs add`:
   ```bash
   $CM render "$RUN" --pick c1,c3 --deck TEST <<'BODIES' \
     | while IFS= read -r card; do printf '%s' "$card" | $SRS add; done
   {"c1": {"front": "...", "back": "...", "extra": "optional — appended to back", "tags": ["topic"]},
    "c3": {"front": "...", "back": "..."}}
   BODIES
   ```
   The rendered cards are also persisted as the stage-6 capsule (resume-safe). Then checkpoint stage 6 `--status completed`.
7. **Push** — via the `srs` tool; **TEST deck first** (the renderer defaults `--deck TEST`).
   ```bash
   $SRS push --dry-run     # inspect the AnkiConnect payload, no contact
   $SRS push               # land in the TEST deck
   ```
   **Gate-out:** a live push to a **real** (non-TEST) deck — get the user's go, then re-render with `--deck "<real deck>"` (or re-stage) before pushing. In a `--dry-run` run, stop after the selection table with no push.

## Stop condition

User-selected `memorize` cards pushed to Anki (TEST deck) + a short report. In dry-run mode: the selection table delivered, no push.

## Harvest / Resume

- **Harvest** `harvest <run-id>` — read the sidecar (`$CM status "$RUN"`) + the TaskList. Deliverable = the selection table + pushed-card count + the sidecar pointer.
- **Resume** `resume <run-id>` — on kill, `$CM status "$RUN"` prints the resume handle (first non-completed stage). Re-enter there using that stage's **input capsule** from the sidecar; do not redo completed stages.

## Constraints

Personal, lightweight, **compose — do not reimplement**. New code → feature branch → PR (merge is user-held). **Dry-run before any live push.** Every card carries `source_refs`; source-less candidates never become cards.
