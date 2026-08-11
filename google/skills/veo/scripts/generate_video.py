#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "google-genai>=2.3.0",
# ]
# ///
"""
Veo Video Generation via the Gemini API

Text-to-video or image-to-video. Polls until the operation completes and
writes the result to a file.

Out of scope, deliberately not scripted: video-to-video (extension),
first/last-frame transitions, and ingredients-to-video (reference images).
Those take more inputs than a CLI comfortably carries; see
references/api-examples.md for worked code you adapt in place.

Usage (the skill runs with the user's project as cwd, never this directory,
so every invocation goes through the plugin root):
    SCRIPT="${CLAUDE_PLUGIN_ROOT}/skills/veo/scripts/generate_video.py"

    uv run "$SCRIPT" "A neon hologram of a cat driving at top speed"
    uv run "$SCRIPT" "Slow dolly shot, cinematic lighting" --image photo.jpg
    uv run "$SCRIPT" "Zoom out to reveal the city skyline" --duration 4 --resolution 720p

Duration and resolution are not independent; --help's flag list carries the
accepted values, and an unusable pair is rejected before the request goes out.

Environment:
    GEMINI_API_KEY - Google AI API key (required)

The dependency is declared inline (PEP 723); uv resolves it. There is no
manual install step.
"""

import argparse
import os
import sys
import time
from pathlib import Path

try:
    from google import genai
    from google.genai import types
except ImportError:
    print("Error: google-genai not available. Run this through uv "
          "(`uv run <path>/generate_video.py ...`) so the inline dependency "
          "resolves.", file=sys.stderr)
    sys.exit(1)


MODEL_CHOICES = [
    "veo-3.1-generate-preview",
    "veo-3.1-fast-generate-preview",
    "veo-3.1-lite-generate-preview",
]
DEFAULT_MODEL = "veo-3.1-generate-preview"

DURATION_CHOICES = [4, 6, 8]
DEFAULT_DURATION = 8

# A local mirror of a vendor rule, kept because the alternative is learning it
# from a rejected request: the default resolution is the high one, so shortening
# a clip alone produces a pair the API refuses — and it refuses by naming the
# combination rather than the flag the caller actually moved.
#
# Being a mirror, it can go stale in the one direction that hurts: if the vendor
# relaxes the pairing, this rejects a call the API would now accept. That is the
# bug to suspect first if a valid-looking pair stops working — widen or delete
# the check rather than working around it. Members must stay reachable through
# the --resolution choices below, or they assert a rule nothing can trigger.
FIXED_DURATION_RESOLUTIONS = {"1080p"}
FIXED_DURATION = 8

# google-genai opts OUT of a default httpx timeout by setting it to None, so a
# stalled request would hang with no ceiling. The SDK takes this value in
# MILLISECONDS at its boundary.
HTTP_TIMEOUT_SECONDS = 600

POLL_INTERVAL_SECONDS = 20

IMAGE_MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
}


def load_image(path: str) -> types.Image:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Image not found: {path}")
    mime_type = IMAGE_MIME_TYPES.get(p.suffix.lower())
    if mime_type is None:
        raise ValueError(
            f"{p.suffix or p.name} is not a supported image extension. "
            f"Supported: {', '.join(sorted(IMAGE_MIME_TYPES))}."
        )
    return types.Image(image_bytes=p.read_bytes(), mime_type=mime_type)


def generate(client: genai.Client, args: argparse.Namespace) -> types.Video:
    source_kwargs = {"prompt": args.prompt}
    if args.image:
        source_kwargs["image"] = load_image(args.image)

    operation = client.models.generate_videos(
        model=args.model,
        source=types.GenerateVideosSource(**source_kwargs),
        config=types.GenerateVideosConfig(
            number_of_videos=1,
            duration_seconds=args.duration,
            aspect_ratio=args.aspect_ratio,
            resolution=args.resolution,
        ),
    )

    print(f"Generating with {args.model} ({args.duration}s, "
          f"{args.aspect_ratio}, {args.resolution})...", file=sys.stderr)
    while not operation.done:
        time.sleep(POLL_INTERVAL_SECONDS)
        operation = client.operations.get(operation)
        print("...still running", file=sys.stderr)

    if operation.error:
        raise RuntimeError(f"Video generation failed: {operation.error}")
    if not operation.response or not operation.response.generated_videos:
        raise RuntimeError(f"No video in response: {operation.response}")

    video = operation.response.generated_videos[0].video
    if video is None:
        raise RuntimeError("Response carried a generated_videos entry with no video.")
    return video


def main():
    parser = argparse.ArgumentParser(
        description="Generate a video with Veo via the Gemini API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("prompt", help="Text prompt describing the video")
    parser.add_argument(
        "--image",
        help="Source image to animate (image-to-video). Omit for text-to-video.",
    )
    parser.add_argument(
        "--model",
        choices=MODEL_CHOICES,
        default=DEFAULT_MODEL,
        help=f"Veo variant (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--duration",
        type=int,
        choices=DURATION_CHOICES,
        default=DEFAULT_DURATION,
        help=f"Clip length in seconds (default: {DEFAULT_DURATION})",
    )
    parser.add_argument(
        "--aspect-ratio",
        choices=["16:9", "9:16"],
        default="16:9",
        help="Aspect ratio (default: 16:9)",
    )
    parser.add_argument(
        "--resolution",
        choices=["720p", "1080p"],
        default="1080p",
        help="Resolution (default: 1080p)",
    )
    parser.add_argument(
        "--output",
        default="output.mp4",
        help="Output file path (default: output.mp4)",
    )
    args = parser.parse_args()

    if args.resolution in FIXED_DURATION_RESOLUTIONS and args.duration != FIXED_DURATION:
        print(f"Error: {args.resolution} is {FIXED_DURATION}s only. Either pass "
              f"--resolution 720p to keep --duration {args.duration}, or drop "
              f"--duration to get the {FIXED_DURATION}s default.", file=sys.stderr)
        sys.exit(1)

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable not set",
              file=sys.stderr)
        sys.exit(1)

    client = genai.Client(
        api_key=api_key,
        http_options={"timeout": HTTP_TIMEOUT_SECONDS * 1000},
    )

    try:
        video = generate(client, args)
        # The API may return the clip inline or as a file reference, and which
        # one arrives is not the caller's to control — so fetch the reference
        # rather than reporting it, and surface the URI only when the fetch
        # itself fails, keeping the clip recoverable by hand.
        if not video.video_bytes and video.uri:
            try:
                client.files.download(file=video)
            except Exception as e:
                raise RuntimeError(
                    f"Could not download the generated video ({e}). "
                    f"Fetch it manually within the file's retention window: {video.uri}"
                ) from e
        if not video.video_bytes:
            raise RuntimeError("Response carried neither video bytes nor a URI.")
        Path(args.output).write_bytes(video.video_bytes)
        print(f"Saved to {args.output}", file=sys.stderr)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
