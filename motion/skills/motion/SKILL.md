---
name: motion
description: "Someone wants a motion-graphics video made from code: /motion reads back through /elicit, at the level the person's own words show, how it took the request — where and for whom the video is used, what it shows and how — builds it right away to the craft that use calls for, on HyperFrames where it is installed, renders an mp4, and shows them that mp4 to approve or change — with drafts or contrasting directions of it where a change cannot be settled in words."
argument-hint: "[what the video is for, in any words]"
skills:
  - euporia:elicit
  - hypotyposis:sketch
  - proplasma:preview
  - horismos:bound
---

# Motion

Invoke with `/motion <what the video is for>`. The video is made to the craft its use calls for — what a professional motion designer would deliver for that place and audience — whatever level the conversation with the person runs at.

**Composition**: `/elicit` carries the contract for what the person's intent turns on; its run stays open beside the build rather than ahead of it. `/sketch`, `/preview`, and `/bound` each carry their own contract and enter only where their deficit shows in this run: `/sketch` and `/preview` on the person's turn on an mp4, `/bound` before an act of the build that reaches outside this session. This skill supplies what is particular to a code-rendered video: how a request is read before anything is built, the decisions a video turns on, and how a page drawn from time becomes something to watch and then an mp4.

Respond in the person's language.

## Prerequisites

| Dependency | Install | Purpose |
|------------|---------|---------|
| epistemic-protocols marketplace | `/plugin marketplace add jongwony/epistemic-protocols` | Where the plugins below come from |
| euporia plugin | `/plugin install euporia@epistemic-protocols` | `/elicit` |
| hypotyposis plugin | `/plugin install hypotyposis@epistemic-protocols` | `/sketch` |
| proplasma plugin | `/plugin install proplasma@epistemic-protocols` | `/preview` |
| horismos plugin | `/plugin install horismos@epistemic-protocols` | `/bound` |
| HyperFrames plugin (optional) | `/plugin marketplace add heygen-com/hyperframes`, then `/plugin install hyperframes@hyperframes` | Builds and renders the video as a HyperFrames project where it is installed |

## Reading the request

Carry the person's words about the video verbatim as the seed; invoked without them, ask once what the video is for.

Invoke `/elicit` on the seed — the skill call itself. Its first surface is the reading of the request: where and for whom the video is used, what it shows and how it shows it, and what that reading rests on. Pitch it at the level the person's words about this video show: a term they use correctly is evidence about that term, not about the craft around it; what their words already settle is stated back in a clause, and what they show no hold on is put as what it changes on screen. The decisions below that the reading leaves open follow it briefly, each as an open question carrying the value the build takes for it. Close with one sentence on what happens next: the build starts now, a wrong reading is theirs to stop with an interrupt, and the mp4 comes back to watch and approve or change. Then build, without waiting for the run to close; what the person says from then on, about the mp4 included, is the `/elicit` run's to read.

## What the video turns on

The decisions below hold for every kind of video. Each value is drawn from the person's words where they give it, otherwise from where and for whom the video is used; each comes with what a wrong value costs:

- **Where it will be shown** (aspect ratio, size) — a vertical feed video built square loses half the screen.
- **Camera** (view, framing) — a fixed full frame leaves small things tiny on a large canvas; pushing in or following something lets each moment fill the frame.
- **How long** (duration) — every later timing hangs on it.
- **What happens in what order** (scenes, beats, joins, pace) — an invented sequence, joins, or pace bring dead time or crowded moments.
- **Sound** (music, effects, voice) — without a track or voice from the person, the choice is silence, synthesized sound, or a track sourced under `/bound`.
- **Look** (style reference, colors) — without a reference, the result tends toward a generic look.
- **Words on screen** (text, typography) — exact words or brand lettering the person needs are easy to miss.
- **Smoothness** (frame rate) — 30 frames a second unless the use calls for otherwise.
- **Repeat** (loop) — an autoplaying loop needs its end to flow back into the start; otherwise it ends with a hard cut.

Where the kind of video comes into view — the request implies it, or the reading cannot place it — read `references/fast-axes.md` for the decisions that change with the kind and for real examples to point at.

## Build

Where `/sketch` ran on an earlier round, the page continues from the version the person took, never rewritten from a description of it. The page's frame shape, length, and sound are what this run took.

Where the HyperFrames skill is available in this session (`/hyperframes:hyperframes`, or `/hyperframes` installed on its own), the page is a HyperFrames project built to that skill's contract, with its tools; to that skill, the person has asked for the file, and this run's reading is the storyline it builds. Otherwise write the page as one HTML file in a folder of this run's own, with each supplied file copied in beside it. The page draws every frame as a function of time — `window.DURATION` (seconds) and `window.seek(t)` drawing the frame for `t` from `t` alone — so every render draws the same frame for the same `t`.

With a loop, the frame at the video's end meets the frame at 0.

Where the build needs an act that reaches outside this session — installing a tool, downloading a library the page uses, fetching music, fonts, or images that carry a license — invoke `/bound` on how far that act may go, before it happens. An act no arrangement reaches does not happen.

## Render and watch

Capture every frame of the page at the settled smoothness and encode the mp4 with its sound, however the builder sees fit; it lands beside the page and runs the video's length. Show the person that mp4. Beside it, show stills from it at the moments that carry the reading, each with its time, and say what the builder chose on its own: each value the person did not give, and any warning the build or the render saw. Whether the video is what was asked is the person's judgment, made on the mp4.

Then stop for the person's turn. A change goes into the page and the mp4 is rendered again. A video's look and movement are often recognized on sight long before they can be described; read the person's turn on the mp4 for where that shows:

- The look or the feel of the movement cannot be said but would be known when seen — "I'd know it when I see it", a change described again instead of settled. Propose `/sketch`, citing what showed it; its versions are short moving variants of the current page.
- Two or more directions are on the table and the person must commit to one they cannot judge from how they are described — flat or with depth, a calm reveal or a fast cut. Propose `/preview`, citing what showed it; its probes are short clips varied from the current page, and real examples that show the difference sit beside them as gathered evidence.

What a run of these settles is the person's, in their words, and the next render follows it. Their go-ahead ends this skill's run with the file, its length and size, and closes the `/elicit` run only where their words say the intent is aligned enough.
