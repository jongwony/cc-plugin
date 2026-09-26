---
name: seedance
description: |
  This skill should be used when the user names Seedance or Higgsfield for a
  video, or asks for a multi-shot cinematic clip, an image-to-video shot
  anchored on a first and/or last frame, or a clip lip-synced to an audio
  file: "make a Seedance video", "generate this on Higgsfield", "animate this
  photo into a 15s multi-shot clip", "make her speak this voice line".

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

## Constraints — read the CLI, not this page

Which Seedance models exist, their `job_set_type` ids, and each one's
accepted durations, aspect ratios, parameters, and media roles all move
with Higgsfield releases. No figures are given here on purpose.

- `higgsfield model list --video` — the current video models and their ids.
  The all-purpose Seedance model has been `seedance_2_0`; confirm it is
  still listed before using it.
- `higgsfield model get <id> --json` — that model's schema: aspect ratios,
  durations (a closed list or a min/max range), parameters with defaults,
  and the media roles each input slot accepts. Pass only what the schema
  declares; leave the rest to its defaults.

Stay on the newest Seedance model the user's intent fits. An older model
whose duration list looks simpler is not a reason to step down — validate
the newer one against its schema first. When the user names a model, use
that one.

## Inputs — images, video, audio

Media flags take a local path (the CLI uploads it) or a UUID (an upload id
from `higgsfield upload create`, or a previous job id — the CLI tells the
two apart).

| Flag | What it anchors |
|---|---|
| `--image` | a reference image — character, prop, location, style; repeatable |
| `--start-image` | the first frame |
| `--end-image` | the last frame, for a transition between two frames |
| `--video` | a reference clip |
| `--audio` | a voice or soundtrack to sync to — lipsync goes here |

These are the roles Seedance has declared; `model get` is the authority
when one is rejected (`Unknown media role`). Audio sync goes through
`--audio`, never through an audio-generation parameter the schema does not
declare.

## Drafting the prompt

Read [references/prompting.md](references/prompting.md) before writing the
prompt. It carries the structure Seedance responds to — the shot header,
per-shot or per-second beats, camera instructions, sound lines — and what
changes when a start frame is attached.

Show the user the drafted prompt before submitting when their brief left
the shot structure, duration, or aspect ratio open; submit directly when
they already fixed those.

## Submitting

A generation spends the user's Higgsfield credits. The user asking for the
video is the go-ahead for one run; before a batch or a retry loop, say how
many runs and ask. `higgsfield generate cost <id> [same flags]` estimates
credits without submitting — use it when the user asks about cost.

Seedance prompts run to many lines and carry quotes, so write the prompt
to a file and pipe it in rather than quoting it on the command line:

```bash
higgsfield generate create seedance_2_0 \
  --start-image ./first.png --aspect_ratio <ratio> --duration <seconds> \
  --wait --wait-timeout 20m < prompt.txt
```

Flags other than media and `--wait*` pass straight through to the model
schema as `--<param> <value>`. `--wait` blocks until the job finishes and
prints the result URL; long clips need a longer `--wait-timeout` than the
default. A job started without `--wait` can be rejoined with
`higgsfield generate wait <job_id>`; `generate list` and `generate get <id>`
show past jobs. Add `--json` only when a later step parses the output.

## Delivering

Give the result URL and one line: model, duration, aspect ratio. Keep job
ids and raw JSON out of the reply unless the user asks for them.

## When it fails

| Message | Meaning and next move |
|---|---|
| `Session expired` / `Not authenticated` / credentials for another environment | the user runs `! higgsfield auth login` |
| `Missing required params: prompt` | the prompt did not reach the CLI — check the stdin redirect |
| `Invalid values: <param>=<v> (allowed: …)` | pick from the allowed list it prints |
| `Unknown params: <name>` | the schema does not declare that flag — re-read `model get` |
| job ends `failed`, `nsfw`, or `ip_detected` | content policy or a server-side failure — rephrase; real public figures, sexual content, and trademarked characters are rejected |
| timeout while waiting | the job is still running — `generate wait <job_id>`, or raise `--wait-timeout` |
| HTTP 429 | rate limited — back off before retrying |
| an HTML body mentioning a captcha | the server's bot check fired — wait about half a minute and retry once |

The server may also return non-fatal `adjustments` (a value coerced to the
nearest accepted one); mention them to the user when they change what was
asked for.
