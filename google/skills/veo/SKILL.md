---
name: veo
description: |
  This skill should be used when the user specifically asks for Veo, or
  names a Veo-specific control: "generate video with Veo", "extend this
  video" / "video-to-video", "first and last frame transition", "ingredients
  to video" / "consistent characters across shots", or integrating with an
  existing Veo pipeline.

  Not the default for a plain "generate a video" / "make a video from this
  photo" request with no Veo-specific control named — prefer Gemini Omni
  Flash for that. Reach for this skill only when the task specifically
  needs Veo's own controls.
context: fork
model: sonnet
---

# Veo Video Generation

Generate video with Google Veo via the Gemini API, with cinematography
control and synchronized audio.

Not the default video-generation route — a plain "generate a video of X"
goes to Gemini Omni Flash. Come here for Veo's own controls.

```bash
export GEMINI_API_KEY="your-api-key"
SCRIPT="${CLAUDE_PLUGIN_ROOT}/skills/veo/scripts/generate_video.py"

uv run "$SCRIPT" "A neon hologram of a cat driving at top speed"
uv run "$SCRIPT" "Slow dolly shot, cinematic lighting" --image photo.jpg
```

The path goes through `CLAUDE_PLUGIN_ROOT` because this runs with the
user's project as the working directory, not this one. A bare relative
path does not resolve.

The script declares its own dependency inline (PEP 723), so `uv run`
resolves it; there is no install step.

`--help` is the list of model variants, durations, and resolutions the
script accepts. It is generated from the code, so it is current in a way
this page cannot be — read it before choosing flags, and do not take a
variant name from prose anywhere.

The script covers text-to-video and image-to-video, and nothing else.
Video extension, first/last-frame transitions, and ingredients-to-video
take more inputs than a CLI comfortably carries; timestamp prompting takes
no parameter at all. None of the four are commands — they are code and
prompt text to adapt in place, in
[references/api-examples.md](references/api-examples.md) and
[references/prompting-guide.md](references/prompting-guide.md).

## Variant, duration, resolution — read the model table, not this page

Three things about a Veo generation are decided together, and all three
move with each Veo release. No figures are given here on purpose; what
follows is what to look up and where.

**The variants are not one model at several prices.** They differ in
which *inputs* they accept, so a workflow needing a source video or
reference images can be unavailable on a cheaper rung whatever its price
per second. Check the accepted inputs before designing around a variant,
not after.

**Duration and resolution are not independent.** The higher resolutions
are offered at a restricted set of clip lengths, so shortening a clip can
force the resolution down in the same command. The script rejects an
invalid pair locally, naming both flags, instead of letting the request go
out and come back rejected — so the error message, not this page, is where
the current rule reaches you.

**Audio is not reliably a lever.** Whether it can be switched off at all,
and whether switching it off changes the price, differs by model line —
look it up in the same table before planning a silent render or budgeting
around one.

All three live in one place: the model table on
[the Veo API page](https://ai.google.dev/gemini-api/docs/video), with
per-second figures on
[the Gemini API pricing page](https://ai.google.dev/gemini-api/docs/pricing).

## The Prompting Formula

For consistent, high-quality results, structure prompts using:

**[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]**

### Example

```
Medium shot, a tired corporate worker, rubbing his temples in exhaustion,
in front of a bulky 1980s computer in a cluttered office late at night.
The scene is lit by the harsh fluorescent overhead lights and the green
glow of the monochrome monitor. Retro aesthetic, shot as if on 1980s
color film, slightly grainy.
```

For detailed cinematography language (camera movements, composition, lens
techniques), see [references/prompting-guide.md](references/prompting-guide.md).

## Audio

Veo builds the soundtrack from the prompt text. There is no audio
parameter to reach for — dialogue, effects, and ambience are written into
the same string as the picture, and the idioms for each are in
[references/prompting-guide.md](references/prompting-guide.md).

## Watermarking

Veo output is watermarked. Whether a given clip carries a *visible* mark
on top of the invisible one varies by surface and by release, and it is
not something to assume in either direction — generate one clip and look
at it before promising a client an unmarked render.

## Resources

- [Veo API Reference](https://ai.google.dev/gemini-api/docs/video)
- [Google GenAI Python SDK](https://github.com/googleapis/python-genai)
