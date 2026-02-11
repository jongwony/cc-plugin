#!/usr/bin/env python3
"""Decode QR codes from image files using zbarimg.

Usage:
    python3 decode_qr.py <image_path>

Output:
    Decoded URL(s), one per line. Exit code 1 if no QR found.

Dependencies:
    - zbarimg (brew install zbar)
"""
import subprocess
import sys


def decode_qr(image_path: str) -> list[str]:
    """Decode QR codes from an image file."""
    result = subprocess.run(
        ["zbarimg", "--quiet", "--raw", image_path],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 and not result.stdout.strip():
        print(f"Error: No QR code found in {image_path}", file=sys.stderr)
        if result.stderr.strip():
            print(result.stderr.strip(), file=sys.stderr)
        return []
    return [line.strip() for line in result.stdout.strip().splitlines() if line.strip()]


def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <image_path>", file=sys.stderr)
        sys.exit(2)

    urls = decode_qr(sys.argv[1])
    if not urls:
        sys.exit(1)

    for url in urls:
        print(url)


if __name__ == "__main__":
    main()
