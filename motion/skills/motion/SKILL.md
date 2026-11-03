---
name: motion
description: "Someone wants a short motion-graphics video made from code but cannot yet say what it should be: /motion shows, in plain words, how it read the request — where and for whom the video is used, what it shows and how — builds it right away, lets them see what words cannot settle, renders an mp4, and shows them that mp4 to approve or change."
argument-hint: "[what the video is for, in any words]"
skills:
  - hypotyposis:sketch
  - proplasma:preview
  - horismos:bound
---

# Motion

Invoke with `/motion <what the video is for>`. The person may know nothing about motion graphics or about writing prompts; the skill is written for that person.

**Composition**: `/sketch`, `/preview`, and `/bound` each carry their own contract and enter only where their deficit shows in this run. This skill supplies what is particular to a code-rendered video: how a request is read before anything is built, the decisions a video turns on, and how a page drawn from time becomes something to watch and then an mp4.

Respond in the person's language.

## Prerequisites

| Dependency | Install | Purpose |
|------------|---------|---------|
| epistemic-protocols marketplace | `/plugin marketplace add jongwony/epistemic-protocols` | Where the plugins below come from |
| hypotyposis plugin | `/plugin install hypotyposis@epistemic-protocols` | `/sketch` |
| proplasma plugin | `/plugin install proplasma@epistemic-protocols` | `/preview` |
| horismos plugin | `/plugin install horismos@epistemic-protocols` | `/bound` |

## Reading the request

Carry the person's words about the video verbatim; invoked without them, ask once what the video is for.

Before building, show in plain words how the request was read: where and for whom the video is used, what it shows and how it shows it, and what that reading rests on — the person's words quoted, and anything the builder supplied marked as its own. Then name, in one line, the value each remaining decision below takes. Close with one plain sentence on what happens next: the build starts now, a wrong reading is theirs to stop with an interrupt, and the mp4 comes back to watch and approve or change. Then build, without waiting for an answer.

## What the video turns on

The decisions below hold for every kind of video. Each value is drawn from the person's words where they give it, otherwise from where and for whom the video is used; each comes with what a wrong value costs:

- **Where it will be shown** (aspect ratio, size) — a vertical feed video built square loses half the screen.
- **Camera** (view, framing) — a fixed full frame leaves small things tiny on a large canvas; pushing in or following something lets each moment fill the frame.
- **How long** (duration) — every later timing hangs on it.
- **What happens in what order** (scenes, beats, joins, pace) — an invented sequence, joins, or pace bring dead time or crowded moments.
- **Sound** (music, effects, voice) — without a track or voice from the person, the choice is silence or synthesized sound.
- **Look** (style reference, colors) — without a reference, the result tends toward a generic look.
- **Words on screen** (text, typography) — exact words or brand lettering the person needs are easy to miss.
- **Smoothness** (frame rate) — 30 frames a second unless the use calls for otherwise.
- **Repeat** (loop) — an autoplaying loop needs its end to flow back into the start; otherwise it ends with a hard cut.

Where the kind of video comes into view — the request implies it, or the reading cannot place it — read `references/fast-axes.md` for the decisions that change with the kind and for real examples to point at.

## Where words run out

A video's look and movement are often things a person would recognize on sight long before they could describe them. Read the run for where that shows:

- The look or the feel of the movement cannot be said but would be known when seen — "I'd know it when I see it", a description rewritten instead of settled. Propose `/sketch`, citing what showed it; the versions it makes are short moving drafts of the page.
- Two or more directions are on the table and the person must commit to one they cannot judge from how they are described — flat or with depth, a calm reveal or a fast cut. Propose `/preview`, citing what showed it; its probes are short placeholder clips, and real examples that show the difference sit beside them as gathered evidence.
- Who settles something still open, or how far an act that reaches outside this session may go — installing a tool, downloading a library the page uses, fetching music, fonts, or images that carry a license — is not settled. Invoke `/bound` on that boundary before the act. An act no arrangement reaches does not happen.

What a run of these settles is the person's, in their words, and the build follows it.

## Build

Where `/sketch` ran, the page continues from the version the person took, never rewritten from a description of it. Write the page as one HTML file in a folder of this run's own, with each supplied file copied in beside it, its canvas the frame shape this run took and its sound what this run took. The page draws every frame as a function of time — `window.DURATION` (seconds) and `window.seek(t)` drawing the frame for `t` from `t` alone — so every render draws the same frame for the same `t`. With a loop, the frame at `DURATION` meets the frame at 0.

## Render and watch

Capture every frame of the page at the settled smoothness and encode the mp4 with its sound, however the builder sees fit; it lands beside the page and runs `DURATION`. Show the person that mp4. Beside it, show stills from it at the moments that carry the reading, each with its time, and say what the builder chose on its own: each value the person did not give, and any warning the build or the render saw. Whether the video is what was asked is the person's judgment, made on the mp4.

Then stop for the person's turn. A change goes into the page and the mp4 is rendered again; their go-ahead ends the run with the file, its length and size.
