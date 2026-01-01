#!/usr/bin/env python3
"""
Amplitude User Activity API
Get event stream for a user by their Amplitude ID.

Usage:
    python user_activity.py <amplitude_id>
    python user_activity.py <amplitude_id> --limit 50
    python user_activity.py <amplitude_id> --direction earliest
    python user_activity.py <amplitude_id> --json

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
import urllib.parse
import base64
from datetime import datetime


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


def user_activity(amplitude_id: str, limit: int = 1000, offset: int = 0, direction: str = "latest") -> dict:
    """Get user activity events by Amplitude ID."""
    api_key, secret_key = get_credentials()
    base_url = get_base_url()

    params = {
        "user": amplitude_id,
        "limit": str(limit),
        "offset": str(offset),
    }
    if direction:
        params["direction"] = direction

    query_string = urllib.parse.urlencode(params)
    url = f"{base_url}/api/2/useractivity?{query_string}"

    credentials = base64.b64encode(f"{api_key}:{secret_key}".encode()).decode()

    request = urllib.request.Request(url)
    request.add_header("Authorization", f"Basic {credentials}")

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        return {"error": f"HTTP {e.code}: {e.reason}", "details": error_body}
    except urllib.error.URLError as e:
        return {"error": f"URL Error: {e.reason}"}


def format_timestamp(ts):
    """Format timestamp to readable format."""
    if not ts:
        return "N/A"
    try:
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M:%S")
        return ts
    except (ValueError, TypeError, OSError):
        return str(ts)


def main():
    parser = argparse.ArgumentParser(description="Get Amplitude user activity by Amplitude ID")
    parser.add_argument("amplitude_id", help="Amplitude ID (get from user_search.py)")
    parser.add_argument("--limit", type=int, default=100, help="Number of events (max 1000, default 100)")
    parser.add_argument("--offset", type=int, default=0, help="Offset for pagination")
    parser.add_argument("--direction", choices=["latest", "earliest"], default="latest",
                        help="Event order: 'latest' (default) or 'earliest'")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    args = parser.parse_args()

    result = user_activity(args.amplitude_id, args.limit, args.offset, args.direction)

    if args.json:
        print(json.dumps(result, indent=2))
        return

    if "error" in result:
        print(f"Error: {result['error']}", file=sys.stderr)
        if "details" in result:
            print(f"Details: {result['details']}", file=sys.stderr)
        sys.exit(1)

    # Print user summary
    user_data = result.get("userData", {})
    print("=" * 60)
    print("USER SUMMARY")
    print("=" * 60)
    print(f"User ID: {user_data.get('user_id', 'N/A')}")
    print(f"Amplitude ID: {user_data.get('canonical_amplitude_id', 'N/A')}")
    print(f"Platform: {user_data.get('platform', 'N/A')}")
    print(f"Country: {user_data.get('country', 'N/A')}")
    print(f"Total Events: {user_data.get('num_events', 'N/A')}")
    print(f"Total Sessions: {user_data.get('num_sessions', 'N/A')}")
    print(f"First Used: {user_data.get('first_used', 'N/A')}")
    print(f"Last Used: {user_data.get('last_used', 'N/A')}")

    if user_data.get('device_ids'):
        print(f"Device IDs: {', '.join(user_data['device_ids'][:5])}")
        if len(user_data['device_ids']) > 5:
            print(f"  ... and {len(user_data['device_ids']) - 5} more")

    if user_data.get('properties'):
        print(f"Properties: {json.dumps(user_data['properties'], indent=2)}")

    # Print events
    events = result.get("events", [])
    print(f"\n{'=' * 60}")
    print(f"EVENTS ({len(events)} shown)")
    print("=" * 60)

    for i, event in enumerate(events, 1):
        event_type = event.get("event_type", "Unknown")
        event_time = format_timestamp(event.get("event_time") or event.get("client_event_time"))
        device_id = event.get("device_id", "N/A")

        print(f"\n[{i}] {event_type}")
        print(f"    Time: {event_time}")
        print(f"    Device: {device_id}")

        # Show event properties if present
        event_props = event.get("event_properties", {})
        if event_props:
            props_str = json.dumps(event_props, ensure_ascii=False)
            if len(props_str) > 100:
                props_str = props_str[:100] + "..."
            print(f"    Props: {props_str}")


if __name__ == "__main__":
    main()
