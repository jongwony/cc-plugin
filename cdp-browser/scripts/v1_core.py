#!/usr/bin/env uv run --quiet --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "websocket-client>=1.6.0",
# ]
# ///
"""
v1_core — Core CDP operations: list, select, screenshot, snapshot, evaluate, navigate, version.
"""

import argparse
import base64
import json
import sys
import time
from pathlib import Path

# Import shared client from same directory
sys.path.insert(0, str(Path(__file__).resolve().parent))
from cdp_client import CDPClient, CDPError


def cmd_version(client, args):
    """Show browser version info."""
    info = client.get_version()
    print(f"Browser: {info.get('Browser', 'Unknown')}")
    print(f"Protocol: {info.get('Protocol-Version', 'Unknown')}")
    print(f"V8: {info.get('V8-Version', 'Unknown')}")
    print(f"User-Agent: {info.get('User-Agent', 'Unknown')}")


def cmd_list(client, args):
    """List browser tabs."""
    type_filter = args.type if args.type != "all" else "all"
    tabs = client.list_tabs(type_filter=type_filter if type_filter != "all" else None)

    # Apply search filter
    if args.search:
        query = args.search.lower()
        tabs = [
            t for t in tabs
            if query in t.get("title", "").lower() or query in t.get("url", "").lower()
        ]

    # Apply limit
    total = len(tabs)
    tabs = tabs[:args.limit]

    selected = client.get_selected_target()

    for i, tab in enumerate(tabs):
        tid = tab.get("id", "?")
        title = tab.get("title", "Untitled")[:70]
        url = tab.get("url", "")[:80]
        tab_type = tab.get("type", "?")
        marker = " *" if tid == selected else ""
        print(f"  [{i}]{marker} ({tab_type}) {title}")
        print(f"       {url}")
        print(f"       id: {tid}")

    if total > args.limit:
        print(f"\n  ... and {total - args.limit} more (use --limit or --search to filter)")
    print(f"\nTotal: {total} tabs (showing {min(len(tabs), args.limit)})")


def cmd_select(client, args):
    """Select a tab by index or target ID."""
    selector = args.target

    # Try as integer index first
    try:
        idx = int(selector)
        tabs = client.list_tabs(type_filter="page")
        if 0 <= idx < len(tabs):
            tab = tabs[idx]
            target_id = tab["id"]
            client.activate_tab(target_id)
            client.save_state(target_id)
            print(f"Selected tab [{idx}]: {tab.get('title', 'Untitled')[:60]}")
            print(f"  ID: {target_id}")
            return
        else:
            print(f"Error: Index {idx} out of range (0-{len(tabs)-1})", file=sys.stderr)
            sys.exit(1)
    except ValueError:
        pass

    # Try as target ID
    tabs = client.list_tabs(type_filter=None)
    for tab in tabs:
        if tab.get("id") == selector:
            client.activate_tab(selector)
            client.save_state(selector)
            print(f"Selected tab: {tab.get('title', 'Untitled')[:60]}")
            print(f"  ID: {selector}")
            return

    print(f"Error: No tab found with index or ID: {selector}", file=sys.stderr)
    sys.exit(1)


def cmd_screenshot(client, args):
    """Take a screenshot of the selected tab."""
    client.connect()
    try:
        params = {"format": args.format}
        if args.format == "jpeg":
            params["quality"] = 80

        if args.full_page:
            # Get full page dimensions
            metrics = client.send("Page.getLayoutMetrics")
            content = metrics.get("contentSize", {})
            width = content.get("width", 1280)
            height = content.get("height", 800)

            # Override device metrics for full page
            client.send("Emulation.setDeviceMetricsOverride", {
                "width": int(width),
                "height": int(height),
                "deviceScaleFactor": 1,
                "mobile": False,
            })
            params["captureBeyondViewport"] = True

        result = client.send("Page.captureScreenshot", params)

        if args.full_page:
            client.send("Emulation.clearDeviceMetricsOverride")

        # Decode and save
        data = base64.b64decode(result["data"])
        ext = "jpg" if args.format == "jpeg" else args.format
        output = args.output or f"/tmp/cdp-screenshot-{int(time.time())}.{ext}"
        Path(output).write_bytes(data)
        print(f"Screenshot saved: {output} ({len(data)} bytes)")
    finally:
        client.close()


def cmd_snapshot(client, args):
    """Get accessibility tree snapshot."""
    client.connect()
    try:
        client.send("Accessibility.enable")
        result = client.send("Accessibility.getFullAXTree", {"depth": args.depth})
        nodes = result.get("nodes", [])

        # Build parent-child map
        node_map = {}
        for n in nodes:
            node_map[n["nodeId"]] = n

        # Print tree (limited depth already handled by CDP)
        for node in nodes:
            # Calculate depth from backend
            depth = 0
            parent_id = node.get("parentId")
            visited = set()
            while parent_id and parent_id not in visited:
                visited.add(parent_id)
                depth += 1
                parent_node = node_map.get(parent_id)
                if parent_node:
                    parent_id = parent_node.get("parentId")
                else:
                    break

            role = node.get("role", {}).get("value", "")
            name = node.get("name", {}).get("value", "")
            if role in ("none", "generic") and not name:
                continue

            prefix = "  " * min(depth, 10)
            line = f"{prefix}[{role}]"
            if name:
                line += f" {name[:80]}"
            print(line)

    finally:
        client.close()


def cmd_evaluate(client, args):
    """Evaluate JavaScript expression."""
    client.connect()
    try:
        params = {
            "expression": args.expression,
            "returnByValue": True,
        }
        if args.await_promise:
            params["awaitPromise"] = True

        result = client.send("Runtime.evaluate", params)
        obj = result.get("result", {})

        if obj.get("type") == "undefined":
            print("undefined")
        elif "value" in obj:
            val = obj["value"]
            if isinstance(val, (dict, list)):
                print(json.dumps(val, indent=2, ensure_ascii=False))
            else:
                print(val)
        elif obj.get("description"):
            print(obj["description"])
        else:
            print(json.dumps(obj, indent=2, ensure_ascii=False))

        # Print exception if any
        exc = result.get("exceptionDetails")
        if exc:
            text = exc.get("text", "")
            exception = exc.get("exception", {})
            desc = exception.get("description", "")
            print(f"Exception: {text} {desc}", file=sys.stderr)
            sys.exit(1)

    finally:
        client.close()


def cmd_navigate(client, args):
    """Navigate to a URL."""
    client.connect()
    try:
        result = client.send("Page.navigate", {"url": args.url})

        if args.wait_for == "load":
            # Wait for Page.loadEventFired
            deadline = time.time() + 30
            while time.time() < deadline:
                try:
                    client._ws.settimeout(1.0)
                    raw = client._ws.recv()
                    resp = json.loads(raw)
                    if resp.get("method") == "Page.loadEventFired":
                        break
                except Exception:
                    continue

        error = result.get("errorText")
        if error:
            print(f"Navigation error: {error}", file=sys.stderr)
            sys.exit(1)

        frame_id = result.get("frameId", "")
        print(f"Navigated to: {args.url}")
        print(f"  Frame: {frame_id}")
    finally:
        client.close()


def main():
    parser = argparse.ArgumentParser(
        prog="cdp-v1",
        description="Core CDP browser operations",
    )
    parser.add_argument("--host", help="CDP host (default: $CDP_HOST or 127.0.0.1)")
    parser.add_argument("--port", type=int, help="CDP port (default: $CDP_PORT or 9222)")
    sub = parser.add_subparsers(dest="command", required=True)

    # version
    sub.add_parser("version", help="Show browser version")

    # list
    p_list = sub.add_parser("list", help="List browser tabs")
    p_list.add_argument("--type", default="page", help="Tab type filter: page, all (default: page)")
    p_list.add_argument("--limit", type=int, default=50, help="Max tabs to show (default: 50)")
    p_list.add_argument("--search", help="Filter by title/URL substring")

    # select
    p_sel = sub.add_parser("select", help="Select a tab by index or ID")
    p_sel.add_argument("target", help="Tab index (integer) or target ID")

    # screenshot
    p_ss = sub.add_parser("screenshot", help="Capture screenshot")
    p_ss.add_argument("--output", "-o", help="Output file path")
    p_ss.add_argument("--format", choices=["png", "jpeg"], default="png")
    p_ss.add_argument("--full-page", action="store_true", help="Capture full page")

    # snapshot
    p_snap = sub.add_parser("snapshot", help="Accessibility tree snapshot")
    p_snap.add_argument("--depth", type=int, default=5, help="Tree depth (default: 5)")

    # evaluate
    p_eval = sub.add_parser("evaluate", help="Evaluate JavaScript")
    p_eval.add_argument("expression", help="JavaScript expression")
    p_eval.add_argument("--await", dest="await_promise", action="store_true",
                        help="Await promise result")

    # navigate
    p_nav = sub.add_parser("navigate", help="Navigate to URL")
    p_nav.add_argument("url", help="Target URL")
    p_nav.add_argument("--wait-for", choices=["load", "none"], default="load",
                       help="Wait condition (default: load)")

    args = parser.parse_args()
    client = CDPClient(host=args.host, port=args.port)

    commands = {
        "version": cmd_version,
        "list": cmd_list,
        "select": cmd_select,
        "screenshot": cmd_screenshot,
        "snapshot": cmd_snapshot,
        "evaluate": cmd_evaluate,
        "navigate": cmd_navigate,
    }

    try:
        commands[args.command](client, args)
    except CDPError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
