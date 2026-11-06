# Fast Axes — What Changes with the Kind of Video

## The kind of video

The reading names the kind it took.

## Real examples to point at

Read the current listing of [awesome-opus5-5-videos](https://github.com/yihui-dev/awesome-opus5-5-videos) (`data/videos.json`) when examples are needed, and show real ones as links — author, watch link where there is one, original post. Where the kind is still unclear, show a few that contrast across kinds; where it is clear, show ones close to the reading, and say which one the build is closest to.

## Decisions that depend on the kind

Each value is drawn as the decisions in `SKILL.md` are, and each comes with what a wrong value costs:

- **How it is drawn** (render technology)
  - Flat shapes and text, or real depth and lighting — a 3D request built flat, or the reverse, is the most visible miss.
  - Everything drawn by the code, or generated or supplied pictures standing in for parts of the scene — a picture may keep the look but limit changing the viewpoint or moving its parts independently.
- **Whether it responds to input** (interactivity)
  - The video itself cannot be clicked; it can show someone clicking or playing through it, and then the clicks, drags, and key presses become moments in the sequence. Without that in the request, things move on their own.
- **What is being told** (subject and narration)
  - What someone should know or be able to do after watching.
  - A voice needs a recorded or provided audio file; with no voice, the weight moves onto words on screen and pacing.
  - Where it depicts something real, which facts or details must match and what may be simplified — facts, how something works, product details; the reading names what it keeps accurate.
- **How the movement feels** (springs, easing, physics, particles)
  - Crisp like an app interface, or loose like objects with weight — added bounce and particles read as template-like in interface motion.
