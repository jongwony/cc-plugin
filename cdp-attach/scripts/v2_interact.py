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

    # Zero-dimension detection → CDPError with guidance (silent failure 제거)
    if obj["width"] == 0 and obj["height"] == 0:
        raise CDPError(
            f"Element '{selector}' has zero dimensions (collapsed/hidden).\n"
            f"  Try: v2 get_bounds --selector '{selector}'\n"
            f"  Or:  v2 scan_interactive"
        )
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


# ── CDP DOM/Accessibility helpers ──────────────────────────────


def _ensure_dom(client):
    """Enable DOM domain (idempotent per connection)."""
    if not getattr(client, '_dom_enabled', False):
        client.send("DOM.enable")
        client._dom_enabled = True


def _ensure_a11y(client):
    """Enable Accessibility domain (idempotent per connection)."""
    if not getattr(client, '_a11y_enabled', False):
        client.send("Accessibility.enable")
        client._a11y_enabled = True


def _node_id_params(node_id=None, backend_node_id=None, **extra):
    """Build CDP params dict from node_id or backend_node_id."""
    params = dict(extra)
    if backend_node_id is not None:
        params["backendNodeId"] = backend_node_id
    elif node_id is not None:
        params["nodeId"] = node_id
    return params


def _quad_to_box(values):
    """Convert 8-element quad array [x1,y1,...x4,y4] to (cx, cy, w, h)."""
    xs = [values[i] for i in range(0, 8, 2)]
    ys = [values[i] for i in range(1, 8, 2)]
    x_min, y_min = min(xs), min(ys)
    width = max(xs) - x_min
    height = max(ys) - y_min
    return x_min + width / 2, y_min + height / 2, width, height


def _get_node_description(client, node_id=None, backend_node_id=None):
    """Get tag name and text content for a node via DOM.describeNode."""
    id_params = _node_id_params(node_id, backend_node_id)
    if not id_params:
        return "unknown", ""
    try:
        result = client.send("DOM.describeNode", {"depth": 0, **id_params})
        node = result.get("node", {})
        tag = node.get("localName", node.get("nodeName", "unknown")).lower()

        text = ""
        try:
            obj_result = client.send("DOM.resolveNode", id_params)
            object_id = obj_result.get("object", {}).get("objectId")
            if object_id:
                text_result = client.send("Runtime.callFunctionOn", {
                    "objectId": object_id,
                    "functionDeclaration": "function(){return(this.textContent||'').trim().slice(0,50)}",
                    "returnByValue": True,
                })
                text = text_result.get("result", {}).get("value", "")
        except CDPError:
            pass

        return tag, text
    except CDPError:
        return "unknown", ""


def _get_node_bounds(client, node_id=None, backend_node_id=None, scroll=True,
                     describe=True):
    """Resolve node to bounding box via CDP DOM domain.

    1. DOM.scrollIntoViewIfNeeded (when scroll=True)
    2. DOM.getBoxModel → content quad → center
    3. Fallback: DOM.getContentQuads

    Returns: {x, y, width, height, visible, tag, text}
    Set describe=False to skip tag/text lookup (saves 3 CDP calls per element).
    """
    _ensure_dom(client)

    params = _node_id_params(node_id, backend_node_id)
    if not params:
        raise CDPError("_get_node_bounds requires nodeId or backendNodeId")

    # Scroll into view
    if scroll:
        try:
            client.send("DOM.scrollIntoViewIfNeeded", params)
        except CDPError:
            pass  # Non-scrollable or detached; continue

    # Try DOM.getBoxModel, fallback to DOM.getContentQuads
    quad_values = None
    for method, extract in [
        ("DOM.getBoxModel", lambda r: r.get("model", {}).get("content", [])),
        ("DOM.getContentQuads", lambda r: (r.get("quads") or [[]])[0]),
    ]:
        try:
            result = client.send(method, params)
            values = extract(result)
            if len(values) >= 8:
                quad_values = values
                break
        except CDPError:
            pass

    if quad_values is None:
        raise CDPError(
            "Cannot resolve element bounds (getBoxModel + getContentQuads failed). "
            "Element may be detached or in a different frame."
        )

    cx, cy, width, height = _quad_to_box(quad_values)
    tag, text = _get_node_description(client, node_id, backend_node_id) if describe else ("", "")
    visible = width > 0 and height > 0

    info = {
        "x": cx, "y": cy,
        "width": width, "height": height,
        "visible": visible, "tag": tag, "text": text,
    }
    if not visible:
        info["warning"] = (
            f"Element <{tag or 'unknown'}> has zero dimensions ({width:.0f}x{height:.0f}). "
            "It may be collapsed, hidden, or not yet rendered."
        )
    return info


def _dom_search(client, query, include_shadow_dom=False, limit=20):
    """Perform DOM.performSearch → getSearchResults → describeNode → discard.

    Returns list of {nodeId, backendNodeId, tag} dicts.
    """
    results = []
    search_result = client.send("DOM.performSearch", {
        "query": query,
        "includeUserAgentShadowDOM": include_shadow_dom,
    })
    search_id = search_result.get("searchId")
    count = search_result.get("resultCount", 0)

    if count > 0:
        fetch_count = min(count, limit)
        fetch_result = client.send("DOM.getSearchResults", {
            "searchId": search_id,
            "fromIndex": 0,
            "toIndex": fetch_count,
        })
        for nid in fetch_result.get("nodeIds", []):
            try:
                desc = client.send("DOM.describeNode", {"nodeId": nid, "depth": 0})
                node_info = desc.get("node", {})
                results.append({
                    "nodeId": nid,
                    "backendNodeId": node_info.get("backendNodeId"),
                    "tag": node_info.get("localName", node_info.get("nodeName", "")).lower(),
                })
            except CDPError:
                pass

    try:
        client.send("DOM.discardSearchResults", {"searchId": search_id})
    except CDPError:
        pass

    return results


# ── Commands ───────────────────────────────────────────────────


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


def cmd_find_element(client, args):
    """Find element by accessible name, role, text, XPath, or CSS selector."""
    has_ax = args.name is not None or args.role is not None
    has_search = args.text is not None or args.xpath is not None
    has_selector = args.selector is not None

    if not (has_ax or has_search or has_selector):
        print("Error: Provide --name/--role, --text, --xpath, or --selector", file=sys.stderr)
        sys.exit(1)

    client.connect()
    try:
        _ensure_dom(client)
        results = []

        if has_ax:
            # Accessibility.queryAXTree → backendDOMNodeId
            _ensure_a11y(client)
            # queryAXTree requires a root node to start from
            doc = client.send("DOM.getDocument", {"depth": 0})
            root_node_id = doc["root"]["nodeId"]
            ax_params = {"nodeId": root_node_id}
            if args.name:
                ax_params["accessibleName"] = args.name
            if args.role:
                ax_params["role"] = args.role

            ax_result = client.send("Accessibility.queryAXTree", ax_params)
            for node in ax_result.get("nodes", []):
                backend_id = node.get("backendDOMNodeId")
                if backend_id:
                    results.append({
                        "backendNodeId": backend_id,
                        "role": node.get("role", {}).get("value", ""),
                        "name": node.get("name", {}).get("value", ""),
                    })

        elif has_search:
            query = args.text or args.xpath
            results = _dom_search(client, query, args.pierce)

        elif has_selector:
            if args.pierce:
                results = _dom_search(client, args.selector, True)
            else:
                # DOM.querySelector (no shadow DOM piercing)
                doc = client.send("DOM.getDocument", {"depth": 0})
                root_id = doc["root"]["nodeId"]
                result = client.send("DOM.querySelector", {
                    "nodeId": root_id,
                    "selector": args.selector,
                })
                nid = result.get("nodeId", 0)
                if nid:
                    desc = client.send("DOM.describeNode", {"nodeId": nid, "depth": 0})
                    node_info = desc.get("node", {})
                    results.append({
                        "nodeId": nid,
                        "backendNodeId": node_info.get("backendNodeId"),
                        "tag": node_info.get("localName", "").lower(),
                    })

        if not results:
            print("No elements found.")
            return

        print(f"Found {len(results)} element(s):")
        for i, r in enumerate(results):
            parts = [f"#{i}"]
            if r.get("tag"):
                parts.append(f"<{r['tag']}>")
            if r.get("role"):
                parts.append(f"role={r['role']}")
            if r.get("name"):
                parts.append(f'name="{r["name"]}"')
            if r.get("nodeId"):
                parts.append(f"nodeId={r['nodeId']}")
            if r.get("backendNodeId"):
                parts.append(f"backendNodeId={r['backendNodeId']}")
            print("  " + "  ".join(parts))
    finally:
        client.close()


def cmd_get_bounds(client, args):
    """Get element bounding box and center coordinates."""
    has_id = args.node_id is not None or args.backend_node_id is not None
    has_selector = args.selector is not None

    if not (has_id or has_selector):
        print("Error: Provide --node-id, --backend-node-id, or --selector", file=sys.stderr)
        sys.exit(1)

    client.connect()
    try:
        _ensure_dom(client)
        scroll = not args.no_scroll

        node_id = args.node_id
        backend_node_id = args.backend_node_id

        # Resolve selector to nodeId if needed
        if has_selector and not has_id:
            doc = client.send("DOM.getDocument", {"depth": 0})
            root_id = doc["root"]["nodeId"]
            result = client.send("DOM.querySelector", {
                "nodeId": root_id,
                "selector": args.selector,
            })
            node_id = result.get("nodeId", 0)
            if not node_id:
                raise CDPError(f"Element not found: {args.selector}")

        info = _get_node_bounds(
            client,
            node_id=node_id,
            backend_node_id=backend_node_id,
            scroll=scroll,
        )

        print(f"Element: <{info['tag']}> \"{info['text']}\"")
        print(f"  Center: ({info['x']:.0f}, {info['y']:.0f})")
        print(f"  Box: {info['width']:.0f}x{info['height']:.0f}")
        print(f"  Visible: {info['visible']}")
        if info.get("warning"):
            print(f"  Warning: {info['warning']}")
        print(f"\nUse: v2 click {info['x']:.0f} {info['y']:.0f}")
    finally:
        client.close()


def cmd_scan_interactive(client, args):
    """List all interactive elements with coordinates."""
    INTERACTIVE_ROLES = {
        "button", "link", "textbox", "checkbox", "radio",
        "combobox", "listbox", "menuitem", "menuitemcheckbox",
        "menuitemradio", "option", "searchbox", "slider",
        "spinbutton", "switch", "tab", "treeitem",
    }

    client.connect()
    try:
        _ensure_dom(client)
        _ensure_a11y(client)

        # Get full accessibility tree
        ax_result = client.send("Accessibility.getFullAXTree", {"depth": -1})
        nodes = ax_result.get("nodes", [])

        # Role filter
        role_filter = None
        if args.role:
            role_filter = set(r.strip() for r in args.role.split(","))

        candidates = []
        for node in nodes:
            role = node.get("role", {}).get("value", "")
            if role_filter:
                if role not in role_filter:
                    continue
            elif role not in INTERACTIVE_ROLES:
                continue

            backend_id = node.get("backendDOMNodeId")
            if not backend_id:
                continue

            name = node.get("name", {}).get("value", "")
            candidates.append({
                "backendNodeId": backend_id,
                "role": role,
                "name": name,
            })

        candidates = candidates[:args.limit]

        if not candidates:
            print("No interactive elements found.")
            return

        # Get viewport dimensions once (for --viewport filter)
        vw, vh = None, None
        if args.viewport:
            try:
                layout = client.send("Page.getLayoutMetrics")
                vp = layout.get("cssVisualViewport", {})
                vw = vp.get("clientWidth", 1920)
                vh = vp.get("clientHeight", 1080)
            except CDPError:
                pass

        # Resolve bounds for each candidate
        results = []
        for item in candidates:
            try:
                info = _get_node_bounds(
                    client,
                    backend_node_id=item["backendNodeId"],
                    scroll=False,
                    describe=False,  # Skip tag/text lookup (3 CDP calls saved per element)
                )
                if not info["visible"]:
                    continue
                if args.viewport and vw is not None:
                    if info["x"] < 0 or info["y"] < 0 or info["x"] > vw or info["y"] > vh:
                        continue

                results.append({
                    "role": item["role"],
                    "name": item["name"],
                    "x": info["x"],
                    "y": info["y"],
                })
            except CDPError:
                continue

        if not results:
            print("No visible interactive elements found.")
            return

        # Print table
        print(f"{'#':<4} {'Role':<14} {'Center':<12} Name")
        print("-" * 50)
        for i, r in enumerate(results):
            center = f"({r['x']:.0f},{r['y']:.0f})"
            name_display = f'"{r["name"]}"' if r["name"] else ""
            print(f"{i:<4} {r['role']:<14} {center:<12} {name_display}")

        print(f"\nUse: v2 click <x> <y>")
    finally:
        client.close()


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

    # find_element
    p_find = sub.add_parser("find_element", help="Find element by name/role/text/xpath/selector")
    p_find.add_argument("--name", "-n", help="Accessible name")
    p_find.add_argument("--role", "-r", help="ARIA role")
    p_find.add_argument("--text", "-t", help="Visible text content")
    p_find.add_argument("--xpath", help="XPath expression")
    p_find.add_argument("--selector", "-s", help="CSS selector")
    p_find.add_argument("--pierce", action="store_true", help="Pierce shadow DOM")

    # get_bounds
    p_bounds = sub.add_parser("get_bounds", help="Get element bounding box")
    p_bounds.add_argument("--node-id", type=int, help="DOM nodeId")
    p_bounds.add_argument("--backend-node-id", type=int, help="Backend DOM nodeId")
    p_bounds.add_argument("--selector", "-s", help="CSS selector")
    p_bounds.add_argument("--no-scroll", action="store_true", help="Skip scroll-into-view")

    # scan_interactive
    p_scan = sub.add_parser("scan_interactive", help="List interactive elements")
    p_scan.add_argument("--viewport", action="store_true", help="Only viewport-visible elements")
    p_scan.add_argument("--role", help="Comma-separated role filter")
    p_scan.add_argument("--limit", type=int, default=50, help="Max elements (default: 50)")

    args = parser.parse_args()
    client = CDPClient(host=args.host, port=args.port)

    commands = {
        "click": cmd_click,
        "fill": cmd_fill,
        "press_key": cmd_press_key,
        "hover": cmd_hover,
        "new_page": cmd_new_page,
        "close_page": cmd_close_page,
        "find_element": cmd_find_element,
        "get_bounds": cmd_get_bounds,
        "scan_interactive": cmd_scan_interactive,
    }

    try:
        client.require_headed()  # Block headless browsers
        commands[args.command](client, args)
    except CDPError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
