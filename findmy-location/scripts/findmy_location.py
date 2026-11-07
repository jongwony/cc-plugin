#!/usr/bin/env python3
"""Print Find My's device-list rows, as the app shows them, in one JSON line."""
import argparse
import datetime
import json
import pathlib
import subprocess
import sys
import time

FINDMY = "com.apple.findmy"
READ = pathlib.Path(__file__).with_name("read_rows.mjs")
MARKER = "FINDMY_ROWS "
ROW_ID = " ID: ListEntityRow"
REFRESH_WAIT_S = 10
SHORT_TIMEOUT_S = 5
WAKE = ["caffeinate", "-u", "-t", "120"]
WAKE_SETTLE_S = 2
UNOBSERVED = "could not observe a protected GUI session becoming unlocked"


class OcuError(Exception):
    pass


def row_text(line):
    """`<index> <role> [(selected)] [Description:] <text> ID: ListEntityRow…` → `<text>`."""
    parts = line.split(ROW_ID, 1)[0].strip().split(" ", 2)
    text = parts[2] if len(parts) == 3 else ""
    for prefix in ("(selected) ", "Description: "):
        if text.startswith(prefix):
            text = text[len(prefix):]
    return text


def run_bounded(cmd):
    """Run a short command; return (stdout, None) on success or (None, reason)."""
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=SHORT_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        return None, "%s timed out after %ds" % (cmd[0], SHORT_TIMEOUT_S)
    except OSError as exc:
        return None, "%s could not start: %s" % (cmd[0], exc)
    if proc.returncode != 0:
        return None, "%s exited %d: %s" % (cmd[0], proc.returncode, (proc.stderr.strip() or "no output")[-200:])
    return proc.stdout.strip(), None


def wake_display(force=False):
    if not force and run_bounded(["pgrep", "-f", "caffeinate -u"])[0]:
        return
    try:
        subprocess.Popen(WAKE, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError:
        return
    time.sleep(WAKE_SETTLE_S)


def ocu_js(args, retried=False):
    try:
        proc = subprocess.run(["ocu", "js", *args], capture_output=True, text=True, timeout=30)
    except subprocess.TimeoutExpired:
        raise OcuError("ocu js timed out after 30s")
    except OSError as exc:
        raise OcuError("ocu js could not start: %s" % exc)
    if proc.returncode != 0:
        tail = (proc.stderr.strip() or proc.stdout.strip())[-200:]
        if UNOBSERVED in tail and not retried:
            wake_display(force=True)
            return ocu_js(args, retried=True)
        raise OcuError("ocu js exited %d: %s" % (proc.returncode, tail or "no output"))
    return proc.stdout


def read_rows():
    out = ocu_js(["--file", str(READ)])
    payload = [line[len(MARKER):] for line in out.splitlines() if line.startswith(MARKER)]
    try:
        lines = json.loads(payload[-1]) if payload else None
    except ValueError:
        lines = None
    if isinstance(lines, dict) and lines.get("error"):
        raise OcuError("Find My AX read failed: " + str(lines["error"]))
    if not isinstance(lines, list) or not all(isinstance(line, str) for line in lines):
        raise OcuError("unreadable ocu js output: " + out.strip()[-200:])
    return [row_text(line) for line in lines if ROW_ID in line]


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


def refreshed_rows(result):
    """Bring Find My to the front, let it update, read, and return focus to the app that was in front."""
    front, reason = run_bounded(["osascript", "-e", 'tell application "System Events" to get bundle identifier of first process whose frontmost is true'])
    _, failed = run_bounded(["open", "-b", FINDMY])
    if failed:
        raise OcuError("Find My could not be brought forward: " + failed)
    result["refreshed"] = True
    try:
        time.sleep(REFRESH_WAIT_S)
        return read_rows()
    finally:
        if not front:
            result.update(focus_restored=False, message="front app unknown: " + (reason or "osascript returned nothing"))
        elif front != FINDMY:
            _, failed = run_bounded(["open", "-b", front])
            result["focus_restored"] = failed is None
            if failed:
                result["message"] = failed


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="bring Find My to the front for %d s so its locations update" % REFRESH_WAIT_S)
    args = parser.parse_args(argv)
    result = {"status": "error", "rows": [], "refreshed": False, "locked_session": False, "focus_restored": None, "message": None, "read_at": None}
    try:
        status = locked_use_status()
        result["locked_session"] = locked = bool(status and status[0] == "locked")
        if locked and not status[1]:
            raise OcuError("the Mac is locked and Open Computer Use's Locked Use is not available"
                           + (": " + status[2] if status[2] else "") + "; unlock the Mac or enable Locked Use (ocu locked-use enable)")
        if locked:
            wake_display()
        result["rows"] = refreshed_rows(result) if args.refresh else read_rows()
        result["status"] = "ok"
    except OcuError as exc:
        result["message"] = str(exc)
    result["read_at"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["status"] == "ok" else 3


if __name__ == "__main__":
    sys.exit(main())
