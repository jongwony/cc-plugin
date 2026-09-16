#!/usr/bin/env python3
"""Read a claude-run.sh stream out into its result files, and rule on the run.

Usage:
    claude-run-extract.py RUN_DIR ASSIGNED_ID RESUMED_FROM CWD EXIT_STATUS

Reads RUN_DIR/events.jsonl and writes result.json (the final result event),
final.md (its answer text, decoded — absent when there is none) and run.json
(the coordinates plus the verdict and its reasons).

Exit status is the verdict, and claude-run.sh reads it as one:
    0  a valid successful result was positively established
    1  an established failure
    3  validation could not finish; the run's state is unknown

Anything other than 0 is a failed run to the caller, so a broken interpreter,
a truncated stream and a genuine error all fail closed rather than reading as
success by default. Standard library only — the wrapper resolves `python3`
itself and needs no environment set up around this.
"""

import json
import os
import sys


def say(msg, err=False):
    """Print without letting a closed pipe decide the verdict.

    A caller that pipes the wrapper's stdout into something short-lived (`head`)
    closes it mid-print. The run's success is already settled by then and
    recorded in run.json, so a write failure here must not turn it into
    "could not validate".
    """
    try:
        print(msg, file=sys.stderr if err else sys.stdout, flush=True)
    except (BrokenPipeError, OSError):
        pass


def finish(code):
    # Python flushes stdout on exit and reports a failure there as status 120,
    # which would reach the wrapper as an unfinished validation. Point the
    # handle at the void when it is already broken, so the chosen status stands.
    try:
        sys.stdout.flush()
    except (BrokenPipeError, OSError):
        try:
            os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        except OSError:
            pass
    sys.exit(code)


def read_stream(path):
    """Return (first_session_id, last_result_event, malformed_line_count)."""
    first_session_id = None
    result_event = None
    malformed = 0
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                # A line that does not parse means the stream was truncated or
                # corrupted, and the events after it are unknown — including,
                # in the observed case, a later result event that would have
                # overridden an earlier success. Count it; never skip past it.
                malformed += 1
                continue
            if not isinstance(event, dict):
                malformed += 1
                continue
            if first_session_id is None and event.get("session_id"):
                first_session_id = event["session_id"]
            if event.get("type") == "result":
                result_event = event
    return first_session_id, result_event, malformed


def answer_text(result_event):
    """The result's answer as text, or None when it carries none.

    The field is a JSON string, so it is decoded here rather than passed through
    — `\\n` has to arrive as a line break for the answer to be readable.
    """
    raw = result_event.get("result")
    if isinstance(raw, str):
        return raw if raw.strip() else None
    if raw is not None:
        return json.dumps(raw, ensure_ascii=False, indent=2)
    return None


def main(argv):
    run_dir, assigned_id, resumed_from, run_cwd, exit_status = argv[1:6]

    first_session_id, result_event, malformed = read_stream(
        os.path.join(run_dir, "events.jsonl"))

    subtype = result_event.get("subtype") if result_event else None
    is_error = result_event.get("is_error") if result_event else None

    answer = None
    if result_event is not None:
        with open(os.path.join(run_dir, "result.json"), "w", encoding="utf-8") as fh:
            json.dump(result_event, fh, ensure_ascii=False, indent=2)
        answer = answer_text(result_event)
    # Only write final.md when there is answer text. An absent file says "no
    # answer"; a file holding the four characters "null" reads like one.
    if answer is not None:
        with open(os.path.join(run_dir, "final.md"), "w", encoding="utf-8") as fh:
            fh.write(answer)

    # Success is established, not assumed: a result event, the success subtype,
    # no error flag, and a stream that parsed end to end. Anything short of all
    # four is a failure, including a subtype this version does not know.
    reasons = []
    if result_event is None:
        reasons.append("the stream carried no result event")
    else:
        if subtype != "success":
            reasons.append(f"result subtype is {subtype!r}, not 'success'")
        if is_error:
            reasons.append("the result reports is_error")
    if malformed:
        reasons.append(f"{malformed} stream line(s) did not parse")

    run = {
        "assigned_session_id": assigned_id,
        "first_event_session_id": first_session_id,
        "resumed_from": resumed_from or None,
        "cwd": run_cwd,
        "exit_status": int(exit_status),
        "result_present": result_event is not None,
        "is_error": bool(is_error) if result_event else None,
        "subtype": subtype,
        "answer_present": answer is not None,
        "malformed_lines": malformed,
        "verdict": "success" if not reasons else "failure",
        "verdict_reasons": reasons,
        "files": {
            "prompt": os.path.join(run_dir, "prompt.txt"),
            "events": os.path.join(run_dir, "events.jsonl"),
            "stderr": os.path.join(run_dir, "stderr.log"),
            "exit_status": os.path.join(run_dir, "exit_status"),
            "result": os.path.join(run_dir, "result.json") if result_event else None,
            "final": os.path.join(run_dir, "final.md") if answer is not None else None,
        },
    }
    with open(os.path.join(run_dir, "run.json"), "w", encoding="utf-8") as fh:
        json.dump(run, fh, ensure_ascii=False, indent=2)

    # The session id the CLI reports is the one that actually exists. Say so when
    # it disagrees with the minted one rather than letting a later resume fail on
    # an id that was never real.
    if first_session_id and first_session_id != assigned_id:
        say(f"SESSION_ID_MISMATCH: assigned {assigned_id}, "
            f"stream reported {first_session_id}")
    if reasons:
        say("RESULT: failure — " + "; ".join(reasons))
        finish(1)
    say("RESULT: success" + ("" if answer is not None else " (no answer text)"))
    finish(0)


if __name__ == "__main__":
    try:
        main(sys.argv)
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 — the verdict must not depend on the cause
        say(f"RESULT: could not validate — {type(exc).__name__}: {exc}", err=True)
        finish(3)
