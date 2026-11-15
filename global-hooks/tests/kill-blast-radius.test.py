import json, os, runpy, subprocess, sys, time
from types import SimpleNamespace
from unittest import mock

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

fails = 0

# --- Mocked pgrep: what the hook would measure, independent of the processes running here.
hook = runpy.run_path(H)

def pids(a, b):
    return [str(p) for p in range(a, b + 1)]

TABLE = {  # pgrep arguments (after "pgrep -l") -> matched PIDs
    ("-x", "worker"): pids(1001, 1006),
    ("-f", "alpha"): pids(2001, 2006),
    ("-f", "beta"): pids(2004, 2011),
    ("-f", "big"): pids(3001, 3011),
}

def measured(cmd):
    calls = []
    def fake(argv, **kw):
        calls.append(argv[2:])
        found = TABLE.get(tuple(argv[2:]), [])
        return SimpleNamespace(returncode=0 if found else 1,
                               stdout="".join(f"{p} proc{p}\n" for p in found))
    with mock.patch.object(hook["subprocess"], "run", fake):
        out = hook["decide"](cmd)
    return calls, ("ASK" if out else "pass")

W = ["-f", "worker"]
mocked = [
    # 1. selection options are kept; only a leading signal and -I are dropped
    ("pkill -P 123 -f worker", [["-P", "123"] + W], "pass"),
    ("pkill -U choi -f worker", [["-U", "choi"] + W], "pass"),
    ("pkill -G staff -f worker", [["-G", "staff"] + W], "pass"),
    ("pkill -F /tmp/pids -f worker", [["-F", "/tmp/pids"] + W], "pass"),
    ("pkill -g 5 -t ttys001 -u root -f worker", [["-g", "5", "-t", "ttys001", "-u", "root"] + W], "pass"),
    ("pkill -9 -P 1 worker", [["-P", "1", "worker"]], "pass"),
    ("pkill -SIGKILL -u choi worker", [["-u", "choi", "worker"]], "pass"),
    ("pkill -If worker", [W], "pass"),
    ("pkill -f worker -n", [W + ["-n"]], "pass"),  # macOS reads -n after the pattern as a pattern
    # 2. a newline ends the command
    ("pkill -f worker\necho done", [W], "pass"),
    # 3. redirections and their targets are not arguments
    ("pkill -f worker > /tmp/log", [W], "pass"),
    ("pkill -f worker >/tmp/log 2>&1", [W], "pass"),
    ("pkill -f worker &>/dev/null", [W], "pass"),
    ("pkill -f worker 2>/dev/null; true", [W], "pass"),
    # 4. text that is not run is not measured; substitutions that run are
    ("echo 'kill $(pgrep -f worker)'", [], "pass"),
    ('echo "kill $(pgrep -f worker)"', [], "pass"),
    ("echo pkill -f worker", [], "pass"),
    ("grep -n pkill toggle.sh", [], "pass"),
    ("git commit -m 'kill $(pgrep -f big)'", [], "pass"),
    ('kill "$(pgrep -f worker)"', [W], "pass"),
    ("cat <<'EOF'\npkill -f big\nEOF", [], "pass"),
    ("cat <<EOF\npkill -f big\nEOF", [], "pass"),
    ("bash <<EOF\npkill -f big\nEOF", [["-f", "big"]], "ASK"),
    ("cat <<EOF\n$(pkill -f big)\nEOF", [["-f", "big"]], "ASK"),
    ("pgrep -f big | wc -l; kill 123", [], "pass"),
    ("pgrep -f big | kill", [], "pass"),  # kill does not read stdin
    ("pgrep -f big | head -1 | xargs kill", [], "pass"),  # filtered: not measured
    ("pgrep -f big | xargs kill", [["-f", "big"]], "ASK"),
    ("pgrep -qd, -f big | xargs kill", [["-f", "big"]], "ASK"),
    ("zsh -lc 'pkill -f big'", [["-f", "big"]], "ASK"),
    ("eval 'pkill -f big'", [["-f", "big"]], "ASK"),
    # 5. the count is the union of PIDs across the command
    ("killall worker worker", [["-x", "worker"], ["-x", "worker"]], "pass"),  # 6, not 12
    ("pkill -f alpha; pkill -f beta", [["-f", "alpha"], ["-f", "beta"]], "ASK"),  # 11 together
    ("pkill -f alpha; pkill -f alpha", [["-f", "alpha"], ["-f", "alpha"]], "pass"),
    ("killall -s worker", [], "pass"),  # -s reports, signals nothing
    ("killall -c worker", [["-x", "worker"]], "pass"),
    ("pkill -f big", [["-f", "big"]], "ASK"),
]
for cmd, want_calls, want in mocked:
    calls, got = measured(cmd)
    ok = calls == want_calls and got == want
    fails += not ok
    print(("ok " if ok else "FAIL"), f"mock {got:4} want {want:4} {cmd!r}" + ("" if ok else f" calls={calls}"))

# Outside macOS: no decision, even for a kill that would be broad here.
for cmd in ('pkill -f "cat" -n', "pgrep -f cat | xargs kill -9", "killall -u choi"):
    r, dt = run(json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}}), platform="linux")
    ok = r.returncode == 0 and not r.stdout.strip()
    fails += not ok
    print(("ok " if ok else "FAIL"), f"linux pass rc={r.returncode} {cmd!r}")

if sys.platform != "darwin":
    print(f"\nnot macOS: {len(mocked)} mocked cases run, measured cases skipped, {fails} failures")
    sys.exit(1 if fails else 0)

# --- Real pgrep on this Mac.
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
    ("bash <<EOF\npkill -f cat -n\nEOF", "ASK"),
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
    # unmeasurable: left to the normal permission flow
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
    ('cat <<EOF\npkill -f cat\nEOF', "pass"),  # a heredoc body cat reads is not run
    ("echo 'unterminated", "pass"),
]

worst = 0.0
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

print(f"\n{len(mocked)} mocked + {len(cases)} measured cases, {fails} failures, slowest {worst*1000:.0f}ms")
sys.exit(1 if fails else 0)
