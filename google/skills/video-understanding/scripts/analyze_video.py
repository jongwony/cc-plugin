#!/usr/bin/env -S uv run --quiet --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "google-genai>=2.3.0",
# ]
# ///
"""
Video Analysis with Gemini Interactions API

Takes a local video file or a public YouTube URL and returns text.

Out of scope, by design: uploading to storage, files too large to send in one
request, bucket objects and pre-signed URLs, clipping, and frame-rate control.
Each of those was removed rather than fixed; see the commit that removed them.

Usage (the skill runs with the user's project as cwd, never this directory,
so every invocation goes through the plugin root):
    SCRIPT="${CLAUDE_PLUGIN_ROOT}/skills/video-understanding/scripts/analyze_video.py"

    uv run "$SCRIPT" /path/to/video.mp4 "Summarize this video"
    uv run "$SCRIPT" "https://www.youtube.com/watch?v=VIDEO_ID" "What is discussed?"
    uv run "$SCRIPT" /path/to/video.mp4 --type summary
    uv run "$SCRIPT" /path/to/video.mp4 --type transcript
    uv run "$SCRIPT" /path/to/video.mp4 --type timestamps

Output streams:
    stdout carries the analysis text and nothing else, so it pipes into a
    parser. Progress, banners, and errors go to stderr.

Environment:
    GEMINI_API_KEY - Google AI API key (required)

The dependency is declared inline (PEP 723); uv resolves it. There is no
manual install step.
"""

import argparse
import base64
import os
import sys
from pathlib import Path

try:
    from google import genai
except ImportError:
    print("Error: google-genai not available. Run this through uv "
          "(`uv run <path>/analyze_video.py ...`) so the inline dependency "
          "resolves.", file=sys.stderr)
    sys.exit(1)


# Default model
MODEL = "gemini-3.6-flash"

# A local file is sent inline in a single request; there is no upload path.
# The vendor limit is on TOTAL request size and base64 inflates the payload by
# 4/3, so the raw file must sit below the limit with room to spare for the
# prompt and the request envelope. 0.70 keeps that headroom.
INLINE_REQUEST_LIMIT_BYTES = 100 * 1024**2
MAX_LOCAL_FILE_BYTES = int(INLINE_REQUEST_LIMIT_BYTES * 0.70)

# google-genai opts OUT of a default httpx timeout by setting it to None, so a
# stalled request would hang with no ceiling. The SDK takes this value in
# MILLISECONDS at its boundary.
HTTP_TIMEOUT_SECONDS = 600

# Analysis type prompts
PROMPTS = {
    "summary": """Provide a comprehensive summary of this video including:
- Main topic and purpose
- Key points discussed
- Important conclusions or takeaways
- Target audience (if apparent)""",

    "transcript": """Transcribe all spoken dialogue in this video.
- Include speaker identification where possible (Speaker 1, Speaker 2, etc.)
- Note any non-verbal sounds [laughter], [applause], [music]
- Use timestamps for major sections""",

    "timestamps": """List all important moments with timestamps in MM:SS format:
- Introduction/opening
- Topic changes
- Key demonstrations or examples
- Important statements
- Conclusion/ending

Format each as: [MM:SS] Description""",

    "visual": """Describe the visual content of this video:
- Settings and locations
- People (appearance, actions)
- Objects and props
- On-screen text, graphics, or animations
- Visual transitions and effects""",
}

# Extension -> MIME type
MIME_TYPES = {
    ".mp4": "video/mp4",
    ".mpeg": "video/mpeg",
    ".mpg": "video/mpg",
    ".mov": "video/mov",
    ".avi": "video/avi",
    ".webm": "video/webm",
    ".wmv": "video/wmv",
    ".flv": "video/x-flv",
    ".3gp": "video/3gpp",
}


def is_youtube_url(source: str) -> bool:
    """Check if source is a YouTube URL."""
    # A URL that misses this list falls through to the local-file branch and
    # dies as "file not found", which names the wrong problem entirely.
    youtube_patterns = [
        "youtube.com/watch",
        "youtu.be/",
        "youtube.com/embed/",
        "youtube.com/shorts/",
        "youtube.com/live/",
    ]
    return any(p in source.lower() for p in youtube_patterns)


def create_interaction(client: genai.Client, input_parts: list) -> str:
    """Run an Interactions API request and return its text.

    Requests are sent with store=False: this is a one-shot analysis utility (no
    previous_interaction_id chaining, no background execution), so interactions
    are not persisted server-side.

    A model that declines to answer -- a safety block, a truncation, an
    exhausted budget -- yields no text. That is a failure, not an empty
    result: returning it would let a refusal read as an answer.
    """
    interaction = client.interactions.create(
        model=MODEL, input=input_parts, store=False
    )
    text = interaction.output_text
    if not text:
        raise RuntimeError(
            "The model returned no text. This is a refusal or a truncation, "
            "not an empty video."
        )
    return text


def analyze_local_file(client: genai.Client, file_path: str, prompt: str) -> str:
    """Analyze a local video file via the Interactions API."""
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"Video file not found: {file_path}")

    file_size = path.stat().st_size
    if file_size > MAX_LOCAL_FILE_BYTES:
        raise ValueError(
            f"{file_path} is {file_size / 1024**2:.1f} MB; this skill sends a "
            f"local file in one request and takes at most "
            f"{MAX_LOCAL_FILE_BYTES / 1024**2:.0f} MB. Shorten or re-encode "
            f"the clip. Stored, reusable media needs different tooling."
        )

    with open(file_path, "rb") as f:
        video_data = base64.standard_b64encode(f.read()).decode("utf-8")

    # MIME_TYPES mirrors the vendor's accepted set, so an extension outside it
    # is rejected server-side anyway. Guessing mp4 only buys an opaque
    # INVALID_ARGUMENT after uploading the whole payload; failing here names
    # the problem before anything is spent.
    mime_type = MIME_TYPES.get(path.suffix.lower())
    if mime_type is None:
        raise ValueError(
            f"{path.suffix or path.name} is not a supported video extension. "
            f"Supported: {', '.join(sorted(MIME_TYPES))}. Re-encode, or rename "
            f"if the file is really one of these."
        )
    input_parts = [
        {"type": "text", "text": prompt},
        {"type": "video", "data": video_data, "mime_type": mime_type},
    ]

    print("Analyzing...", file=sys.stderr)
    return create_interaction(client, input_parts)


def analyze_youtube(client: genai.Client, url: str, prompt: str) -> str:
    """Analyze a YouTube video via the Interactions API."""
    print(f"Analyzing YouTube: {url}", file=sys.stderr)

    input_parts = [
        {"type": "text", "text": prompt},
        {"type": "video", "uri": url},
    ]
    return create_interaction(client, input_parts)


def main():
    global MODEL

    parser = argparse.ArgumentParser(
        description="Analyze video with Gemini API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "source",
        help="Video file path or YouTube URL",
    )
    parser.add_argument(
        "prompt",
        nargs="?",
        help="Analysis prompt (optional if --type is used)",
    )
    parser.add_argument(
        "--type",
        choices=["summary", "transcript", "timestamps", "visual"],
        help="Predefined analysis type",
    )
    parser.add_argument(
        "--model",
        default=MODEL,
        help=f"Model to use (default: {MODEL})",
    )

    args = parser.parse_args()

    # Determine prompt
    if args.type:
        prompt = PROMPTS[args.type]
    elif args.prompt:
        prompt = args.prompt
    else:
        parser.error("Either --type or a prompt is required")

    # Check API key
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable not set",
              file=sys.stderr)
        sys.exit(1)

    # Initialize client
    client = genai.Client(
        api_key=api_key,
        http_options={"timeout": HTTP_TIMEOUT_SECONDS * 1000},
    )

    # Update model if specified
    MODEL = args.model

    try:
        if is_youtube_url(args.source):
            result = analyze_youtube(client, args.source, prompt)
        else:
            result = analyze_local_file(client, args.source, prompt)

        # The banner is an affordance for someone reading a terminal, so it
        # goes to stderr with the progress lines. stdout stays result-only:
        # a caller piping this into a parser must not have to strip it.
        print("\n" + "=" * 60, file=sys.stderr)
        print("ANALYSIS RESULT", file=sys.stderr)
        print("=" * 60 + "\n", file=sys.stderr)
        print(result)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
