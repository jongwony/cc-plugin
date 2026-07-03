---
name: video-understanding
description: |
  This skill should be used when the user asks to "analyze video", "summarize video", "extract video transcript", "understand video content", "video to text", "describe video", "ask questions about video", or "what happens in this video". Analyzes videos using Google Gemini API with local file upload or YouTube URL input.
context: fork
model: sonnet
---

# Video Understanding with Gemini

Analyze video content using Google Gemini 3.5 Flash API. Extract summaries, transcripts, timestamps, and answer questions about video content from local files or YouTube URLs.

Uses the **Interactions API** (`client.interactions.create`), the current standard idiom
in Google's docs. `generateContent` still works, but Interactions is the default for new
development. Inputs are plain dicts — no `types.*` wrappers — and output is read from
`interaction.output_text`.

## Prerequisites

```bash
# Install SDK (Interactions API requires >= 2.0.0)
uv pip install "google-genai>=2.0.0"

# Set API key
export GEMINI_API_KEY="your-api-key"
```

## Input Methods

### 1. Files API Upload (Recommended for local files)

For files >20MB (or when reusing a video across prompts), use Files API for reliable upload.

```python
import os

from google import genai

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# Upload video file
video_file = client.files.upload(file="/path/to/video.mp4")

# Wait for processing
import time
while video_file.state.name == "PROCESSING":
    time.sleep(5)
    video_file = client.files.get(name=video_file.name)

if video_file.state.name == "FAILED":
    raise ValueError("Video processing failed")

# Analyze
interaction = client.interactions.create(
    model="gemini-3.5-flash",
    input=[
        {"type": "text", "text": "Summarize this video"},
        {"type": "video", "uri": video_file.uri, "mime_type": video_file.mime_type},
    ],
)
print(interaction.output_text)
```

### 2. Inline Data (For small files <20MB)

```python
import base64

with open("/path/to/short_video.mp4", "rb") as f:
    video_data = base64.standard_b64encode(f.read()).decode("utf-8")

interaction = client.interactions.create(
    model="gemini-3.5-flash",
    input=[
        {"type": "text", "text": "What is happening in this video?"},
        {"type": "video", "data": video_data, "mime_type": "video/mp4"},
    ],
)
print(interaction.output_text)
```

### 3. YouTube URL (Public videos only)

```python
interaction = client.interactions.create(
    model="gemini-3.5-flash",
    input=[
        {"type": "text", "text": "Summarize this video with key timestamps"},
        {"type": "video", "uri": "https://www.youtube.com/watch?v=VIDEO_ID"},
    ],
)
print(interaction.output_text)
```

**YouTube Limits:**
- Public videos only (no private/unlisted)
- Free tier: 8 hours/day
- Paid tier: Unlimited

## Analysis Types

### Video Summary

```python
prompt = "Provide a comprehensive summary of this video including main topics, key points, and conclusions."
```

### Timestamp Extraction

```python
prompt = """List all important moments with timestamps in MM:SS format:
- Scene changes
- Key topics discussed
- Notable events"""
```

### Transcript/Transcription

```python
prompt = "Transcribe all spoken dialogue in this video with speaker identification where possible."
```

### Visual Description

```python
prompt = "Describe the visual content: settings, people, objects, actions, and any on-screen text."
```

### Question & Answer

```python
# Timestamp-specific question
prompt = "What is being demonstrated at 01:30?"

# Content-specific question
prompt = "What tools are used in this tutorial?"
```

## Advanced Configuration

### Video Clipping (legacy generate_content only)

The Interactions API has no offset parameter — `video_metadata` offsets are silently
ignored (verified: a clipped request bills the full video's tokens). To analyze a
specific segment, use the legacy `generate_content` call, which still honors offsets:

```python
from google.genai import types

response = client.models.generate_content(
    model="gemini-3.5-flash",
    contents=[
        types.Part(
            file_data=types.FileData(file_uri=video_file.uri),
            video_metadata=types.VideoMetadata(
                start_offset="60s",   # Start at 1 minute
                end_offset="180s"     # End at 3 minutes
            )
        ),
        "Summarize this segment"
    ]
)
print(response.text)
```

### Frame Rate Control (legacy generate_content only)

Custom `fps` is likewise unavailable in the Interactions API; use the legacy
`generate_content` call via `types.VideoMetadata`:

```python
# Default: 1 FPS
# Static content (presentations): lower FPS saves tokens
# Fast action (sports): higher FPS captures more detail

video_metadata=types.VideoMetadata(fps=0.5)  # 1 frame per 2 seconds
```

### Resolution Control

Reduce token usage with lower resolution. `resolution` is a per-item field on the video
input part (values: `low`, `medium`, `high`, `ultra_high`), so it applies to every source
(local and YouTube) by tagging each video part. `generation_config` has no matching
resolution key in the Interactions API — such a key there would be silently ignored:

```python
interaction = client.interactions.create(
    model="gemini-3.5-flash",
    input=[
        {"type": "text", "text": prompt},
        {"type": "video", "uri": video_file.uri, "mime_type": video_file.mime_type,
         "resolution": "low"},  # 66 tokens/frame vs 258 default
    ],
)
print(interaction.output_text)
```

## Token Calculation

Understanding token costs for capacity planning:

| Component | Tokens per Second |
|-----------|-------------------|
| Video frames (default) | 258 |
| Video frames (low res) | 66 |
| Audio | 32 |
| **Total (default)** | ~300 |
| **Total (low res)** | ~100 |

**Example:** 10-minute video at default resolution:
- 600 seconds × 300 tokens = ~180,000 tokens

## Capacity Limits

| Context Window | Default Resolution | Low Resolution |
|----------------|-------------------|----------------|
| 1M tokens | ~1 hour | ~3 hours |

**Multi-video:** Gemini 2.5+ supports up to 10 videos per request.

## Supported Formats

`video/mp4`, `video/mpeg`, `video/mov`, `video/avi`, `video/x-flv`, `video/mpg`, `video/webm`, `video/wmv`, `video/3gpp`

## Workflow

1. **Determine input method:**
   - Local file >20MB → Files API upload
   - Local file <20MB → Inline data
   - YouTube public URL → Direct URL

2. **Choose analysis type** based on user request

3. **Configure optimization:**
   - Token budget → Use low resolution (`--low-res` / per-item `resolution`)
   - Long videos → Clip specific segments (legacy `generate_content` only)
   - Static content → Lower FPS (legacy `generate_content` only)

4. **Execute and iterate** based on results

## Cleanup

Delete uploaded files after use:

```python
client.files.delete(name=video_file.name)
```

List all uploaded files:

```python
for f in client.files.list():
    print(f"{f.name}: {f.state.name}")
```

## Error Handling

```python
try:
    interaction = client.interactions.create(...)
except Exception as e:
    if "PERMISSION_DENIED" in str(e):
        # Check API key or quota
        pass
    elif "INVALID_ARGUMENT" in str(e):
        # Check video format or size
        pass
    raise
```

## Reference Files

For detailed API documentation and advanced use cases:
- **[references/api-reference.md](references/api-reference.md)** - Complete API parameters, error codes, and edge cases

## Scripts

Utility scripts for common operations:
- **[scripts/analyze_video.py](scripts/analyze_video.py)** - Complete analysis workflow with error handling

## Quick Checklist

- [ ] Input method selected (Files API / inline / YouTube)
- [ ] Analysis type chosen (summary / transcript / timestamps / visual / QnA)
- [ ] Token budget considered (use low-res if needed)
- [ ] Clipping configured for long videos (legacy `generate_content`, if applicable)
- [ ] Cleanup planned for uploaded files
