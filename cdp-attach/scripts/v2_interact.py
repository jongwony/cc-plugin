#!/usr/bin/env uv run --quiet --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "websocket-client>=1.6.0",
# ]
# ///
"""
v2_interact — Browser interaction: click, fill, press_key, hover, new_page, close_page.
"""

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cdp_client import CDPClient, CDPError


def _resolve_selector(client, selector):
    """Resolve CSS selector to element center coordinates via Runtime.evaluate."""
    js = f"""
    (() => {{
        const el = document.querySelector({json.dumps(selector)});
        if (!el) return {{error: 'Element not found: {selector}'}};
        const rect = el.getBoundingClientRect();
        return {{
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            width: rect.width,
            height: rect.height,
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').slice(0, 50)
        }};
    }})()
    """
    result = client.send("Runtime.evaluate", {
        "expression": js,
        "returnByValue": True,
    })
    obj = result.get("result", {}).get("value", {})
    if not obj or "error" in obj:
        raise CDPError(obj.get("error", f"Cannot resolve selector: {selector}"))
    return obj


def _dispatch_mouse(client, x, y, event_type, button="left", click_count=1):
    """Send mouse event at coordinates."""
    client.send("Input.dispatchMouseEvent", {
        "type": event_type,
        "x": x,
        "y": y,
        "button": button,
        "clickCount": click_count,
    })


def cmd_click(client, args):
    """Click at coordinates or CSS selector."""
    if not args.selector and (args.x is None or args.y is None):
        print("Error: Provide --selector or both x y coordinates", file=sys.stderr)
        sys.exit(1)
    client.connect()
    try:
        if args.selector:
            info = _resolve_selector(client, args.selector)
            x, y = info["x"], info["y"]
            print(f"Resolved: <{info['tag']}> \"{info['text']}\" at ({x:.0f}, {y:.0f})")
        else:
            x, y = args.x, args.y

        _dispatch_mouse(client, x, y, "mousePressed")
        _dispatch_mouse(client, x, y, "mouseReleased")
        print(f"Clicked at ({x:.0f}, {y:.0f})")
    finally:
        client.close()


def cmd_fill(client, args):
    """Fill text into an element."""
    client.connect()
    try:
        info = _resolve_selector(client, args.selector)
        x, y = info["x"], info["y"]

        # Click to focus
        _dispatch_mouse(client, x, y, "mousePressed")
        _dispatch_mouse(client, x, y, "mouseReleased")
        time.sleep(0.05)

        # Select all existing text (Ctrl+A / Cmd+A)
        client.send("Input.dispatchKeyEvent", {
            "type": "keyDown",
            "key": "a",
            "code": "KeyA",
            "modifiers": 8 if sys.platform == "darwin" else 2,  # meta or ctrl
        })
        client.send("Input.dispatchKeyEvent", {
            "type": "keyUp",
            "key": "a",
            "code": "KeyA",
        })

        # Type characters via insertText
        client.send("Input.insertText", {"text": args.text})
        print(f"Filled <{info['tag']}> with: {args.text[:50]}")
    finally:
        client.close()


def cmd_press_key(client, args):
    """Press a keyboard key."""
    client.connect()
    try:
        # Build modifiers bitmask: 1=Alt, 2=Ctrl, 4=Shift, 8=Meta
        modifiers = 0
        if args.modifiers:
            mod_parts = [m.strip().lower() for m in args.modifiers.split(",")]
            for m in mod_parts:
                if m == "alt":
                    modifiers |= 1
                elif m == "ctrl":
                    modifiers |= 2
                elif m == "shift":
                    modifiers |= 4
                elif m in ("meta", "cmd"):
                    modifiers |= 8

        key = args.key
        # Map common key names
        key_map = {
            "enter": ("Enter", "Enter", 13),
            "tab": ("Tab", "Tab", 9),
            "escape": ("Escape", "Escape", 27),
            "esc": ("Escape", "Escape", 27),
            "backspace": ("Backspace", "Backspace", 8),
            "delete": ("Delete", "Delete", 46),
            "space": (" ", "Space", 32),
            "arrowup": ("ArrowUp", "ArrowUp", 38),
            "arrowdown": ("ArrowDown", "ArrowDown", 40),
            "arrowleft": ("ArrowLeft", "ArrowLeft", 37),
            "arrowright": ("ArrowRight", "ArrowRight", 39),
        }

        if key.lower() in key_map:
            key_val, code, keycode = key_map[key.lower()]
        else:
            key_val = key
            code = f"Key{key.upper()}" if len(key) == 1 else key
            keycode = ord(key.upper()) if len(key) == 1 else 0

        params = {
            "type": "keyDown",
            "key": key_val,
            "code": code,
            "modifiers": modifiers,
            "windowsVirtualKeyCode": keycode,
        }
        client.send("Input.dispatchKeyEvent", params)

        params["type"] = "keyUp"
        client.send("Input.dispatchKeyEvent", params)
        print(f"Pressed: {key}" + (f" (modifiers: {args.modifiers})" if args.modifiers else ""))
    finally:
        client.close()


def cmd_hover(client, args):
    """Hover over coordinates or CSS selector."""
    if not args.selector and (args.x is None or args.y is None):
        print("Error: Provide --selector or both x y coordinates", file=sys.stderr)
        sys.exit(1)
    client.connect()
    try:
        if args.selector:
            info = _resolve_selector(client, args.selector)
            x, y = info["x"], info["y"]
            print(f"Resolved: <{info['tag']}> \"{info['text']}\" at ({x:.0f}, {y:.0f})")
        else:
            x, y = args.x, args.y

        _dispatch_mouse(client, x, y, "mouseMoved")
        print(f"Hovered at ({x:.0f}, {y:.0f})")
    finally:
        client.close()


def cmd_new_page(client, args):
    """Open a new tab."""
    tab = client.new_tab(args.url or "")
    target_id = tab.get("id", "?")
    title = tab.get("title", "New Tab")
    print(f"New tab: {title}")
    print(f"  ID: {target_id}")
    # Auto-select the new tab
    client.save_state(target_id)
    print(f"  (auto-selected)")


def cmd_close_page(client, args):
    """Close a tab."""
    target_id = args.target_id or client.get_selected_target()
    if not target_id:
        print("Error: No tab specified or selected", file=sys.stderr)
        sys.exit(1)

    if client.close_tab(target_id):
        print(f"Closed tab: {target_id}")
        # Clear selection if we closed the selected tab
        if client.get_selected_target() == target_id:
            client.save_state("")
    else:
        print(f"Error: Failed to close tab {target_id}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        prog="cdp-v2",
        description="CDP browser interaction",
    )
    parser.add_argument("--host", help="CDP host")
    parser.add_argument("--port", type=int, help="CDP port")
    sub = parser.add_subparsers(dest="command", required=True)

    # click
    p_click = sub.add_parser("click", help="Click element")
    p_click.add_argument("x", nargs="?", type=float, help="X coordinate")
    p_click.add_argument("y", nargs="?", type=float, help="Y coordinate")
    p_click.add_argument("--selector", "-s", help="CSS selector (alternative to x,y)")

    # fill
    p_fill = sub.add_parser("fill", help="Fill text into element")
    p_fill.add_argument("--selector", "-s", required=True, help="CSS selector")
    p_fill.add_argument("text", help="Text to fill")

    # press_key
    p_key = sub.add_parser("press_key", help="Press keyboard key")
    p_key.add_argument("key", help="Key name (e.g., Enter, Tab, a)")
    p_key.add_argument("--modifiers", "-m", help="Comma-separated: ctrl,shift,alt,meta")

    # hover
    p_hover = sub.add_parser("hover", help="Hover over element")
    p_hover.add_argument("x", nargs="?", type=float, help="X coordinate")
    p_hover.add_argument("y", nargs="?", type=float, help="Y coordinate")
    p_hover.add_argument("--selector", "-s", help="CSS selector")

    # new_page
    p_new = sub.add_parser("new_page", help="Open new tab")
    p_new.add_argument("url", nargs="?", default="", help="URL to open")

    # close_page
    p_close = sub.add_parser("close_page", help="Close a tab")
    p_close.add_argument("target_id", nargs="?", help="Target ID (default: selected)")

    args = parser.parse_args()
    client = CDPClient(host=args.host, port=args.port)
    client.require_headed()

    commands = {
        "click": cmd_click,
        "fill": cmd_fill,
        "press_key": cmd_press_key,
        "hover": cmd_hover,
        "new_page": cmd_new_page,
        "close_page": cmd_close_page,
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
