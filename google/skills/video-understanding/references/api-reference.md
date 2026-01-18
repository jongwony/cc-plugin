# Gemini Video Understanding API Reference

Detailed API documentation for video analysis with Gemini.

## Model

- `gemini-3-flash-preview`: 1M Latest capabilities

## Files API

### Upload

```python
video_file = client.files.upload(
    file="/path/to/video.mp4",
    config={"display_name": "my_video"}  # Optional
)
```

**Response:**
```python
video_file.name        # "files/abc123"
video_file.uri         # "https://..."
video_file.state.name  # "PROCESSING" | "ACTIVE" | "FAILED"
video_file.mime_type   # "video/mp4"
```

### Polling for Processing

```python
import time

while video_file.state.name == "PROCESSING":
    print(f"Processing: {video_file.name}")
    time.sleep(10)
    video_file = client.files.get(name=video_file.name)

if video_file.state.name == "FAILED":
    raise ValueError(f"Processing failed: {video_file.name}")
```

### List Files

```python
for f in client.files.list():
    print(f"Name: {f.name}")
    print(f"State: {f.state.name}")
    print(f"MIME: {f.mime_type}")
    print(f"Size: {f.size_bytes}")
    print("---")
```

### Delete File

```python
client.files.delete(name=video_file.name)
```

## Content Generation

### Basic Request

```python
response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=[video_file, "Your prompt here"]
)
```

### With Configuration

```python
from google.genai import types

response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=[video_file, prompt],
    config=types.GenerateContentConfig(
        temperature=0.7,
        max_output_tokens=8192,
        media_resolution="low",  # Reduce token usage
    )
)
```

## Video Metadata Options

### Clipping (Start/End Offset)

```python
types.Part(
    file_data=types.FileData(file_uri=video_file.uri),
    video_metadata=types.VideoMetadata(
        start_offset="30s",    # Start at 30 seconds
        end_offset="120s"      # End at 2 minutes
    )
)
```

**Offset formats:**
- `"30s"` - 30 seconds
- `"1m30s"` - 1 minute 30 seconds
- `"1h2m30s"` - 1 hour 2 minutes 30 seconds

### Frame Rate (FPS)

```python
video_metadata=types.VideoMetadata(
    fps=0.5  # 1 frame per 2 seconds (saves tokens)
)
```

**FPS guidelines:**
| Content Type | Recommended FPS |
|--------------|-----------------|
| Static (slides, documents) | 0.25 - 0.5 |
| Normal video | 1 (default) |
| Fast action | 2+ |

### Combined Metadata

```python
video_metadata=types.VideoMetadata(
    start_offset="60s",
    end_offset="300s",
    fps=0.5
)
```

## YouTube Integration

### Basic Usage

```python
response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=types.Content(
        parts=[
            types.Part(
                file_data=types.FileData(
                    file_uri="https://www.youtube.com/watch?v=VIDEO_ID"
                )
            ),
            types.Part(text="Summarize this video")
        ]
    )
)
```

### Supported URL Formats

```
https://www.youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
https://www.youtube.com/embed/VIDEO_ID
```

### Limitations

| Tier | Daily Limit |
|------|-------------|
| Free | 8 hours total |
| Paid | Unlimited |

- Only public videos (no private, unlisted, age-restricted)
- Some videos may have copyright restrictions

## Inline Data

For small videos (<20MB):

```python
import base64

with open("video.mp4", "rb") as f:
    video_bytes = f.read()

video_data = base64.standard_b64encode(video_bytes).decode("utf-8")

response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=[
        {
            "inline_data": {
                "mime_type": "video/mp4",
                "data": video_data
            }
        },
        "Describe this video"
    ]
)
```

## Multi-Video Analysis

Gemini 2.5+ supports up to 10 videos per request:

```python
response = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=[
        video_file_1,
        video_file_2,
        "Compare these two videos"
    ]
)
```

## Token Calculation

### Per-Second Breakdown

| Component | Tokens |
|-----------|--------|
| Video frame (default) | 258 |
| Video frame (low res) | 66 |
| Audio (1kbps mono) | 32 |

### Estimation Formula

```python
def estimate_tokens(duration_seconds, resolution="default"):
    frame_tokens = 258 if resolution == "default" else 66
    audio_tokens = 32
    return duration_seconds * (frame_tokens + audio_tokens)

# 5-minute video at default resolution
tokens = estimate_tokens(300, "default")  # ~87,000 tokens
```

### Context Window Capacity

| Resolution | Max Duration (1M context) |
|------------|--------------------------|
| Default | ~55 minutes |
| Low | ~2.8 hours |

## Error Codes

| Error | Cause | Solution |
|-------|-------|----------|
| `PERMISSION_DENIED` | Invalid API key or quota exceeded | Check key, upgrade plan |
| `INVALID_ARGUMENT` | Unsupported format or corrupt file | Verify file integrity |
| `RESOURCE_EXHAUSTED` | Rate limit hit | Implement retry with backoff |
| `DEADLINE_EXCEEDED` | Request timeout | Use shorter videos or clipping |
| `FAILED_PRECONDITION` | Video still processing | Poll until ACTIVE |

## Retry with Exponential Backoff

```python
import time
import random

def generate_with_retry(client, model, contents, max_retries=3):
    for attempt in range(max_retries):
        try:
            return client.models.generate_content(
                model=model,
                contents=contents
            )
        except Exception as e:
            if "RESOURCE_EXHAUSTED" in str(e) and attempt < max_retries - 1:
                wait = (2 ** attempt) + random.uniform(0, 1)
                print(f"Rate limited. Waiting {wait:.1f}s...")
                time.sleep(wait)
            else:
                raise
```

## Timestamp Prompting

Request specific timestamps in responses:

```python
prompt = """Analyze this video and provide timestamps in MM:SS format for:
1. Introduction
2. Main content sections
3. Key demonstrations
4. Conclusion

Format: [MM:SS] Description"""
```

### Querying Specific Timestamps

```python
prompt = "What is being shown at 02:30?"
prompt = "Summarize what happens between 01:00 and 05:00"
```

## Audio Analysis

Audio is automatically included in analysis:

```python
# Audio-focused prompt
prompt = """Analyze the audio track:
- Transcribe all spoken words
- Identify speakers (if possible)
- Note background music or sound effects
- List any notable audio events with timestamps"""
```

Audio processing specs:
- Sample rate: 1kbps
- Channels: Mono
- Token cost: 32 tokens/second

## Best Practices

### Optimize Token Usage

1. Use `media_resolution="low"` for non-visual analysis
2. Set appropriate FPS for content type
3. Use clipping to analyze only relevant segments
4. Delete uploaded files after use

### Prompt Engineering

1. Be specific about desired output format
2. Request timestamps explicitly when needed
3. Specify JSON output for structured data:

```python
prompt = """Analyze this video and return JSON:
{
  "title": "inferred title",
  "duration": "estimated duration",
  "summary": "brief summary",
  "topics": ["topic1", "topic2"],
  "key_moments": [
    {"timestamp": "MM:SS", "description": "what happens"}
  ]
}"""
```

### Handling Long Videos

1. Split into segments using clipping
2. Analyze segments separately
3. Combine results with a final summary prompt

```python
segments = [
    ("0s", "300s"),
    ("300s", "600s"),
    ("600s", "900s"),
]

summaries = []
for start, end in segments:
    # Analyze each segment
    ...
    summaries.append(response.text)

# Combine
final = client.models.generate_content(
    model="gemini-3-flash-preview",
    contents=[
        f"Segment summaries:\n{chr(10).join(summaries)}",
        "Create a unified summary"
    ]
)
```

## Supported MIME Types

| Extension | MIME Type |
|-----------|-----------|
| .mp4 | video/mp4 |
| .mpeg | video/mpeg |
| .mov | video/mov |
| .avi | video/avi |
| .flv | video/x-flv |
| .mpg | video/mpg |
| .webm | video/webm |
| .wmv | video/wmv |
| .3gp | video/3gpp |

## SDK Installation

```bash
# Using uv (recommended)
uv pip install google-genai

# Using pip
pip install google-genai
```

## Authentication

### API Key (Recommended for development)

```python
import os
from google import genai

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
```

### Vertex AI (Production)

```python
client = genai.Client(
    vertexai=True,
    project=os.getenv("GOOGLE_CLOUD_PROJECT"),
    location="us-central1"
)
```

Requires:
```bash
gcloud auth application-default login
```
