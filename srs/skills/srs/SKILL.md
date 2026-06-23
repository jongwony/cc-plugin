---
name: srs
description: |
  This skill should be used when the user asks to "make flashcards", "turn these
  notes into cards", "add this to Anki", "push cards to Anki", "make Anki cards
  from X", or wants to capture something for spaced-repetition study. It drafts
  Q/A cards from the user's material, stages them with provenance, and pushes
  them into Anki via the AnkiConnect addon. Anki owns review, scheduling, and
  visualization — this skill owns capture + provenance, not the review loop.
  Also triggers for automated invocation via /loop 1d /srs:srs push.
argument-hint: "[add|list|push]"
---

# SRS — Card Generator + Anki Push

A personal card *generator* for spaced repetition. It drafts flashcards from your
Extended Mind (notes, decks, Claude sessions), stages them in
`~/.claude/srs/cards.json` with provenance, and pushes them into **Anki** through
the AnkiConnect addon. **Anki owns review, scheduling, and visualization** — this
tool deliberately does not reimplement a review loop (Anki does it better).
Respond in the user's language.

The engine is one self-contained script — reference it as:

```
${CLAUDE_PLUGIN_ROOT}/skills/srs/scripts/srs.py
```

Run every subcommand through `uv run`:

```
uv run ${CLAUDE_PLUGIN_ROOT}/skills/srs/scripts/srs.py <subcommand> [args]
```

## Prerequisite

Pushing needs **Anki running with the [AnkiConnect](https://ankiweb.net/shared/info/2055492159) addon** (listens on `http://127.0.0.1:8765`). If Anki is closed, `push` fails with an actionable message — start Anki (`open -a Anki`) and retry. Override the endpoint with `ANKICONNECT_URL`; override the store dir with `SRS_DATA_DIR`.

## Subcommands

| Input | Behavior |
|-------|----------|
| `add` | Stage one card — from `--id/--front/--back/--source-ref/--tag/--deck` flags, or a JSON object on stdin (skips a duplicate `id`) |
| `list` | List staged cards as JSON (`--unpushed` for only un-pushed) |
| `push` | Push staged cards into Anki via AnkiConnect (`--all` re-pushes everything; `--dry-run` prints the payload without sending) |

The store is a **staging ledger**: each card records `pushed` (date or null) and
`anki_note_id`, so re-running `push` (including from `/loop`) only sends new cards
— never double-creates.

## How Claude uses it (the generation step)

Card *drafting* is Claude's job (it is heuristic, not deterministic, so it lives
here, not in the script). When the user points at material to study:

1. Read the source (a note, a deck slide, a passage, a session excerpt).
2. Draft tight Q/A cards — one idea per card; the `front` prompts recall, the
   `back` gives the answer plus the "aha" link (e.g. a root → meaning bridge).
3. `add` each card, filling **`--source-ref`** with where it came from
   (`note-123#p2`, `etymonline.com/word/salience`) — provenance that rides into
   Anki as a `src::<ref>` tag, linking each card back to the Extended Mind.
4. `push` to Anki. Report how many landed (and any duplicates Anki rejected).

```bash
# stage (flags)
uv run ${CLAUDE_PLUGIN_ROOT}/skills/srs/scripts/srs.py add \
  --id "etymonline#salience" --front "salience — 어근과 '두드러짐'의 연결?" \
  --back "라틴 salire '뛰다' + -ence → 튀어나옴 → 두드러짐 (punctum saliens)" \
  --source-ref "etymonline.com/word/salience" --tag etymology --deck "Etymology"

# stage (JSON on stdin)
echo '{"id":"deck.html#s3","front":"...","back":"...","source_refs":["deck.html#s3"]}' \
  | uv run ${CLAUDE_PLUGIN_ROOT}/skills/srs/scripts/srs.py add

# inspect, then push to Anki
uv run ${CLAUDE_PLUGIN_ROOT}/skills/srs/scripts/srs.py list --unpushed
uv run ${CLAUDE_PLUGIN_ROOT}/skills/srs/scripts/srs.py push
```

Cards land in the `--deck` deck (default **"Extended Mind"**) using Anki's
**Basic** note type (Front/Back). `source_refs` and any `--tag` become Anki tags.

## Reviewing

Review happens **in Anki** — open Anki and study the deck (desktop, mobile,
AnkiWeb, with full scheduling and stats). This tool intentionally has no `review`
subcommand; pushing the card hands it to Anki's scheduler.

## Daily run

Flush any newly-staged cards into Anki once a day via the existing `/loop` skill:

```
/loop 1d /srs:srs push
```

Plugin skills are namespaced as `{plugin-name}:{skill-name}`; the bare `/srs`
form only resolves for a user-level skill installation. The `pushed` ledger makes
this safe to repeat — already-pushed cards are skipped. (Anki must be running for
the push to land; otherwise the loop reports the connection error and the cards
stay staged for the next run.) No separate scheduler code — `/loop` carries the
cadence, Anki carries the spacing.
