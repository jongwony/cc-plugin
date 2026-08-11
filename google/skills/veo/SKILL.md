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
  Flash for that (Google's current default for video generation: better
  coherence, multi-input reasoning, character consistency, multi-turn
  editing). Reach for this skill only when the task specifically needs
  Veo's own controls.
context: fork
model: sonnet
---

# Veo Video Generation

Generate video with Google Veo 3.1 via the Gemini API, with cinematography
control and synchronized audio.

Not the default video-generation route: a plain "generate a video of X" is
Gemini Omni Flash's job, which leads on coherence, multi-input reasoning,
character consistency, and multi-turn editing. Come here for Veo's own
controls.

```bash
export GEMINI_API_KEY="your-api-key"
SCRIPT="${CLAUDE_PLUGIN_ROOT}/skills/veo/scripts/generate_video.py"

uv run "$SCRIPT" "A neon hologram of a cat driving at top speed"
uv run "$SCRIPT" "Slow dolly shot, cinematic lighting" --image photo.jpg
uv run "$SCRIPT" "Zoom out to reveal the skyline" --model veo-3.1-fast-generate-preview --duration 4
```

The path goes through `CLAUDE_PLUGIN_ROOT` because this runs with the
user's project as the working directory, not this one. A bare relative
path does not resolve.

The script declares its own dependency inline (PEP 723), so `uv run`
resolves it; there is no install step. `--help` carries the current flags.

The script covers text-to-video and image-to-video, and nothing else.
Video extension, first/last-frame transitions, and ingredients-to-video
take more inputs than a CLI comfortably carries; timestamp prompting takes
no parameter at all. None of the four are commands — they are code and
prompt text to adapt in place, in
[references/api-examples.md](references/api-examples.md) and
[references/prompting-guide.md](references/prompting-guide.md).

## Choosing a Veo variant

| Model | Use when |
|---|---|
| `veo-3.1-generate-preview` | Best fidelity, production/hero shots |
| `veo-3.1-fast-generate-preview` | Faster iteration, drafts |
| `veo-3.1-lite-generate-preview` | Cheapest, quick previews, high volume |

Price scales per second of output, and the same two levers move it for
every variant: resolution, and whether audio is generated alongside the
video (video+audio costs more than video-only). Check
[Google's Vertex AI generative-AI pricing page](https://cloud.google.com/vertex-ai/generative-ai/pricing)
for the current per-second figures before a spend decision — a number
copied here would go stale silently.

## Duration

Supported single-generation durations are **4, 6, or 8 seconds** —
anything else is rejected by the API. `--duration` defaults to 8.

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

## Audio Direction

Veo 3.1 generates complete soundtracks based on text instructions in the
same prompt — there is no separate audio parameter.

- **Dialogue** — quotation marks: `A woman says, "We have to leave now."`
- **Sound effects** — described explicitly: `SFX: thunder cracks in the distance`
- **Ambient noise** — background soundscape: `Ambient noise: the quiet hum of a starship bridge`

## Watermarking

Google DeepMind documents that Veo output carries an invisible SynthID
watermark — invisible does not mean absent. Whether API output *also*
carries a visible watermark, the way some consumer surfaces (the Gemini
app, Flow) do, is **not verified here** — check a generated clip rather
than assuming either way.

## Resources

- [Veo API Reference](https://ai.google.dev/gemini-api/docs/video)
- [Google GenAI Python SDK](https://github.com/googleapis/python-genai)
