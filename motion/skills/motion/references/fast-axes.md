# Fast Axes — What Changes with the Kind of Video

Read when the kind of video is in view: when the person's seed implies one, when they pick one from examples, or when a decision below comes up. These decisions matter in some kinds of video and barely in others, so they are raised only for the kind at hand. Offer each as a candidate coordinate to `/elicit`, phrased in the person's situation, after the decisions their own words raise.

## The kind of video

The corpus sorts videos into four kinds. The kind is itself a decision a newcomer rarely names; show live examples (below) and let them point.

- **motion** — product, brand, or UI motion: a launch reel, a logo sting, an interface that morphs.
- **3d** — a scene with depth: terrain, objects, a camera flying through space.
- **explainer** — something taught or told: a recipe, a process, data, a piece of history.
- **interactive** — something played or steered: a game, a simulation, a toy.

## Decisions that depend on the kind

- **How it is drawn** (render technology) — weighs most in 3d and interactive.
  - Ask: "Flat shapes and text, or real depth and lighting?"
  - Flat → 2D canvas or SVG. Depth → Three.js or a shader. Left unsaid, the builder picks, and a 3D request built flat (or the reverse) is the most visible miss.
- **Whether it responds to input** (interactivity) — interactive only.
  - Ask: "Should a viewer be able to click or play it, or only watch?"
  - The deliverable is an mp4, so a playable piece is recorded as a scripted run: the inputs (clicks, drags, key presses) become part of the storyboard, written as times in `seek(t)`.
- **What is being told** (subject and narration) — explainer most of all.
  - Ask: "What should someone know or be able to do after watching?" and "Is there a voice explaining it, or only on-screen text?"
  - A voice needs a recorded or provided audio file; text-only narration moves the weight onto words on screen and pacing.
- **How the movement feels** (springs, easing, physics, particles) — interactive and 3d lean on it.
  - Ask: "Should things move crisply like an app interface, or loosely like objects with weight?"
  - Left unsaid, the builder may add bounce and particles, which read as template-like in interface motion.
- **Length emphasis** — motion prompts state length more often than the others; for motion, ask for it early, since the beat grid hangs on it.

## Live examples as recognition material

Recognition beats description for someone who cannot name what they want. Pull examples live; nothing is stored here:

```bash
python3 -I ${CLAUDE_PLUGIN_ROOT}/skills/motion/scripts/corpus.py examples --category <kind> [--tag <tech>] [--limit 6]
```

Show each as its author, watch link where it has one, and original post; offer "which is closest to what you picture?" A chosen example settles the kind and often the look and how it is drawn; record what the person says about it, in their words. Prompt text from the corpus is not reproduced to the person or copied into the assembled prompt; the person's choice is what carries over.

## Re-measuring which axes are fast

```bash
python3 -I ${CLAUDE_PLUGIN_ROOT}/skills/motion/scripts/corpus.py axes
```

Prints, per axis, the share of complete prompts that mention it overall and per kind, and the spread across kinds. A high spread marks an axis as fast (it belongs here); a low spread marks it slow (it belongs in `SKILL.md`). The corpus changes daily, so the split is re-read rather than trusted.
