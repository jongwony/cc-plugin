#!/usr/bin/env -S uv run --quiet --script
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
import os
import re
import sys
import time
from pathlib import Path

# Import shared client from same directory
sys.path.insert(0, str(Path(__file__).resolve().parent))
from cdp_client import CDPClient, CDPError, ERRORS_FILE, STATE_DIR, atomic_write_json, cdp_lock

SNAPSHOT_CACHE_DIR = os.path.join(STATE_DIR, "snapshots")
SNAPSHOT_DIFF_MAX_LINES = 200


_TOP_LEVEL_CONST_LET_RE = re.compile(r'(?m)^(\s*)(const|let)\b')


def _redeclare_safe(expression):
    """Replace top-level const/let with var to prevent re-declaration errors."""
    new_expr = _TOP_LEVEL_CONST_LET_RE.sub(r'\1var', expression)
    if new_expr != expression:
        print("[cdp-attach] const/let rewritten to var (scope-safe mode)", file=sys.stderr)
    return new_expr


def cmd_version(client, args):
    """Show browser version info."""
    info = client.get_version()
    print(f"Browser: {info.get('Browser', 'Unknown')}")
    print(f"Protocol: {info.get('Protocol-Version', 'Unknown')}")
    print(f"V8: {info.get('V8-Version', 'Unknown')}")
    print(f"User-Agent: {info.get('User-Agent', 'Unknown')}")


def _get_browser_targets(client):
    """Fetch raw Target.getTargets() targetInfos via the browser-level
    WebSocket endpoint.

    browserContextId (Chromium profile boundary) is a stable, non-
    experimental TargetInfo field, but the HTTP /json/list endpoint does
    not expose it — only Target.getTargets over /devtools/browser/... does.
    Opens a short-lived browser-level connection and closes it before
    returning, matching the plugin's per-command connect/close discipline.
    """
    client.connect_browser()
    try:
        result = client.send("Target.getTargets")
        return result.get("targetInfos", [])
    finally:
        client.close()


def _resolve_context_filter(client, prefix):
    """Resolve a browserContextId (or short prefix) to the set of target
    ids belonging to that context.

    Raises CDPError when the prefix is empty/whitespace (would match every
    context, including targets with no browserContextId at all — not a
    meaningful filter), when it matches no context, or when it matches
    more than one distinct context (ambiguous).
    """
    if not prefix or not prefix.strip():
        raise CDPError("--context requires a non-empty id prefix")

    targets = _get_browser_targets(client)
    matched_contexts = sorted({
        t.get("browserContextId") for t in targets
        if t.get("browserContextId") and t.get("browserContextId").startswith(prefix)
    })
    if not matched_contexts:
        raise CDPError(f"No browser context matches prefix {prefix!r}")
    if len(matched_contexts) > 1:
        shown = ", ".join(c[:8] + "..." for c in matched_contexts)
        raise CDPError(
            f"Ambiguous context prefix {prefix!r} matches {len(matched_contexts)} "
            f"contexts: {shown}"
        )
    ctx_id = matched_contexts[0]
    target_ids = {
        t.get("targetId") for t in targets if t.get("browserContextId") == ctx_id
    }
    return target_ids, ctx_id


def _cmd_list_contexts(client, args):
    """`list --contexts`: group page targets by browserContextId (profile).

    Display + filter only — no enforcement/locking (that is separate future
    work). `--context` narrows the grouping to one context; `--search`
    filters titles/URLs within it, same semantics as the flat listing.
    """
    targets = _get_browser_targets(client)
    pages = [t for t in targets if t.get("type") == "page"]

    if args.context:
        pages = [
            t for t in pages
            if (t.get("browserContextId") or "").startswith(args.context)
        ]
        if not pages:
            print(f"No page targets in a context matching prefix {args.context!r}")
            return

    if args.search:
        query = args.search.lower()
        pages = [
            t for t in pages
            if query in t.get("title", "").lower() or query in t.get("url", "").lower()
        ]

    groups = {}
    for t in pages:
        ctx = t.get("browserContextId") or "(default)"
        groups.setdefault(ctx, []).append(t)

    if not groups:
        print("No page targets found.")
        return

    print(f"{len(groups)} browser context(s):\n")
    for ctx, tabs in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        short = ctx[:8] + "..." if ctx != "(default)" else ctx
        print(f"Context {short} ({len(tabs)} page(s)):")
        for t in tabs:
            title = (t.get("title") or "Untitled")[:70]
            print(f"    {title}")
            print(f"      id: {t.get('targetId', '?')}")
        print()


def cmd_list(client, args):
    """List browser tabs."""
    if args.contexts:
        _cmd_list_contexts(client, args)
        return

    type_filter = args.type if args.type != "all" else "all"
    all_tabs = client.list_tabs(type_filter=type_filter if type_filter != "all" else None)

    # Preserve original indexes so `select <index>` stays consistent
    indexed_tabs = list(enumerate(all_tabs))

    if args.context:
        target_ids, ctx_id = _resolve_context_filter(client, args.context)
        indexed_tabs = [(i, t) for i, t in indexed_tabs if t.get("id") in target_ids]
        print(f"Filtered to context {ctx_id[:8]}...\n")

    # Apply search filter (keeping original index)
    if args.search:
        query = args.search.lower()
        indexed_tabs = [
            (i, t) for i, t in indexed_tabs
            if query in t.get("title", "").lower() or query in t.get("url", "").lower()
        ]

    # Apply limit
    total = len(indexed_tabs)
    indexed_tabs = indexed_tabs[:args.limit]

    selected = client.get_selected_target()

    for i, tab in indexed_tabs:
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
    print(f"\nTotal: {total} tabs (showing {min(len(indexed_tabs), args.limit)})")


def cmd_select(client, args):
    """Select a tab by index or target ID."""
    selector = args.target

    context_target_ids = None
    ctx_id = None
    if args.context:
        context_target_ids, ctx_id = _resolve_context_filter(client, args.context)

    def _guard_context(target_id):
        """Refuse to select a target outside the --context guard, if set."""
        if context_target_ids is not None and target_id not in context_target_ids:
            print(
                f"Error: tab {target_id[:8]}... is outside context {ctx_id[:8]}... "
                "— refusing to select across the profile boundary.",
                file=sys.stderr,
            )
            sys.exit(1)

    # Try as integer index first
    try:
        idx = int(selector)
        tabs = client.list_tabs(type_filter="page")
        if 0 <= idx < len(tabs):
            tab = tabs[idx]
            target_id = tab["id"]
            _guard_context(target_id)
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
            _guard_context(selector)
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
    full_page_active = False
    try:
        params = {"format": args.format}
        if args.format == "jpeg":
            params["quality"] = 80

        if args.full_page:
            # Get full page dimensions
            metrics = client.send("Page.getLayoutMetrics")
            content = metrics.get("contentSize", {})
            width = max(content.get("width", 1280), 1)
            height = max(content.get("height", 800), 1)

            # Override device metrics for full page
            client.send("Emulation.setDeviceMetricsOverride", {
                "width": int(width),
                "height": int(height),
                "deviceScaleFactor": 1,
                "mobile": False,
            })
            full_page_active = True
            params["captureBeyondViewport"] = True

        result = client.send("Page.captureScreenshot", params)

        # Decode and save
        data = base64.b64decode(result["data"])
        ext = "jpg" if args.format == "jpeg" else args.format
        output = args.output or f"/tmp/cdp-screenshot-{int(time.time())}.{ext}"
        Path(output).write_bytes(data)
        print(f"Screenshot saved: {output} ({len(data)} bytes)")
    finally:
        if full_page_active:
            try:
                client.send("Emulation.clearDeviceMetricsOverride")
            except Exception:
                pass
        client.close()


def _ax_node_key(node):
    """Stable identity key for an AX node across separate snapshot calls.

    backendDOMNodeId survives DOM position/order changes; CDP's own nodeId
    is invalidated on DOM mutation (see SKILL.md 'Known Limitations'), so
    it is unsuitable as a diff identity. Falls back to a nodeId-prefixed
    key for the rare AX node with no backing DOM node.
    """
    backend_id = node.get("backendDOMNodeId")
    if backend_id is not None:
        return f"b{backend_id}"
    return f"n{node.get('nodeId')}"


def _build_ax_entries(nodes):
    """Reduce raw AX nodes to {key: {role, name, depth}}, in encounter order.

    Applies the same visibility filter the (pre-existing) full-tree print
    used: skip role in (none, generic) with no accessible name. Returns
    (entries dict, ordered key list) — order is needed for diff output.
    """
    node_map = {n["nodeId"]: n for n in nodes}
    entries = {}
    order = []
    for node in nodes:
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

        key = _ax_node_key(node)
        entries[key] = {"role": role, "name": name[:80], "depth": min(depth, 10)}
        order.append(key)
    return entries, order


def _print_snapshot_full(entries, order):
    """Print the full accessibility tree (original snapshot behavior)."""
    for key in order:
        e = entries[key]
        prefix = "  " * e["depth"]
        line = f"{prefix}[{e['role']}]"
        if e["name"]:
            line += f" {e['name']}"
        print(line)


def _snapshot_cache_path(target_id):
    return os.path.join(SNAPSHOT_CACHE_DIR, f"{target_id}.json")


def _load_snapshot_cache(target_id):
    """Returns cached {key: {role, name, depth}}, or None if no baseline."""
    try:
        with open(_snapshot_cache_path(target_id)) as f:
            return json.load(f).get("entries")
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _save_snapshot_cache(target_id, entries):
    """Best-effort cache write for the next --diff call.

    Uses cdp_client's atomic-write helper (crash-safe rename) — the same
    care state.json gets. Concurrency is already handled by the global
    cdp_lock (one cdp-attach command runs at a time per host:port), so no
    separate flock is needed here. A write failure must not affect the
    (already-printed) snapshot output.
    """
    try:
        atomic_write_json(_snapshot_cache_path(target_id), {
            "target_id": target_id,
            "timestamp": time.time(),
            "entries": entries,
        })
    except OSError as e:
        print(f"Warning: failed to update snapshot cache: {e}", file=sys.stderr)


def _print_snapshot_diff(target_id, entries, order):
    """Print only the delta vs the cached snapshot for this target.

    Falls back to the full tree (with a note) when there is no cached
    baseline yet — the cache is always written by the caller regardless,
    so the next --diff call has one.
    """
    cached = _load_snapshot_cache(target_id)
    if cached is None:
        print(
            f"No cached baseline for target {target_id[:8]}... — showing full "
            "tree (cache now primed for future --diff calls)"
        )
        _print_snapshot_full(entries, order)
        return

    added = [k for k in order if k not in cached]
    removed = [k for k in cached if k not in entries]
    changed = [
        k for k in order
        if k in cached and (
            cached[k].get("role") != entries[k]["role"]
            or cached[k].get("name") != entries[k]["name"]
        )
    ]

    if not added and not removed and not changed:
        print(f"Snapshot diff vs cached (target {target_id[:8]}...): no changes")
        return

    print(
        f"Snapshot diff vs cached (target {target_id[:8]}...): "
        f"{len(added)} added, {len(removed)} removed, {len(changed)} changed"
    )

    lines = []
    for k in added:
        e = entries[k]
        indent = "  " * e["depth"]
        lines.append(f"+ {indent}[{e['role']}] {e['name']}".rstrip())
    for k in removed:
        e = cached[k]
        indent = "  " * min(e.get("depth", 0), 10)
        lines.append(f"- {indent}[{e.get('role', '')}] {e.get('name', '')}".rstrip())
    for k in changed:
        old, new = cached[k], entries[k]
        lines.append(
            f"~ [{old.get('role', '')}] {old.get('name', '')} -> "
            f"[{new['role']}] {new['name']}".rstrip()
        )

    for line in lines[:SNAPSHOT_DIFF_MAX_LINES]:
        print(line)
    if len(lines) > SNAPSHOT_DIFF_MAX_LINES:
        remaining = len(lines) - SNAPSHOT_DIFF_MAX_LINES
        print(f"... and {remaining} more changes (use without --diff for full tree)")


def cmd_snapshot(client, args):
    """Get accessibility tree snapshot.

    --diff prints only the delta vs the last cached snapshot for the
    selected target (token-economy for repeated post-action reads) instead
    of the full tree. The cache is always refreshed — with or without
    --diff — so a later --diff call has a baseline.
    """
    target_id = client.get_selected_target()
    client.connect()
    try:
        client.send("Accessibility.enable")
        result = client.send("Accessibility.getFullAXTree", {"depth": args.depth})
        nodes = result.get("nodes", [])
        entries, order = _build_ax_entries(nodes)

        if args.diff:
            if target_id:
                _print_snapshot_diff(target_id, entries, order)
            else:
                print(
                    "Warning: no tab selected — cannot key the snapshot cache; "
                    "showing full tree",
                    file=sys.stderr,
                )
                _print_snapshot_full(entries, order)
        else:
            _print_snapshot_full(entries, order)

        if target_id:
            _save_snapshot_cache(target_id, entries)
    finally:
        client.close()


def cmd_evaluate(client, args):
    """Evaluate JavaScript expression."""
    if args.stdin:
        expression = sys.stdin.read().strip()
    elif args.expression:
        expression = args.expression
    else:
        print("Error: Provide expression argument or use --stdin", file=sys.stderr)
        sys.exit(1)

    if not args.no_rewrite:
        expression = _redeclare_safe(expression)

    # Auto-wrap await expressions in async IIFE
    if args.await_promise and 'await ' in expression and not expression.strip().startswith('(async'):
        stripped = expression.rstrip().rstrip(';')
        if ';' not in stripped and '\n' not in stripped:
            expression = f"(async () => {{ return {stripped}; }})()"
        else:
            expression = f"(async () => {{ {expression} }})()"

    if args.frame and args.frame_url:
        print("Error: --frame and --frame-url are mutually exclusive", file=sys.stderr)
        sys.exit(1)

    client.connect()
    try:
        if args.frame_url:
            context_id = client.resolve_frame_context_id_by_url(args.frame_url)
        else:
            context_id = client.resolve_frame_context_id(args.frame)

        params = {
            "expression": expression,
            "returnByValue": True,
        }
        if args.await_promise:
            params["awaitPromise"] = True
        if context_id is not None:
            params["contextId"] = context_id

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


def _post_nav_probe(client, timeouts=(5, 10)):
    """Bounded renderer-liveness probe after navigate/reload.

    A reload issued while the renderer had pending/blocked cross-origin
    fetches can leave the tab permanently unresponsive — every later CDP
    call then burns its full 30s timeout (#47). Probing right after the
    navigation surfaces the wedge immediately and points at recovery.

    A busy renderer is not a wedged one: Runtime.evaluate queues behind
    long main-thread tasks (heavy hydration, analytics), so the probe
    retries with a longer timeout before declaring the tab unresponsive.

    Returns True when the renderer answered.
    """
    reason = "no response"
    for timeout in timeouts:
        try:
            result = client.send(
                "Runtime.evaluate",
                {"expression": "1", "returnByValue": True},
                timeout=timeout,
            )
            value = result.get("result", {}).get("value")
            if value == 1:
                return True
            reason = f"unexpected probe result: {value!r}"
        except CDPError as e:
            reason = str(e).splitlines()[0]
    print(
        f"Error: tab unresponsive after navigation ({reason}; "
        f"{len(timeouts)} attempt(s), {sum(timeouts)}s total). The renderer "
        "may be wedged — or still busy with a long task. Re-check with "
        "`evaluate \"1\"`; if it stays silent, run 'revive' to close and "
        "reopen this tab via the HTTP API (discards renderer state: "
        "sessionStorage, in-memory JS).",
        file=sys.stderr,
    )
    return False


def _await_load_and_probe(client):
    """Shared --wait-for load epilogue: load-event wait, then renderer probe.

    Returns False when the renderer probe fails (caller exits non-zero).
    """
    if not _wait_for_load_event(client):
        print(
            "Warning: Page load event not received within 30s — page may not be fully loaded",
            file=sys.stderr,
        )
    return _post_nav_probe(client)


def cmd_navigate(client, args):
    """Navigate to a URL."""
    client.connect()
    try:
        if args.wait_for == "load":
            _enable_page_subscription(client)

        result = client.send("Page.navigate", {"url": args.url})

        # Check navigation error before entering wait loop
        error = result.get("errorText")
        if error:
            print(f"Navigation error: {error}", file=sys.stderr)
            sys.exit(1)

        if args.wait_for == "load":
            if not _await_load_and_probe(client):
                sys.exit(1)

        frame_id = result.get("frameId", "")
        print(f"Navigated to: {args.url}")
        print(f"  Frame: {frame_id}")
    finally:
        client.close()


def cmd_reload(client, args):
    """Reload the current page. --hard bypasses cache."""
    client.connect()
    try:
        if args.wait_for == "load":
            _enable_page_subscription(client)

        client.send("Page.reload", {"ignoreCache": args.hard})

        if args.wait_for == "load":
            if not _await_load_and_probe(client):
                sys.exit(1)

        print(f"Reloaded{' (cache bypassed)' if args.hard else ''}")
    finally:
        client.close()


def cmd_revive(client, args):
    """Recover a wedged tab: close it and reopen its URL via the HTTP API.

    The HTTP endpoints (/json/list, /json/close, /json/new) are served by
    the browser process, so they work even when the tab's renderer no
    longer answers CDP WebSocket calls (#47). Renderer-local state
    (session history, sessionStorage, in-memory JS state) is lost;
    cookies and localStorage survive in the profile.
    """
    target_id = client.get_selected_target()
    if not target_id:
        print("Error: No tab selected. Use 'select' first.", file=sys.stderr)
        sys.exit(1)

    tabs = client.list_tabs(type_filter=None)
    tab = next((t for t in tabs if t.get("id") == target_id), None)
    if tab is None:
        print(
            f"Error: Selected target {target_id} not found in tab list. "
            "Use 'list' + 'select' to pick a tab.",
            file=sys.stderr,
        )
        sys.exit(1)

    url = args.url or tab.get("url", "")
    if not url:
        print("Error: Tab has no URL and no --url override given.", file=sys.stderr)
        sys.exit(1)

    # Open-then-close: if /json/new fails, the wedged tab still exists and
    # state.json keeps pointing at a live (if unresponsive) target.
    new_tab = client.new_tab(url)
    new_id = new_tab.get("id")
    if not new_id:
        print(f"Error: /json/new returned no target id: {new_tab}", file=sys.stderr)
        sys.exit(1)

    if not client.close_tab(target_id):
        print(
            f"Warning: /json/close did not confirm for {target_id[:8]}... — "
            "the wedged tab may still be open.",
            file=sys.stderr,
        )

    client.save_state(new_id)
    client.activate_tab(new_id)
    print(f"Revived tab: closed {target_id[:8]}..., reopened as {new_id[:8]}...")
    print(f"  URL: {url}")

    # Confirm the fresh renderer answers before handing control back.
    try:
        client.connect(target_id=new_id)
        if _post_nav_probe(client, timeouts=(10,)):
            print("  Renderer responsive.")
        else:
            sys.exit(1)
    finally:
        client.close()


def _history_nav(client, wait_for, direction, label):
    """Shared back/forward navigation via Page.navigateToHistoryEntry.

    Note: bfcache restore may skip Page.loadEventFired entirely. Default
    --wait-for is 'none' for back/forward to avoid 30s timeouts on cached
    restores. Use 'load' explicitly only when you know the navigation
    triggers a fresh load.
    """
    client.connect()
    try:
        if wait_for == "load":
            _enable_page_subscription(client)

        hist = client.send("Page.getNavigationHistory")
        entries = hist.get("entries", [])
        current = hist.get("currentIndex", 0)
        target = current + direction

        if target < 0:
            raise CDPError("No further history (already at first entry)")
        if target >= len(entries):
            raise CDPError("No further history (already at last entry)")

        entry = entries[target]
        client.send("Page.navigateToHistoryEntry", {"entryId": entry.get("id")})

        if wait_for == "load":
            if not _await_load_and_probe(client):
                sys.exit(1)

        print(f"Navigated {label} to: {entry.get('url', '')}")
    finally:
        client.close()


def cmd_back(client, args):
    """Navigate back in history."""
    _history_nav(client, args.wait_for, direction=-1, label="back")


def cmd_forward(client, args):
    """Navigate forward in history."""
    _history_nav(client, args.wait_for, direction=+1, label="forward")


_WAIT_LIFECYCLE_NAMES = {
    "load": "load",
    "domcontentloaded": "DOMContentLoaded",
    "networkidle": "networkIdle",
}


def _wait_for_load_event(client, timeout=30):
    """Wait for Page.loadEventFired event. Returns True if received before timeout.

    Drains the client event buffer first — Page.loadEventFired often arrives
    during the preceding navigation method's response wait (especially for
    fast operations like reload), so checking the buffer first prevents
    false 30s timeouts.

    Caller should call _enable_page_subscription() before the navigation
    method to ensure Page.loadEventFired is delivered.
    """
    for ev in client.drain_events():
        if ev.get("method") == "Page.loadEventFired":
            return True

    deadline = time.time() + timeout
    while time.time() < deadline:
        remaining = min(deadline - time.time(), 1.0)
        if remaining <= 0:
            break
        try:
            ev = client.recv_one_event(timeout=remaining)
        except CDPError:
            break
        if ev is None:
            continue
        if ev.get("method") == "Page.loadEventFired":
            return True
    return False


def _enable_page_subscription(client):
    """Call before a navigation method when --wait-for load is requested.

    Idempotent on the CDP side. CDPError (e.g., connection drop) is logged
    to stderr — silent swallow would mask connection issues as opaque 30s
    timeouts in the subsequent _wait_for_load_event call.
    """
    try:
        client.send("Page.enable")
    except CDPError as e:
        print(
            f"Warning: Page.enable failed ({e}) — load wait may time out",
            file=sys.stderr,
        )


def _wait_poll(client, expression, label, deadline):
    """Poll Runtime.evaluate until expression returns truthy or deadline passes."""
    start = time.time()
    while time.time() < deadline:
        result = client.send("Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True,
        })
        obj = result.get("result", {})
        if obj.get("value"):
            elapsed_ms = int((time.time() - start) * 1000)
            print(f"Wait satisfied: {label} ({elapsed_ms}ms)")
            return
        time.sleep(0.2)

    print(f"Wait timeout: {label}", file=sys.stderr)
    sys.exit(1)


def _wait_lifecycle(client, state, deadline):
    """Subscribe to Page.lifecycleEvent and block until the named state arrives.

    Pre-checks document.readyState first so an already-loaded page succeeds
    immediately — Page.lifecycleEvent only fires for future transitions,
    not for states the page has already passed.
    """
    import websocket

    target_name = _WAIT_LIFECYCLE_NAMES[state]

    if state in ("load", "domcontentloaded"):
        pre = client.send("Runtime.evaluate", {
            "expression": "document.readyState",
            "returnByValue": True,
        })
        ready = pre.get("result", {}).get("value", "")
        if state == "load" and ready == "complete":
            print(f"Wait satisfied: load-state {state} (already ready)")
            return
        if state == "domcontentloaded" and ready in ("interactive", "complete"):
            print(f"Wait satisfied: load-state {state} (already ready)")
            return

    client.send("Page.enable")
    client.send("Page.setLifecycleEventsEnabled", {"enabled": True})

    while time.time() < deadline:
        try:
            client._ws.settimeout(1.0)
            raw = client._ws.recv()
            resp = json.loads(raw)
            if resp.get("method") == "Page.lifecycleEvent":
                name = resp.get("params", {}).get("name", "")
                if name == target_name:
                    print(f"Wait satisfied: load-state {state}")
                    return
        except websocket.WebSocketTimeoutException:
            continue
        except (websocket.WebSocketConnectionClosedException, ConnectionError):
            break

    print(f"Wait timeout: load-state {state}", file=sys.stderr)
    sys.exit(1)


def cmd_wait(client, args):
    """Wait for a readiness condition: selector, text, URL, lifecycle, or JS predicate."""
    modes = [
        ("selector", args.selector),
        ("text", args.text),
        ("url-contains", args.url_contains),
        ("load-state", args.load_state),
        ("function", args.function),
    ]
    active = [(name, value) for name, value in modes if value is not None]
    if len(active) != 1:
        print(
            "Error: provide exactly one of --selector, --text, --url-contains, "
            "--load-state, --function",
            file=sys.stderr,
        )
        sys.exit(1)

    deadline = time.time() + args.timeout_ms / 1000.0
    mode, value = active[0]

    client.connect()
    try:
        if mode == "load-state":
            _wait_lifecycle(client, value, deadline)
        elif mode == "selector":
            expr = f"!!document.querySelector({json.dumps(value)})"
            _wait_poll(client, expr, f"selector {value!r}", deadline)
        elif mode == "text":
            expr = (
                "!!Array.from(document.querySelectorAll('body, body *')).find("
                f"el => (el.textContent || '').includes({json.dumps(value)}))"
            )
            _wait_poll(client, expr, f"text {value!r}", deadline)
        elif mode == "url-contains":
            expr = f"location.href.includes({json.dumps(value)})"
            _wait_poll(client, expr, f"url contains {value!r}", deadline)
        elif mode == "function":
            expr = f"!!({value})"
            _wait_poll(client, expr, f"function {value!r}", deadline)
    finally:
        client.close()


def cmd_doctor(client, args):
    """Diagnostic check for cdp-attach setup. Reports headless/headed status itself."""
    fail_count = 0

    def step(label, ok, detail=""):
        nonlocal fail_count
        if not ok:
            fail_count += 1
        marker = "PASS" if ok else "FAIL"
        suffix = f" — {detail}" if detail else ""
        print(f"  [{marker}] {label}{suffix}")

    print(f"cdp-attach doctor — host={client.host} port={client.port}")

    try:
        info = client.get_version()
        browser = info.get("Browser", "?") if isinstance(info, dict) else "?"
        step("HTTP /json/version reachable", True, browser)
    except Exception as e:
        step("HTTP /json/version reachable", False, str(e))
        print(f"\n{fail_count} check(s) failed (cannot continue without HTTP).")
        sys.exit(1)

    # Step 2: headed/headless (informational; doctor does not require headed)
    try:
        is_h = client.is_headless()
        step("Browser visible (not headless)", not is_h, "headless" if is_h else "headed")
    except Exception as e:
        step("Browser visible (not headless)", False, str(e))

    tabs = []
    try:
        tabs = client.list_tabs(type_filter="page")
        step("Tab list non-empty", len(tabs) > 0, f"{len(tabs)} tab(s)")
    except Exception as e:
        step("Tab list non-empty", False, str(e))

    selected = client.get_selected_target()
    target_ids = {t.get("id") for t in tabs}
    if selected is None:
        step("Selected target valid", True, "none selected (use 'select' first)")
        ws_target = None
    else:
        valid = selected in target_ids
        detail = f"{selected[:8]}..." + ("" if valid else " (not in tab list)")
        step("Selected target valid", valid, detail)
        ws_target = selected if valid else None

    # Step 5/6: WebSocket handshake + Runtime.evaluate
    if ws_target:
        try:
            client.connect(target_id=ws_target)
            step("WebSocket handshake", True)
            try:
                result = client.send(
                    "Runtime.evaluate",
                    {"expression": "1+1", "returnByValue": True},
                )
                value = result.get("result", {}).get("value")
                step("Runtime.evaluate 1+1 == 2", value == 2, str(value))
            except Exception as e:
                step("Runtime.evaluate 1+1 == 2", False, str(e))
            finally:
                client.close()
        except Exception as e:
            step("WebSocket handshake", False, str(e))
            step("Runtime.evaluate 1+1 == 2", False, "skipped")
    else:
        step("WebSocket handshake", False, "no valid target")
        step("Runtime.evaluate 1+1 == 2", False, "skipped")

    # Step 7: cache dir writable
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        test_path = os.path.join(STATE_DIR, ".doctor-write-test")
        with open(test_path, "w") as f:
            f.write("ok")
        os.remove(test_path)
        step("Cache dir writable", True, STATE_DIR)
    except Exception as e:
        step("Cache dir writable", False, f"{STATE_DIR}: {e}")

    print()
    if fail_count == 0:
        print("All checks passed.")
    else:
        print(f"{fail_count} check(s) failed.")
        sys.exit(1)


def cmd_cdp_call(client, args):
    """Send a raw CDP method and print the result.

    Escape hatch for CDP primitives not exposed by v1/v2/v3 commands.
    """
    if args.params_json and args.stdin:
        print("Error: --params-json and --stdin are mutually exclusive", file=sys.stderr)
        sys.exit(1)

    params = None
    if args.stdin:
        raw = sys.stdin.read().strip()
        if raw:
            try:
                params = json.loads(raw)
            except json.JSONDecodeError as e:
                print(f"Error: invalid JSON on stdin: {e}", file=sys.stderr)
                sys.exit(1)
    elif args.params_json:
        try:
            params = json.loads(args.params_json)
        except json.JSONDecodeError as e:
            print(f"Error: invalid JSON in --params-json: {e}", file=sys.stderr)
            sys.exit(1)

    if params is not None and not isinstance(params, dict):
        print(
            f"Error: params must be a JSON object (got {type(params).__name__})",
            file=sys.stderr,
        )
        sys.exit(1)

    client.connect()
    try:
        result = client.send(args.method, params=params)
        print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
    finally:
        client.close()


def cmd_error_list(client, args):
    """List recent error events from errors.jsonl."""
    cutoff = time.time() - args.since_seconds if args.since_seconds else 0
    filter_str = (args.filter or "").lower()

    try:
        with open(ERRORS_FILE) as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"No errors logged ({ERRORS_FILE} not found)")
        return

    matching = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if cutoff and entry.get("t", 0) < cutoff:
            continue
        if filter_str:
            haystack = " ".join(
                str(entry.get(k, "")) for k in ("category", "method", "error", "kind")
            ).lower()
            if filter_str not in haystack:
                continue
        matching.append(entry)

    matching = matching[-args.limit:]

    if not matching:
        print(f"No matching errors (limit={args.limit}, filter={args.filter!r})")
        return

    for entry in matching:
        ts = entry.get("t", 0)
        ts_str = time.strftime("%H:%M:%S", time.localtime(ts))
        category = entry.get("category", "?")
        method = entry.get("method", "")
        kind = entry.get("kind", "")
        suffix_parts = [p for p in (method, kind) if p]
        suffix = f" {'/'.join(suffix_parts)}" if suffix_parts else ""
        error = entry.get("error", "")
        print(f"[{ts_str}] {category}{suffix}: {error}")


# Commands that bypass the headless guard:
# - version: diagnostic/info-only
# - error_list: reads local JSONL file, no CDP commands
# - doctor: diagnostic, reports headless status itself
LOCAL_COMMANDS = {"version", "error_list", "doctor"}


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
    p_list.add_argument("--contexts", action="store_true",
                        help="Group tabs by browserContextId (Chromium profile) instead of a flat list")
    p_list.add_argument("--context", help="Restrict listing to one browser context (id or short prefix)")

    # select
    p_sel = sub.add_parser("select", help="Select a tab by index or ID")
    p_sel.add_argument("target", help="Tab index (integer) or target ID")
    p_sel.add_argument("--context", help="Refuse to select a target outside this browser context (id or short prefix)")

    # screenshot
    p_ss = sub.add_parser("screenshot", help="Capture screenshot")
    p_ss.add_argument("--output", "-o", help="Output file path")
    p_ss.add_argument("--format", choices=["png", "jpeg"], default="png")
    p_ss.add_argument("--full-page", action="store_true", help="Capture full page")

    # snapshot
    p_snap = sub.add_parser("snapshot", help="Accessibility tree snapshot")
    p_snap.add_argument("--depth", type=int, default=5, help="Tree depth (default: 5)")
    p_snap.add_argument("--diff", action="store_true",
                        help="Show delta vs the cached snapshot for this target (updates cache); "
                             "falls back to full tree with a note when there is no baseline yet")

    # evaluate
    p_eval = sub.add_parser("evaluate", help="Evaluate JavaScript")
    p_eval.add_argument("expression", nargs="?", default=None,
                        help="JavaScript expression (or use --stdin)")
    p_eval.add_argument("--stdin", action="store_true",
                        help="Read expression from stdin (avoids shell quoting)")
    p_eval.add_argument("--no-rewrite", action="store_true",
                        help="Disable automatic const/let to var rewriting")
    p_eval.add_argument("--await", dest="await_promise", action="store_true",
                        help="Await promise result")
    p_eval.add_argument("--frame", default=None,
                        help="CSS selector of a frame owner element, or 'main' for top frame")
    p_eval.add_argument("--frame-url", dest="frame_url", default=None,
                        help="URL substring to match a frame (use when selectors are unstable)")

    # navigate
    p_nav = sub.add_parser("navigate", help="Navigate to URL")
    p_nav.add_argument("url", help="Target URL")
    p_nav.add_argument("--wait-for", choices=["load", "none"], default="load",
                       help="Wait condition (default: load)")

    # reload
    p_reload = sub.add_parser("reload", help="Reload current page")
    p_reload.add_argument("--hard", action="store_true",
                          help="Bypass cache (Page.reload ignoreCache=true)")
    p_reload.add_argument("--wait-for", choices=["load", "none"], default="load",
                          help="Wait condition (default: load)")

    # revive
    p_revive = sub.add_parser(
        "revive",
        help="Recover a wedged tab: close + reopen its URL via the HTTP API",
    )
    p_revive.add_argument("--url", default=None,
                          help="Reopen with this URL instead of the tab's current URL")

    # back
    p_back = sub.add_parser("back", help="Navigate back in history")
    p_back.add_argument("--wait-for", choices=["load", "none"], default="none",
                        help="Wait condition (default: none — bfcache may skip load event)")

    # forward
    p_forward = sub.add_parser("forward", help="Navigate forward in history")
    p_forward.add_argument("--wait-for", choices=["load", "none"], default="none",
                           help="Wait condition (default: none — bfcache may skip load event)")

    # wait
    p_wait = sub.add_parser("wait", help="Wait for a readiness condition")
    p_wait.add_argument("--selector", help="CSS selector to appear in DOM")
    p_wait.add_argument("--text", help="Substring present in any element's textContent")
    p_wait.add_argument("--url-contains", dest="url_contains",
                        help="Substring of location.href")
    p_wait.add_argument("--load-state", dest="load_state",
                        choices=list(_WAIT_LIFECYCLE_NAMES.keys()),
                        help="Page lifecycle state to await")
    p_wait.add_argument("--function", help="JavaScript boolean expression")
    p_wait.add_argument("--timeout-ms", dest="timeout_ms", type=int, default=30000,
                        help="Timeout in milliseconds (default: 30000)")

    # doctor
    sub.add_parser(
        "doctor",
        help="Diagnostic check (HTTP, WebSocket, eval, cache writable)",
    )

    # cdp_call
    p_call = sub.add_parser(
        "cdp_call",
        help="Send a raw CDP method (escape hatch for primitives not exposed by v1/v2/v3)",
    )
    p_call.add_argument("method", help="CDP method, e.g. Page.captureScreenshot")
    p_call.add_argument("--params-json", dest="params_json",
                        help="JSON string with params object")
    p_call.add_argument("--stdin", action="store_true",
                        help="Read params JSON from stdin")

    # error_list
    p_err = sub.add_parser("error_list", help="List recent CDP error events from errors.jsonl")
    p_err.add_argument("--limit", type=int, default=50, help="Max entries to show (default: 50)")
    p_err.add_argument("--filter", help="Substring to match in category/method/error/kind")
    p_err.add_argument("--since-seconds", dest="since_seconds", type=int,
                       help="Only entries within last N seconds")

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
        "reload": cmd_reload,
        "revive": cmd_revive,
        "back": cmd_back,
        "forward": cmd_forward,
        "wait": cmd_wait,
        "doctor": cmd_doctor,
        "cdp_call": cmd_cdp_call,
        "error_list": cmd_error_list,
    }

    try:
        # doctor is exempt from the global lock: diagnostics must remain
        # runnable during contention. All other commands serialize CDP access.
        if args.command == "doctor":
            commands[args.command](client, args)
        else:
            with cdp_lock(client.host, client.port):
                # Block headless browsers (except for diagnostic / local commands).
                if args.command not in LOCAL_COMMANDS:
                    client.require_headed()
                commands[args.command](client, args)
    except CDPError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
