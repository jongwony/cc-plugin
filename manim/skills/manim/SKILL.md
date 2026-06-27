---
name: manim
description: |
  This skill should be used when the user asks to "make a math animation",
  "animate an equation", "manim animation", "render a Manim scene",
  "parametric curve animation", "3D plot animation", "animated graph/diagram for
  a web page", "concept explainer video", or wants a short mathematical /
  diagrammatic motion clip to embed in an HTML page. Authors a Manim Scene from
  the request, renders it headless, and returns the video path plus a
  ready-to-paste `<video>`/`<img>` embed snippet. Default output is a muted,
  loopable mp4 (no audio track). Out of scope: editing existing footage, audio,
  or non-math UI/architecture diagrams.
argument-hint: "[describe the animation, or pass a scene .py path]"
---

# Manim

Generate a short mathematical / diagrammatic animation video for embedding in an
HTML page. This is a thin orchestration layer: **Manim is the externally
provisioned runtime** — it is never vendored or reimplemented here. The driver
script composes Manim's programmatic render path; `uv` provisions the Python
stack; Cairo + Pango come from the system.

Respond in the user's language.

## Prerequisites

| Dependency | Install | Purpose |
|------------|---------|---------|
| uv | (already present) | Runs the driver; auto-provisions `manim==0.20.*` on first run |
| Cairo + Pango | `brew install cairo pango pkg-config` | Vector/text rasterization (`pkg-config` lets the build find them) |
| LaTeX | *optional* — `brew install --cask mactex-no-gui` (or TinyTeX) | **Only** for `Tex`/`MathTex` mobjects; a full TeX install is multi-GB — keep it OFF unless rendering equations |

### Preflight

Verify the system libraries before authoring (mirrors a `which`-style gate). The
first `manim checkhealth` run also provisions the Manim stack into uv's cache:

```bash
which pkg-config && pkg-config --exists cairo pango && echo "cairo/pango OK"
uvx --from 'manim==0.20.*' manim checkhealth
```

`manim checkhealth` verifies Cairo/Pango and **warns if LaTeX is absent** — that
warning is expected and fine; LaTeX is opt-in (see below). If `pkg-config` is
missing, the first render's wheel build for `pycairo` will fail — install it now.

## Workflow

### Phase 1: Author the Scene

Translate the user's request into a `Scene` subclass in a `.py` file. Keep it
**short** (a few seconds — these are loopable web clips) and **silent** (Manim
output has no audio track, which is what muted-autoplay wants).

```python
from manim import *

class MyScene(Scene):
    def construct(self):
        axes = Axes(x_range=[-3, 3], y_range=[-2, 2])
        graph = axes.plot(lambda x: x**2 / 2, color=BLUE)
        self.play(Create(axes), run_time=1)
        self.play(Create(graph), run_time=1.5)
        self.wait(0.5)
```

Authoring guidance:
- One `Scene` subclass per request is simplest; the driver auto-selects the sole
  one (pass `--scene NAME` when a file defines several).
- **No-LaTeX text path**: use `Text(...)` / `MarkupText(...)` (Pango-rendered) for
  labels. Reach for `MathTex(...)` / `Tex(...)` **only** for real equations — that
  path invokes LaTeX and requires the opt-in toolchain.
- Common building blocks: `Axes`/`NumberPlane` + `.plot()` for graphs, geometric
  mobjects (`Circle`, `Square`, `Polygon`, `Arrow`), `ParametricFunction` for
  curves, `ThreeDScene` + `ThreeDAxes` for 3D. Animate with `self.play(Create(...),
  Transform(a, b), FadeIn(...), ...)` and pace with `run_time` / `self.wait()`.

Write the scene to a working file (e.g. under the scratchpad), not into the repo.

### Phase 2: Render (headless)

Run the driver. It provisions Manim on first call, renders with the default
software Cairo renderer (no display needed), moves the file to a known path, and
prints the absolute path + embed snippet.

```bash
uv run ${CLAUDE_PLUGIN_ROOT}/skills/manim/scripts/render.py <scene.py> [flags]
```

| Flag | Default | Effect |
|------|---------|--------|
| `--scene NAME` / `-s` | sole Scene in file | Pick which Scene class to render |
| `--format FMT` / `-f` | `mp4` | `mp4` (H.264, universal) · `webm` (VP9) · `gif` (tiny inline loop) |
| `--quality Q` / `-q` | `medium` | `low` 480p15 · `medium` 720p30 · `high` 1080p60 · `fourk` 2160p60 |
| `--output PATH` / `-o` | `~/manim-output/<Scene>.<ext>` | Destination file |
| `--transparent` / `-t` | off | Transparent background — **implies webm** (alpha needs the VP9 codec; mp4/H.264 has none) |
| `--latex` | off | Assert a LaTeX toolchain is present *before* rendering; fail clean if not. Pass this for `Tex`/`MathTex` scenes |
| `--keep-work` | off | Keep the intermediate media directory |

Examples:

```bash
# Default muted-loop mp4
uv run ${CLAUDE_PLUGIN_ROOT}/skills/manim/scripts/render.py /tmp/scene.py

# Transparent overlay (auto-webm)
uv run ${CLAUDE_PLUGIN_ROOT}/skills/manim/scripts/render.py /tmp/scene.py -t

# Equation scene (LaTeX preflight) at high quality
uv run ${CLAUDE_PLUGIN_ROOT}/skills/manim/scripts/render.py /tmp/scene.py --latex -q high
```

### Phase 3: Return

Report two things to the user:
1. The **absolute path** to the rendered file (the `MANIM_OUTPUT_PATH=` line).
2. The **embed snippet**, ready to paste:
   - mp4 / webm → `<video autoplay muted loop playsinline src="..."></video>`
   - gif → `<img src="..." loading="lazy">`

The `src` is the local absolute path (previewable via `file://`); tell the user to
swap it for their served URL when hosting. Do **not** build any further HTML-page
integration — emitting the snippet is the whole output contract.

## Notes

- **Format choice**: `mp4` is the safe default (universal browser support, small).
  Use `webm` only for transparency. Use `gif` for very short inline loops where a
  `<video>` element is overkill — but gifs are larger and lower quality.
- **First render is slow** — uv resolves and caches the Manim stack (numpy, scipy,
  pycairo, manimpango, av, ...). Subsequent renders are fast.
- **LaTeX stays off by default.** Equations are the only trigger; everything else
  (text via Pango, shapes, graphs, 3D) renders without it.
