---
name: make-deck
description: Generate a self-contained HTML slide deck from organized notes. Use whenever the user wants to turn notes, a doc, or session content into a presentation, slides, or a deck. The skill surfaces the audience/difficulty/density/time/scope dimensions progressively (never an all-at-once panel), fills a bundled layout-catalog skeleton (10 layouts, 4 narrative ZONEs, clawd mascot decorators), derives slide count from talk length, and outputs one portable HTML file with assets inlined.
---

# Make Deck

Turn an already-organized set of notes into a presentation-ready HTML slide deck.

Invoke with `/make-deck` (optionally `/make-deck <path-to-notes>`) when the user wants
slides or a deck from content they already have.

This skill is **self-contained and portable**: it carries its own template, mascot assets,
and dimension reference. It does not depend on any other plugin. The dimension-elicitation
step below embeds the *method* of progressive reverse-elicitation inline — you run it
directly, no external protocol call required.

## When to Use

- User has notes / a summary / a doc and wants a slide deck or presentation built from it.
- User says "make a deck", "turn this into slides", "발표 자료 만들어줘", "슬라이드로".

## Skip When

- The source is raw and unorganized (many transcripts, scattered files). This skill
  **assumes the notes are already digestible**. If they are not, summarize/organize first
  (e.g. parallel-summarize into a notes doc), then invoke this skill on the result.
- The user wants a non-slide artifact (blog post, doc) — use a writing skill instead.

## Inputs

- **Source notes** — a path passed as the argument, a file in context, or pasted content.
  Treated read-only as the substrate you elicit dimensions from and fill slides with.

## Workflow

```
READ notes → ELICIT dimensions (progressive) → DERIVE slide count → OUTLINE gate
  → FILL skeleton → GENERATE self-contained HTML → REFINE (per-slide feedback)
```

### 1. Read the notes

Read the source. Identify its natural sections — these become candidate slides. Do not
ask anything yet.

### 2. Elicit dimensions — progressively (inline reverse-elicitation)

Read `references/dimensions.md`. It lists the five dimensions that shape a deck:
**audience, difficulty/technical-depth, brevity/density, presentation-time, scope/angle.**

Surface them **progressively, grounded in the notes** — this ordering matters and is the
core method:

1. **Density/form first** — "presentation-core only, or core + a detailed appendix?"
2. **Then scope/angle** — "faithful to these notes, or reframed toward a goal (which may
   add or drop content)?" — bundle the audience + difficulty questions here, since they
   co-determine scope.
3. **Then time** — "how long is the talk?" → you derive slide count, you don't ask it.

Rules for this step:
- **Recognition over recall.** Use `AskUserQuestion` with concrete options drawn from the
  notes, not open prompts. Propose a substrate-cited default for each ("these notes are
  mostly conceptual, so I'd default to analogy-centric — agree?").
- **Don't ask all five at once.** One cluster per turn; later clusters can shift based on
  earlier answers. Audience especially tends to get refined after a first pass — leave room.
- **Cite the notes** when proposing a value. Every question carries evidence.

### 3. Derive slide count from time

~1 slide per 1.3–1.7 min. 20 min ≈ 12–16 slides. Scale **within** the four ZONEs (grow
Part 1 / Part 2) using the skeleton's parallel-add convention — never break the ZONE
structure to hit a number.

### 4. Outline gate (confirm before generating)

Propose a ZONE plan as text: which notes map to which ZONE → slide → layout, with the
derived slide count. Get a yes before generating the full deck. This is cheap insurance
against regenerating 14 slides on a wrong premise.

### 5. Fill the skeleton

Copy `assets/templates/deck-skeleton.html` to the output path, then fill it. **Read the
skeleton's own top comment and per-slide `[LAYOUT N/10]` comments first** — they are the
authoritative convention reference (10 layout classes, 4 ZONEs, mascot rule, talk cues,
parallel-add anchors, color tokens). Key points:

- **Keep the layout classes**; replace only the `{{...}}` placeholder content.
- **Every `<section class="slide">` gets one mascot** `<object class="deco" ...>` right
  after `chrome-tl` (see the skeleton's mascot convention block). Pick a pose from
  `assets/clawd-*.svg` that fits the slide's tone.
- Add slides by inserting before a ZONE's closing `<!-- ══ /ZONE: X ══ -->` anchor.
- Fill `talk` presenter cues, `chrome-bl` labels, `chrome-br` counts.
- Recolor via the three `:root` tokens (`--blue/--purple/--amber`) only if the user wants.

### 6. Generate a self-contained single file

Output one portable HTML file. **Inline each referenced mascot SVG as a data-URI** so the
deck needs no sibling files: replace `<object data="../clawd-X.svg">` with
`<object data="data:image/svg+xml;base64,...">` (base64 of that SVG), or inline the `<svg>`
directly. User-supplied images (`{{...png}}` placeholders) stay as the user's own asset
references unless the user wants them inlined too.

Default output path: alongside the notes, named `YYYY-MM-DD-<topic>-deck.html`.

### 7. Refine loop

Present the deck. Take per-slide feedback ("drop slide 14", "I don't get slide 11") and
revise in place. Decks converge through pruning — expect it.

## Skeleton reference

The bundled template (`assets/templates/deck-skeleton.html`) is a layout catalog: one
example slide per layout, with narrative-function comments. Its 10 layouts —
`lay-cover / lay-statement / lay-divider / lay-split(.rev) / lay-twocol / lay-clips /
lay-list / lay-cue / lay-bleed / lay-checklist` — map onto 4 ZONEs:

- **오프닝** — cover, one-line thesis, headline collage, audience cue
- **Part 1 (왜)** — concept/why: split, list, two-column contrast
- **Part 2 (실습/본문)** — divider transition, full-bleed impact, worked examples
- **Part 3 + 마무리** — closing dialogue cue, summary checklist

Treat the 4 ZONEs as the fixed methodology; swap only the topic and content.

## Assets

- `assets/templates/deck-skeleton.html` — the layout-catalog template (fill, don't restructure).
- `assets/clawd-*.svg` — 19 normalized mascot poses (viewBox `-15 -25 45 45`).
- `references/dimensions.md` — the five elicitation dimensions + pose guide.
