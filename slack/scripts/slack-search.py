#!/usr/bin/env uv run --quiet --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "slack-sdk>=3.23.0",
# ]
# ///
"""
slack-search - Search Slack messages and output results for piping to other tools

Unix Philosophy: Do one thing well - search Slack and output clean text
"""

import argparse
import os
import re
import sys
from datetime import datetime

from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError


class SlackSearcher:
    """Searches and formats Slack messages"""

    def __init__(self, token: str):
        self.slack = WebClient(token=token)
        self._user_cache = {}
        self._channel_cache = {}

    def get_username(self, user_id: str) -> str:
        """Get username from user ID with caching"""
        if not user_id:
            return "unknown"
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

    def get_channel_name(self, channel_id: str) -> str:
        """Get channel name from channel ID with caching"""
        if not channel_id:
            return "unknown"
        if channel_id in self._channel_cache:
            return self._channel_cache[channel_id]

        try:
            response = self.slack.conversations_info(channel=channel_id)
            name = response["channel"].get("name", channel_id)
            self._channel_cache[channel_id] = name
            return name
        except SlackApiError:
            self._channel_cache[channel_id] = channel_id
            return channel_id

    def format_message_text(self, text: str) -> str:
        """Clean and format message text"""
        if not text:
            return ""
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

        # Remove highlight markers
        text = text.replace("\ue000", "**")
        text = text.replace("\ue001", "**")

        return text.strip()

    def build_permalink(self, team: str, channel_id: str, ts: str) -> str:
        """Build Slack message permalink"""
        ts_clean = ts.replace(".", "")
        return f"https://{team}.slack.com/archives/{channel_id}/p{ts_clean}"

    def search(self, query: str, count: int = 20, sort: str = "timestamp") -> dict:
        """Search Slack messages"""
        try:
            response = self.slack.search_messages(
                query=query,
                count=min(count, 100),
                sort=sort,
                sort_dir="desc",
                highlight=True,
            )
            return response
        except SlackApiError as e:
            error_msg = e.response.get("error", "Unknown error")
            if error_msg == "missing_scope":
                raise Exception(
                    "Missing 'search:read' scope. User tokens (xoxp-) are required for search."
                )
            raise Exception(f"Slack API error: {error_msg}")

    def format_results(self, response: dict, query: str) -> str:
        """Format search results for output"""
        output_lines = []

        messages = response.get("messages", {})
        matches = messages.get("matches", [])
        total = messages.get("total", 0)

        output_lines.append(f"Search Query: {query}")
        output_lines.append(f"Total Results: {total} (showing {len(matches)})")
        output_lines.append("---")

        if not matches:
            output_lines.append("No messages found.")
            return "\n".join(output_lines)

        for i, match in enumerate(matches, 1):
            # Extract message info
            channel_info = match.get("channel", {})
            channel_id = channel_info.get("id", "")
            channel_name = channel_info.get("name", self.get_channel_name(channel_id))

            user_id = match.get("user", "") or match.get("username", "")
            username = match.get("username") or self.get_username(user_id)

            ts = match.get("ts", "0")
            time_str = datetime.fromtimestamp(float(ts)).strftime("%Y-%m-%d %H:%M")

            text = self.format_message_text(match.get("text", ""))

            # Build permalink
            team = match.get("team", "")
            permalink = match.get("permalink", "")
            if not permalink and team:
                permalink = self.build_permalink(team, channel_id, ts)

            # Extract thread_ts from permalink (API doesn't return it directly)
            thread_link = None
            is_thread_reply = False
            if permalink:
                thread_ts_match = re.search(r'thread_ts=(\d+\.\d+)', permalink)
                if thread_ts_match:
                    thread_ts = thread_ts_match.group(1)
                    is_thread_reply = True
                    # Extract team domain from permalink for consistent URL format
                    team_match = re.search(r'https://([^.]+)\.slack\.com', permalink)
                    team_domain = team_match.group(1) if team_match else team
                    thread_link = self.build_permalink(team_domain, channel_id, thread_ts)

            # Format output - indicate if message is in a thread
            header = f"[{i}] #{channel_name} | {username} | {time_str}"
            if is_thread_reply:
                header += " [reply]"
            output_lines.append(header)

            # Truncate long messages
            if len(text) > 500:
                text = text[:500] + "..."

            for line in text.split("\n")[:5]:  # Max 5 lines per message
                output_lines.append(f"    {line}")

            # Show thread root link first (for slack-thread usage)
            if thread_link:
                output_lines.append(f"    Thread: {thread_link}")
            if permalink:
                output_lines.append(f"    → {permalink}")
            output_lines.append("")

        return "\n".join(output_lines)

    def search_and_format(self, query: str, count: int = 20, sort: str = "timestamp") -> str:
        """Main method to search and format results"""
        response = self.search(query, count, sort)
        return self.format_results(response, query)


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        prog="slack-search",
        description="Search Slack messages and output results for piping to other tools",
        epilog="""
Examples:
  slack-search "project deadline"
  slack-search "from:@john in:#general budget"
  slack-search --count 50 "API error"
  slack-search --sort score "important announcement"

Search modifiers:
  in:#channel     - Search in specific channel
  from:@user      - Search messages from specific user
  before:2024-01-01 - Search before date
  after:2024-01-01  - Search after date
  has:link        - Messages with links
  has:reaction    - Messages with reactions
""",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "query",
        nargs="?",
        help="Search query (if not provided, reads from stdin)",
    )

    parser.add_argument(
        "--count", "-n",
        type=int,
        default=20,
        help="Number of results to return (default: 20, max: 100)",
    )

    parser.add_argument(
        "--sort", "-s",
        choices=["timestamp", "score"],
        default="timestamp",
        help="Sort by timestamp (newest first) or relevance score (default: timestamp)",
    )

    parser.add_argument(
        "--token",
        help="Slack user token (overrides SLACK_USER_TOKEN environment variable)",
    )

    args = parser.parse_args()

    # Check for Slack token - User token required for search
    token = args.token or os.environ.get("SLACK_USER_TOKEN")

    if not token:
        print("Error: No Slack user token found", file=sys.stderr)
        print("\nThe search API requires a user token (xoxp-):", file=sys.stderr)
        print("  export SLACK_USER_TOKEN='xoxp-your-user-token'", file=sys.stderr)
        print("\nOr provide token via command line:", file=sys.stderr)
        print("  slack-search --token 'xoxp-...' <query>", file=sys.stderr)
        print("\nNote: Bot tokens (xoxb-) do not support search.", file=sys.stderr)
        sys.exit(1)

    if not token.startswith("xoxp-"):
        print("Warning: Search API requires a user token (xoxp-). Bot tokens won't work.", file=sys.stderr)

    # Get query from argument or stdin
    if args.query:
        query = args.query
    else:
        query = sys.stdin.readline().strip()

    if not query:
        print("Error: No search query provided", file=sys.stderr)
        parser.print_help(file=sys.stderr)
        sys.exit(1)

    try:
        searcher = SlackSearcher(token)
        results = searcher.search_and_format(query, args.count, args.sort)
        print(results)

    except KeyboardInterrupt:
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
