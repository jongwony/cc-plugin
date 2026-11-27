# What goes to agy, and how Claude hands it over

Read this when a task touches a Google service or asks to understand a media
file, and before writing the prompt for such a run.

## What goes to agy

- A task on a Google service — Gmail, Drive, Docs, Calendar, YouTube, Maps,
  Workspace, or anything else Claude judges to be a Google service → a Gemini
  model through `agy`, first.
- Understanding a local video, audio, or image file → `agy`, opening the file
  with its own `read_file` (`references/agy-features.md` § Local Media).
- Preparing the input — downloading (`yt-dlp`), trimming or converting
  (`ffmpeg`), any other shell work, and the orchestration around the run →
  Claude, itself.

## How Claude hands it over

- Claude shapes the context first: gathers what the task needs, prepares the
  input file, and narrows the question to what `agy` must check or understand.
- The prompt carries that shaped context and the file's path, not a URL or a
  step that needs the shell; `--add-dir <dir>` opens a directory outside
  `-C DIR`.
- `agy` checks or understands it with its own tools and reports back; Claude
  weighs the report against the context it shaped.

## Outside local agy

- A YouTube URL analyzed without downloading it, fps / clip / media-resolution
  control, or a timestamped transcription → the Gemini API, on the cloud side.
