---
name: media-download
description: |
  This skill should be used when the user asks to "download video", "download reel",
  "save video from URL", "yt-dlp download", "download Instagram reel", "download YouTube video",
  "download TikTok", "extract audio from video", "download audio from URL",
  "extract video from QR code", "download media", or provides a URL/QR image from a
  supported video platform. Handles link extraction, compatibility check, download, and
  metadata saving via yt-dlp.
---

# Media Download

Download media from URLs or QR code images using yt-dlp, with automatic metadata extraction for search.

## Prerequisites

| Tool | Install | Purpose |
|------|---------|---------|
| yt-dlp | `brew install yt-dlp` | Media download engine |
| zbarimg | `brew install zbar` | QR code decoding |

Verify before proceeding:
```bash
which yt-dlp && which zbarimg
```

## Workflow

### Phase 1: Input Resolution

Determine the download URL from user input.

**Direct URL**: Use as-is. Strip tracking parameters (`?utm_source=...`) if desired.

**QR code image**: Decode with the bundled script:
```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/media-download/scripts/decode_qr.py <image_path>
```

Output is one URL per line. If multiple URLs are found, confirm which one to use.

### Phase 2: Compatibility Check

Verify yt-dlp supports the URL and preview available formats:

```bash
yt-dlp --simulate -F "<url>"
```

If this fails:
- **Login required**: Suggest `--cookies-from-browser chrome` option
- **Unsupported site**: Inform the user; check `yt-dlp --list-extractors` for site support
- **Geo-restricted**: Suggest VPN or `--geo-bypass`

### Phase 3: Download

Download to the standard output directory:

```bash
yt-dlp \
  -o "~/Downloads/yt-dlp-output/%(title)s [%(id)s].%(ext)s" \
  --write-info-json \
  --no-write-playlist-metafiles \
  "<url>"
```

**Options by scenario:**

| Scenario | Additional flags |
|----------|-----------------|
| Best quality (default) | None needed (yt-dlp selects best) |
| Audio only | `-x --audio-format mp3` |
| Specific format | `-f <format_id>` (from Phase 2 output) |
| Login required | `--cookies-from-browser chrome` |
| Playlist | `--yes-playlist` (confirm with user first) |
| Subtitles | `--write-subs --sub-langs all` |

### Phase 4: Metadata Extraction

After download, convert the verbose `.info.json` into a slim search-friendly `.meta.json`:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/media-download/scripts/save_metadata.py \
  ~/Downloads/yt-dlp-output/"<filename>.info.json"
```

This extracts key fields: title, description, uploader, upload_date, duration, tags, categories, view/like counts, URL, thumbnail, resolution.

To reduce clutter, remove the original `.info.json` after extraction:
```bash
rm ~/Downloads/yt-dlp-output/"<filename>.info.json"
```

### Phase 5: Report

Summarize the result to the user:

| Field | Value |
|-------|-------|
| Source | Platform name + URL |
| File | Saved path |
| Format | Resolution, codec, file size |
| Metadata | `.meta.json` path |

## Output Structure

```
~/Downloads/yt-dlp-output/
├── Video Title [abc123].mp4
├── Video Title [abc123].meta.json
├── Another Video [def456].webm
└── Another Video [def456].meta.json
```

Naming convention: `%(title)s [%(id)s].%(ext)s` — the `[id]` suffix ensures uniqueness.

## Supported Platforms

yt-dlp supports 1000+ sites. Common ones:

| Platform | URL pattern | Notes |
|----------|------------|-------|
| YouTube | `youtube.com/watch?v=`, `youtu.be/` | Most reliable |
| Instagram | `instagram.com/reel/`, `instagram.com/p/` | Public posts only without cookies |
| Twitter/X | `x.com/*/status/` | May need cookies |
| TikTok | `tiktok.com/@*/video/` | |
| Reddit | `reddit.com/r/*/comments/` | |
| Vimeo | `vimeo.com/` | |

## Troubleshooting

**yt-dlp version outdated**: Instagram and other sites change APIs frequently.
```bash
yt-dlp -U
```

**QR decode fails**: Ensure the image is clear and zbar is installed. Instagram QR codes with logo overlay work due to QR error correction.

**Private content**: Requires browser cookies:
```bash
yt-dlp --cookies-from-browser chrome "<url>"
```

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `scripts/decode_qr.py` | Decode QR codes from image files → URL output |
| `scripts/save_metadata.py` | Extract slim search-friendly JSON from yt-dlp `.info.json` |
