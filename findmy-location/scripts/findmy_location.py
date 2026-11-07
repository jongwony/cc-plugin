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
ROW_START = re.compile(r"^(세부사항 열기|\d+(\.\d+)?\s*k?m), ")
WAIT_S = 15
FOCUS_TIMEOUT_S = 5
WAKE = ["caffeinate", "-u", "-t", "120"]
WAKE_SETTLE_S = 2
RELOCK_WAIT_S = 5
UNOBSERVED = "could not observe a protected GUI session becoming unlocked"
CONFIGURE = (
    "claude plugin configure findmy-location@cc-plugin --values-stdin <<'FINDMY_LOCATION_CONFIG_END'\n"
    '{"primary_device": "<name>", "fallback_device": "<name>"}\n'
    "FINDMY_LOCATION_CONFIG_END"
)
SELECT = """
const app = await cua.getApp("com.apple.findmy", { initialState: false });
const q = await app.query({ text: TEXT, role: "AXStaticText", maxNodes: 2000, limit: 5 });
const row = q.matches.find(m => /ListEntityRow/.test(m.identifier || "") && m.title === TEXT);
if (row) await app.click(row.index, { clickMethod: "accessibility" });
nodeRepl.write(row ? "selected" : "not_found");
"""


def row_head(line):
    head = line.split(" ID: ListEntityRow", 1)[0].strip()
    head = re.sub(r"^\d+\s+", "", head)
    head = re.sub(r"^\S+\s+(\(selected\)\s+)?", "", head)
    return re.sub(r"^Description:\s*", "", head)


def match_rows(lines, devices):
    heads = [row_head(line) for line in lines]
    rows = []
    for name in devices:
        hits = [h for h in heads if belongs(h, name)]
        if len(hits) == 1:
            rows.append(parse_row(hits[0], name))
        elif hits:
            rows.append({"name": name, "ambiguous": True, "freshness": None})
    return rows


def belongs(head, name):
    if not head.startswith(name + ", "):
        return False
    rest = head[len(name) + 2:]
    return bool(ROW_START.match(rest)) or ", " not in rest


def parse_row(head, name):
    rest = head[len(name) + 2:]
    selected = rest.startswith("세부사항 열기, ")
    if selected:
        rest = rest[len("세부사항 열기, "):]
    place = distance = address = freshness = None
    if selected:
        if " | " in rest:
            place, rest = rest.split(" | ", 1)
        first, _, remainder = rest.partition(", ")
        if remainder and DISTANCE.match(first):
            distance, rest = first, remainder
        middle, _, last = rest.rpartition(", ")
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
    return {"name": name, "place_label": place, "distance": distance, "address": address, "freshness": freshness, "text": head}


def is_fresh(row):
    return bool(row and FRESH.match(row.get("freshness") or ""))


def pick(rows, devices):
    by_name = {r["name"]: r for r in rows}
    return next((by_name[d] for d in devices if is_fresh(by_name.get(d))), None)


class OcuError(Exception):
    def __init__(self, message, timed_out=False):
        super().__init__(message)
        self.timed_out = timed_out


def ocu_js(args, stdin=None, timeout=30, retried=False):
    try:
        proc = subprocess.run(["ocu", "js", *args], input=stdin, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise OcuError("ocu js timed out after %gs" % timeout, timed_out=True)
    except OSError as exc:
        raise OcuError("ocu js could not start: %s" % exc)
    if proc.returncode != 0:
        tail = (proc.stderr.strip() or proc.stdout.strip())[-200:]
        if UNOBSERVED in tail and not retried:
            wake_display(force=True)
            return ocu_js(args, stdin, timeout, retried=True)
        raise OcuError("ocu js exited %d: %s" % (proc.returncode, tail or "no output"))
    return proc.stdout


def read_rows(devices, timeout=30):
    out = ocu_js(["--file", str(READ)], timeout=timeout)
    payload = [line[len(MARKER):] for line in out.splitlines() if line.startswith(MARKER)]
    try:
        lines = json.loads(payload[-1]) if payload else None
    except ValueError:
        lines = None
    if isinstance(lines, dict) and lines.get("error"):
        raise OcuError("Find My AX read failed: " + str(lines["error"]))
    if not isinstance(lines, list) or not all(isinstance(line, str) for line in lines):
        raise OcuError("unreadable ocu js output: " + out.strip()[-200:])
    return match_rows(lines, devices)


def select(text):
    try:
        return "selected" in ocu_js(["-"], "const TEXT = " + json.dumps(text, ensure_ascii=False) + ";" + SELECT)
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


def locked_use_status():
    """Return (session_state, available, blocker) from Locked Use, or None when it cannot be read."""
    out, _ = run_bounded(["open-computer-use", "locked-use", "status", "--json"])
    try:
        status = json.loads(out) if out else None
    except ValueError:
        status = None
    if not isinstance(status, dict):
        return None
    session = status.get("session") if isinstance(status.get("session"), dict) else {}
    blockers = status.get("blockers") if isinstance(status.get("blockers"), list) else []
    return session.get("state"), status.get("available") is True, (str(blockers[0]) if blockers else None)


def wake_display(force=False):
    if not force:
        running, _ = run_bounded(["pgrep", "-f", " ".join(WAKE)])
        if running:
            return
    try:
        subprocess.Popen(WAKE, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError:
        return
    time.sleep(WAKE_SETTLE_S)


def relock(result):
    _, reason = run_bounded(["pmset", "displaysleepnow"])
    deadline = time.monotonic() + RELOCK_WAIT_S
    state = None
    while reason is None and time.monotonic() < deadline:
        status = locked_use_status()
        state = status[0] if status else None
        if state == "locked":
            break
        time.sleep(0.5)
    result["relocked"] = state == "locked"
    if not result["relocked"]:
        note = reason or "session state after pmset displaysleepnow: %s" % (state or "unreadable")
        result["message"] = ((result["message"] + "; ") if result["message"] else "") + "Mac not locked again: " + note


def front_app():
    bundle, reason = run_bounded(["osascript", "-e", 'tell application "System Events" to get bundle identifier of first process whose frontmost is true'])
    if reason is None and not bundle:
        reason = "osascript returned no front app"
    return (bundle or None), reason


def restore_focus(front, front_reason, result):
    if front is None:
        result.update(focus_restored=False, focus_note="front app unknown: " + (front_reason or ""))
        return
    _, reason = (None, None) if front == FINDMY else run_bounded(["open", "-b", front])
    result.update(focus_restored=reason is None, focus_note=reason)


def refresh(devices, front, front_reason, result):
    """Bring Find My forward until a configured device is fresh, then return focus."""
    _, reason = run_bounded(["open", "-b", FINDMY])
    if reason:
        result["activation_error"] = reason
        raise OcuError("Find My could not be brought forward: " + reason)
    result["activated_findmy"] = True
    rows, target = [], None
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
        restore_focus(front, front_reason, result)
    return rows, target


def configured(value):
    value = (value or "").strip()
    return "" if value.startswith("${") else value


def main(argv=None, stdin=None):
    started = time.monotonic()
    result = {
        "status": "error", "device": None, "candidates": {}, "ambiguous": [], "message": None,
        "activated_findmy": False, "activation_error": None, "focus_restored": None, "focus_note": None,
        "locked_session": False, "relocked": None, "read_at": None, "elapsed_s": None,
    }
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
        result.update(status="unconfigured", message="no device name is set; set them with:\n" + CONFIGURE)
    else:
        status = locked_use_status()
        locked = bool(status and status[0] == "locked")
        result["locked_session"] = locked
        try:
            if locked and not status[1]:
                raise OcuError("the Mac is locked and Open Computer Use's Locked Use is not available"
                               + (": " + status[2] if status[2] else "") + "; unlock the Mac or enable Locked Use (ocu locked-use enable)")
            if locked:
                wake_display()
            locate(devices, result)
        except OcuError as exc:
            result.update(status="error", message=str(exc))
        finally:
            if locked and status[1]:
                relock(result)
    result["read_at"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    result["elapsed_s"] = round(time.monotonic() - started, 1)
    print(json.dumps(result, ensure_ascii=False))
    return {"ok": 0, "stale_or_missing": 1, "unconfigured": 2}.get(result["status"], 3)


def locate(devices, result):
    front, front_reason = front_app()
    rows = read_rows(devices)
    target = pick(rows, devices)
    if target is None:
        rows, target = refresh(devices, front, front_reason, result)
    if target and not target["address"] and select(target["text"]):
        try:
            reread = next((r for r in read_rows(devices) if r["name"] == target["name"]), None)
        except OcuError:
            reread = None
        if is_fresh(reread):
            target = reread
    result.update(
        status="ok" if target else "stale_or_missing",
        device={k: v for k, v in target.items() if k != "text"} if target else None,
        candidates={r["name"]: r["freshness"] for r in rows if not r.get("ambiguous")},
        ambiguous=[r["name"] for r in rows if r.get("ambiguous")],
    )

if __name__ == "__main__":
    sys.exit(main())
