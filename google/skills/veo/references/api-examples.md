# Veo 3.1 API Examples

Complete examples for using Google Veo 3.1 via the Gemini API Python SDK.
The [scripts/generate_video.py](../scripts/generate_video.py) script covers
text-to-video and image-to-video from the command line; the workflows below
(video extension, first/last frame, ingredients, timestamp prompting) are
not scripted — copy and adapt the code directly.

## Setup

### Installation

```bash
uv pip install google-genai
```

### Authentication

```bash
export GEMINI_API_KEY="your-api-key"
```

### Client Initialization

```python
from google import genai
from google.genai import types
import time
import os

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
```

These examples use `source=types.GenerateVideosSource(...)` rather than
passing `prompt=`/`image=`/`video=` directly to `generate_videos()`,
because the direct kwargs are deprecated in favor of `source`.

## Text-to-Video Generation

```python
operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    source=types.GenerateVideosSource(
        prompt='A neon hologram of a cat driving at top speed',
    ),
    config=types.GenerateVideosConfig(
        number_of_videos=1,
        duration_seconds=8,
    ),
)

while not operation.done:
    time.sleep(20)
    operation = client.operations.get(operation)

if operation.error:
    raise Exception(f"Video generation failed: {operation.error}")

video = operation.response.generated_videos[0].video
with open('output.mp4', 'wb') as f:
    f.write(video.video_bytes)
```

### Advanced Text-to-Video with Audio

```python
prompt = '''
Medium shot of a detective in a noir film office. He looks directly at
the camera and says, "I've been expecting you." SFX: the creak of a
leather chair. Ambient noise: rain pattering against the window.
Moody lighting with venetian blind shadows, cinematic, 1940s film noir style.
'''

operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    source=types.GenerateVideosSource(prompt=prompt),
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

if operation.error:
    raise Exception(f"Video generation failed: {operation.error}")

video = operation.response.generated_videos[0].video
```

## Image-to-Video Animation

```python
with open("path/to/your/image.png", 'rb') as f:
    image_data = f.read()

image = types.Image(
    image_bytes=image_data,
    mime_type='image/png'  # or 'image/jpeg' for JPEG files
)

operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    source=types.GenerateVideosSource(
        prompt='Night sky with twinkling stars',  # optional alongside an image
        image=image,
    ),
    config=types.GenerateVideosConfig(
        number_of_videos=1,
        duration_seconds=8,
    ),
)

while not operation.done:
    time.sleep(20)
    operation = client.operations.get(operation)

if operation.error:
    raise Exception(f"Video generation failed: {operation.error}")

video = operation.response.generated_videos[0].video
```

### Image-to-Video with Detailed Cinematography

```python
with open("portrait.jpg", 'rb') as f:
    image_data = f.read()

image = types.Image(image_bytes=image_data, mime_type='image/jpeg')

prompt = '''
Slow dolly shot moving closer to the subject. Shallow depth of field,
cinematic lighting with soft bokeh in the background. The subject
slowly turns their head to look at the camera with a slight smile.
'''

operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    source=types.GenerateVideosSource(prompt=prompt, image=image),
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

## Video Extension ("Video-to-Video")

Extend or transform existing video content. The Gemini API path takes the
video as inline bytes (`video_bytes`); a `gs://` URI is a Vertex AI
concept and does not apply here.

```python
with open("local/path/video.mp4", 'rb') as f:
    video_data = f.read()

video_input = types.Video(video_bytes=video_data, mime_type='video/mp4')

operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    source=types.GenerateVideosSource(
        prompt='Transform into a cyberpunk style with neon lights',
        video=video_input,
    ),
    config=types.GenerateVideosConfig(
        number_of_videos=1,
        duration_seconds=8,
    ),
)

while not operation.done:
    time.sleep(20)
    operation = client.operations.get(operation)

if operation.error:
    raise Exception(f"Video generation failed: {operation.error}")

video = operation.response.generated_videos[0].video
```

## Advanced Features

### First and Last Frame (Seamless Transitions)

```python
with open("start_frame.png", 'rb') as f:
    start_image = types.Image(image_bytes=f.read(), mime_type='image/png')

with open("end_frame.png", 'rb') as f:
    end_image = types.Image(image_bytes=f.read(), mime_type='image/png')

prompt = '''
The camera performs a smooth 180-degree arc shot, starting with the
front-facing view and circling around to the back view. Natural camera
movement, cinematic.
'''

operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    source=types.GenerateVideosSource(prompt=prompt, image=start_image),
    config=types.GenerateVideosConfig(
        number_of_videos=1,
        duration_seconds=6,
        last_frame=end_image,
    ),
)

while not operation.done:
    time.sleep(20)
    operation = client.operations.get(operation)

video = operation.response.generated_videos[0].video
```

### Ingredients to Video (Consistent Characters/Objects)

The SDK's own field documentation for `reference_images` describes it in
terms of Veo 2 ("Veo 2 supports up to 3 asset images or 1 style image");
whether this feature is fully supported on the veo-3.1 model line is
**not verified** here — check the API's response if it matters for the task.

```python
with open("character_reference.png", 'rb') as f:
    character_ref = types.Image(image_bytes=f.read(), mime_type='image/png')

with open("office_reference.png", 'rb') as f:
    location_ref = types.Image(image_bytes=f.read(), mime_type='image/png')

prompt = '''
Using the provided character and office setting, create a medium shot
of the character sitting at the desk, typing on a computer. They pause,
look up thoughtfully, and say "I think I've found something." Natural
office lighting, realistic.
'''

operation = client.models.generate_videos(
    model='veo-3.1-generate-preview',
    source=types.GenerateVideosSource(prompt=prompt),
    config=types.GenerateVideosConfig(
        number_of_videos=1,
        duration_seconds=6,
        reference_images=[character_ref, location_ref],
    ),
)

while not operation.done:
    time.sleep(20)
    operation = client.operations.get(operation)

video = operation.response.generated_videos[0].video
```

### Timestamp Prompting

Direct a multi-shot sequence with precise timing inside a single
generation — no special parameter, just structured prompt text.

```python
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
    source=types.GenerateVideosSource(prompt=prompt),
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
def generate_video_safe(prompt: str, **config_kwargs):
    """Generate video with error handling and retry logic."""
    max_retries = 3
    retry_count = 0

    while retry_count < max_retries:
        try:
            operation = client.models.generate_videos(
                model='veo-3.1-generate-preview',
                source=types.GenerateVideosSource(prompt=prompt),
                config=types.GenerateVideosConfig(**config_kwargs),
            )

            timeout = 300  # 5 minutes
            elapsed = 0
            while not operation.done and elapsed < timeout:
                time.sleep(20)
                elapsed += 20
                operation = client.operations.get(operation)

            if not operation.done:
                raise TimeoutError(f"Operation timed out after {timeout}s")
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
        duration_seconds=8,
        aspect_ratio='16:9',
    )
except Exception as e:
    print(f"Video generation failed: {e}")
```

## Best Practices

1. `enhance_prompt` defaults to `True` and cannot be set to `False` on Veo 3.1 — omit it rather than pass it explicitly.
2. Poll every 20 seconds; generation typically takes 2-5 minutes.
3. Check `operation.error`, then `operation.response`, then `operation.response.generated_videos`, in that order, before touching the result.
4. Use reference images for character consistency across shots (see the verification note above).
5. Specify resolution and aspect ratio explicitly for production use.
6. Include SFX and ambient noise in prompts for rich audio generation.
7. Prefer PNG (lossless) for image inputs when maximum quality matters; JPEG is acceptable but may introduce compression artifacts.

## Resources

- [Veo API Reference](https://ai.google.dev/gemini-api/docs/video)
- [Prompting Guide](./prompting-guide.md)
- [Google GenAI Python SDK](https://github.com/googleapis/python-genai)
