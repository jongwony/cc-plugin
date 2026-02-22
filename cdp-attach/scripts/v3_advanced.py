#!/usr/bin/env uv run --quiet --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "websocket-client>=1.6.0",
# ]
# ///
"""
v3_advanced — Advanced CDP: network/console monitoring, perf tracing, emulation, drag, dialog.
"""

import argparse
import json
import os
import signal
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cdp_client import CDPClient, CDPError

CACHE_DIR = os.path.expanduser("~/.cache/cdp-attach")
NETWORK_EVENTS = os.path.join(CACHE_DIR, "network-events.jsonl")
CONSOLE_EVENTS = os.path.join(CACHE_DIR, "console-events.jsonl")
AUTO_TIMEOUT = 300  # 5 minutes


def _kill_existing(client, process_type):
    """Kill existing background process if running."""
    entry = client.get_pid(process_type)
    if entry:
        pid = entry["pid"]
        create_time = entry.get("create_time", 0)
        # Skip kill if process has long exceeded its expected lifetime (likely PID reuse)
        if create_time and time.time() - create_time > AUTO_TIMEOUT + 60:
            client.clear_pid(process_type)
            return
        try:
            os.kill(pid, signal.SIGTERM)
            time.sleep(0.2)
        except ProcessLookupError:
            pass
        client.clear_pid(process_type)


def _run_collector(client, process_type, events_file, enable_method, event_names):
    """Fork a background collector process."""
    import websocket

    target_id = client.get_selected_target()
    if not target_id:
        raise CDPError("No tab selected. Use 'select' first.")

    _kill_existing(client, process_type)
    os.makedirs(CACHE_DIR, exist_ok=True)

    # Clear previous events
    open(events_file, "w").close()

    pid = os.fork()
    if pid > 0:
        # Parent
        client.save_pid(process_type, pid)
        print(f"{process_type} collector started (PID {pid})")
        print(f"Events: {events_file}")
        return

    # Child — collector process
    _shutdown = False

    def _handle_sigterm(*_):
        nonlocal _shutdown
        _shutdown = True

    error_log = os.path.join(CACHE_DIR, f"{process_type}-error.log")
    try:
        # Detach from parent
        os.setsid()
        signal.signal(signal.SIGTERM, _handle_sigterm)

        ws = websocket.create_connection(
            f"ws://{client.host}:{client.port}/devtools/page/{target_id}",
            timeout=AUTO_TIMEOUT,
            suppress_origin=True,
        )

        # Enable domain
        msg_id = 1
        ws.send(json.dumps({"id": msg_id, "method": enable_method}))
        # Wait for ack
        deadline = time.time() + 10
        while time.time() < deadline:
            resp = json.loads(ws.recv())
            if resp.get("id") == msg_id:
                break

        # Collect events
        start_time = time.time()
        with open(events_file, "a") as f:
            while not _shutdown and time.time() - start_time < AUTO_TIMEOUT:
                try:
                    ws.settimeout(1.0)
                    raw = ws.recv()
                    data = json.loads(raw)
                    method = data.get("method", "")
                    if method in event_names:
                        entry = {
                            "t": time.time(),
                            "method": method,
                            "params": data.get("params", {}),
                        }
                        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
                        f.flush()
                except websocket.WebSocketTimeoutException:
                    continue
                except (websocket.WebSocketConnectionClosedException, ConnectionError):
                    break

        ws.close()
        os._exit(0)
    except Exception as exc:
        try:
            with open(error_log, "a") as ef:
                ef.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')} {exc}\n")
        except Exception:
            pass
        os._exit(1)


def cmd_network_start(client, args):
    """Start network request collector."""
    _run_collector(
        client, "network", NETWORK_EVENTS,
        "Network.enable",
        {
            "Network.requestWillBeSent",
            "Network.responseReceived",
            "Network.loadingFinished",
            "Network.loadingFailed",
        },
    )


def cmd_network_list(client, args):
    """List collected network requests."""
    if not os.path.exists(NETWORK_EVENTS):
        print("No network events collected. Run network_start first.")
        return

    requests = {}  # requestId -> info
    with open(NETWORK_EVENTS) as f:
        for line in f:
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            method = entry["method"]
            params = entry["params"]

            if method == "Network.requestWillBeSent":
                req = params.get("request", {})
                rid = params.get("requestId", "")
                requests[rid] = {
                    "url": req.get("url", "")[:100],
                    "method": req.get("method", ""),
                    "status": "pending",
                    "type": params.get("type", ""),
                }
            elif method == "Network.responseReceived":
                rid = params.get("requestId", "")
                resp = params.get("response", {})
                if rid in requests:
                    requests[rid]["status"] = str(resp.get("status", "?"))
                    requests[rid]["mime"] = resp.get("mimeType", "")[:30]
            elif method == "Network.loadingFailed":
                rid = params.get("requestId", "")
                if rid in requests:
                    requests[rid]["status"] = "FAILED"

    # Filter
    items = list(requests.values())
    if args.filter:
        pattern = args.filter.lower()
        items = [r for r in items if pattern in r.get("url", "").lower()]

    if not items:
        print("No matching requests.")
        return

    print(f"{'Method':<7} {'Status':<8} {'Type':<12} URL")
    print("-" * 80)
    for r in items:
        print(f"{r.get('method','?'):<7} {r.get('status','?'):<8} {r.get('type',''):<12} {r['url']}")
    print(f"\nTotal: {len(items)} requests")


def cmd_network_stop(client, args):
    """Stop network collector."""
    _kill_existing(client, "network")
    print("Network collector stopped.")
    # Show final count
    if os.path.exists(NETWORK_EVENTS):
        with open(NETWORK_EVENTS) as f:
            count = sum(1 for _ in f)
        print(f"Collected {count} events → {NETWORK_EVENTS}")


def cmd_console_start(client, args):
    """Start console message collector."""
    _run_collector(
        client, "console", CONSOLE_EVENTS,
        "Runtime.enable",
        {"Runtime.consoleAPICalled", "Runtime.exceptionThrown"},
    )


def cmd_console_list(client, args):
    """List collected console messages."""
    if not os.path.exists(CONSOLE_EVENTS):
        print("No console events collected. Run console_start first.")
        return

    messages = []
    with open(CONSOLE_EVENTS) as f:
        for line in f:
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            params = entry["params"]

            if entry["method"] == "Runtime.consoleAPICalled":
                level = params.get("type", "log")
                call_args = params.get("args", [])
                text = " ".join(
                    str(a.get("value", a.get("description", repr(a))))
                    for a in call_args
                )[:200]
                messages.append({"level": level, "text": text, "t": entry["t"]})
            elif entry["method"] == "Runtime.exceptionThrown":
                exc = params.get("exceptionDetails", {})
                text = exc.get("text", "")
                exception = exc.get("exception", {})
                desc = exception.get("description", "")
                messages.append({
                    "level": "error",
                    "text": f"{text} {desc}"[:200],
                    "t": entry["t"],
                })

    # Filter by level (normalize warn/warning as equivalent)
    if args.level and args.level != "all":
        if args.level in ("warn", "warning"):
            messages = [m for m in messages if m["level"] in ("warn", "warning")]
        else:
            messages = [m for m in messages if m["level"] == args.level]

    if not messages:
        print("No matching console messages.")
        return

    for m in messages:
        ts = time.strftime("%H:%M:%S", time.localtime(m["t"]))
        print(f"[{ts}] {m['level'].upper():<7} {m['text']}")
    print(f"\nTotal: {len(messages)} messages")


def cmd_console_stop(client, args):
    """Stop console collector."""
    _kill_existing(client, "console")
    print("Console collector stopped.")
    if os.path.exists(CONSOLE_EVENTS):
        with open(CONSOLE_EVENTS) as f:
            count = sum(1 for _ in f)
        print(f"Collected {count} events → {CONSOLE_EVENTS}")


def cmd_perf_start(client, args):
    """Start performance tracing."""
    client.connect()
    try:
        params = {}
        if args.categories:
            params["categories"] = args.categories
        client.send("Tracing.start", params)
        print("Tracing started.")
        if args.categories:
            print(f"  Categories: {args.categories}")
    finally:
        client.close()


def cmd_perf_stop(client, args):
    """Stop tracing and save results."""
    import websocket

    client.connect()
    try:
        client.send("Tracing.end")

        # Collect trace chunks
        chunks = []
        deadline = time.time() + 60
        while time.time() < deadline:
            try:
                client._ws.settimeout(2.0)
                raw = client._ws.recv()
                resp = json.loads(raw)
                method = resp.get("method", "")
                if method == "Tracing.dataCollected":
                    chunks.extend(resp.get("params", {}).get("value", []))
                elif method == "Tracing.tracingComplete":
                    break
            except websocket.WebSocketTimeoutException:
                continue
            except (websocket.WebSocketConnectionClosedException, ConnectionError):
                break

        output = args.output or f"/tmp/cdp-trace-{int(time.time())}.json"
        with open(output, "w") as f:
            json.dump({"traceEvents": chunks}, f)
        print(f"Trace saved: {output} ({len(chunks)} events)")
    finally:
        client.close()


def cmd_emulate(client, args):
    """Set device emulation."""
    client.connect()
    try:
        params = {
            "width": args.width,
            "height": args.height,
            "deviceScaleFactor": args.scale,
            "mobile": args.mobile,
        }
        client.send("Emulation.setDeviceMetricsOverride", params)
        print(f"Emulation set: {args.width}x{args.height} (scale={args.scale}, mobile={args.mobile})")
    finally:
        client.close()


def cmd_emulate_reset(client, args):
    """Reset device emulation to defaults."""
    client.connect()
    try:
        client.send("Emulation.clearDeviceMetricsOverride")
        print("Emulation reset to defaults.")
    finally:
        client.close()


def cmd_drag(client, args):
    """Drag from (x1,y1) to (x2,y2)."""
    client.connect()
    try:
        steps = max(1, args.steps or 10)
        dx = (args.x2 - args.x1) / steps
        dy = (args.y2 - args.y1) / steps

        # Mouse down at start
        client.send("Input.dispatchMouseEvent", {
            "type": "mousePressed",
            "x": args.x1, "y": args.y1,
            "button": "left", "clickCount": 1,
        })

        # Intermediate moves
        for i in range(1, steps + 1):
            client.send("Input.dispatchMouseEvent", {
                "type": "mouseMoved",
                "x": args.x1 + dx * i,
                "y": args.y1 + dy * i,
                "button": "left",
            })
            time.sleep(0.01)

        # Mouse up at end
        client.send("Input.dispatchMouseEvent", {
            "type": "mouseReleased",
            "x": args.x2, "y": args.y2,
            "button": "left", "clickCount": 1,
        })

        print(f"Dragged ({args.x1},{args.y1}) → ({args.x2},{args.y2}) in {steps} steps")
    finally:
        client.close()


def cmd_dialog(client, args):
    """Handle JavaScript dialog (alert/confirm/prompt)."""
    client.connect()
    try:
        params = {"accept": args.action == "accept"}
        if args.prompt_text:
            params["promptText"] = args.prompt_text
        client.send("Page.handleJavaScriptDialog", params)
        print(f"Dialog {args.action}ed" + (f" with: {args.prompt_text}" if args.prompt_text else ""))
    finally:
        client.close()


def main():
    parser = argparse.ArgumentParser(
        prog="cdp-v3",
        description="Advanced CDP operations",
    )
    parser.add_argument("--host", help="CDP host")
    parser.add_argument("--port", type=int, help="CDP port")
    sub = parser.add_subparsers(dest="command", required=True)

    # network
    sub.add_parser("network_start", help="Start network collector")
    p_nl = sub.add_parser("network_list", help="List collected requests")
    p_nl.add_argument("--filter", help="URL pattern filter")
    sub.add_parser("network_stop", help="Stop network collector")

    # console
    sub.add_parser("console_start", help="Start console collector")
    p_cl = sub.add_parser("console_list", help="List console messages")
    p_cl.add_argument("--level", choices=["error", "warn", "warning", "all"], default="all")
    sub.add_parser("console_stop", help="Stop console collector")

    # perf
    p_ps = sub.add_parser("perf_start", help="Start tracing")
    p_ps.add_argument("--categories", help="Trace categories (comma-separated)")
    p_pst = sub.add_parser("perf_stop", help="Stop tracing")
    p_pst.add_argument("--output", "-o", help="Output trace file path")

    # emulate
    p_em = sub.add_parser("emulate", help="Device emulation")
    p_em.add_argument("--width", type=int, required=True)
    p_em.add_argument("--height", type=int, required=True)
    p_em.add_argument("--scale", type=float, default=1.0, help="Device scale factor")
    p_em.add_argument("--mobile", action="store_true")
    sub.add_parser("emulate_reset", help="Reset device emulation")

    # drag
    p_drag = sub.add_parser("drag", help="Drag gesture")
    p_drag.add_argument("x1", type=float)
    p_drag.add_argument("y1", type=float)
    p_drag.add_argument("x2", type=float)
    p_drag.add_argument("y2", type=float)
    p_drag.add_argument("--steps", type=int, default=10, help="Interpolation steps")

    # dialog
    p_dlg = sub.add_parser("dialog", help="Handle JS dialog")
    p_dlg.add_argument("action", choices=["accept", "dismiss"])
    p_dlg.add_argument("prompt_text", nargs="?", help="Text for prompt dialogs")

    args = parser.parse_args()
    client = CDPClient(host=args.host, port=args.port)

    commands = {
        "network_start": cmd_network_start,
        "network_list": cmd_network_list,
        "network_stop": cmd_network_stop,
        "console_start": cmd_console_start,
        "console_list": cmd_console_list,
        "console_stop": cmd_console_stop,
        "perf_start": cmd_perf_start,
        "perf_stop": cmd_perf_stop,
        "emulate": cmd_emulate,
        "emulate_reset": cmd_emulate_reset,
        "drag": cmd_drag,
        "dialog": cmd_dialog,
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
