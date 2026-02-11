#!/usr/bin/env python3
"""Extract search-friendly metadata from yt-dlp info JSON.

Usage:
    python3 save_metadata.py <info_json_path>
    yt-dlp --dump-json URL | python3 save_metadata.py - -o output.json

Reads a yt-dlp .info.json (or stdin with '-') and writes a slim JSON
containing only fields useful for search and content understanding.
"""
import json
import sys
from pathlib import Path

FIELDS = [
    "title",
    "description",
    "uploader",
    "uploader_id",
    "channel",
    "upload_date",
    "duration",
    "duration_string",
    "tags",
    "categories",
    "view_count",
    "like_count",
    "comment_count",
    "webpage_url",
    "original_url",
    "thumbnail",
    "extractor",
    "resolution",
    "fps",
    "filesize_approx",
]


def extract_metadata(info: dict) -> dict:
    """Extract search-relevant fields from full yt-dlp info dict."""
    meta = {}
    for key in FIELDS:
        val = info.get(key)
        if val is not None:
            meta[key] = val
    return meta


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Extract slim metadata from yt-dlp info JSON")
    parser.add_argument("input", help="Path to .info.json file, or '-' for stdin")
    parser.add_argument("-o", "--output", help="Output JSON path (default: replace .info.json → .meta.json, or stdout for stdin)")
    args = parser.parse_args()

    if args.input == "-":
        info = json.load(sys.stdin)
    else:
        with open(args.input) as f:
            info = json.load(f)

    meta = extract_metadata(info)

    if args.output:
        out_path = args.output
    elif args.input == "-":
        json.dump(meta, sys.stdout, ensure_ascii=False, indent=2)
        print()
        return
    else:
        if args.input.endswith(".info.json"):
            out_path = args.input[: -len(".info.json")] + ".meta.json"
        else:
            out_path = args.input + ".meta.json"

    Path(out_path).write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Saved: {out_path}")


if __name__ == "__main__":
    main()
