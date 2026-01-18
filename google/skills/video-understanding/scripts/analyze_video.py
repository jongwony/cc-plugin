#!/usr/bin/env python3
"""
Video Analysis with Gemini API

Supports:
- Local file upload via Files API
- YouTube URL analysis
- Multiple analysis types: summary, transcript, timestamps, QnA

Usage:
    python analyze_video.py /path/to/video.mp4 "Summarize this video"
    python analyze_video.py "https://www.youtube.com/watch?v=VIDEO_ID" "What is discussed?"
    python analyze_video.py /path/to/video.mp4 --type summary
    python analyze_video.py /path/to/video.mp4 --type transcript
    python analyze_video.py /path/to/video.mp4 --type timestamps

Environment:
    GEMINI_API_KEY - Google AI API key (required)
"""

import argparse
import base64
import os
import sys
import time
from pathlib import Path

try:
    from google import genai
    from google.genai import types
except ImportError:
    print("Error: google-genai not installed. Run: uv pip install google-genai")
    sys.exit(1)


# Default model
MODEL = "gemini-3-flash-preview"

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


def is_youtube_url(source: str) -> bool:
    """Check if source is a YouTube URL."""
    youtube_patterns = [
        "youtube.com/watch",
        "youtu.be/",
        "youtube.com/embed/",
    ]
    return any(p in source.lower() for p in youtube_patterns)


def upload_video(client: genai.Client, file_path: str) -> types.File:
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


def analyze_local_file(
    client: genai.Client,
    file_path: str,
    prompt: str,
    low_res: bool = False,
    start_offset: str = None,
    end_offset: str = None,
) -> str:
    """Analyze a local video file."""
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"Video file not found: {file_path}")

    file_size = path.stat().st_size

    # Use inline data for small files (<20MB)
    if file_size < 20 * 1024 * 1024:
        print("Using inline data (file < 20MB)")
        with open(file_path, "rb") as f:
            video_data = base64.standard_b64encode(f.read()).decode("utf-8")

        # Determine MIME type
        suffix = path.suffix.lower()
        mime_types = {
            ".mp4": "video/mp4",
            ".mpeg": "video/mpeg",
            ".mov": "video/mov",
            ".avi": "video/avi",
            ".webm": "video/webm",
            ".wmv": "video/wmv",
            ".flv": "video/x-flv",
            ".3gp": "video/3gpp",
        }
        mime_type = mime_types.get(suffix, "video/mp4")

        contents = [
            {"inline_data": {"mime_type": mime_type, "data": video_data}},
            prompt,
        ]
    else:
        # Use Files API for larger files
        print("Using Files API (file >= 20MB)")
        video_file = upload_video(client, file_path)

        # Build content with optional metadata
        if start_offset or end_offset:
            metadata = types.VideoMetadata()
            if start_offset:
                metadata.start_offset = start_offset
            if end_offset:
                metadata.end_offset = end_offset

            contents = [
                types.Part(
                    file_data=types.FileData(file_uri=video_file.uri),
                    video_metadata=metadata,
                ),
                prompt,
            ]
        else:
            contents = [video_file, prompt]

    # Configure request
    config = None
    if low_res:
        config = types.GenerateContentConfig(media_resolution="low")

    # Generate response
    print("Analyzing...")
    response = client.models.generate_content(
        model=MODEL,
        contents=contents,
        config=config,
    )

    return response.text


def analyze_youtube(client: genai.Client, url: str, prompt: str) -> str:
    """Analyze a YouTube video."""
    print(f"Analyzing YouTube: {url}")

    response = client.models.generate_content(
        model=MODEL,
        contents=types.Content(
            parts=[
                types.Part(
                    file_data=types.FileData(file_uri=url)
                ),
                types.Part(text=prompt),
            ]
        ),
    )

    return response.text


def main():
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
        help="Start offset (e.g., '30s', '1m30s')",
    )
    parser.add_argument(
        "--end",
        help="End offset (e.g., '120s', '5m')",
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
    global MODEL
    MODEL = args.model

    try:
        if is_youtube_url(args.source):
            result = analyze_youtube(client, args.source, prompt)
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
