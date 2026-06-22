---
name: srs
description: |
  This skill should be used when the user asks to "review my cards", "do my
  spaced repetition", "srs review", "what's due today", "add a flashcard",
  "grade a card", or wants to study/recall saved notes on a spacing schedule.
  A personal, single-user spaced-repetition (SRS) card store with an SM-2-style
  scheduler — cards live in ~/.claude/srs/cards.json, reviewed interactively
  over stdin. Also triggers for automated invocation via /loop 1d /srs:srs review.
  Distinct from note-taking or summarization: this schedules recall, not capture.
argument-hint: "[review|due|add|grade]"
---

# SRS — Personal Spaced Repetition

A lightweight, single-user spaced-repetition tool. Cards are stored in
`~/.claude/srs/cards.json`; the scheduler is an SM-2-style scheme (SM-2 is the
classic SuperMemo spacing algorithm). Pure Python standard library, run via `uv`.
Respond in the user's language.

The engine is one self-contained script — reference it as:

```
${CLAUDE_PLUGIN_ROOT}/skills/srs/scripts/srs.py
```

Run every subcommand through `uv run` so the inline PEP 723 metadata resolves:

```
uv run ${CLAUDE_PLUGIN_ROOT}/skills/srs/scripts/srs.py <subcommand> [args]
```

## Subcommands

| Input | Behavior |
|-------|----------|
| (empty) | Default to `review` — run the interactive loop over due cards |
| `review` | Interactive review loop (the primary surface; see below) |
| `due` | Print cards due today or earlier, as a JSON array |
| `add` | Append one card — from `--id/--front/--back/--source-ref` flags, or a JSON object on stdin |
| `grade <id> <again\|hard\|good\|easy>` | Apply a grade to one card and reschedule it |

State directory override: set `SRS_DATA_DIR` to point the store somewhere other
than `~/.claude/srs` (useful for testing without touching real cards).

## Review loop (primary surface)

`review` is interactive over stdin — no AI model sits in the per-card loop, so it
is the lightest surface. It loads due cards, then for each one:

1. prints the `front` (the question),
2. waits for you to recall, then on Enter prints the `back` (the answer) and any `source_refs`,
3. reads a grade from stdin and reschedules the card.

Grade keys accept the full word, its first letter, or a number, plus skip/quit:

```
1 / a / again    2 / h / hard    3 / g / good    4 / e / easy    s = skip    q = quit
```

Each grade is persisted immediately, so quitting mid-session keeps the progress so
far. When nothing is due, the loop says so and exits.

## Adding cards

Two equivalent forms — pick whichever the caller has on hand:

```bash
# flags
uv run ${CLAUDE_PLUGIN_ROOT}/skills/srs/scripts/srs.py add \
  --id note-123#p2 --front "What does SM-2 schedule?" \
  --back "The next review interval from ease × prior interval." \
  --source-ref "note-123#p2"

# JSON object on stdin
echo '{"id":"deck.html#slide-3","front":"...","back":"...","source_refs":["deck.html#slide-3"]}' \
  | uv run ${CLAUDE_PLUGIN_ROOT}/skills/srs/scripts/srs.py add
```

`source_refs` is provenance metadata (e.g. `"note-123#p2"`, `"deck.html#slide-3"`)
— whatever creates a card fills it in; the engine just stores and surfaces it.
A new card defaults to ease 2.5, reps 0, interval 0, lapses 0, and is due today
(so it shows up in the next review). Re-adding an existing `id` is a no-op (skip).

## Scheduling (SM-2-style)

On `grade`, `reps` is read **before** it is updated; the first-review guards give a
fresh card an absolute interval so an initial `interval_days = 0` is never
multiplied into zero:

- **again** — interval → 1 day; ease − 0.2; lapses + 1; reps reset to 0 (a lapse restarts the ladder)
- **hard** — first review → 1 day, else interval × 1.2; ease − 0.15; reps + 1
- **good** — first → 1 day, second → 3 days, else interval × ease; reps + 1
- **easy** — first → 3 days, else interval × (ease + 0.15) × 1.3; ease + 0.15; reps + 1

After every grade: ease is clamped to a floor of 1.3, `last_reviewed` is set to
today, and `due` becomes today + round(interval) days.

## Daily run

Review once a day via the existing `/loop` skill, using the namespaced skill form:

```
/loop 1d /srs:srs review
```

Plugin skills are namespaced as `{plugin-name}:{skill-name}`; the bare `/srs` form
only resolves for a user-level skill installation. No separate scheduler code — the
`/loop` skill carries the cadence.
