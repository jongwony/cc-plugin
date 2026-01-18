---
name: video-understanding
description: |
  This skill should be used when the user asks to "analyze video", "summarize video", "extract video transcript", "understand video content", "video to text", "describe video", "ask questions about video", or "what happens in this video". Analyzes videos using Google Gemini API with local file upload or YouTube URL input.
context: fork
---

# Video Understanding with Gemini

Analyze video content using Google Gemini 3 Flash API. Extract summaries, transcripts, timestamps, and answer questions about video content from local files or YouTube URLs.

## Prerequisites

```bash
# Install SDK
uv pip install google-genai

# Set API key
export GEMINI_API_KEY="your-api-key"
```

## Input Methods

### 1. Files API Upload (Recommended for local files)

For files >100MB or videos >1 minute, use Files API for reliable upload.

```python
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
response = client.models.generate_content(
    model="gemini-2.5-flash-preview-05-20",
    contents=[video_file, "Summarize this video"]
)
print(response.text)
```

### 2. Inline Data (For small files <20MB)

```python
import base64

with open("/path/to/short_video.mp4", "rb") as f:
    video_data = base64.standard_b64encode(f.read()).decode("utf-8")

response = client.models.generate_content(
    model="gemini-2.5-flash-preview-05-20",
    contents=[
        {"inline_data": {"mime_type": "video/mp4", "data": video_data}},
        "What is happening in this video?"
    ]
)
```

### 3. YouTube URL (Public videos only)

```python
from google.genai import types

response = client.models.generate_content(
    model="gemini-2.5-flash-preview-05-20",
    contents=types.Content(
        parts=[
            types.Part(
                file_data=types.FileData(
                    file_uri="https://www.youtube.com/watch?v=VIDEO_ID"
                )
            ),
            types.Part(text="Summarize this video with key timestamps")
        ]
    )
)
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

### Video Clipping

Analyze specific segments only:

```python
from google.genai import types

response = client.models.generate_content(
    model="gemini-2.5-flash-preview-05-20",
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
```

### Frame Rate Control

Adjust sampling rate for different content types:

```python
# Default: 1 FPS
# Static content (presentations): lower FPS saves tokens
# Fast action (sports): higher FPS captures more detail

video_metadata=types.VideoMetadata(fps=0.5)  # 1 frame per 2 seconds
```

### Resolution Control

Reduce token usage with lower resolution:

```python
config = types.GenerateContentConfig(
    media_resolution="low"  # 66 tokens/frame vs 258 default
)

response = client.models.generate_content(
    model="gemini-2.5-flash-preview-05-20",
    contents=[video_file, prompt],
    config=config
)
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
   - Long videos → Use clipping for specific segments
   - Token budget → Use low resolution
   - Static content → Lower FPS

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
    response = client.models.generate_content(...)
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
- [ ] Clipping configured for long videos (if applicable)
- [ ] Cleanup planned for uploaded files
