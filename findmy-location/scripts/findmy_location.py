#!/usr/bin/env python3
"""Print the user's current Find My location as one JSON line."""
import argparse
import datetime
import json
import os
import pathlib
import re
import subprocess
import sys
import time

FINDMY = "com.apple.findmy"
READ = pathlib.Path(__file__).with_name("read_rows.mjs")
MARKER = "FINDMY_ROWS "
FRESH = re.compile(r"^(지금|\d+\s*분 전)$")
SEP = re.compile(r"[\s ]*·[\s ]*")
DISTANCE = re.compile(r"^\d+(\.\d+)?\s*k?m$")
WAIT_S = 15
FOCUS_TIMEOUT_S = 5
CONFIGURE = (
    "claude plugin configure findmy-location@cc-plugin --values-stdin <<'EOF'\n"
    '{"primary_device": "<name>", "fallback_device": "<name>"}\n'
    "EOF"
)
SELECT = """
const app = await cua.getApp("com.apple.findmy", { initialState: false });
const q = await app.query({ text: NAME + ", ", role: "AXStaticText", maxNodes: 2000, limit: 5 });
const row = q.matches.find(m => /ListEntityRow/.test(m.identifier || "") && (m.title || "").startsWith(NAME + ", "));
if (row) await app.click(row.index, { clickMethod: "accessibility" });
nodeRepl.write(row ? "selected" : "not_found");
"""


def parse_row(line, devices):
    head = line.split(" ID: ListEntityRow", 1)[0].strip()
    head = re.sub(r"^\d+\s+", "", head)
    head = re.sub(r"^\S+\s+(\(selected\)\s+)?", "", head)
    head = re.sub(r"^Description:\s*", "", head)
    name = next((d for d in sorted(devices, key=len, reverse=True) if head.startswith(d + ", ")), None)
    if name is None:
        return None
    rest = head[len(name) + 2:]
    if rest.startswith("세부사항 열기, "):
        rest = rest[len("세부사항 열기, "):]
    place = distance = address = freshness = None
    if " | " in rest:
        place, after = rest.split(" | ", 1)
        distance, _, tail = after.partition(", ")
        if tail:
            middle, _, last = tail.rpartition(", ")
            address = middle or None
            freshness = SEP.split(last)[0]
    elif "·" in rest:
        first, _, remainder = rest.partition(", ")
        if remainder and DISTANCE.match(first):
            distance, rest = first, remainder
        fields = SEP.split(rest)
        place = fields[0]
        freshness = fields[1] if len(fields) > 1 else None
    else:
        freshness = rest
    return {"name": name, "place_label": place, "distance": distance, "address": address, "freshness": freshness}


def is_fresh(row):
    return bool(row and FRESH.match(row.get("freshness") or ""))


def pick(rows, devices):
    by_name = {r["name"]: r for r in rows}
    return next((by_name[d] for d in devices if is_fresh(by_name.get(d))), None)


class OcuError(Exception):
    def __init__(self, message, timed_out=False):
        super().__init__(message)
        self.timed_out = timed_out


def ocu_js(args, stdin=None, timeout=30):
    try:
        proc = subprocess.run(["ocu", "js", *args], input=stdin, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise OcuError("ocu js timed out after %gs" % timeout, timed_out=True)
    except OSError as exc:
        raise OcuError("ocu js could not start: %s" % exc)
    if proc.returncode != 0:
        tail = (proc.stderr.strip() or proc.stdout.strip())[-200:]
        raise OcuError("ocu js exited %d: %s" % (proc.returncode, tail or "no output"))
    return proc.stdout


def read_rows(devices, timeout=30):
    out = ocu_js(["--file", str(READ)], timeout=timeout)
    payload = [line[len(MARKER):] for line in out.splitlines() if line.startswith(MARKER)]
    try:
        lines = json.loads(payload[-1]) if payload else None
    except ValueError:
        lines = None
    if not isinstance(lines, list) or not all(isinstance(line, str) for line in lines):
        raise OcuError("unreadable ocu js output: " + out.strip()[-200:])
    return [row for row in (parse_row(line, devices) for line in lines) if row]


def select(name):
    try:
        return "selected" in ocu_js(["-"], "const NAME = " + json.dumps(name, ensure_ascii=False) + ";" + SELECT)
    except OcuError:
        return False


def run_bounded(cmd):
    """Run a short command; return (stdout, None) on success or (None, reason)."""
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=FOCUS_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        return None, "%s timed out after %ds" % (cmd[0], FOCUS_TIMEOUT_S)
    except OSError as exc:
        return None, "%s could not start: %s" % (cmd[0], exc)
    if proc.returncode != 0:
        return None, "%s exited %d: %s" % (cmd[0], proc.returncode, (proc.stderr.strip() or "no output")[-200:])
    return proc.stdout.strip(), None


def front_app():
    bundle, reason = run_bounded(["osascript", "-e", 'tell application "System Events" to get bundle identifier of first process whose frontmost is true'])
    if reason is None and not bundle:
        reason = "osascript returned no front app"
    return (bundle or None), reason


def restore_focus(front, front_reason):
    if front is None:
        return {"focus_restored": False, "focus_note": "front app unknown: " + (front_reason or "")}
    if front == FINDMY:
        return {"focus_restored": True}
    _, reason = run_bounded(["open", "-b", front])
    return {"focus_restored": True} if reason is None else {"focus_restored": False, "focus_note": reason}


def refresh(devices, front, front_reason):
    """Bring Find My forward until a configured device is fresh, then return focus."""
    rows, target, focus = [], None, {}
    run_bounded(["open", "-b", FINDMY])
    try:
        deadline = time.monotonic() + WAIT_S
        while target is None:
            time.sleep(1)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                rows = read_rows(devices, timeout=max(1, remaining))
            except OcuError as exc:
                if exc.timed_out and time.monotonic() >= deadline:
                    break
                raise
            target = pick(rows, devices)
    finally:
        focus = restore_focus(front, front_reason)
    return rows, target, focus


def configured(value):
    value = (value or "").strip()
    return "" if value.startswith("${") else value


def main(argv=None, stdin=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--devices-stdin", action="store_true", help="read the primary and fallback device names from stdin, one per line")
    parser.add_argument("--primary", default=os.environ.get("CLAUDE_PLUGIN_OPTION_PRIMARY_DEVICE"))
    parser.add_argument("--fallback", default=os.environ.get("CLAUDE_PLUGIN_OPTION_FALLBACK_DEVICE"))
    args = parser.parse_args(argv)
    if args.devices_stdin:
        lines = (stdin or sys.stdin).read().splitlines() + ["", ""]
        args.primary, args.fallback = lines[0], lines[1]
    devices = [d for d in (configured(args.primary), configured(args.fallback)) if d]
    if not devices:
        print(json.dumps({"status": "unconfigured", "message": "set primary_device with:\n" + CONFIGURE}))
        return 2
    started = time.monotonic()
    result = {"status": "error"}
    try:
        result.update(locate(devices))
    except OcuError as exc:
        result["message"] = str(exc)
    result["read_at"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    result["elapsed_s"] = round(time.monotonic() - started, 1)
    print(json.dumps(result, ensure_ascii=False))
    return {"ok": 0, "stale_or_missing": 1}.get(result["status"], 3)


def locate(devices):
    front, front_reason = front_app()
    rows = read_rows(devices)
    target, activated, focus = pick(rows, devices), False, {}
    if target is None:
        activated = True
        rows, target, focus = refresh(devices, front, front_reason)
    if target and not target["address"] and select(target["name"]):
        try:
            reread = next((r for r in read_rows(devices) if r["name"] == target["name"]), None)
        except OcuError:
            reread = None
        if is_fresh(reread):
            target = reread
    return {
        "status": "ok" if target else "stale_or_missing",
        "device": target,
        "candidates": {r["name"]: r["freshness"] for r in rows},
        "activated_findmy": activated,
        **focus,
    }


if __name__ == "__main__":
    sys.exit(main())
