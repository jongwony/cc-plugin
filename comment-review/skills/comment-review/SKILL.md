---
name: comment-review
description: "Review a markdown or HTML artifact in a live browser preview: right-click any element to anchor a comment by CSS selector, then have those comments applied back as edits to that same file. Markdown renders through marked into the light DOM and is sanitized before it is inserted; HTML is served raw through a Shadow DOM and is not. Comments queue to feedback-{slug}.jsonl and the page hot-reloads whenever the source changes. User-invoked via /comment-review."
---

# Comment Review

Open an artifact in a browser as it will actually be read, annotate it in place, and get
those annotations back as edits to the source. That loop is the whole skill.

The render substrate is keyed off the file extension: markdown (`.md`) renders through
marked and is sanitized on the way into the page; HTML (`.html`/`.htm`) is served raw through
a Shadow DOM and is not. Anchoring does not branch on the extension — either way you
right-click an element and the browser records a CSS path down to that element.

The skill is agnostic about *what kind of artifact* is under review: blog drafts, plan
documents, handoffs, design docs, and changeset descriptions are all valid targets. It also
supplies no judgment of its own. It carries comments in one direction and edits back in the
other; deciding what is worth commenting on stays with the user.

## Caller Signature

```
/comment-review(artifact_path)

artifact_path : String | List<String>   -- markdown or HTML file(s); render substrate keys off the extension
```

An artifact that already exists is reviewed where it lives, and the edits land in that same
file — the path handed to the skill is the path that gets edited. Only an artifact drafted
inside the session needs somewhere to live first; write that one to the session scratchpad and
point the skill there.

The scratchpad instruction used to be unconditional, which quietly made a review of an
existing project file edit a copy of it. Its stated reason — that no path under a harness
config directory is referenced, since where such a directory sits varies by substrate and
pinning a rule to one layout would make it wrong everywhere else — was always about *where a
draft should live*, never a claim that an existing file cannot be reviewed in place.

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
   review. Treat the `serving at …` line as the start confirmation — it arrives on **stderr**,
   as does every other line this server writes: the `drafts:` and tailnet lines relayed below,
   and the `fatal:` line a bad artifact path exits on. Whatever redirection is assembled around
   the launch above must therefore keep stderr. One that keeps only stdout captures nothing at
   all — not the confirmation, and not the failure — so polling it waits forever on a server
   that is already up, or reports one that never started as running. On termination,
   stop the server through that handle — the exit promise in step 2 is only keepable if
   something was kept to stop it with.
   **Read that line before relaying it, and say where the channel actually opened.** If the
   machine is on a tailnet, the server binds the tailnet interface rather than loopback, and
   what becomes reachable from the user's other tailnet devices is not only the preview and
   the `/feedback` endpoint that writes into the queue: **the unit of exposure is the
   artifact's directory.** Files beside the artifact are served on that port too — reviewing
   `~/Documents/plan.md` puts the rest of `~/Documents/` within reach of anything on the
   tailnet. That is what makes an HTML artifact's own images and stylesheets load, and it is
   not conditional on the render mode: a markdown draft opens the same door. Say the
   directory, not just the page, because the directory is what the user chooses when they
   decide where a draft lives.
   That reach is deliberate: it is what lets a draft be read on a phone. It is also not
   something the user can be assumed to know, and there is no way to turn it off — no flag
   and no environment variable disables it, so do not imply one exists.
   Where the bind is loopback (no tailnet), say that instead; the startup lines are what
   distinguish the two, so read them rather than guessing. The server refuses writes AND
   live-channel connections carrying a cross-origin `Origin` header, and refuses READS whose
   `Host` is not one of the addresses the startup lines print. Together those stop another *web
   page* from writing into the queue, listening to it, or reading the directory — including a
   page whose DNS has been repointed at this port, which is same-origin as far as the browser is
   concerned and is why the read side has to go by `Host` instead. None of it is authentication,
   and none of it bears on tailnet reachability at all. One consequence to relay if it comes up:
   an address the startup lines do NOT print — a hosts-file alias, another search domain —
   now reads nothing rather than loading and silently failing to save.
4. **Round 1 entry** — surface the queue size for this artifact, or "No prior comments —
   fresh start." A slug widens when two artifacts would otherwise share one, so the same
   artifact can have left a queue under a different name in an earlier session: look beside
   the source for any `feedback-*.jsonl` whose entries carry this artifact's path, not only
   the current slug's file. Exclude names ending `.markers.jsonl` or `.consumed.jsonl` — the
   apply step writes both beside the source and both match that glob, so counting them would
   report retired markers and archived copies back to the user as queued comments. (The
   discriminator is the dotted suffix, so a slug merely ending in `-markers` is unaffected;
   an artifact whose own name ends `.markers` or `.consumed` would be excluded here, which
   costs only this carryover search — its current-slug queue is still read by name in the
   apply step.) Name any queue found under an earlier slug when you surface it, so a
   carryover the current name would have hidden is visible rather than silently absent.

## Phase L: Round Loop

Each round is the same three beats: the user comments in the browser, says so in chat, and
the AI applies the queue as edits. There is no branch gate — the loop has one shape.

**Pre-round prose** (per round) — surface the round counter and the apply load, so the user
always knows where they are:

```
Round 1 — browser preview opened. {N comments in queue from prior session. | No prior comments — fresh start.}

Round {k} complete — {X} applied{, {Y} deferred}{, {R} retracted mid-apply}.
  deferred:  {selector} — {why} (× Y)    -- the REASON; the browser already lists the line itself
  retracted: {selector} — deleted while this round was applying (× R)   -- omitted when R is 0
Browser preview reflects the latest edits.
```

Say why each deferred line was held back. Not because the browser cannot show it — the page
reads the queue from the server and lists every live entry, and a deferred line is one — but
because the browser cannot show **why the apply step declined it**. That is a judgement this
round made while reading the source, and it is written nowhere: not in the queue, not in a
marker, not on the page. The selector in that line is a key into the row the user is already
looking at, not a second copy of it.

Do not add a field or a file to carry the reason instead. It is a fact about this round, said
to the person in the room, and the next round re-reads the source anyway — persisting it would
grow the marker machinery for something that expires when the round does.

**This is narrower than the requirement that used to stand here, and rests on a different
fact.** That one said to name every queued line, because after a reload the browser could show
none of them and this prose was the only place one still appeared. The browser now shows all of
them, so that requirement is gone and does not come back. What is here is the reason alone,
which the browser has no way to learn. A later reader finding the removal in the history should
not read it as covering this line.

Retracted lines are named on a reason of their own as well: a retraction leaves a tombstone, so
the entry is gone from the queue and the browser has nothing to show. Without this line the user
would not learn that a comment they deleted mid-apply was seen and honoured.

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

- **Markdown** (marked, then DOMPurify) — the source markdown renders into the **light DOM**
  as a published-style artifact; frontmatter is stripped so only the body shows. Light DOM is
  deliberate: the preview page's stylesheet carries that published typography, and a shadow
  boundary would cut it off. Anchoring does not need the boundary.
  marked passes raw HTML through untouched, so the rendered result is sanitized before it is
  inserted. This is not defence against a hypothetical: the preview page can write to
  `/feedback`, and the apply step turns what is in that queue into edits to the user's own
  file — so an `<img onerror>` in a markdown document is a path from *reading* a document to
  *editing* a file, and it needs no click, only that the preview opened. A markdown file is
  treated as data here, never as a program. Dropped: inline event handlers, `javascript:`
  URLs, `<script>`, `<iframe>`, `<object>`, `<embed>`, and `<style>` elements (a stylesheet
  reaches other elements — it can hide the comment popup — and `url(...)` in one is an active
  subresource load). The `style` *attribute* is kept: it can load a subresource too, but it
  cannot reach past its own element, and markdown that sets a width on an image is ordinary.
  Separately from execution, the artifact cannot impersonate the review chrome: every id,
  class, and dataset key the preview owns is namespaced under `cr-`, and artifact attributes
  in that namespace are dropped. Without that, a plain `<div id="cr-popup">` — inert markup —
  would capture the chrome's own element, because `getElementById` answers with whichever
  comes first in document order and the artifact renders above the chrome.
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
  **The asymmetry with markdown is deliberate, and it is the one place this skill asks for
  trust.** Sanitizing here would defeat the mode: rendering the file exactly as authored is
  what makes an HTML artifact reviewable at all. So markdown is sanitized because nothing is
  lost by it, and HTML is not because everything would be — which is why the warning above
  lives on this bullet and not the other one.

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
- A right-side panel indexes the live queue for this artifact — every comment still waiting,
  not only the ones made in this page: one row per entry, showing its selector, and clicking a
  row scrolls to that element and pulses it. It is an index of positions, not a second copy of
  the comments — the comment text lives on the element itself. A row whose anchor could not be
  confirmed reads `⚠ not confirmed` and carries the reason; clicking it reports that reason
  rather than scrolling. Open the panel from the handle that appears at the right edge when the
  cursor approaches, or from the comment count in the status bar; Esc closes it. It stays
  off-screen otherwise, so an HTML artifact still renders full-bleed.
- When the source file changes (a round applied edits), the page auto-reloads while
  preserving scroll position. The queue is the server's, so the reloaded page reads it back —
  as does any other device opening the same preview, and any page already open when the queue
  moves. Every live entry is listed, and a mark is put back on the element wherever the anchor
  can still be confirmed. Confirmation compares the element against the evidence recorded with
  the comment (the block's text, or for an element with none, the attributes its author wrote),
  so a block a round rewrote is listed without a mark rather than annotated in the wrong place.
  That is the guard, not a shortfall: an unconfirmed row you can see and re-place is better
  than a mark on a paragraph the comment was not about.

### Element Anchoring

The anchor is a single element, recorded as a CSS path down to it. `preview.html` computes it
as an `#id` where one is unique within the render root, otherwise a `tag:nth-of-type(n)` child
chain up to that root (the shadow root in HTML mode, `#cr-content` in markdown mode). The same
function serves both substrates — it takes the root as a parameter.

The chain carries no root prefix, so it says where the element sits rather than naming it
uniquely: the same chain can match at another depth wherever a document repeats a shape — a
list inside a list, a paragraph inside a blockquote. Nothing re-resolves it in the browser,
which holds the element itself, so this lands entirely at apply time, where **Locating the
Anchor in the Source** and the `anchorText` comparison already govern. Read the path as a
description to check, never as a lookup key to trust.

The comment unit is therefore a **block**, not a sentence. A comment names a paragraph, a
list item, a heading, a table cell; it does not name a phrase inside one. Say which part of
the block you mean in the comment text when it matters.

The anchor is the element right-clicked, exactly — never an ancestor of it. This is what the
hover outline and the selector chip are for: they name the element under the cursor before
the click, so the click has to act on that same element or the page has promised one thing
and done another. It follows that **a commented element can hold commented children** — a
comment on a blockquote and a comment on a paragraph inside it are two separate anchors, two
ids, and two sidebar rows. That is intended, not an accident to design around: the outer
comment is about the quote as a unit and the inner one is about that paragraph, and there is
no reason the reviewer has to choose.

Marks are attributes on the artifact's own elements, so they are namespaced (`data-cr-*`) and
the element is left as it was found when a comment is deleted. `title` is the exception that
cannot be namespaced — the browser's tooltip reads that exact attribute — so a mark borrows
it and puts back whatever was there, including an empty one.

### Locating the Anchor in the Source

The right-clicked element *is* the edit scope. Where what it points at could be read more
than one way — an item inside a nested list, a paragraph inside a blockquote — take the whole
region that was outlined immediately before the right-click. In markdown, find that element
in the source by counting which block of its kind it is.

Nothing in the code implements this traceback. The AI reads the source at apply time and
counts. For HTML the selector applies to the source file directly, since the `.html` under
review *is* the rendered artifact.

### JSONL Consumption Timing

Each JSONL line: `{id, slug, artifact, selector, anchorText, anchorSig, comment, deleted?,
timestamp}`, where `artifact` is the absolute path of the source file the comment belongs to and
`anchorText` is the *rendered* text of the anchored element as it read when the comment was made
(capped at 300 characters). It is rendered text, not source text, so it will not match the source
character for character — inline markup is gone from it. It exists so the apply step can tell
a selector that still resolves to the right block from one that resolves to a different block
that has since moved into its position.

`anchorSig` is that same evidence for an element with no text to record — an image, a horizontal
rule, a figure holding only a picture, an empty cell. Those are empty legitimately, so treating
the emptiness as "no evidence" would leave their comments unconfirmable forever. The signature
carries the element's tag name and the attributes its author wrote — `id`, `src`, `srcset`,
`href`, `alt`, `name`, `type`, `value`, `width`, `height`, and any class that is not the review's
own `cr-` one — joined with `|` and capped at the same 300 characters, and it is written only
where `anchorText` came out empty. It never carries anything the render computed: a position, an
ordinal or a measured size moves whenever the source moves, and would confirm an anchor precisely
when it should not.

A deletion appends a tombstone line — same `id`,
empty `comment`, `deleted: true` — rather than rewriting the file, and the apply step records
what it consumed by appending a marker rather than rewriting either, so the log is append-only
without qualification. Nothing overwrites it, so there is nothing for a concurrent write to
lose. Entries sharing an `id` are an edit history: the latest timestamp wins.

A consumed-marker line is `{id, artifact, consumed: true, consumedThrough, timestamp}`, where
`consumedThrough` is the timestamp of the entry the apply step actually consumed. It asserts
nothing about what the artifact should say, so it does not enter the liveness judgement below
as an entry — it only retires one.

A line is live when its latest non-marker entry is not a tombstone and no consumed-marker for
that `id` carries a `consumedThrough` at or after that entry's timestamp. Keying the marker to
the timestamp it consumed, rather than to the `id` alone, is what lets a comment edited after
it was applied count as the new instruction it is: the edit carries a later timestamp than the
marker, so it is live again. A marker keyed on `id` alone would swallow it.

Timestamps are millisecond-resolution, so two entries of different kinds can share the latest
one — a tab editing and another deleting need only finish in the same millisecond, which
measurement shows is common rather than exotic. **Where a tie is between entries of different
kinds, the one that produces no edit wins.** This is the same asymmetry the anchor guard runs
on: a comment that fails to apply shows up as a source that did not change, while a comment
applied against a retraction edits the artifact the user was trying to protect.

This deliberately disagrees with the server. `serve.ts`'s DELETE existence check breaks the same
tie by the order the entries were read in — its comparison is strict, so the one already held
stays. That check asks a different question (is there a live entry to tombstone?), and the worst
its disagreement produces is one redundant tombstone line, never a wrong edit. Do not reconcile
the two by changing this rule to match: the reason this one leans the other way is written
directly above.

That safety claim is about the TIE-BREAK, and only about it. **Which files the two paths read is
not a second divergence — they read the same set**: every `feedback-*.jsonl` beside the source
whose lines carry this artifact's path. They have to. A check reading fewer files than the queue
does would refuse to tombstone a line the queue lists, leaving it live for the next round to
apply against the user's wish — a wrong edit, which is exactly what the sentence above promises
cannot happen. That promise holds only while the two file sets match.

**There is a third axis, and the two above are not the whole list.** The DELETE check does not
resolve consumed markers at all — it reads the entries, and retirement is applied a layer above
it. So a line an apply round has already turned into an edit is gone from the sidebar and still
tombstoneable, and what that produces is one redundant tombstone: a tombstone is dropped for
being a tombstone before markers are ever consulted, so nothing downstream reads differently.
This is left as it is on purpose. Making the check honour markers would put retraction
downstream of a file the apply step writes, so its failure direction would become *the user
cannot retract what is on their screen* — the direction refused everywhere else here — where
today's is *the user retracts something already gone*. The refusal would also have to say
something untrue, since the entry was neither missing nor deleted but applied.

A marker is what retires a line, and reading the source cannot stand in for it — because the
browser offers no way to retract a comment from an earlier round. Why that makes the marker
load-bearing, and what breaks without it, is in the commit that settled it.

**Apply step**:

1. **Read this artifact's queues afresh at the start of the apply step** —
   `feedback-{slug}.jsonl` and any queue Phase 0 found beside the source under an earlier
   slug, identified by its entries carrying this artifact's path. Phase 0 surfaces those;
   consuming them is what makes surfacing them mean anything. Any prior in-session Read is
   informational only and does not substitute for this one, since the browser may have
   appended lines in between. Read the marker files beside them too — every
   `feedback-*.markers.jsonl` next to the source, one per past round. Keep the lines that are
   live by the rule above: `id` dedup and marker resolution run across all of these files
   together, never per file, and the rule keys on entry timestamps alone, so neither which
   file an entry sits in nor the order the files are read can change a verdict.
2. For each surviving line, locate the anchor in the source artifact per **Locating the
   Anchor in the Source** above, then **read the source before editing it**. Two questions are
   settled by that read, and both are ordinary rather than exceptional:
   - Is this still the block the comment was written about? Where `anchorText` is non-empty,
     compare against it. Where it is empty, compare against `anchorSig` instead.
     A signature names a KIND of element and the attributes its author gave it, so read it as a
     description and find that element in the source — do not look for the string itself. In
     markdown the source spells `![alt](src)`, never the rendered `<img src= alt=>` the signature
     was built from, so a character comparison there answers nothing.
     **If more than one element in the source could answer to that signature, do not apply —
     leave the line and surface it.** The browser refuses to place a mark on an ambiguous
     signature, and it refuses on the grounds of what THIS step would do to the wrong element
     afterwards; a guard that stops at the browser does not accomplish the thing it names.
     (That uniqueness requirement is asked of the signature branch only. The text branch does not
     carry it, deliberately — the same asymmetry the browser holds, and it is recorded rather
     than resolved.)
     Where the comparison fails, or where it is unclear, leave the line and surface it — see
     Error Recovery.
   - Is this edit already present? Then a previous round was interrupted between editing the
     source and writing its marker. Record the marker and move on; do not apply it twice.
   Otherwise translate the comment into an Edit/Write call. A comment that cannot be
   translated faithfully — ambiguous, conflicting, or resting on something the AI would have
   to guess — is left in the queue rather than guessed at, and surfaced as deferred.
   Immediately before each edit, re-read that id's current state: the set was computed at
   step 1 and the browser stays live, so a retraction can arrive in between. Where a tombstone
   has appeared since step 1, skip it. This narrows the window to one id's worth of work
   rather than the whole round; it does not close it, because re-reading and then editing is
   still two acts, and what remains stays in the queue, which the browser lists. This is not what the
   tie rule handles — that rule governs which entry wins, not the interval between reading a
   set and editing against it.
3. Write one consumed-marker per consumed line into **this round's own file**,
   `feedback-{slug}-{timestamp}.markers.jsonl`, carrying the `consumedThrough` timestamp of the
   entry consumed. Every write the apply step makes is a **new file**; the only writer that
   appends to a shared queue is the server. The tools force this — Edit and Write are both
   read-modify-write and neither can delete, so a marker written into the shared queue would be
   a read-modify-write against a file the server is still appending to, while creating a file
   with Write reads nothing first and so has nothing to clobber. A comment that lands mid-apply
   simply gets no marker this round and is live again next round.
   Copy the consumed lines to `{queue-filename}-{timestamp}.consumed.jsonl` — each queue under
   its own name, so a queue found under an earlier slug is archived beside itself. The copy is
   an audit record, not the re-ingestion guard: the markers are that.
4. After edits land, the browser auto-reloads.

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
Channel state at exit:   {C_unc} still-live comments across this artifact's queue file(s), named
                          -- live by the rule in JSONL Consumption Timing: no marker reaches them
                          -- includes never-processed comments AND apply-deferred ones
                          -- named here, unlike the per-round prose: the channel is stopping,
                             so the browser that lists them is about to be gone
Artifact(s):             {list of paths}
```

## Error Recovery

- **Feedback consumption**: this artifact's queue file(s) — the current slug's, plus any
  earlier-slug queue Phase 0 found — are consumed at the start of every apply step, and each
  consumed line gets a marker written into this round's own marker file. When that write fails
  (disk full, permission denied), surface the failure — do not silently retry — and halt
  consumption until the cause is resolved: without its marker a consumed line is still live,
  and the next round would re-translate it. The archive copy carries the same rule.
  A write refused with `ELOOP` means the sidecar path is a symlink. That is not a
  misconfiguration to work around: the server declines to follow it so a comment cannot be
  appended outside the artifact's own directory. Move or remove the symlink rather than
  looking for a way past the refusal.
- **Anchor no longer trustworthy on apply**: a queued comment's selector may fail to resolve,
  or resolve to a block that is no longer the one it was written about — a positional selector
  like `p:nth-of-type(2)` keeps resolving while the block underneath it changes. Compare the
  resolved block against the entry's `anchorText`, which records how the anchored element read
  when the comment was made; it is rendered text, so it will not match the source character
  for character, and judging whether it is the same block is the point rather than an
  obstacle. Where `anchorText` is empty the element had no text to record and `anchorSig` is
  what to compare instead — read it as a description of the element rather than as a string,
  and where more than one element in the source answers to it, that counts as unclear. Where they are the same block, apply. Where they are not, or where it is unclear,
  leave the line in the queue and surface it so the user can judge — the two errors are not
  symmetric: a needless return is visible and cheap, while a wrong match edits a region the
  comment was never about, silently. Do not silently drop it, and do not pick a nearby block
  on a guess.
- **An apply was interrupted**: there is no separate recovery path. The apply step reads the
  source before every edit anyway, so an id whose edit is already present is a previous round
  that stopped between editing and marking — it gets its marker and is not applied again.
  Nothing needs to be replayed and nothing needs to be dropped.
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
- `templates/purify.min.js` — bundled DOMPurify, applied to marked's output before it is
  inserted (markdown mode only; HTML mode is deliberately unsanitized, see above).
