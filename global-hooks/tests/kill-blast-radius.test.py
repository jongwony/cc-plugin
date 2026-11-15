import json, os, subprocess, sys, time

H = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "hooks", "kill-blast-radius.py")

def run(payload, platform=None):
    t = time.time()
    argv = ["python3", "-I", H]
    if platform:
        # Run the hook as __main__ with sys.platform overridden, to exercise the non-macOS path here.
        argv = ["python3", "-I", "-c",
                "import runpy, sys; sys.platform = sys.argv[1]; runpy.run_path(sys.argv[2], run_name='__main__')",
                platform, H]
    r = subprocess.run(argv, input=payload, capture_output=True, text=True, timeout=15)
    return r, time.time() - t

def decide(cmd):
    r, dt = run(json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}}))
    out = r.stdout.strip()
    if out:
        d = json.loads(out)["hookSpecificOutput"]
        assert d["hookEventName"] == "PreToolUse" and d["permissionDecision"] == "ask"
        return "ASK", dt, r
    return "pass", dt, r

BROAD = "cat"  # matches hundreds of processes on this Mac (pgrep -f cat)
NONE = "zz_no_such_proc_zz"
cases = [
    # incident and its wrappers
    ('pkill -f "cat" -n 2>/dev/null; rm -f /tmp/q', "ASK"),
    ("ps aux | grep cat | pkill -f cat -n", "ASK"),
    ("cd /tmp && pkill -f cat -n || true", "ASK"),
    ("for i in 1 2; do pkill -f cat -n; done", "ASK"),
    ("( pkill -f cat -n )", "ASK"),
    ("echo $(pkill -f cat -n)", "ASK"),
    ("timeout 5 pkill -f cat -n", "ASK"),
    ("xargs pkill -f cat -n < /dev/null", "ASK"),
    ('bash -c "pkill -f cat -n"', "ASK"),
    ("sh -c 'cd /tmp; pkill -f cat'", "ASK"),
    ("sudo pkill -f cat", "ASK"),
    ("FOO=1 pkill -f cat", "ASK"),
    ("/usr/bin/pkill -f cat", "ASK"),
    ("nohup pkill -9 -f cat &", "ASK"),
    ("echo start\npkill -f cat\necho end", "ASK"),
    ('pkill -f "ca[t]" -n', "ASK"),
    ("killall -u choi", "ASK"),
    # pgrep-fed kill
    ("pgrep -f cat | xargs kill -9", "ASK"),
    ("pgrep -f cat | xargs -I{} kill {}", "ASK"),
    ("pgrep -f cat | while read p; do kill $p; done", "ASK"),
    ("kill -9 $(pgrep -f cat)", "ASK"),
    ("kill `pgrep -f cat`", "ASK"),
    # narrow kills pass
    (f"pkill -f {NONE}", "pass"),
    ('pkill -INT -f "voice_dictation.wav"', "pass"),
    ("killall Finder", "pass"),
    (f"kill -9 $(pgrep -f {NONE})", "pass"),
    (f"pgrep -f {NONE} | xargs kill", "pass"),
    ("kill 12345", "pass"),
    ("kill -TERM $PID", "pass"),
    # unmeasurable: left to the classifier
    ('pkill -f "$PAT"', "pass"),
    ("ssh host pkill -f cat", "pass"),
    ("ps aux | grep cat | awk '{print $2}' | xargs kill", "pass"),
    # no kill at all / text mentioning kill
    ("git log --oneline", "pass"),
    ("pgrep -f cat", "pass"),
    ("pgrep -f cat | wc -l", "pass"),
    ("echo 'pkill -f cat'", "pass"),
    ("git commit -m 'drop pkill -f cat rule'", "pass"),
    ("grep -rnE 'pkill|killall' ~/github", "pass"),
    ("grep -n pkill toggle.sh", "pass"),
    ('cat <<EOF\npkill -f cat\nEOF', "ASK"),  # heredoc body is read as a line; over-approximation, prompt only
    ("echo 'unterminated", "pass"),
]

fails, worst = 0, 0.0
# Outside macOS: no decision, even for a kill that would be broad here.
for cmd in ('pkill -f "cat" -n', "pgrep -f cat | xargs kill -9", "killall -u choi"):
    r, dt = run(json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}}), platform="linux")
    ok = r.returncode == 0 and not r.stdout.strip()
    fails += not ok
    print(("ok " if ok else "FAIL"), f"linux pass rc={r.returncode} {cmd!r}")

if sys.platform != "darwin":
    print(f"\nnot macOS: measured cases skipped, {fails} failures")
    sys.exit(1 if fails else 0)

for cmd, want in cases:
    got, dt, r = decide(cmd)
    worst = max(worst, dt)
    mark = "ok " if got == want else "FAIL"
    if got != want:
        fails += 1
    print(f"{mark} {got:4} want {want:4} {dt*1000:5.0f}ms  {cmd!r}")

# robustness: malformed input, non-Bash tools, empty command
for payload in ["", "not json", json.dumps({"tool_name": "Edit", "tool_input": {"file_path": "x"}}), json.dumps({"tool_input": {}})]:
    r, dt = run(payload)
    ok = r.returncode == 0 and not r.stdout.strip()
    fails += not ok
    print(("ok " if ok else "FAIL"), f"robust rc={r.returncode} out={r.stdout.strip()[:40]!r} {payload[:30]!r}")

print(f"\n{len(cases)} cases, {fails} failures, slowest {worst*1000:.0f}ms")
sys.exit(1 if fails else 0)
