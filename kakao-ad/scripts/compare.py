#!/usr/bin/env python3
"""Run the same command sequence against the kakao plugin and kakao-ad on one room, and record
per-command latency, exit code, status and delivery evidence.

Sends happen only with --self-chat, which asserts that --room is the person's own chat room;
the total across both plugins is capped at 3. Without --self-chat the run reads, drafts and
clears only. One command at a time; nothing runs in parallel.
"""
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

SEND_CAP = 3
EVIDENCE = ["window_id", "total_rows", "marker_found", "press_reported", "input_cleared",
            "text_appeared", "waited_seconds", "reason", "missing", "checks"]


def default_kakao(root: Path) -> str:
    sibling = root.parent / "kakao" / "scripts" / "kakao"
    return str(sibling) if sibling.exists() else "kakao"


def call(binary, args, env):
    t0 = time.monotonic()
    p = subprocess.run([binary, *args], capture_output=True, text=True, env=env)
    ms = round((time.monotonic() - t0) * 1000)
    try:
        body = json.loads(p.stdout.strip().splitlines()[-1]) if p.stdout.strip() else {}
    except (json.JSONDecodeError, IndexError):
        body = {"unparsed": p.stdout[-400:]}
    return {"exit": p.returncode, "ms": ms, "status": body.get("status"),
            "evidence": {k: body[k] for k in EVIDENCE if k in body}, "body": body}


def run_plugin(name, binary, room, sends, tag, env):
    steps = []

    def step(op, args):
        r = call(binary, args, env)
        r.update(plugin=name, op=op)
        steps.append(r)
        print(f"{name:9} {op:12} exit={r['exit']:<3} {r['ms']:>6} ms  {r['status']}", file=sys.stderr)
        return r

    hs = step("handshake", ["handshake", "--room", room])
    if hs["exit"] != 0:
        return steps
    w = str(hs["body"]["window_id"])
    base = ["--room", room, "--window", w]
    rd = step("read", ["read", *base, "--limit", "10"])
    marker = rd["body"].get("marker")
    step("draft", ["draft", *base, "--text", f"[{tag}] {name} draft (not sent)"])
    step("clear", ["clear", *base])
    for i in range(sends):
        step(f"send#{i + 1}", ["send", *base, "--text", f"[{tag}] {name} send {i + 1}"])
    if marker:
        step("read-after", ["read", *base, "--after", marker, "--limit", "10"])
    return steps


def markdown(steps):
    lines = ["| plugin | op | exit | status | ms | evidence |", "|---|---|---|---|---|---|"]
    for s in steps:
        ev = ", ".join(f"{k}={json.dumps(v, ensure_ascii=False)}" for k, v in s["evidence"].items()
                       if k not in ("checks", "missing"))
        lines.append(f"| {s['plugin']} | {s['op']} | {s['exit']} | {s['status']} | {s['ms']} | {ev} |")
    return "\n".join(lines) + "\n"


def main():
    root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--room", required=True, help="exact chat window title, open in KakaoTalk")
    ap.add_argument("--self-chat", action="store_true", help="assert --room is your own chat; enables sends")
    ap.add_argument("--sends", type=int, default=1, help="sends per plugin (total capped at 3)")
    ap.add_argument("--kakao", default=os.environ.get("KAKAO_BIN") or default_kakao(root))
    ap.add_argument("--kakao-ad", default=os.environ.get("KAKAO_AD_BIN") or str(root / "scripts" / "kakao-ad"))
    ap.add_argument("--out", default=f"kakao-compare-{time.strftime('%Y%m%d-%H%M%S')}")
    a = ap.parse_args()

    sends = a.sends if a.self_chat else 0
    if sends * 2 > SEND_CAP:
        sys.exit(f"--sends {a.sends} sends {sends * 2} messages; the cap is {SEND_CAP} for both plugins together")

    tag = time.strftime("cmp %H:%M:%S")
    env = dict(os.environ)
    steps = run_plugin("kakao", a.kakao, a.room, sends, tag, env)
    steps += run_plugin("kakao-ad", a.kakao_ad, a.room, sends, tag, env)

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "report.json").write_text(json.dumps(
        {"room": a.room, "self_chat": a.self_chat, "sends_per_plugin": sends, "tag": tag, "steps": steps},
        ensure_ascii=False, indent=2))
    (out / "report.md").write_text(f"# kakao vs kakao-ad — {a.room}\n\n{markdown(steps)}")
    print(out / "report.md")


if __name__ == "__main__":
    main()
