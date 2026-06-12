---
name: handwriting
description: Read and interpret Apple Pencil handwriting from Apple Notes (including iPad Quick Note popups) by scanning the local Notes database and reading the rendered drawing images multimodally. Use whenever the user mentions handwritten notes, Apple Notes, Quick Note, Apple Pencil, 노트 필기, 손글씨, 아이패드 메모, or asks "what did I write/jot down", "새 필기 있어?", "노트 봐줘" — even if they don't name the app. Also the substrate for any scheduled polling loop that consumes new handwriting.
---

# Apple Notes Handwriting Reader

Apple Pencil drawings in Notes are invisible to AppleScript and every Notes MCP
server — but each drawing is rendered to a `FallbackImage.png` on disk, and the
local `NoteStore.sqlite` knows which drawings exist, when they changed, and which
note they belong to. Claude reads those images directly (multimodal), which beats
Apple's built-in handwriting OCR in accuracy, Korean included.

## Workflow

1. **Scan** — run the bundled scanner (Python stdlib only, read-only, headless):

   ```bash
   uv run "<skill-dir>/scripts/scan_handwriting.py"            # new since watermark (loop mode)
   uv run "<skill-dir>/scripts/scan_handwriting.py" --all --limit 10   # browse recent (on-demand)
   ```

   Each output line is JSON: `note_title`, `modified`, `modified_raw` (the raw
   cursor value — keep it for the watermark step), `image_path`, `image_bytes`,
   `handwriting_text` (Apple's recognition text — a noisy hint), `attachment_id`.
   Loop mode emits oldest-first so a truncated batch is resumed next poll;
   `--all` browsing is newest-first.

2. **Read** — for each row, Read `image_path` (it is an image; Claude sees the
   strokes). Skip rows where `image_bytes` is under ~10 KB — those are blank or
   near-blank canvases; say so instead of inventing content.

3. **Interpret** — transcribe faithfully, then add a one-line reading of what the
   note is about. Trust the image over `handwriting_text`: Apple's recognizer
   produces errors like "Menory" for "Memory"; use its text only as a hint for
   ambiguous strokes or as a cheap pre-filter. Present per note: title, modified
   time, transcription, interpretation. When running as 마틴, emit the result over
   the Telegram `reply` channel as usual.

4. **Advance the watermark — only in loop mode.** After new handwriting has been
   successfully consumed (interpreted and delivered), run
   `--update-watermark <max modified_raw of the consumed rows>`. The value comes
   from the batch you actually consumed — never from a fresh scan — so notes that
   arrived in between are picked up next poll instead of being skipped. On-demand
   browsing must NOT advance the watermark. State lives at
   `~/.local/state/notes-handwriting/watermark`.

## Edge cases

- **`image_path` null**: the fallback render doesn't exist yet (drawing very fresh,
  or created on iPad and image not synced). Report the note by title and
  `handwriting_text` if present; it usually resolves on the next scan.
- **Empty `handwriting_text` + tiny image (~7.5 KB blank render)**: either a
  genuinely empty canvas, or a placeholder whose real strokes haven't synced from
  the iPad yet (verified 2026-06: fresh iPad drawings can sit at a blank
  generation-3 render while older ones reach rich generation-14 renders). The
  stroke source of truth is a CloudKit asset, not the local DB
  (`ZMERGEABLEDATA1` is empty for all drawings). Treat as pending: surface the
  note title, say the ink hasn't landed, and recheck on the next scan rather
  than concluding the note is empty.
- **Locked notes**: encrypted in the database and in fallback images — inaccessible
  by design; don't try to work around it.
- **Schema drift**: `NoteStore.sqlite` is a private schema. If the scanner errors
  after a macOS major update, check columns with
  `PRAGMA table_info(ZICCLOUDSYNCINGOBJECT)` — the load-bearing ones are
  `ZTYPEUTI`, `ZHANDWRITINGSUMMARY`, `ZNOTE`, `ZTITLE1`, `ZMODIFICATIONDATE`.
- **Sync lag**: the Mac sees handwriting only after iCloud syncs it from the iPad
  (NoteStore.sqlite mtime shows last sync). "I just wrote it" + no result usually
  means sync hasn't landed yet, not a bug.

## Loop reuse contract

A future polling loop (cron / /loop) should call exactly: scan (no `--all`) →
if rows: read + interpret + deliver → `--update-watermark <max modified_raw of
those rows>`. No other state is needed; the watermark file is the single cursor
shared by all consumers. The polling loop is the watermark's **single writer**
(on-demand browsing never advances it); the monotonic check is not atomic across
processes, so never run two consumers that both advance the cursor.
