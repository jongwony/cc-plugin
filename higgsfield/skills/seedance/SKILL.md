---
name: seedance
description: |
  This skill should be used when the user names Seedance or Higgsfield for a
  video, or asks for a multi-shot cinematic clip, an image-to-video shot
  anchored on a first and/or last frame, a clip with spoken dialogue or
  lip-synced to an audio file, or an edit or extension of an existing clip:
  "make a Seedance video", "generate this on Higgsfield", "animate this
  photo into a 15s multi-shot clip", "make her speak this voice line",
  "extend this clip".

  Video only. Image generation, ads, and avatar or identity training are out
  of scope — route images elsewhere.
---

# Seedance Video on Higgsfield

Draft a Seedance prompt from the user's intent, submit it through the
`higgsfield` CLI, and hand back the result URL. The prompt is where the
quality comes from; the CLI part is mechanical.

## Prerequisite — the CLI and a session

The `higgsfield` CLI is a prerequisite, not something this plugin ships.

1. `command -v higgsfield` — when absent, install it with the vendor's
   installer, `curl -fsSL https://raw.githubusercontent.com/higgsfield-ai/cli/main/install.sh | sh`.
2. `higgsfield account status` — when it reports `Session expired` or
   `Not authenticated`, the login is interactive: ask the user to run
   `! higgsfield auth login` and wait for them to confirm before going on.

Every other command in this skill fails with the same two messages until
the session is valid, so check once up front rather than per command.

## The model — Seedance 2.5 only

Use `seedance_2_5`, and only it: this skill tracks the newest Seedance
release and nothing older. When the user asks for something 2.5's schema
does not accept, say so rather than switching to another model.

Its accepted durations, aspect ratios, resolutions, parameters, and media
limits move with Higgsfield releases, so no figures are given here.

- `higgsfield model list --video` — confirm `seedance_2_5` is still listed.
  When a newer Seedance has replaced it, use that one and read its schema
  before relying on anything below.
- `higgsfield model get seedance_2_5 --json` — the schema: modes, durations,
  aspect ratios, resolutions, parameters with defaults, and the media roles
  each input slot accepts. Pass only what the schema declares; leave the
  rest to its defaults.

## Modes

`--mode` decides what the job is and which inputs it takes:

| Mode | Use for |
|---|---|
| `t2v` | prompt only — accepts no media |
| `omni_reference` | any job with an input: a first or last frame, reference images, a reference clip, or audio |
| `video_edit` | changing an existing clip |
| `video_extension` | continuing an existing clip |

For the two clip modes, read `model get` for the role the source clip takes.

## Inputs — images, video, audio

Media flags take a local path (the CLI uploads it) or a UUID (an upload id
from `higgsfield upload create`, or a previous job id — the CLI tells the
two apart). Any of them needs `--mode omni_reference` or a clip mode.

| Flag | What it anchors |
|---|---|
| `--image` | a reference image — character, prop, location, style; repeatable |
| `--start-image` | the first frame |
| `--end-image` | the last frame, for a transition between two frames |
| `--video` | a reference clip, or the source clip to edit or extend |
| `--audio` | a voice or soundtrack to sync to |

`model get` is the authority when a role is rejected (`Unknown media role`).

## Sound and speech

Seedance generates sound in the same pass as the picture while
`--generate_audio` is on, which is its default: ambience, effects, and any
dialogue the prompt quotes, lip-synced to the speaker. Write the lines into
the prompt for speech the model voices itself. Pass `--audio` only when the
user supplies the recording to sync to; an audio reference also needs an
image or video input beside it. Turn `--generate_audio` off only when the
user wants a silent clip.

## Drafting the prompt

Read [references/prompting.md](references/prompting.md) before writing the
prompt. It carries the labelled layout Seedance responds to — style, cast,
blocking, shots, locks, dialogue, audio — and what changes when a start
frame or reference images are attached.

Show the user the drafted prompt before submitting when their brief left
the shot structure, duration, or aspect ratio open; submit directly when
they already fixed those.

## Submitting

A generation spends the user's Higgsfield credits. The user asking for the
video is the go-ahead for one run; before a batch or a retry loop, say how
many runs and ask. `higgsfield generate cost seedance_2_5 [same flags]`
estimates credits without submitting — use it when the user asks about
cost.

While a clip is still being iterated, draft at the lowest resolution the
schema accepts and render the final take at the resolution the user wants;
say which one a run used.

Seedance prompts run to many lines and carry quotes, so write the prompt
to a file and pipe it in rather than quoting it on the command line:

```bash
higgsfield generate create seedance_2_5 --mode omni_reference \
  --start-image ./first.png --aspect_ratio <ratio> --duration <seconds> \
  --resolution <res> --wait --wait-timeout 20m < prompt.txt
```

Flags other than media and `--wait*` pass straight through to the model
schema as `--<param> <value>`. `--wait` blocks until the job finishes and
prints the result URL; long clips need a longer `--wait-timeout` than the
default. A job started without `--wait` can be rejoined with
`higgsfield generate wait <job_id>`; `generate list` and `generate get <id>`
show past jobs. Add `--json` only when a later step parses the output.

## Delivering

Give the result URL and one line: mode, duration, aspect ratio, resolution.
Keep job ids and raw JSON out of the reply unless the user asks for them.

## When it fails

| Message | Meaning and next move |
|---|---|
| `Session expired` / `Not authenticated` / credentials for another environment | the user runs `! higgsfield auth login` |
| `Missing required params: prompt` | the prompt did not reach the CLI — check the stdin redirect |
| `Invalid values: <param>=<v> (allowed: …)` | pick from the allowed list it prints |
| `Unknown params: <name>` | the schema does not declare that flag — re-read `model get` |
| media rejected on a `t2v` job | the job has an input — resubmit with `--mode omni_reference` |
| a reference-count or audio-reference constraint | the schema's media limits — drop references, or add the image or video an audio reference needs |
| job ends `failed`, `nsfw`, or `ip_detected` | content policy or a server-side failure — rephrase; real public figures, sexual content, and trademarked characters are rejected |
| timeout while waiting | the job is still running — `generate wait <job_id>`, or raise `--wait-timeout` |
| HTTP 429 | rate limited — back off before retrying |
| an HTML body mentioning a captcha | the server's bot check fired — wait about half a minute and retry once |

The server may also return non-fatal `adjustments` (a value coerced to the
nearest accepted one); mention them to the user when they change what was
asked for.
