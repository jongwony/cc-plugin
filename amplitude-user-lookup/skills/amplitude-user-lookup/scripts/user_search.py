#!/usr/bin/env python3
"""
Amplitude User Search API
Search for users by device_id or user_id and get their Amplitude ID.

Usage:
    python user_search.py <device_id_or_user_id>
    python user_search.py <device_id_or_user_id> --json

Environment Variables:
    AMPLITUDE_API_KEY: Amplitude API Key (required)
    AMPLITUDE_SECRET_KEY: Amplitude Secret Key (required)
    AMPLITUDE_REGION: 'us' (default) or 'eu'
"""
import argparse
import json
import os
import sys
import urllib.request
import urllib.error
import base64


def get_credentials():
    api_key = os.environ.get("AMPLITUDE_API_KEY")
    secret_key = os.environ.get("AMPLITUDE_SECRET_KEY")

    if not api_key or not secret_key:
        print("Error: AMPLITUDE_API_KEY and AMPLITUDE_SECRET_KEY environment variables required", file=sys.stderr)
        sys.exit(1)

    return api_key, secret_key


def get_base_url():
    region = os.environ.get("AMPLITUDE_REGION", "us").lower()
    if region == "eu":
        return "https://analytics.eu.amplitude.com"
    return "https://amplitude.com"


def user_search(user_query: str) -> dict:
    """Search for a user by device_id or user_id."""
    api_key, secret_key = get_credentials()
    base_url = get_base_url()

    url = f"{base_url}/api/2/usersearch?user={urllib.parse.quote(user_query)}"

    # Create Basic Auth header
    credentials = base64.b64encode(f"{api_key}:{secret_key}".encode()).decode()

    request = urllib.request.Request(url)
    request.add_header("Authorization", f"Basic {credentials}")

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        return {"error": f"HTTP {e.code}: {e.reason}", "details": error_body}
    except urllib.error.URLError as e:
        return {"error": f"URL Error: {e.reason}"}


# Need to import urllib.parse for quote
import urllib.parse


def main():
    parser = argparse.ArgumentParser(description="Search Amplitude users by device_id or user_id")
    parser.add_argument("user", help="Device ID or User ID to search")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    args = parser.parse_args()

    result = user_search(args.user)

    if args.json:
        print(json.dumps(result, indent=2))
        return

    if "error" in result:
        print(f"Error: {result['error']}", file=sys.stderr)
        if "details" in result:
            print(f"Details: {result['details']}", file=sys.stderr)
        sys.exit(1)

    matches = result.get("matches", [])
    match_type = result.get("type", "unknown")

    print(f"Search type: {match_type}")
    print(f"Found {len(matches)} match(es)\n")

    for i, match in enumerate(matches, 1):
        print(f"Match {i}:")
        print(f"  Amplitude ID: {match.get('amplitude_id', 'N/A')}")
        print(f"  User ID: {match.get('user_id', 'N/A')}")
        if match.get('device_ids'):
            print(f"  Device IDs: {', '.join(match['device_ids'])}")
        print()


if __name__ == "__main__":
    main()
