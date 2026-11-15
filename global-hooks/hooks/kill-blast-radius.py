#!/usr/bin/env python3
"""PreToolUse(Bash) hook: ask only when a process kill would signal more than LIMIT processes.

Covered: pkill/killall anywhere in a segment (after for/do, timeout, xargs, env, ...), the
string of `bash|sh|zsh -c`, and kill fed by pgrep (`pgrep … | xargs kill`, `kill $(pgrep …)`).
The match set is measured with pgrep using the same arguments, so macOS argument quirks
(e.g. `pkill -f "cat" -n`, where -n becomes a second pattern) are measured as they would run.
A command the hook cannot measure gets no decision and goes to the normal permission flow.
Outside macOS the hook makes no decision at all: the measurement is calibrated to macOS pgrep.
"""
import json
import os
import re
import shlex
import subprocess
import sys

LIMIT = 10
OPERATORS = {";", "&&", "||", "|", "&", "(", ")", "\n"}
SIGNAL = re.compile(r"^-([0-9]+|[A-Z][A-Z0-9]*)$")
REDIRECT = re.compile(r"^[0-9&]*[<>]")
KILLERS = ("pkill", "killall")
SHELLS = ("bash", "sh", "zsh")
REMOTE = ("ssh",)
SUBST = re.compile(r"\$\(\s*(pgrep\b[^()]*)\)|`\s*(pgrep\b[^`]*)`")


def segments(command):
    """Yield (tokens, operator that follows them)."""
    lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|()\n")
    lexer.whitespace_split = True
    seg = []
    for tok in lexer:
        if tok in OPERATORS:
            if seg:
                yield seg, tok
            seg = []
        else:
            seg.append(tok)
    if seg:
        yield seg, None


def base(tok):
    return os.path.basename(tok)


def pgrep(args):
    args = [a for a in args if not REDIRECT.match(a)]
    if any("$" in a or "`" in a for a in args):
        return None
    r = subprocess.run(["pgrep", "-l"] + args, capture_output=True, text=True, timeout=5)
    if r.returncode not in (0, 1):
        return None
    return [l for l in r.stdout.splitlines() if l.strip()]


def measure_killer(name, args):
    """Matched process lines for a pkill/killall invocation, or None when unmeasurable."""
    args = [a for a in args if not REDIRECT.match(a)]
    if any("$" in a or "`" in a for a in args):
        return None
    if name == "pkill":
        return pgrep([a for a in args if not SIGNAL.match(a)])
    names, regex, opts, i = [], False, [], 0
    while i < len(args):
        a = args[i]
        if a == "-m":
            regex = True
        elif a in ("-u", "-t", "-c", "-s"):
            if a in ("-u", "-t") and i + 1 < len(args):
                opts += [a, args[i + 1]]
            i += 1
        elif not a.startswith("-"):
            names.append(a)
        i += 1
    if not names:
        # killall -u user (no names) signals every process of that user.
        return pgrep(opts + ["."]) if opts else None
    found = []
    for n in names:
        r = pgrep(opts + ([n] if regex else ["-x", n]))
        if r is None:
            return None
        found += r
    return found


def scan(command, hits, depth=0):
    if depth > 3:
        return
    try:
        segs = list(segments(command))
    except ValueError:
        return
    for i, (seg, op) in enumerate(segs):
        for j, tok in enumerate(seg):
            b = base(tok)
            if b in REMOTE:
                break
            if b in SHELLS and j + 2 < len(seg) and seg[j + 1] == "-c":
                scan(seg[j + 2], hits, depth + 1)
                break
            if b in KILLERS:
                hits.append((" ".join(seg[j:]), measure_killer(b, seg[j + 1:])))
                break
            if b == "pgrep" and op == "|":
                later = [t for s, _ in segs[i + 1:] for t in s]
                if "kill" in map(base, later):
                    hits.append((" ".join(seg[j:]) + " | … kill", pgrep(seg[j + 1:])))
                break


def scan_substitutions(command, hits):
    if not re.search(r"\bkill\b", command):
        return
    for m in SUBST.finditer(command):
        inner = m.group(1) or m.group(2)
        try:
            toks = shlex.split(inner)
        except ValueError:
            continue
        hits.append(("kill … $(" + inner.strip() + ")", pgrep(toks[1:])))


def main():
    if sys.platform != "darwin":
        return
    data = json.load(sys.stdin)
    command = (data.get("tool_input") or {}).get("command") or ""
    if not re.search(r"kill", command):
        return
    hits = []
    scan(command, hits)
    scan_substitutions(command, hits)
    broad = [(c, m) for c, m in hits if m is not None and len(m) > LIMIT]
    if not broad:
        return
    lines = [
        f"`{c}` would signal {len(m)} processes, e.g.: " + ", ".join(x.split(" ", 1)[-1][:40] for x in m[:8])
        for c, m in broad
    ]
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "ask",
        "permissionDecisionReason": f"Process kill matches more than {LIMIT} processes. " + " | ".join(lines),
    }}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
