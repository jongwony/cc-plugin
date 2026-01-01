# Veo 3.1 API Examples

Complete examples for using Google Veo 3.1 API via Python SDK.

## Setup

### Installation

```bash
uv pip install google-genai
```

### Authentication

Set up authentication before running examples:

```bash
# For Vertex AI
export GOOGLE_CLOUD_PROJECT="your-project-id"
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"

# For API Key (Gemini API)
export GOOGLE_API_KEY="your-api-key"
```

### Client Initialization

```python
from google import genai
from google.genai import types
import time
import os

# Initialize client
client = genai.Client(
    # Vertex AI: uses GOOGLE_CLOUD_PROJECT and GOOGLE_APPLICATION_CREDENTIALS
    # Gemini API: uses GOOGLE_API_KEY
    vertexai=True,  # Set to False for Gemini API
    project=os.getenv("GOOGLE_CLOUD_PROJECT"),  # Required for Vertex AI
    location="us-central1"  # Required for Vertex AI
)
```

## Text-to-Video Generation

Generate video from text prompt only.

```python
from google.genai import types
import time

# Create operation
operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    prompt='A neon hologram of a cat driving at top speed',
    config=types.GenerateVideosConfig(
        number_of_videos=1,
        duration_seconds=5,
        enhance_prompt=True,
    ),
)

# Poll operation until complete
while not operation.done:
    time.sleep(20)
    operation = client.operations.get(operation)

# Get generated video
video = operation.response.generated_videos[0].video
video.show()

# Save to file
with open('output.mp4', 'wb') as f:
    f.write(video.video_bytes)
```

### Advanced Text-to-Video with Audio

```python
# Example with dialogue and sound effects
prompt = '''
Medium shot of a detective in a noir film office. He looks directly at
the camera and says, "I've been expecting you." SFX: the creak of a
leather chair. Ambient noise: rain pattering against the window.
Moody lighting with venetian blind shadows, cinematic, 1940s film noir style.
'''

operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    prompt=prompt,
    config=types.GenerateVideosConfig(
        number_of_videos=1,
        duration_seconds=6,
        aspect_ratio='16:9',
        resolution='1080p',
        enhance_prompt=True,
    ),
)

# Poll and retrieve
while not operation.done:
    time.sleep(20)
    operation = client.operations.get(operation)

video = operation.response.generated_videos[0].video
video.show()
```

## Image-to-Video Animation

Animate a source image with optional prompt guidance.

```python
from google.genai import types
import time

# Load image with proper MIME type
with open("path/to/your/image.png", 'rb') as f:
    image_data = f.read()

image = types.Image(
    image_bytes=image_data,
    mime_type='image/png'  # or 'image/jpeg' for JPEG files
)

# Create operation
operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    # Prompt is optional if image is provided
    prompt='Night sky with twinkling stars',
    image=image,
    config=types.GenerateVideosConfig(
        number_of_videos=1,
        duration_seconds=5,
        enhance_prompt=True,
    ),
)

# Poll operation
while not operation.done:
    time.sleep(20)
    operation = client.operations.get(operation)

video = operation.response.generated_videos[0].video
video.show()
```

### Image-to-Video with Detailed Cinematography

```python
# Load image with proper MIME type
with open("portrait.jpg", 'rb') as f:
    image_data = f.read()

image = types.Image(
    image_bytes=image_data,
    mime_type='image/jpeg'
)

# Detailed prompt for camera movement
prompt = '''
Slow dolly shot moving closer to the subject. Shallow depth of field,
cinematic lighting with soft bokeh in the background. The subject
slowly turns their head to look at the camera with a slight smile.
'''

operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    prompt=prompt,
    image=image,
    config=types.GenerateVideosConfig(
        number_of_videos=1,
        duration_seconds=4,
        aspect_ratio='9:16',  # Vertical format
        resolution='1080p',
    ),
)

while not operation.done:
    time.sleep(20)
    operation = client.operations.get(operation)

video = operation.response.generated_videos[0].video
with open('portrait_animation.mp4', 'wb') as f:
    f.write(video.video_bytes)
```

## Video-to-Video Editing

Edit or transform existing video content.

```python
from google.genai import types
import time

# For Vertex AI: video must be in Google Cloud Storage

# GCS URI (required for Vertex AI)
video_input = types.Video(
    uri="gs://bucket-name/inputs/videos/cat_driving.mp4",
)

# Note: For Gemini API, use binary video data:
# with open("local/path/video.mp4", 'rb') as f:
#     video_data = f.read()
# video_input = types.Video(video_bytes=video_data)

# Create operation
operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    prompt='Transform into a cyberpunk style with neon lights',
    video=video_input,
    config=types.GenerateVideosConfig(
        number_of_videos=1,
        duration_seconds=5,
        enhance_prompt=True,
    ),
)

# Poll operation
while not operation.done:
    time.sleep(20)
    operation = client.operations.get(operation)

video = operation.response.generated_videos[0].video
video.show()
```

## Advanced Features

### First and Last Frame (Seamless Transitions)

Create smooth transitions between two images.

```python
from google.genai import types

# Load start and end frames with proper MIME type
with open("start_frame.png", 'rb') as f:
    start_image_data = f.read()
start_image = types.Image(
    image_bytes=start_image_data,
    mime_type='image/png'
)

with open("end_frame.png", 'rb') as f:
    end_image_data = f.read()
end_image = types.Image(
    image_bytes=end_image_data,
    mime_type='image/png'
)

# Describe the transition
prompt = '''
The camera performs a smooth 180-degree arc shot, starting with the
front-facing view and circling around to the back view. Natural camera
movement, cinematic.
'''

operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    prompt=prompt,
    image=start_image,
    config=types.GenerateVideosConfig(
        number_of_videos=1,
        duration_seconds=6,
        last_frame=end_image,  # Specify ending frame
    ),
)

while not operation.done:
    time.sleep(20)
    operation = client.operations.get(operation)

video = operation.response.generated_videos[0].video
video.show()
```

### Ingredients to Video (Consistent Characters/Objects)

Maintain consistent elements across multiple shots using reference images.

```python
from google.genai import types

# Load reference images with proper MIME type
with open("character_reference.png", 'rb') as f:
    character_data = f.read()
character_ref = types.Image(
    image_bytes=character_data,
    mime_type='image/png'
)

with open("office_reference.png", 'rb') as f:
    location_data = f.read()
location_ref = types.Image(
    image_bytes=location_data,
    mime_type='image/png'
)

# Create scene with consistent elements
prompt = '''
Using the provided character and office setting, create a medium shot
of the character sitting at the desk, typing on a computer. They pause,
look up thoughtfully, and say "I think I've found something." Natural
office lighting, realistic.
'''

operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    prompt=prompt,
    config=types.GenerateVideosConfig(
        number_of_videos=1,
        duration_seconds=6,
        reference_images=[character_ref, location_ref],  # Multiple references
    ),
)

while not operation.done:
    time.sleep(20)
    operation = client.operations.get(operation)

video = operation.response.generated_videos[0].video
video.show()
```

### Timestamp Prompting

Create multi-shot sequences with precise timing in a single generation.

```python
# Multi-shot sequence with timestamps
prompt = '''
[00:00-00:02] Wide shot of a coffee shop exterior on a rainy morning.
Soft natural lighting, people with umbrellas passing by. SFX: rain and
distant traffic.

[00:02-00:04] Medium shot inside the coffee shop. A barista pours latte
art into a white cup. Close-up on the swirling milk pattern. SFX: the
hiss of the espresso machine, quiet jazz music.

[00:04-00:06] Over-the-shoulder shot of a customer at a window seat,
typing on a laptop while occasionally sipping coffee. They gaze out at
the rain thoughtfully. Cozy, warm interior lighting.
'''

operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    prompt=prompt,
    config=types.GenerateVideosConfig(
        number_of_videos=1,
        duration_seconds=6,
        aspect_ratio='16:9',
        resolution='1080p',
    ),
)

while not operation.done:
    time.sleep(20)
    operation = client.operations.get(operation)

video = operation.response.generated_videos[0].video
with open('coffee_shop_sequence.mp4', 'wb') as f:
    f.write(video.video_bytes)
```

## Error Handling

```python
from google.genai import types
import time

def generate_video_safe(prompt: str, **kwargs):
    """Generate video with error handling and retry logic."""
    max_retries = 3
    retry_count = 0

    while retry_count < max_retries:
        try:
            operation = client.models.generate_videos(
                model='veo-3.1-generate-preview',
                prompt=prompt,
                config=types.GenerateVideosConfig(**kwargs),
            )

            # Poll with timeout
            timeout = 300  # 5 minutes
            elapsed = 0

            while not operation.done and elapsed < timeout:
                time.sleep(20)
                elapsed += 20
                operation = client.operations.get(operation)

            if not operation.done:
                raise TimeoutError(f"Operation timed out after {timeout}s")

            # Check for errors
            if operation.error:
                raise Exception(f"Generation failed: {operation.error}")

            if not operation.response:
                raise Exception(f"No response received. Operation metadata: {operation.metadata}")

            if not operation.response.generated_videos:
                raise Exception(f"No videos generated. Response: {operation.response}")

            return operation.response.generated_videos[0].video

        except Exception as e:
            retry_count += 1
            if retry_count >= max_retries:
                raise Exception(f"Failed after {max_retries} retries: {e}")
            print(f"Retry {retry_count}/{max_retries} after error: {e}")
            time.sleep(10 * retry_count)  # Exponential backoff

# Usage
try:
    video = generate_video_safe(
        "A serene mountain landscape at sunset",
        number_of_videos=1,
        duration_seconds=5,
        aspect_ratio='16:9',
    )
    video.show()
except Exception as e:
    print(f"Video generation failed: {e}")
```

## Best Practices

1. **Always use enhance_prompt=True** or omit it (defaults to True). Note: `enhance_prompt=False` is NOT supported in Veo 3.1 and will raise an error.
2. **Poll frequently** (every 20 seconds) to retrieve results promptly
3. **Handle timeouts** - Video generation can take 2-5 minutes
4. **Always check operation status** before accessing results: Check `operation.error`, then `operation.response`, then `operation.response.generated_videos`
5. **Store videos in GCS** for Vertex AI video-to-video workflows
6. **Use reference images** for character consistency across multiple shots
7. **Specify resolution and aspect ratio** explicitly for production use
8. **Include SFX and ambient noise** in prompts for rich audio generation
9. **Use PNG (lossless) for image inputs** when maximum quality is needed; JPEG is acceptable but may introduce compression artifacts

## Resources

- [Veo API Reference](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation)
- [Prompting Guide](./prompting-guide.md)
- [Google GenAI Python SDK](https://github.com/googleapis/python-genai)
