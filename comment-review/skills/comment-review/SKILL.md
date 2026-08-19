---
name: comment-review
description: "Review a markdown or HTML artifact in a live browser preview: right-click any element to anchor a comment by CSS selector, then have those comments applied back as edits to the source file. Markdown renders through marked into the light DOM; HTML is served raw through a Shadow DOM. Comments queue to feedback-{slug}.jsonl and the page hot-reloads whenever the source changes. User-invoked via /comment-review."
---

# Comment Review

Open an artifact in a browser as it will actually be read, annotate it in place, and get
those annotations back as edits to the source. That loop is the whole skill.

The render substrate is keyed off the file extension: markdown (`.md`) renders through
marked; HTML (`.html`/`.htm`) is served raw through a Shadow DOM. Anchoring does not branch
on the extension — either way you right-click an element and the browser records that
element's unique CSS selector.

The skill is agnostic about *what kind of artifact* is under review: blog drafts, plan
documents, handoffs, design docs, and changeset descriptions are all valid targets. It also
supplies no judgment of its own. It carries comments in one direction and edits back in the
other; deciding what is worth commenting on stays with the user.

## Caller Signature

```
/comment-review(artifact_path)

artifact_path : String | List<String>   -- markdown or HTML file(s); render substrate keys off the extension
```

Write the artifact under review to the session scratchpad and point the skill at it there.
No path under a harness config directory is referenced: where such a directory sits varies
by substrate, and pinning an inference rule to one substrate's layout would make the rule
wrong everywhere else.

## Loop Overview

```
Phase 0  : channel open (browser, rendered preview)
Phase L  : round k
             user right-clicks elements in the browser and leaves comments
             user says so in chat → AI applies the queued comments as edits
             source changes → browser hot-reloads → round k+1
free-exit : the user may end the review at any time by saying so (Phase 0 prose declares this once)
```

## When to Use

- Any markdown or HTML artifact you want to read as rendered before editing it
- Editorial iteration over multiple turns is expected
- Asynchronous comment-style feedback fits the review rhythm better than chat-gate dispositions
- Layout, cadence, and typography matter to the judgment — they are only visible rendered

## When NOT to Use

- Trivial artifacts (single sentence, typo, comment fix) — direct Edit suffices
- One-shot artifacts the user does not intend to revise

## Phase 0: Channel Open

1. **Bun preflight** — verify `bun --version` ≥ 1.0. If absent, print the install hint
   (`curl -fsSL https://bun.sh/install | bash`) and exit. The channel is the skill's
   identity; running without it would change what `/comment-review` *is*, not just degrade
   the experience.
2. **Termination prose (declared once)** — announce *before opening the browser*: *"I'll
   open a browser preview. You can end this review at any time by saying so; on exit I will
   produce the materialized view and stop the channel server."* This is the free-response
   pathway for termination. Announcing it first puts the exit affordance in view before the
   first session artifact (the rendered preview) is.
3. **Channel open** — launching the channel server is a write/exec action. When the harness
   restricts non-read-only actions behind a permission gate, surface that gate for approval
   before launching; proceed once it is cleared. Then start
   `bun "${CLAUDE_PLUGIN_ROOT}/skills/comment-review/scripts/serve.ts" <artifact.md|artifact.html> [...]`;
   the browser auto-opens to the rendered preview. The path goes through
   `CLAUDE_PLUGIN_ROOT` because this runs with the user's project as the working directory,
   not the skill directory — a bare `scripts/serve.ts` resolves against the caller and is not
   found.
   Launch it in the background and keep the process handle (or PID) for the session: the
   server runs until the review ends, so a foreground launch blocks the agent for the whole
   review. Treat the `serving at …` line on stdout as the start confirmation. On termination,
   stop the server through that handle — the exit promise in step 2 is only keepable if
   something was kept to stop it with.
4. **Round 1 entry** — surface the queue size for this artifact, or "No prior comments —
   fresh start." A slug widens when two artifacts would otherwise share one, so the same
   artifact can have left a queue under a different name in an earlier session: look beside
   the source for any `feedback-*.jsonl` whose entries carry this artifact's path, not only
   the current slug's file. Name any queue found under an earlier slug when you surface it,
   so a carryover the current name would have hidden is visible rather than silently absent.

## Phase L: Round Loop

Each round is the same three beats: the user comments in the browser, says so in chat, and
the AI applies the queue as edits. There is no branch gate — the loop has one shape.

**Pre-round prose** (per round) — surface the round counter and the apply load, so the user
always knows where they are:

```
Round 1 — browser preview opened. {N comments in queue from prior session. | No prior comments — fresh start.}

Round {k} complete — {X} applied{, {Y} deferred}.    -- Y omitted when 0
Browser preview reflects the latest edits.
```

**Round signal**: the user's chat turn *is* the round-complete signal. No separate browser
button is needed — the browser collects comments, chat marks the boundary. "Wait, I'm still
commenting" is implicit in not yet sending that turn; the queue is consumed only when the
user says so. With several artifacts open, that turn also says *which* one it completes:
name the artifact to advance its counter alone, or say nothing to complete every artifact
whose queue is non-empty. Each named artifact's counter advances on its own, so one
artifact's round can close while another stays mid-comment.

Between rounds the user is free to run any separate review of the artifact they want; this
skill runs none of its own.

## Channel Modality

The browser channel is opened once in Phase 0 and stays live across every round until the
user terminates the review. It is the **default review modality**, not an augmentation: the
rendered preview is the user's first input layer and stays the medium where layout-level
problems (font, heading rhythm, link presentation, line-break-driven cadence) become visible
at all.

### Server + Browser Behavior

The Bun server renders each artifact on demand, accepts comment POSTs, and broadcasts
file-change notifications over a WebSocket. Each artifact slug is its filename without
extension, widened only where two artifacts would otherwise share one — enough of the
extension or leading path to tell them apart. Comments append to `feedback-{slug}.jsonl`
next to the source. The server picks the render substrate from the file extension
(`.html`/`.htm` → HTML; everything else → markdown) and injects it into the preview page.
For HTML, relative subresource URLs (sibling CSS, images, fonts) resolve under
`/preview/...` and are served read-only, **scoped to the artifact's own directory** — the
requested path is canonicalized and anything escaping that directory (path traversal,
symlink) is rejected with 404. See `scripts/serve.ts` for
endpoint and watcher details.

**Render substrates**:

- **Markdown** (marked) — the source markdown renders into the **light DOM** as a
  published-style artifact; frontmatter is stripped so only the body shows. Light DOM is
  deliberate: the preview page's stylesheet carries that published typography, and a shadow
  boundary would cut it off. Anchoring does not need the boundary.
- **HTML** (Shadow DOM) — the raw `.html` file is served *as the artifact itself* through an
  open Shadow DOM (`attachShadow({mode:'open'})`, `shadowRoot.innerHTML = rawHtml`). The
  Shadow DOM gives CSS isolation from the review chrome and keeps selector anchoring working
  because it is the same document. `innerHTML` does not execute `<script>` tags, but it is
  **not** a JS sandbox: inline event handlers (`onerror`/`onload`), `<iframe>`, and active
  subresources still execute/load in the same-origin preview page, and any JS that runs can
  reach the review chrome and the `/feedback` endpoint. **Review only HTML you trust.** In
  HTML mode the markdown reading-width box and the top nav chrome are dropped so the page
  renders at its authored full viewport; full-page `100vh`/fixed-position fidelity is still
  bounded by Shadow-DOM rendering. (Deferred hardening: a sandboxed iframe — for
  untrusted-HTML isolation *and* a true nested viewport — compatible with selector
  anchoring, out of scope here since raw render fidelity is the channel's identity.) marked
  is not used in HTML mode; the file passes through raw and untouched.

In the browser — each artifact has its own preview page at `/preview/{slug}`. A single
artifact opens straight to its page; with several, the browser opens the index and each page
is one click away, rather than a tab being forced open per artifact:

- The artifact renders as above — no raw markdown syntax in markdown mode; the page rendered
  as authored in HTML mode
- **Anchor a comment**: right-click any element. Left-click stays free for the artifact's own
  links and buttons. On hover the target element is outlined and its CSS selector shows live
  in a chip at the bottom-left, so what the right-click will anchor is visible before you
  commit.
- Type a comment, ⌘Enter (or Submit) sends it as `{slug, selector, comment}`
- The anchored element is marked in place: an outline + 💬
- A right-side panel indexes where this round's comments are: one row per commented
  element, showing its selector, and clicking a row scrolls to that element and pulses it.
  It is an index of positions, not a second copy of the comments — the comment text lives
  on the element itself. Open it from the handle that appears at the right edge when the
  cursor approaches, or from the comment count in the status bar; Esc closes it. It stays
  off-screen otherwise, so an HTML artifact still renders full-bleed.
- When the source file changes (a round applied edits), the page auto-reloads while
  preserving scroll position. Comment marks are **not** re-applied on reload — comments are
  consumed at the apply step (the edit-back that changed the source and triggered the
  reload), so the reload renders the post-edit artifact without them.

### Element Anchoring

The anchor is a single element, identified by a unique CSS selector. `preview.html` computes
it as a unique `#id` where one exists, otherwise a `tag:nth-of-type(n)` child chain up to the
render root (the shadow root in HTML mode, `#content` in markdown mode). The same function
serves both substrates — it takes the root as a parameter.

The comment unit is therefore a **block**, not a sentence. A comment names a paragraph, a
list item, a heading, a table cell; it does not name a phrase inside one. Say which part of
the block you mean in the comment text when it matters.

### Locating the Anchor in the Source

The right-clicked element *is* the edit scope. Where what it points at could be read more
than one way — an item inside a nested list, a paragraph inside a blockquote — take the whole
region that was outlined immediately before the right-click. In markdown, find that element
in the source by counting which block of its kind it is.

Nothing in the code implements this traceback. The AI reads the source at apply time and
counts. For HTML the selector applies to the source file directly, since the `.html` under
review *is* the rendered artifact.

### JSONL Consumption Timing

Each JSONL line: `{id, slug, artifact, selector, anchorText, comment, timestamp}`, where
`artifact` is the absolute path of the source file the comment belongs to and `anchorText` is
the *rendered* text of the anchored element as it read when the comment was made (capped at
300 characters). It is rendered text, not source text, so it will not match the source
character for character — inline markup is gone from it. It exists so the apply step can tell
a selector that still resolves to the right block from one that resolves to a different block
that has since moved into its position. A deletion appends a tombstone
line — same `id`, empty `comment`, `deleted: true` — rather than rewriting the file, so the
log stays append-only **for as long as the browser channel owns it**. Entries sharing an
`id` are an edit history: the latest timestamp wins. The apply step is the one writer that
rewrites the queue, and it does so under the constraint in **Apply step** below.

**Apply step**:

1. **Read this artifact's queues afresh at the start of the apply step** —
   `feedback-{slug}.jsonl` and any queue Phase 0 found beside the source under an earlier
   slug, identified by its entries carrying this artifact's path. Phase 0 surfaces those;
   consuming them is what makes surfacing them mean anything. Any prior in-session Read is
   informational only and does not substitute for this one, since the browser may have
   appended lines in between. Skip lines superseded by a later entry for the same `id`, and
   lines whose latest entry is a tombstone — `id` dedup runs across all of these files
   together, not per file.
2. **Record the intent before touching the source** — write the ids about to be applied,
   with the artifact path, to `feedback-{slug}.inflight.json`. This file is what makes the
   exactly-once guarantee in Rule 2 true rather than hoped for: editing the source and
   archiving its queue lines cannot be one atomic act, so an interruption between them would
   otherwise leave applied ids sitting in the queue for the next round to apply a second time.
3. For each surviving line, locate the anchor in the source artifact per **Locating the
   Anchor in the Source** above, and translate the comment into an Edit/Write call. A comment
   that cannot be translated faithfully — ambiguous, conflicting, or resting on something the
   AI would have to guess — is left in the queue rather than guessed at, and surfaced in the
   round-complete prose as deferred.
4. Archive the consumed lines to `{queue-filename}-{timestamp}.consumed.jsonl` — each queue
   under its own name, so a queue found under an earlier slug is archived beside itself
   rather than folded into the current slug's — then rewrite each queue to hold exactly the
   lines that were *not* consumed.
   Re-read the queue immediately before that rewrite and carry forward anything the browser
   appended since the fresh Read of step 1: the server stays live throughout the apply, and a
   rewrite computed from the earlier Read would drop a comment made while the edits were
   landing. Archive by `id`, never by truncating the file to the lines step 1 happened to see.
   Delete the `.inflight` file last, once the rewrite has landed.
5. After edits land, the browser auto-reloads.

Apply-step tools are Edit / Write. The skill introduces no other write path.

**Empty-queue degenerate**: an apply on an empty queue completes as a no-op — the round
counter advances, the pre-round prose surfaces `Round {k} complete — 0 applied`, and the
browser does not reload because no edit landed. Recovery is implicit: the user comments in
the browser before marking the next round.

## Materialized View

On user-explicit termination (free-response exit), present the transformation trace as
aggregated totals — not a per-round breakdown. Round-level visibility belongs to the in-loop
pre-round prose; the materialized view is the audit summary.

```
Rounds:                  {N}
Comments processed:      {C_in} queued → {E} edits landed, {Df} deferred
Channel state at exit:   {C_unc} unconsumed comments across this artifact's queue file(s), named
                          (preserved, not archived)
                          -- includes never-processed comments AND apply-deferred ones
Artifact(s):             {list of paths}
```

## Error Recovery

- **Feedback consumption**: this artifact's queue file(s) — the current slug's, plus any
  earlier-slug queue Phase 0 found — are consumed at the start of every apply step and each
  archived under its own name to prevent stale comments re-entering later rounds. When the archive write fails (disk full, permission denied),
  surface the failure — do not silently retry — and halt consumption until the cause is
  resolved; a silent retry would re-translate identical comments. The same applies to the
  rewrite that follows: the queue is re-read immediately before it, so a comment appended
  during the apply survives instead of being silently overwritten.
- **Anchor no longer trustworthy on apply**: a queued comment's selector may fail to resolve,
  or resolve to a block that is no longer the one it was written about — a positional selector
  like `p:nth-of-type(2)` keeps resolving while the block underneath it changes. Compare the
  resolved block against the entry's `anchorText`, which records how the anchored element read
  when the comment was made; it is rendered text, so it will not match the source character
  for character, and judging whether it is the same block is the point rather than an
  obstacle. Where they are the same block, apply. Where they are not, or where it is unclear,
  leave the line in the queue and surface it so the user can judge — the two errors are not
  symmetric: a needless return is visible and cheap, while a wrong match edits a region the
  comment was never about, silently. Do not silently drop it, and do not pick a nearby block
  on a guess.
- **An `.inflight` file is present at apply time**: a previous apply was interrupted between
  editing the source and archiving its queue lines. Do not replay those ids and do not drop
  them. Read the source and establish, per id, whether its edit is already present; archive
  the ones that landed, return the ones that did not to the queue, and say which was which in
  the round-complete prose. Deciding this by reading is the point — the ids alone cannot say
  whether the write happened.
- **Bun server crash mid-loop**: surface it with two options — restart the channel and resume
  (the accumulated JSONL is preserved) / terminate the review with a materialized view of the
  completed rounds.

## Rules

1. **Channel is the skill's identity** — opened in Phase 0, persisted across rounds. The
   rendered artifact is the user's first input layer; the render substrate is the artifact as
   it will be consumed — marked for markdown, direct Shadow-DOM render for HTML — and that
   rendered surface is itself a review surface, not merely a feedback collection mechanism.
   Rendering visibility (markdown cadence, HTML layout/CSS) is where layout-level problems
   become visible at all. A missing bun runtime is a hard prerequisite failure (install hint,
   then exit) — there is no degraded-mode fallback, because `/comment-review` without the
   channel would be a different skill.
2. **Feedback consumption is single-shot per comment, on a fresh Read each apply** — the
   apply step's input is a Read of this artifact's queue file(s) taken when the user marks the
   round complete; any earlier in-session Read is informational and does not seed
   consumption, since the browser may have appended lines in between. Each comment is
   consumed exactly once across the loop's lifetime. Entries sharing an `id` keep only the
   latest timestamp at the moment of consumption.
3. **Termination is user-explicit and free-response** — the review ends when the user says
   so, at any time; the affordance is declared once in Phase 0 and never surfaced as an
   option in a list.
4. **Multi-artifact variants are first-class** — when several artifacts are supplied, each
   gets its own preview page, feedback file, and round counter; comments are namespaced per
   artifact and one artifact's pacing does not block another.

## Bundled Resources

- `scripts/serve.ts` — Bun-based live server;
  `bun "${CLAUDE_PLUGIN_ROOT}/skills/comment-review/scripts/serve.ts" <artifact.md|artifact.html> [more...]`.
  Picks the render substrate from the file extension and injects it into the preview; handles
  GET/POST/DELETE/WebSocket; `node:fs.watch` triggers reload broadcasts.
- `templates/preview.html` — interactive preview with right-click element anchoring (hover
  outline + live selector chip), anchored comment popup, a sidebar indexing where the
  round's comments sit (selector per row, click to jump), WebSocket hot-reload client,
  dark-mode support.
- `templates/marked.min.js` — bundled marked.js markdown renderer (markdown mode only; not
  used in HTML mode).
