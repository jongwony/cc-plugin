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
| euporia plugin | `/plugin install euporia@epistemic-protocols` | `/elicit` |
| horismos plugin | `/plugin install horismos@epistemic-protocols` | `/bound`, invoked only at the seam below |
| Python 3 | (system) | `scripts/corpus.py` reads the example corpus live |
| Node.js 18+ | `brew install node` (or the distro package) | `scripts/render.cjs` |
| Playwright + Chromium | `npm i -g playwright && npx playwright install chromium` | Steps the page through time and captures frames |
| ffmpeg (with ffprobe and libx264) | `brew install ffmpeg` (or `apt install ffmpeg`) | Encodes frames (and audio) to mp4; ffprobe checks its length |

Preflight: `python3 --version >/dev/null && node --version >/dev/null && ffmpeg -version >/dev/null && ffprobe -version >/dev/null && ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libx264 && node -e "const {chromium}=require(require('path').join(require('child_process').execSync('npm root -g').toString().trim(),'playwright'));process.exit(require('fs').existsSync(process.env.CHROMIUM_PATH||chromium.executablePath())?0:1)"` — a non-zero exit names nothing, so run each part on its own to see which is missing. Set `CHROMIUM_PATH` when Chromium lives outside Playwright's cache. Corpus reads need network access to `raw.githubusercontent.com`.

## Phase 1: Seed

Carry the person's words about the video verbatim as the seed. Invoked without them, ask once what the video is for, then proceed.

## Phase 2: Elicit

Open with one plain sentence on what happens next: a few questions about the video, answered in any words or skipped, then preview frames to check, then the finished video.

Invoke `/elicit` on the seed — the skill call itself. The coordinates below are the domain's decision structure that `/elicit` draws on: candidates raised where the seed leaves them open and the person's own words have not already settled them, after the coordinates those words raise, never as a checklist walked in order. Phrase each in the person's situation rather than the craft term, and say what happens if it is left unsaid.

These decisions hold for every kind of video:

- **Where it will be shown** (aspect ratio, size) — "Where will people watch this: a phone feed, a web page, a slide?" Left unsaid, the builder picks a frame shape, and a vertical feed video built square loses half the screen.
- **How long** (duration) — "About how many seconds?" Left unsaid, the builder picks; every later timing hangs on this number.
- **What happens in what order** (scenes, beats) — "What should be seen first, what next, how does it end?" Left unsaid, the builder invents the sequence.
- **Sound** (music, effects, voice; sync) — "Silent, music, or a voice? If music, do you have a track?" A provided track sets the beat the motion lands on. Left unsaid, the builder chooses silence or synthesized sound, and nothing lands on a beat.
- **Look** (style reference, colors) — "Is there a video, brand, or site whose look you want? Any colors to use or avoid?" Left unsaid, the result tends toward a generic look.
- **Words on screen** (text, typography) — "Must any exact words appear? Any font or brand lettering?" Left unsaid, the builder writes its own text.
- **Smoothness** (frame rate) — "Smooth like a phone screen (60 frames a second) or calmer, film-like (24–30)?" Left unsaid, 30.
- **Repeat** (loop) — "Will it autoplay on repeat, so the end should flow back into the start?" Left unsaid, it ends with a hard cut.
- **What would make it wrong** (checking) — "What would you look for to say 'not this'?" The answer chooses the moments shown as preview frames in Phase 5. Left unsaid, the builder checks its own work.

Where the kind of video comes into view — the seed implies it, or the person cannot picture it — read `references/fast-axes.md`: it says where the current kinds are named, the decisions that depend on the kind, and how to pull live examples the person can point at.

## Seam: who settles what stays open

When `/elicit` resolves, run the Preflight, so a missing prerequisite (an install) is known. This run's output folder is `~/motion-output/<name>/`, `<name>` a short slug of the seed plus the start time (`launch-reel-20261020-1432`): fresh for every run, so nothing from an earlier run is overwritten, while files this run writes there are regenerated as the preview loop needs. Then read `/elicit`'s residual beside the build and render plan. Who settles what is still open, and how far an entrustment reaches, is undefined — the deficit `/bound` resolves — where either holds:

- the residual is non-empty;
- the plan includes an act that is hard to undo or reaches outside: installing a render prerequisite, fetching an asset that carries a license (music, fonts, images), overwriting an existing output.

Where it is undefined, invoke `/bound` — the skill call itself — on the build boundary: those residual coordinates and those acts. The video's content stays as `/elicit` closed it. Where neither holds, go straight to Phase 3.

Once the boundary stands, its arrangements govern the build:

- an item the person keeps waits for their value;
- an item they asked proposals for is shown with its candidates at the Phase 5 preview;
- an item entrusted to the builder is chosen within the stated limits and reported in Phase 6;
- an act that is hard to undo goes only as far as the reach shown for it.

An item the boundary leaves with no arrangement: a coordinate is built on a value the builder states — the coordinate's "Left unsaid" value where it has one — and is marked at the Phase 5 preview as not yet decided, with that value; an act does not happen.

## Phase 3: Assemble the prompt

Past the seam, write the build prompt from `/elicit`'s record in this shape, each section in the words the record holds:

- `<inputs>` — files the person supplies (track, logo, exact text) and where they are.
- `<direction>` — the look, the feel of movement, and what is banned.
- `<structure>` — the scenes in order, each with its start time in seconds; on a provided track, on its beat grid.
- `<build>` — the page contract of Phase 4, the size, frame rate, and loop.
- `<gotchas>` — what the person said would make it wrong.
- `<start>` — "Build the page, then show the preview frames before the full render."

Each residual coordinate goes into `<build>` with the arrangement the seam's boundary gives it. Save the prompt as `prompt.md` in this run's output folder and show it: it is also something the person can paste into another session.

## Phase 4: Build

Write one self-contained HTML file in the output folder:

- `window.DURATION` — length in seconds.
- `window.seek(t)` — draws the frame for time `t` from `t` alone: no timers, CSS transitions, `requestAnimationFrame` loops, or state carried between calls. The renderer calls it in any order.
- A fixed canvas size matching the shape chosen in Phase 2.
- With a loop, the frame at `DURATION` matches the frame at 0.
- Sound: a supplied track is muxed by the renderer and the structure times are placed on its beats; synthesized sound is exposed as `window.renderAudio()`, resolving to a base64 WAV rendered with an `OfflineAudioContext`.

## Phase 5: Preview

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/motion/scripts/render.cjs <page.html> --size <W>x<H> --preview <t1,t2,...>
```

A non-zero exit is a failed check — a page error, a font that did not load, a bad argument — and its message says which; fix the page and run again. Choose times at each scene boundary and at the moments the person named in "what would make it wrong". Show each `MOTION_PREVIEW=` frame with its time and the scene it belongs to, each item left for proposal with its candidates, and each item marked not yet decided with the value it was built on, then stop for the person's turn. Changes go back into the page, and into `prompt.md` where they change what it says, and the preview runs again; their go-ahead moves to Phase 6.

## Phase 6: Render

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/motion/scripts/render.cjs <page.html> --size <W>x<H> --fps <fps> [--subframes 4] [--audio <track>] [--overwrite]
```

`--subframes N` blends N captures per frame into motion blur. The mp4 lands beside the page and runs exactly `DURATION`: a shorter track is padded with silence, a longer one cut. `--overwrite` replaces an existing mp4 or wav, and is passed for a file this run wrote or where the seam's boundary reached that overwrite. A non-zero exit means no mp4 was written; report its message. Report the `MOTION_OUTPUT_PATH=` file, its length and size, and each choice the builder made on an item entrusted to it.
