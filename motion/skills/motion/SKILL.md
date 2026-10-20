---
name: motion
description: "Someone wants a short motion-graphics video made from code but cannot yet say what it should be: /motion surfaces, in plain words, the decisions such a video turns on through /elicit, then builds it and renders an mp4 after they check preview frames."
argument-hint: "[what the video is for, in any words]"
skills:
  - euporia:elicit
  - horismos:bound
---

# Motion

Invoke with `/motion <what the video is for>`. The person may know nothing about motion graphics or about writing prompts; the skill is written for that person.

**Composition**: `/elicit` carries the epistemic contract — what the person's intent turns on, what stands on their own words, what stays open. This skill supplies only the decisions a code-rendered video turns on, phrased for a newcomer, and the pipeline that turns the resolved intent into an mp4. Where who settles what is still open is undefined, `/bound` carries that contract in the same way (see **Seam**).

Respond in the person's language.

## Prerequisites

| Dependency | Install | Purpose |
|------------|---------|---------|
| epistemic-protocols marketplace | `/plugin marketplace add jongwony/epistemic-protocols` | Where the next two plugins come from |
| euporia plugin | `/plugin install euporia@epistemic-protocols` | `/elicit` |
| horismos plugin | `/plugin install horismos@epistemic-protocols` | `/bound`, invoked only at the seam below |
| Python 3 | `brew install python` (or the distro package, e.g. `apt install python3`) | `scripts/corpus.py` reads the example corpus live (network access to `raw.githubusercontent.com`) |

## Phase 1: Seed

Carry the person's words about the video verbatim as the seed. Invoked without them, ask once what the video is for, then proceed.

## Phase 2: Elicit

Open with one plain sentence on what happens next: a few questions about the video, answered in any words or skipped, then preview frames to check, then the finished video.

Invoke `/elicit` on the seed — the skill call itself. The coordinates below are the domain's decision structure that `/elicit` draws on: candidates raised where the seed leaves them open and the person's own words have not already settled them, never as a checklist walked in order. Phrase each in the person's situation rather than the craft term, and say what happens if it is left unsaid.

These decisions hold for every kind of video:

- **Where it will be shown** (aspect ratio, size) — "Where will people watch this: a phone feed, a web page, a slide?" Left unsaid, the builder picks a frame shape, and a vertical feed video built square loses half the screen.
- **How long** (duration) — "About how many seconds?" Left unsaid, the builder picks; every later timing hangs on this number.
- **What happens in what order** (scenes, beats) — "What should be seen first, what next, how does it end?" Left unsaid, the builder invents the sequence.
- **Sound** (music, effects, voice; sync) — "Silent, music, or a voice? If music, do you have a track?" With a track, motion lands on its beats only where its tempo (BPM) and the time of its first beat are known — the person says them; otherwise scene times are in seconds. Left unsaid, the builder chooses silence or synthesized sound.
- **Look** (style reference, colors) — "Is there a video, brand, or site whose look you want? Any colors to use or avoid?" Left unsaid, the result tends toward a generic look.
- **Words on screen** (text, typography) — "Must any exact words appear? Any font or brand lettering?" Left unsaid, the builder writes its own text.
- **Smoothness** (frame rate) — "Smooth like a phone screen (60 frames a second) or calmer, film-like (24–30)?" Left unsaid, 30.
- **Repeat** (loop) — "Will it autoplay on repeat, so the end should flow back into the start?" Left unsaid, it ends with a hard cut.
- **What would make it wrong** (checking) — "What would you look for to say 'not this'?" The answer chooses the moments shown as preview frames in Phase 5. Left unsaid, the builder picks those moments itself and says which at Phase 5.

Where the kind of video comes into view — the seed implies it, or the person cannot picture it — read `references/fast-axes.md`: it says where the current kinds are named, the decisions that depend on the kind — offered to `/elicit` in the same way as those above — and how to pull live examples the person can point at.

## Seam: who settles what stays open

When `/elicit` resolves, this run's output folder is `~/motion-output/<name>/`, `<name>` a short slug of the seed plus the start time to the second (`launch-reel-20261020-143205`), with `-2`, `-3`… appended where that folder already exists: fresh for every run, so nothing from an earlier run is overwritten, while files this run writes there are regenerated as the preview loop needs. Then read `/elicit`'s residual beside the build and render plan. Who settles what is still open, and how far an entrustment reaches, is undefined — the deficit `/bound` resolves — where either holds:

- the residual is non-empty;
- the plan includes an act that is hard to undo or reaches outside: installing a tool, downloading a library the page uses, fetching an asset that carries a license (music, fonts, images).

Where it is undefined, invoke `/bound` — the skill call itself — on the build boundary: those residual coordinates and those acts. The video's content stays as `/elicit` closed it. Where neither holds, go straight to the build sheet.

### Build sheet

Then write `sheet.md` in this run's output folder: one row for each value that a Phase 3 prompt section (`<inputs>`, `<direction>`, `<structure>`, `<build>`, `<gotchas>`) or the render reads, whether or not `/elicit` raised it (supplied files, what is banned, how the movement feels, the kind's own decisions, frame size, frame rate, motion blur, each sound source, where in a supplied track the video starts if that matters, and, where motion lands on a track's beats, its BPM and first-beat time). It is this skill's list of what the build consumes, not a further round of questions; `/elicit` and `/bound` remain the contracts that settled what it holds. Each row carries its value and where the value came from:

- the person's words — `/elicit`'s record, or what they gave during `/bound` — kept in those words;
- a `/bound` arrangement: a value the person keeps is asked for now, before the build; a value they asked proposals for lists its candidates, shown in Phase 5; a value entrusted to the builder is chosen within the stated limits;
- a value `/elicit` recorded as entrusted to the builder ("you pick"): the builder's choice under that grant;
- the builder's reading of the person's words or of an example they picked ("a phone feed" → 1080x1920, a picked Three.js example → Three.js), marked as the builder's reading;
- otherwise a default the builder states — the row's "Left unsaid" value above where it has one.

An act that is hard to undo goes only as far as the reach `/bound` showed for it; one with no arrangement does not happen. An act that arises after the seam — a library the sheet now needs, a licensed asset a preview change asks for — is where that deficit appears: invoke `/bound` there, before the act.

## Phase 3: Assemble the prompt

Write the build prompt from the build sheet in this shape, each section in the words the sheet holds:

- `<inputs>` — files the person supplies (track, logo, exact text) and where they are.
- `<direction>` — how it is drawn, the look, the feel of movement, and what is banned.
- `<structure>` — what is being told, and the scenes in order, each with its start time in seconds; on a provided track whose BPM and first beat are known, on its beats.
- `<build>` — the page contract of Phase 4, the length (`DURATION`), size, frame rate, and loop.
- `<gotchas>` — what the person said would make it wrong.
- `<start>` — "Build the page, then show the preview frames before the full render."

Save the prompt as `prompt.md` in this run's output folder and show it: it is also something the person can paste into another session.

## Phase 4: Build

Write the page as one HTML file in the output folder, with each supplied file copied in beside it. The page draws every frame as a function of time — `window.DURATION` (seconds) and `window.seek(t)` drawing the frame for `t` from `t` alone — so the preview and the mp4 come from the same page. Its canvas is the sheet's frame size; with a loop, the frame at `DURATION` meets the frame at 0; its sound is the sources the sheet holds.

## Phase 5: Preview

Capture the page in a browser at the chosen times, however the builder sees fit. Whether the page is what was asked is the person's judgment, made on these frames. Choose times at each scene boundary and at the moments the person named in "what would make it wrong" — where they named none, at moments the builder picks, said as its own. Show each frame with its time and the scene it belongs to, and ask them to check that the picture fills the frame and that each supplied asset (logo, text, image) appears; show beside the frames each warning the build saw — a load that failed, an error the page reported; offer the mixed sound — every source the mp4 will carry, at its own level — to listen to, since stills do not show sound, and whether it is balanced or clips is the person's to hear there; show beside the frames each sheet row whose value is a builder default, the builder's reading, or the builder's choice under a grant; for a value with candidates, preview each at a moment where the value shows — a candidate that differs in motion (frame rate, blur, speed, easing, how the movement feels) as a short clip, one that differs in a still look as a still; a candidate that changes the page gets its own variant page file, one that changes only how it is rendered keeps the one page; each is named by its value.

Then stop for the person's turn. Their pick — a variant page or a render value — is written into its sheet row as the value, with the pick as its source, and `prompt.md` is rendered again; a picked variant page becomes the page. Other accepted changes go into the page, `sheet.md`, and `prompt.md`, and the preview runs again; their go-ahead moves to Phase 6.

## Phase 6: Render

Capture every frame of the page and encode the mp4, however the builder sees fit. The mp4 lands beside the page and runs `DURATION`. Report the file, its length and size, any warning the build saw, and each sheet row the builder chose.
