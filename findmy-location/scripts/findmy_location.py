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
FRESH = re.compile(r"^(지금|\d+\s*분 전)$")
SEP = re.compile(r"[\s ]*·[\s ]*")
WAIT_S = 15
CONFIGURE = "echo '{\"primary_device\":\"<name>\",\"fallback_device\":\"<name>\"}' | claude plugin configure findmy-location@cc-plugin --values-stdin"
SELECT = """
const app = await cua.getApp("com.apple.findmy", { initialState: false });
const q = await app.query({ text: NAME + ", ", role: "AXStaticText", maxNodes: 2000, limit: 5 });
const row = q.matches.find(m => /ListEntityRow/.test(m.identifier || "") && (m.title || "").startsWith(NAME + ","));
if (row) await app.click(row.index, { clickMethod: "accessibility" });
nodeRepl.write(row ? "selected" : "not_found");
"""


def parse_row(line):
    head = line.split(" ID: ListEntityRow", 1)[0].strip()
    head = re.sub(r"^\d+\s+", "", head)
    head = re.sub(r"^\S+\s+(\(selected\)\s+)?", "", head)
    head = re.sub(r"^Description:\s*", "", head)
    parts = head.split(", ")
    name = parts.pop(0)
    rest = [p for p in parts if p != "세부사항 열기"]
    place = distance = address = freshness = None
    if rest and " | " in rest[0]:
        place, distance = rest[0].split(" | ", 1)
        if len(rest) > 1:
            freshness = SEP.split(rest[-1])[0]
        if len(rest) > 2:
            address = ", ".join(rest[1:-1])
    elif rest and "·" in rest[-1]:
        if len(rest) >= 2:
            distance = rest[0]
        fields = SEP.split(rest[-1])
        place = fields[0]
        freshness = fields[1] if len(fields) > 1 else None
    elif rest:
        freshness = rest[-1]
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


def read_rows(timeout=30):
    out = ocu_js(["--file", str(READ)], timeout=timeout)
    start = max(out.rfind('["'), out.rfind("[]"))
    try:
        lines = json.loads(out[start:].strip()) if start >= 0 else None
    except ValueError:
        lines = None
    if not isinstance(lines, list):
        raise OcuError("unreadable ocu js output: " + out.strip()[-200:])
    return [parse_row(line) for line in lines]


def select(name):
    try:
        return "selected" in ocu_js(["-"], "const NAME = " + json.dumps(name, ensure_ascii=False) + ";" + SELECT)
    except OcuError:
        return False


def refresh(devices, front):
    """Bring Find My forward until a configured device is fresh, then return focus."""
    rows, target = [], None
    subprocess.run(["open", "-b", FINDMY])
    try:
        deadline = time.monotonic() + WAIT_S
        while target is None:
            time.sleep(1)
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            try:
                rows = read_rows(timeout=max(1, remaining))
            except OcuError as exc:
                if exc.timed_out and time.monotonic() >= deadline:
                    break
                raise
            target = pick(rows, devices)
    finally:
        if front and front != FINDMY:
            subprocess.run(["open", "-b", front])
    return rows, target


def osa(script):
    return subprocess.run(["osascript", "-e", script], capture_output=True, text=True).stdout.strip()


def configured(value):
    value = (value or "").strip()
    return "" if value.startswith("${") else value


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--primary", default=os.environ.get("CLAUDE_PLUGIN_OPTION_PRIMARY_DEVICE"))
    parser.add_argument("--fallback", default=os.environ.get("CLAUDE_PLUGIN_OPTION_FALLBACK_DEVICE"))
    args = parser.parse_args(argv)
    devices = [d for d in (configured(args.primary), configured(args.fallback)) if d]
    if not devices:
        print(json.dumps({"status": "unconfigured", "message": "set primary_device with `" + CONFIGURE + "`"}))
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
    front = osa('tell application "System Events" to get bundle identifier of first process whose frontmost is true')
    rows = read_rows()
    target, activated = pick(rows, devices), False
    if target is None:
        activated = True
        rows, target = refresh(devices, front)
    if target and not target["address"] and select(target["name"]):
        try:
            reread = next((r for r in read_rows() if r["name"] == target["name"]), None)
        except OcuError:
            reread = None
        if is_fresh(reread):
            target = reread
    return {
        "status": "ok" if target else "stale_or_missing",
        "device": target,
        "candidates": {r["name"]: r["freshness"] for r in rows if r["name"] in devices},
        "activated_findmy": activated,
    }


if __name__ == "__main__":
    sys.exit(main())
