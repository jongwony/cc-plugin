#!/usr/bin/env python3
"""
Video Analysis with Gemini Interactions API

Supports:
- Local file upload via Files API
- YouTube URL analysis
- Multiple analysis types: summary, transcript, timestamps, QnA

Uses the Interactions API (client.interactions.create), the current standard for
new development. generateContent still works, but Interactions is the default idiom
in the official docs. Video clipping (--start/--end) has no Interactions equivalent,
so that path alone falls back to the legacy generate_content call (see analyze_clip).

Usage:
    python analyze_video.py /path/to/video.mp4 "Summarize this video"
    python analyze_video.py "https://www.youtube.com/watch?v=VIDEO_ID" "What is discussed?"
    python analyze_video.py /path/to/video.mp4 --type summary
    python analyze_video.py /path/to/video.mp4 --type transcript
    python analyze_video.py /path/to/video.mp4 --type timestamps

Environment:
    GEMINI_API_KEY - Google AI API key (required)

Install:
    uv pip install "google-genai>=2.3.0"
"""

import argparse
import base64
import os
import sys
import time
from pathlib import Path

try:
    from google import genai
    from google.genai import types  # only for the legacy clipping fallback
except ImportError:
    print('Error: google-genai not installed. Run: uv pip install "google-genai>=2.3.0"')
    sys.exit(1)


# Default model
MODEL = "gemini-3.5-flash"

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
    youtube_patterns = [
        "youtube.com/watch",
        "youtu.be/",
        "youtube.com/embed/",
    ]
    return any(p in source.lower() for p in youtube_patterns)


def create_interaction(client: genai.Client, input_parts: list, low_res: bool):
    """Run an Interactions API request.

    Media resolution is a per-item field on video parts ("resolution": "low");
    generation_config has no media_resolution key in the Interactions API (an
    unknown key there is silently ignored), so --low-res is applied by tagging
    each video part. Per-item means it covers every source (local and YouTube).

    Requests are sent with store=False: this is a one-shot analysis utility (no
    previous_interaction_id chaining, no background execution), so interactions
    are not persisted server-side.
    """
    if low_res:
        input_parts = [
            {**p, "resolution": "low"} if p.get("type") == "video" else p
            for p in input_parts
        ]
    return client.interactions.create(model=MODEL, input=input_parts, store=False)


def upload_video(client: genai.Client, file_path: str):
    """Upload video file and wait for processing."""
    print(f"Uploading: {file_path}")

    video_file = client.files.upload(file=file_path)
    print(f"Uploaded: {video_file.name}")

    # Wait for processing
    while video_file.state.name == "PROCESSING":
        print("Processing...", end="\r")
        time.sleep(5)
        video_file = client.files.get(name=video_file.name)

    if video_file.state.name == "FAILED":
        raise ValueError(f"Video processing failed: {video_file.name}")

    print(f"Ready: {video_file.state.name}")
    return video_file


def analyze_clip(
    client: genai.Client,
    file_path: str,
    prompt: str,
    low_res: bool,
    start_offset: str,
    end_offset: str,
) -> str:
    """Analyze a clipped segment of a local video.

    The Interactions API has no offset parameter (video_metadata is silently
    ignored), so clipping falls back to the legacy generate_content call, which
    still honors start/end offsets via types.VideoMetadata.
    """
    print("Clipping requested -> using legacy generate_content "
          "(Interactions API has no offset support)")
    video_file = upload_video(client, file_path)

    metadata = types.VideoMetadata()
    if start_offset:
        metadata.start_offset = start_offset
    if end_offset:
        metadata.end_offset = end_offset

    config = None
    if low_res:
        config = types.GenerateContentConfig(
            media_resolution=types.MediaResolution.MEDIA_RESOLUTION_LOW
        )

    print("Analyzing...")
    response = client.models.generate_content(
        model=MODEL,
        contents=[
            types.Part(
                file_data=types.FileData(file_uri=video_file.uri),
                video_metadata=metadata,
            ),
            prompt,
        ],
        config=config,
    )
    return response.text


def analyze_local_file(
    client: genai.Client,
    file_path: str,
    prompt: str,
    low_res: bool = False,
    start_offset: str = None,
    end_offset: str = None,
) -> str:
    """Analyze a local video file via the Interactions API."""
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"Video file not found: {file_path}")

    # Clipping has no Interactions equivalent -> legacy fallback.
    if start_offset or end_offset:
        return analyze_clip(client, file_path, prompt, low_res, start_offset, end_offset)

    file_size = path.stat().st_size

    # The 20MB inline limit is TOTAL request size; base64 inflates ~4/3,
    # so compare the encoded size, not the raw file size.
    encoded_size = file_size * 4 // 3
    if encoded_size < 20 * 1024 * 1024:
        print("Using inline data (encoded size < 20MB)")
        with open(file_path, "rb") as f:
            video_data = base64.standard_b64encode(f.read()).decode("utf-8")

        mime_type = MIME_TYPES.get(path.suffix.lower(), "video/mp4")
        input_parts = [
            {"type": "text", "text": prompt},
            {"type": "video", "data": video_data, "mime_type": mime_type},
        ]
    else:
        print("Using Files API (encoded size >= 20MB)")
        video_file = upload_video(client, file_path)
        input_parts = [
            {"type": "text", "text": prompt},
            {"type": "video", "uri": video_file.uri, "mime_type": video_file.mime_type},
        ]

    print("Analyzing...")
    interaction = create_interaction(client, input_parts, low_res)
    return interaction.output_text


def analyze_youtube(
    client: genai.Client,
    url: str,
    prompt: str,
    low_res: bool = False,
) -> str:
    """Analyze a YouTube video via the Interactions API."""
    print(f"Analyzing YouTube: {url}")

    input_parts = [
        {"type": "text", "text": prompt},
        {"type": "video", "uri": url},
    ]
    interaction = create_interaction(client, input_parts, low_res)
    return interaction.output_text


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
        "--low-res",
        action="store_true",
        help="Use low resolution (saves tokens)",
    )
    parser.add_argument(
        "--start",
        help="Start offset (e.g., '30s', '1m30s'); local files only",
    )
    parser.add_argument(
        "--end",
        help="End offset (e.g., '120s', '5m'); local files only",
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
        print("Error: GEMINI_API_KEY environment variable not set")
        sys.exit(1)

    # Initialize client
    client = genai.Client(api_key=api_key)

    # Update model if specified
    MODEL = args.model

    try:
        if is_youtube_url(args.source):
            if args.start or args.end:
                print("Warning: --start/--end are ignored for YouTube sources "
                      "(clipping is supported for local files only)", file=sys.stderr)
            result = analyze_youtube(client, args.source, prompt, low_res=args.low_res)
        else:
            result = analyze_local_file(
                client,
                args.source,
                prompt,
                low_res=args.low_res,
                start_offset=args.start,
                end_offset=args.end,
            )

        print("\n" + "=" * 60)
        print("ANALYSIS RESULT")
        print("=" * 60 + "\n")
        print(result)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
