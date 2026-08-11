# Veo 3.1 — the API shapes the CLI does not carry

[scripts/generate_video.py](../scripts/generate_video.py) covers text-to-video
and image-to-video, so neither is repeated here. What follows is the four
workflows the script deliberately leaves out, each shown only by the part
that differs — copy the config field into the shared skeleton below.

Timestamp prompting is absent from this file on purpose: it takes no special
parameter, so it is prompt craft, not an API shape — see
[prompting-guide.md](./prompting-guide.md).

## The skeleton

Declare the dependency the way the script does — a PEP 723 header plus
`uv run`, so there is no install step; copy the header from
[scripts/generate_video.py](../scripts/generate_video.py).

```python
import os, time
from google import genai
from google.genai import types

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
prompt = "A neon hologram of a cat driving at top speed"

operation = client.models.generate_videos(
    model="veo-3.1-generate-preview",
    source=types.GenerateVideosSource(prompt=prompt),   # ← varies
    config=types.GenerateVideosConfig(                  # ← varies
        number_of_videos=1,
        duration_seconds=8,
    ),
)

while not operation.done:
    time.sleep(20)
    operation = client.operations.get(operation)

if operation.error:
    raise RuntimeError(operation.error)
if not operation.response or not operation.response.generated_videos:
    raise RuntimeError(f"No video in response: {operation.response}")

video = operation.response.generated_videos[0].video
if not video.video_bytes and video.uri:
    client.files.download(file=video)   # sets video.video_bytes in place
with open("output.mp4", "wb") as f:
    f.write(video.video_bytes)
```

Inputs go through `source=types.GenerateVideosSource(...)`, not the
`prompt=`/`image=`/`video=` kwargs on `generate_videos()` — those are
deprecated in favor of `source`.

Check `operation.error`, then `operation.response`, then
`operation.response.generated_videos`, in that order, before touching the
result; the earlier one being fine does not imply the later one exists.

`enhance_prompt` defaults to `True` and cannot be set to `False` on Veo 3.1 —
omit it rather than pass it explicitly.

## Video extension ("video-to-video")

The Gemini API path takes the source video as inline bytes. A `gs://` URI is a
Vertex AI concept and does not apply here.

Output is 720p when extending, whatever `resolution` says, and
`veo-3.1-lite-generate-preview` does not accept video input at all.

```python
source=types.GenerateVideosSource(
    prompt="Transform into a cyberpunk style with neon lights",
    video=types.Video(
        video_bytes=open("local/path/video.mp4", "rb").read(),
        mime_type="video/mp4",
    ),
)
```

## First and last frame

The start image goes on the source, the end image on the config. `last_frame`
only works alongside `image` — an end frame with no start frame is rejected.

```python
source=types.GenerateVideosSource(prompt=prompt, image=start_image)
config=types.GenerateVideosConfig(
    number_of_videos=1,
    duration_seconds=6,
    last_frame=end_image,
)
```

where each frame is `types.Image(image_bytes=..., mime_type="image/png")`.

## Ingredients to video (consistent characters/objects)

Reference images ride on the config, not the source; the prompt then refers to
them ("Using the provided character and office setting, ...").

Each one is a `VideoGenerationReferenceImage`, not a bare `Image` — the wrapper
exists to carry `reference_type`, which decides whether the picture supplies
content or style.

```python
config=types.GenerateVideosConfig(
    number_of_videos=1,
    duration_seconds=8,
    reference_images=[
        types.VideoGenerationReferenceImage(
            image=character_ref,
            reference_type=types.VideoGenerationReferenceType.ASSET,
        ),
        types.VideoGenerationReferenceImage(
            image=location_ref,
            reference_type=types.VideoGenerationReferenceType.STYLE,
        ),
    ],
)
```

Three constraints come with it, and the first two are silent until the API
rejects the call:

- Reference images do not combine with `image`, `video`, or `last_frame` —
  the prompt is the only other input.
- Duration is forced to 8 seconds.
- `veo-3.1-lite-generate-preview` does not accept reference images at all;
  use the full or fast variant.

Up to three images, per the Veo 3.1 model table.

## Resources

- [Veo API Reference](https://ai.google.dev/gemini-api/docs/video)
- [Prompting Guide](./prompting-guide.md)
- [Google GenAI Python SDK](https://github.com/googleapis/python-genai)
