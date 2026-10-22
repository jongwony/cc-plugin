# Fast Axes — What Changes with the Kind of Video

## The kind of video

The kind is itself a decision a newcomer rarely names.

## Real examples to point at

Read the current listing of [awesome-opus5-5-videos](https://github.com/yihui-dev/awesome-opus5-5-videos) (`data/videos.json`) when examples are needed, and show real ones as links — author, watch link where there is one, original post. Where the kind is still unclear, show a few that contrast across kinds; where it is clear, show ones close to what the person described. Ask which is closest to what they picture.

## Decisions that depend on the kind

- **How it is drawn** (render technology)
  - Ask: "Flat shapes and text, or real depth and lighting?"
  - Left unsaid, the builder picks, and a 3D request built flat (or the reverse) is the most visible miss.
  - Ask: "Should everything be drawn by the code, or may generated or supplied pictures stand in for parts of the scene?"
  - Left unsaid, builders settle this differently, and the look, the cost, and whether those parts can move later all change with it.
- **Whether it responds to input** (interactivity)
  - Ask: "The video itself can't be clicked. Should it show someone clicking or playing through it, or only things moving on their own?"
  - Where it shows someone playing, the clicks, drags, and key presses become moments in the sequence. Left unsaid, things move on their own.
- **What is being told** (subject and narration)
  - Ask: "What should someone know or be able to do after watching?"
  - A voice (Sound) needs a recorded or provided audio file; with no voice, the weight moves onto words on screen and pacing.
  - Left unsaid, the builder decides what must stay accurate — facts, how something works, product details — and what may be simplified.
- **How the movement feels** (springs, easing, physics, particles)
  - Ask: "Should things move crisply like an app interface, or loosely like objects with weight?"
  - Left unsaid, the builder may add bounce and particles, which read as template-like in interface motion.
