#!/usr/bin/env uv run --quiet --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "slack-sdk>=3.23.0",
#     "requests>=2.28.0",
# ]
# ///
"""
slack-resource - Fetch Slack file metadata and download files for analysis

Unix Philosophy: Access Slack file resources (images, documents) for context
"""

import argparse
import base64
import os
import re
import sys
import tempfile
from pathlib import Path

import requests
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError


class SlackResourceFetcher:
    """Fetches Slack file resources"""

    def __init__(self, token: str):
        self.slack = WebClient(token=token)
        self.token = token

    def parse_file_url(self, url: str) -> dict | None:
        """Parse Slack file URL to extract file ID"""
        # Format: https://files.slack.com/files-pri/TEAM_ID-FILE_ID/filename
        # Team ID: T..., File ID: F...
        match = re.search(r'files(?:-pri|-tmb)?/(T[A-Z0-9]+)-(F[A-Z0-9]+)', url)
        if match:
            return {"team_id": match.group(1), "file_id": match.group(2)}

        # Format with separate paths: .../T.../F.../filename
        match = re.search(r'/(T[A-Z0-9]+)/(F[A-Z0-9]+)/', url)
        if match:
            return {"team_id": match.group(1), "file_id": match.group(2)}

        # Direct file ID (starts with F)
        if re.match(r'^F[A-Z0-9]{8,}$', url):
            return {"file_id": url}

        return None

    def get_file_info(self, file_id: str) -> dict:
        """Get file metadata from Slack API"""
        try:
            response = self.slack.files_info(file=file_id)
            return response["file"]
        except SlackApiError as e:
            return {"error": e.response.get("error", "Unknown error")}

    def download_file(self, url: str, output_path: Path) -> bool:
        """Download file from Slack (requires authentication)"""
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()

            with open(output_path, "wb") as f:
                f.write(response.content)
            return True
        except Exception as e:
            print(f"Download error: {e}", file=sys.stderr)
            return False

    def format_file_info(self, file_info: dict) -> str:
        """Format file metadata for output"""
        if "error" in file_info:
            return f"Error: {file_info['error']}"

        lines = []
        lines.append(f"# File: {file_info.get('name', 'Unknown')}")
        lines.append("")
        lines.append(f"- **ID**: {file_info.get('id')}")
        lines.append(f"- **Type**: {file_info.get('filetype', 'unknown')}")
        lines.append(f"- **MIME**: {file_info.get('mimetype', 'unknown')}")
        lines.append(f"- **Size**: {file_info.get('size', 0):,} bytes")
        lines.append(f"- **Title**: {file_info.get('title', 'N/A')}")

        if file_info.get("url_private"):
            lines.append(f"- **URL**: {file_info['url_private']}")

        if file_info.get("url_private_download"):
            lines.append(f"- **Download**: {file_info['url_private_download']}")

        # Image-specific info
        if file_info.get("original_w"):
            lines.append(f"- **Dimensions**: {file_info['original_w']}x{file_info.get('original_h', '?')}")

        return "\n".join(lines)

    def process_resource(self, url: str, download: bool = False, output_dir: Path | None = None) -> str:
        """Process a Slack file resource"""
        parsed = self.parse_file_url(url)
        if not parsed:
            return f"Cannot parse URL: {url}"

        file_id = parsed["file_id"]
        file_info = self.get_file_info(file_id)

        if "error" in file_info:
            return f"Error fetching file {file_id}: {file_info['error']}"

        output_lines = [self.format_file_info(file_info)]

        # Download if requested
        if download and file_info.get("url_private"):
            output_dir = output_dir or Path(tempfile.gettempdir())
            filename = file_info.get("name", f"{file_id}.bin")
            output_path = output_dir / filename

            if self.download_file(file_info["url_private"], output_path):
                output_lines.append("")
                output_lines.append(f"**Downloaded to**: {output_path}")

                # For images, provide base64 option
                mimetype = file_info.get("mimetype", "")
                if mimetype.startswith("image/") and output_path.stat().st_size < 5_000_000:
                    output_lines.append(f"**Local path for Claude Read**: {output_path}")

        return "\n".join(output_lines)


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        prog="slack-resource",
        description="Fetch Slack file metadata and optionally download files",
        epilog="""
Examples:
  # Get file metadata
  slack-resource "https://files.slack.com/files-pri/T.../F.../image.png"

  # Download file for analysis
  slack-resource --download "https://files.slack.com/files-pri/T.../F.../image.png"

  # Download to specific directory
  slack-resource --download --output /tmp/slack "F0ABC123DEF"
""",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "urls",
        nargs="+",
        help="Slack file URLs or file IDs",
    )

    parser.add_argument(
        "--download", "-d",
        action="store_true",
        help="Download files locally",
    )

    parser.add_argument(
        "--output", "-o",
        type=Path,
        help="Output directory for downloads (default: temp dir)",
    )

    parser.add_argument(
        "--token",
        help="Slack token (overrides SLACK_USER_TOKEN or SLACK_BOT_TOKEN)",
    )

    args = parser.parse_args()

    token = args.token or os.environ.get("SLACK_USER_TOKEN") or os.environ.get("SLACK_BOT_TOKEN")

    if not token:
        print("Error: No Slack token found", file=sys.stderr)
        print("  export SLACK_USER_TOKEN='xoxp-your-user-token'", file=sys.stderr)
        sys.exit(1)

    if args.output and not args.output.exists():
        args.output.mkdir(parents=True, exist_ok=True)

    try:
        fetcher = SlackResourceFetcher(token)

        for url in args.urls:
            result = fetcher.process_resource(url, args.download, args.output)
            print(result)
            print()

    except KeyboardInterrupt:
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
