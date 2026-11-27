# What goes to agy, and how Claude hands it over

Read this when a task touches a Google service or asks to understand a local
media file, and before writing the prompt for such a run.

## What goes to agy

- A task on a Google service — Gmail, Drive, Docs, Calendar, YouTube, Maps,
  Workspace, or anything else Claude judges to be a Google service → a Gemini
  model through `agy`, first.
- Understanding a video — a local file, or a YouTube URL that Claude first
  downloads with `yt-dlp` → `agy`, opening the file with its own `read_file`
  (`references/agy-features.md` § Local Media). Audio and image files are
  unverified on this path.
- Preparing the input — downloading, trimming or converting (`ffmpeg`), any
  other shell work, and the orchestration around the run → Claude, itself.

## Reach on a Google service

- Before routing a Google-service task, run `agy plugin list` and
  `agy mcp list`.
- A plugin or MCP server there covers the service → `agy` reads the service
  itself.
- None covers it → Claude gathers the service's context itself (its own
  connectors, files, downloads) and hands it over for `agy` to check.
- A Google-service run is read-only: pass `-M plan` unless writing is the
  task. A send, edit, or delete on a Google service goes to `agy` only with the
  user's go-ahead.

## How Claude hands it over

- Claude shapes the context first: gathers what the task needs, prepares the
  input file, and narrows the question to what `agy` must check or understand.
- The prompt carries that shaped context and the file's absolute path, not a
  URL or a step that needs the shell; `--add-dir "$(dirname <file>)"` opens the
  file's directory when it lies outside `-C DIR`.
- `agy` checks or understands it with its own tools and reports back; Claude
  weighs the report against the context it shaped.

## Outside local agy

- A YouTube URL analyzed without downloading it, fps / clip / media-resolution
  control, or a timestamped transcript of audio or video → the
  `google:video-understanding` skill (Gemini API), where it is enabled (cloud).
