---
name: motion
description: "Someone wants a short motion-graphics video made from code but cannot yet say what it should be: /motion surfaces, in plain words, the decisions such a video turns on through /elicit, lets them see what words cannot settle, then builds it, renders an mp4, and shows them that mp4 to approve or change."
argument-hint: "[what the video is for, in any words]"
skills:
  - euporia:elicit
  - hypotyposis:sketch
  - proplasma:preview
  - horismos:bound
---

# Motion

Invoke with `/motion <what the video is for>`. The person may know nothing about motion graphics or about writing prompts; the skill is written for that person.

**Composition**: `/elicit` carries the contract for what the person's intent turns on. `/sketch`, `/preview`, and `/bound` each carry their own contract and enter only where their deficit shows in this run. This skill supplies what is particular to a code-rendered video: the decisions it turns on, phrased for a newcomer, and how a page drawn from time becomes something to watch and then an mp4.

Respond in the person's language.

## Prerequisites

| Dependency | Install | Purpose |
|------------|---------|---------|
| epistemic-protocols marketplace | `/plugin marketplace add jongwony/epistemic-protocols` | Where the plugins below come from |
| euporia plugin | `/plugin install euporia@epistemic-protocols` | `/elicit` |
| hypotyposis plugin | `/plugin install hypotyposis@epistemic-protocols` | `/sketch` |
| proplasma plugin | `/plugin install proplasma@epistemic-protocols` | `/preview` |
| horismos plugin | `/plugin install horismos@epistemic-protocols` | `/bound` |

## What the video turns on

Carry the person's words about the video verbatim as the seed; invoked without them, ask once what the video is for. Open with one plain sentence on what happens next: a few questions answered in any words or skipped, then the mp4, to watch and approve or change.

Invoke `/elicit` on the seed — the skill call itself. The decisions below hold for every kind of video. They are candidates `/elicit` draws on where the seed and the person's words leave them open, never a checklist walked in order. Each is phrased in the person's situation, with what happens if it is left unsaid:

- **Where it will be shown** (aspect ratio, size) — "Where will people watch this: a phone feed, a web page, a slide?" Left unsaid, the builder picks a frame shape, and a vertical feed video built square loses half the screen.
- **How long** (duration) — "About how many seconds?" Left unsaid, the builder picks a length, and every later timing hangs on it.
- **What happens in what order** (scenes, beats) — "What should be seen first, what next, how does it end?" Left unsaid, the builder invents the sequence.
- **Sound** (music, effects, voice) — "Silent, music, or a voice? If music, do you have a track, and should the motion land on its beats?" Left unsaid, the builder chooses silence or synthesized sound.
- **Look** (style reference, colors) — "Is there a video, brand, or site whose look you want? Any colors to use or avoid?" Left unsaid, the result tends toward a generic look.
- **Words on screen** (text, typography) — "Must any exact words appear? Any font or brand lettering?" Left unsaid, the builder writes its own text.
- **Smoothness** (frame rate) — "Smooth like a phone screen, or calmer and film-like?" Left unsaid, 30 frames a second.
- **Repeat** (loop) — "Will it autoplay on repeat, so the end should flow back into the start?" Left unsaid, it ends with a hard cut.
- **What would make it wrong** — "What would you look for to say 'not this'?" The answer is what the mp4 is checked against. Left unsaid, the builder picks the moments for the stills and says they are its own.

Where the kind of video comes into view — the seed implies it, or the person cannot picture it — read `references/fast-axes.md` for the decisions that change with the kind and for real examples to point at.

## Where words run out

A video's look and movement are often things a person would recognize on sight long before they could describe them. Read the run for where that shows:

- The look or the feel of the movement cannot be said but would be known when seen — "I'd know it when I see it", a description rewritten instead of settled. Propose `/sketch`, citing what showed it; the versions it makes are short moving drafts of the page.
- Two or more directions are on the table and the person must commit to one they cannot judge from how they are described — flat or with depth, a calm reveal or a fast cut. Propose `/preview`, citing what showed it; its probes are short placeholder clips, and real examples that show the difference sit beside them as gathered evidence.
- Who settles something still open, or how far an act that reaches outside this session may go — installing a tool, downloading a library the page uses, fetching music, fonts, or images that carry a license — is not settled. Invoke `/bound` on that boundary before the act. An act no arrangement reaches does not happen.

What a run of these settles is the person's, in their words, and the build follows it.

## Build

Where `/sketch` ran, the page continues from the version the person took, never rewritten from a description of it. Write the page as one HTML file in a folder of this run's own, with each supplied file copied in beside it, its canvas the frame shape this run settled and its sound what this run settled. The page draws every frame as a function of time — `window.DURATION` (seconds) and `window.seek(t)` drawing the frame for `t` from `t` alone — so every render draws the same frame for the same `t`. With a loop, the frame at `DURATION` meets the frame at 0.

## Render and watch

Capture every frame of the page at the settled smoothness and encode the mp4 with its sound, however the builder sees fit; it lands beside the page and runs `DURATION`. Show the person that mp4. Beside it, show stills from it at the moments chosen for "what would make it wrong", each with its time, and say what the builder chose on its own: each decision the person left unsaid and the value it took, and any warning the build or the render saw. Whether the video is what was asked is the person's judgment, made on the mp4.

Then stop for the person's turn. A change goes into the page and the mp4 is rendered again; their go-ahead ends the run with the file, its length and size.
