#!/usr/bin/env uv run --quiet --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "slack-sdk>=3.23.0",
# ]
# ///
"""
slack-thread - Fetch and format Slack threads for piping to other tools

Unix Philosophy: Do one thing well - fetch Slack threads and output clean text
"""

import argparse
import os
import re
import sys
from datetime import datetime

from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError


class SlackThreadFetcher:
    """Fetches and formats Slack thread conversations"""

    def __init__(self, token: str):
        self.slack = WebClient(token=token)
        self._user_cache = {}

    def parse_url(self, url: str) -> dict[str, str]:
        """Parse Slack thread URL to extract channel and timestamp"""
        # Handle various Slack URL formats
        patterns = [
            r"https?://([^\.]+)\.slack\.com/archives/([^/]+)/p(\d+)",
            r"https?://app\.slack\.com/client/[^/]+/([^/]+)/thread/([^-]+)-(\d+\.\d+)",
        ]

        for pattern in patterns:
            match = re.match(pattern, url)
            if match:
                if len(match.groups()) == 3:
                    _, channel_id, timestamp_str = match.groups()
                    # Convert timestamp format
                    timestamp = f"{timestamp_str[:10]}.{timestamp_str[10:]}"
                else:
                    # Handle app.slack.com format
                    channel_id = match.group(2)
                    timestamp = match.group(3)

                return {"channel": channel_id, "timestamp": timestamp}

        raise ValueError(f"Cannot parse Slack URL: {url}")

    def get_username(self, user_id: str) -> str:
        """Get username from user ID with caching"""
        if user_id in self._user_cache:
            return self._user_cache[user_id]

        try:
            response = self.slack.users_info(user=user_id)
            username = response["user"].get("display_name") or response["user"].get(
                "name", f"user_{user_id}"
            )
            self._user_cache[user_id] = username
            return username
        except SlackApiError:
            username = f"user_{user_id}"
            self._user_cache[user_id] = username
            return username

    def fetch_messages(self, channel: str, timestamp: str) -> list[dict]:
        """Fetch all messages in a thread"""
        try:
            response = self.slack.conversations_replies(channel=channel, ts=timestamp, limit=1000)
            return response["messages"]
        except SlackApiError as e:
            error_msg = e.response.get("error", "Unknown error")
            token = self.slack.token
            is_user_token = token and token.startswith("xoxp-")

            if error_msg == "channel_not_found":
                if is_user_token:
                    raise Exception("Channel not found. You may not have access to this private channel.")
                else:
                    raise Exception("Channel not found. Make sure the bot is added to the channel.")
            elif error_msg == "not_in_channel":
                if is_user_token:
                    raise Exception("You don't have access to this channel. Only channels you're a member of can be accessed.")
                else:
                    raise Exception("Bot is not in the channel. Please add the bot to the channel first.")
            else:
                raise Exception(f"Slack API error: {error_msg}")

    def format_message_text(self, text: str) -> str:
        """Clean and format message text"""
        # Remove Slack user mentions
        text = re.sub(r"<@[A-Z0-9]+>", lambda m: "@user", text)

        # Convert Slack links
        text = re.sub(
            r"<(https?://[^|>]+)(?:\|([^>]+))?>",
            lambda m: m.group(2) if m.group(2) else m.group(1),
            text,
        )

        # Clean up formatting
        text = text.replace("&amp;", "&")
        text = text.replace("&lt;", "<")
        text = text.replace("&gt;", ">")

        return text.strip()

    def format_media(self, item: dict, item_type: str) -> list[str]:
        """Format file or attachment for output"""
        if item_type == "file":
            # Deleted file
            if item.get("mode") == "tombstone":
                return ["[File Deleted]"]

            url = item.get("url_private", "")
            if not url:
                return []

            name = item.get("name") or item.get("title") or "unnamed"
            mimetype = item.get("mimetype", "")
            filetype = item.get("filetype", "").lower()

            # Determine type
            if mimetype.startswith("image/") or filetype in {"png", "jpg", "jpeg", "gif"}:
                return [f"[Image] {name}", f"  {url}"]
            elif mimetype.startswith("video/") or filetype in {"mp4", "mov", "webm"}:
                return [f"[Video] {name}", f"  {url}"]
            elif filetype == "pdf":
                lines = [f"[PDF] {name}", f"  {url}"]
                if download := item.get("url_private_download"):
                    lines.append(f"  download: {download}")
                return lines
            else:
                return [f"[File] {name}", f"  {url}"]

        else:  # attachment
            # Link unfurl (1-depth)
            if from_url := item.get("from_url"):
                title = item.get("title") or item.get("fallback") or "Link"
                return [f"[Link] {title}", f"  {from_url}"]

            # Actual attachment (title only)
            title = item.get("title") or item.get("fallback")
            if title:
                return [f"[Attachment] {title}"]
            return []

    def format_thread(self, url: str, messages: list[dict]) -> str:
        """Format thread messages for output"""
        output_lines = []
        output_lines.append(f"Slack Thread URL: {url}")
        output_lines.append("---")
        output_lines.append("Conversation Format:")
        output_lines.append("[<timestamp>] <username>:")
        output_lines.append("<message>")
        output_lines.append("<attachment or file>")
        output_lines.append("---")

        for msg in messages:
            # Get user info
            user_id = msg.get("user", "unknown")
            username = self.get_username(user_id) if user_id != "unknown" else "Unknown"

            # Get timestamp
            ts = float(msg.get("ts", 0))
            time_str = datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")

            # Get message text
            text = self.format_message_text(msg.get("text", ""))

            # Check if it's a thread reply
            is_reply = "thread_ts" in msg and msg["thread_ts"] != msg["ts"]

            # Detailed format
            prefix = "└─ " if is_reply else ""
            output_lines.append(f"{prefix}[{time_str}] {username}:")
            for line in text.split("\n"):
                output_lines.append(f"{'   ' if is_reply else ''}{line}")

            # Format attachments and files
            indent = "   " if is_reply else ""
            for attachment in msg.get("attachments", []):
                for line in self.format_media(attachment, "attachment"):
                    output_lines.append(f"{indent}{line}")

            for file in msg.get("files", []):
                for line in self.format_media(file, "file"):
                    output_lines.append(f"{indent}{line}")

            output_lines.append("")  # Empty line between messages

        return "\n".join(output_lines)

    def fetch_thread(self, url: str) -> str:
        """Main method to fetch and format a thread"""
        # Parse URL
        info = self.parse_url(url)

        # Fetch messages
        messages = self.fetch_messages(info["channel"], info["timestamp"])

        # Format and return
        return self.format_thread(url, messages)


def main():
    """Main entry point"""
    # Set up argument parser
    parser = argparse.ArgumentParser(
        prog="slack-thread",
        description="Fetch and format Slack threads for piping to other tools",
        epilog="Unix Philosophy: Do one thing well - fetch Slack threads and output clean text"
    )

    parser.add_argument(
        "url",
        nargs="?",
        help="Slack thread URL (if not provided, reads from stdin)"
    )

    parser.add_argument(
        "--token",
        help="Slack token (overrides SLACK_USER_TOKEN or SLACK_BOT_TOKEN environment variables)"
    )

    args = parser.parse_args()

    # Check for Slack token - Command line > User token > Bot token
    token = args.token or os.environ.get("SLACK_USER_TOKEN") or os.environ.get("SLACK_BOT_TOKEN")

    if not token:
        print("Error: No Slack token found", file=sys.stderr)
        print("\nFor personal use (access your own threads):", file=sys.stderr)
        print("  export SLACK_USER_TOKEN='xoxp-your-user-token'", file=sys.stderr)
        print("\nFor server/CI use (access all channels):", file=sys.stderr)
        print("  export SLACK_BOT_TOKEN='xoxb-your-bot-token'", file=sys.stderr)
        print("\nOr provide token via command line:", file=sys.stderr)
        print("  slack-thread --token 'your-token' <thread-url>", file=sys.stderr)
        sys.exit(1)

    # Get URL from argument or stdin
    if args.url:
        url = args.url
    else:
        # Read from stdin if no argument
        url = sys.stdin.readline().strip()

    if not url:
        print("Error: No Slack thread URL provided", file=sys.stderr)
        parser.print_help(file=sys.stderr)
        sys.exit(1)

    try:
        # Fetch and output thread
        fetcher = SlackThreadFetcher(token)
        thread_content = fetcher.fetch_thread(url)
        print(thread_content)

    except KeyboardInterrupt:
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
