# /// script
# dependencies = ["pypdf"]
# ///
"""
Extract table of contents and chapter structure from PDF.

Usage:
    uv run extract_toc.py <pdf_path> [--pattern <regex>] [--pages <n>]

Options:
    --pattern   Custom regex pattern for chapter detection (default: Chapter followed by number)
    --pages     Number of pages to scan for patterns (default: all)

Output:
    - PDF metadata and page count
    - Embedded bookmarks/outline (if present)
    - Detected chapter patterns with page numbers
"""

import argparse
import re
import sys
from pypdf import PdfReader


def extract_outline(reader: PdfReader) -> list[tuple[int, str, int]]:
    """Extract bookmarks/outline from PDF."""
    results = []

    def process_outline(outline, level=0):
        for item in outline:
            if isinstance(item, list):
                process_outline(item, level + 1)
            else:
                try:
                    page_num = reader.get_destination_page_number(item) + 1
                except Exception:
                    page_num = -1
                results.append((level, item.title, page_num))

    if reader.outline:
        process_outline(reader.outline)

    return results


def detect_chapter_patterns(
    reader: PdfReader,
    pattern: str = r"Chapter\s+\d+",
    max_pages: int | None = None
) -> list[tuple[int, str]]:
    """Detect chapter headings from page text."""
    results = []
    total = len(reader.pages) if max_pages is None else min(max_pages, len(reader.pages))

    for i in range(total):
        text = reader.pages[i].extract_text()
        if text and re.search(pattern, text, re.IGNORECASE):
            # Extract first 150 chars for context
            preview = text[:150].replace('\n', ' ').strip()
            results.append((i + 1, preview))

    return results


def main():
    parser = argparse.ArgumentParser(description="Extract PDF TOC and chapter structure")
    parser.add_argument("pdf_path", help="Path to PDF file")
    parser.add_argument("--pattern", default=r"Chapter\s+\d+", help="Regex pattern for chapter detection")
    parser.add_argument("--pages", type=int, default=None, help="Max pages to scan (default: all)")
    args = parser.parse_args()

    try:
        reader = PdfReader(args.pdf_path)
    except Exception as e:
        print(f"Error reading PDF: {e}", file=sys.stderr)
        sys.exit(1)

    # Basic info
    print(f"=== PDF Analysis: {args.pdf_path} ===\n")
    print(f"Total pages: {len(reader.pages)}")

    if reader.metadata:
        if reader.metadata.title:
            print(f"Title: {reader.metadata.title}")
        if reader.metadata.author:
            print(f"Author: {reader.metadata.author}")
    print()

    # Bookmarks/Outline
    outline = extract_outline(reader)
    if outline:
        print("=== Embedded Bookmarks ===\n")
        for level, title, page in outline:
            indent = "  " * level
            print(f"{indent}{title} (page {page})")
        print()
    else:
        print("=== Embedded Bookmarks ===\n")
        print("No bookmarks found.\n")

    # Pattern detection
    print(f"=== Chapter Pattern Detection (pattern: {args.pattern}) ===\n")
    chapters = detect_chapter_patterns(reader, args.pattern, args.pages)

    if chapters:
        print(f"Found {len(chapters)} matches:\n")
        for page, preview in chapters:
            print(f"Page {page}: {preview[:80]}...")
            print()
    else:
        print("No chapter patterns detected.")
        print("Try different patterns:")
        print("  --pattern 'Part\\s+\\w+'")
        print("  --pattern 'Section\\s+\\d+'")
        print("  --pattern 'CHAPTER\\s+[IVXLC]+'")

    # Summary for next step
    print("\n=== Next Steps ===")
    print("Define chapter boundaries and run split_by_chapters.py")
    print("Example chapters JSON format:")
    print('  [[1, 22, "00_Intro"], [23, 45, "01_Chapter1"], ...]')


if __name__ == "__main__":
    main()
