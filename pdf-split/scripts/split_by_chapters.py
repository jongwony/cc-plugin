# /// script
# dependencies = ["pypdf"]
# ///
"""
Split PDF into chapter files based on provided boundaries.

Usage:
    uv run split_by_chapters.py <pdf_path> <output_dir> --chapters '<json>'

Arguments:
    pdf_path    Path to source PDF
    output_dir  Directory for output files (created if not exists)
    --chapters  JSON array of [start, end, name] tuples
                Example: '[[1,22,"Intro"],[23,45,"Ch1"]]'

Output:
    Creates numbered PDF files in output_dir:
    - 00_Intro.pdf
    - 01_Ch1.pdf
    - ...
"""

import argparse
import json
import os
import re
import sys
from pypdf import PdfReader, PdfWriter


def sanitize_filename(name: str) -> str:
    """Convert chapter name to safe filename."""
    # Replace spaces and special chars
    sanitized = re.sub(r'[^\w\-]', '_', name)
    # Remove consecutive underscores
    sanitized = re.sub(r'_+', '_', sanitized)
    # Remove leading/trailing underscores
    return sanitized.strip('_')


def split_pdf(pdf_path: str, output_dir: str, chapters: list[tuple[int, int, str]]) -> list[str]:
    """Split PDF into chapter files."""
    reader = PdfReader(pdf_path)
    total_pages = len(reader.pages)
    created_files = []

    os.makedirs(output_dir, exist_ok=True)

    for idx, (start, end, name) in enumerate(chapters):
        writer = PdfWriter()

        # Validate page range
        actual_start = max(1, start)
        actual_end = min(end, total_pages)

        if actual_start > total_pages:
            print(f"Warning: Skipping {name} (start page {start} > total {total_pages})")
            continue

        # Add pages (convert to 0-indexed)
        for i in range(actual_start - 1, actual_end):
            writer.add_page(reader.pages[i])

        # Generate filename
        safe_name = sanitize_filename(name)
        filename = f"{idx:02d}_{safe_name}.pdf"
        output_path = os.path.join(output_dir, filename)

        with open(output_path, "wb") as f:
            writer.write(f)

        page_count = actual_end - actual_start + 1
        created_files.append((filename, page_count))
        print(f"Created: {filename} ({page_count} pages)")

    return created_files


def main():
    parser = argparse.ArgumentParser(description="Split PDF by chapter boundaries")
    parser.add_argument("pdf_path", help="Path to source PDF")
    parser.add_argument("output_dir", help="Output directory")
    parser.add_argument("--chapters", required=True, help="JSON array of [start, end, name]")
    args = parser.parse_args()

    # Parse chapters JSON
    try:
        chapters_raw = json.loads(args.chapters)
        chapters = [(int(c[0]), int(c[1]), str(c[2])) for c in chapters_raw]
    except (json.JSONDecodeError, IndexError, ValueError) as e:
        print(f"Error parsing chapters JSON: {e}", file=sys.stderr)
        print("Expected format: '[[1,22,\"Intro\"],[23,45,\"Ch1\"]]'", file=sys.stderr)
        sys.exit(1)

    # Validate input
    if not os.path.exists(args.pdf_path):
        print(f"Error: PDF not found: {args.pdf_path}", file=sys.stderr)
        sys.exit(1)

    print(f"=== Splitting PDF ===")
    print(f"Source: {args.pdf_path}")
    print(f"Output: {args.output_dir}")
    print(f"Chapters: {len(chapters)}")
    print()

    # Execute split
    try:
        created = split_pdf(args.pdf_path, args.output_dir, chapters)
        print(f"\nDone! Created {len(created)} files in {args.output_dir}")
    except Exception as e:
        print(f"Error splitting PDF: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
