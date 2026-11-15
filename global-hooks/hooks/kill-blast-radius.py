#!/usr/bin/env python3
"""PreToolUse(Bash) hook: an auxiliary warning before a process kill that looks broad.

It asks when the processes it observes, before the command runs, as matching the command's
kills number more than LIMIT. It reads the command with a small shell lexer (quotes,
substitutions, redirections, heredocs, newlines) and looks only at words in command position:
pkill/killall, also behind wrappers (sudo, env, timeout, xargs, nohup, ...) and inside
`bash|sh|zsh -c`, `eval` and `$(...)`; kill fed by pgrep (`pgrep … | xargs kill`,
`pgrep … | while read p; do kill $p; done`, `kill $(pgrep …)`). Each kill's selection is
re-run as `pgrep -l` with its selection options and patterns in their order (a leading signal
and -I dropped), so macOS argument quirks such as `pkill -f "cat" -n`, where -n becomes a second
pattern, are observed as they would select. The count is the union of PIDs across the command.

It is not a guarantee. It makes no decision (the normal permission flow applies) for a command
it cannot measure: a pattern or command from a variable, a kill fed by any other pipeline, a
remote ssh command, a syntax it cannot lex. Processes can start or exit between its observation
and the kill. Outside macOS it makes no decision at all: the observation is calibrated to macOS
pgrep, and cloud sessions run in a sandbox.
"""
import json
import os
import re
import subprocess
import sys

LIMIT = 10
SIGNALS = set(
    "HUP INT QUIT ILL TRAP ABRT EMT FPE KILL BUS SEGV SYS PIPE ALRM TERM URG STOP TSTP CONT "
    "CHLD TTIN TTOU IO XCPU XFSZ VTALRM PROF WINCH INFO USR1 USR2".split()
)
SHELLS = {"bash", "sh", "zsh", "dash", "ksh"}
RESERVED = {"do", "then", "else", "elif", "if", "while", "until", "!", "{", "}"}
# Wrappers that run the command that follows them, with the options of theirs that take a value.
WRAPPERS = {
    "sudo": {"-u", "-g", "-h", "-p", "-C", "-D", "-r", "-t", "-U", "-T", "-R"},
    "doas": {"-u", "-C"},
    "env": {"-u", "-P", "-S", "-C"},
    "nice": {"-n"},
    "nohup": set(),
    "time": set(),
    "command": set(),
    "builtin": set(),
    "exec": {"-a"},
    "timeout": {"-s", "-k", "--signal", "--kill-after"},
    "gtimeout": {"-s", "-k", "--signal", "--kill-after"},
    "xargs": {"-I", "-J", "-L", "-n", "-P", "-s", "-E", "-R", "-S", "-a", "-d"},
    "caffeinate": {"-t", "-w"},
    "stdbuf": {"-i", "-o", "-e"},
}
# pgrep/pkill options whose value follows the letter (macOS pkill(1)).
ARG_LETTERS = set("FGPUdgtu")
ASSIGN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*\+?=")
REDIRECTS = ("&>>", "&>", "<<<", "<<-", "<<", ">>", ">&", "<&", ">|", "<>", ">", "<")
OPERATORS = ("&&", "||", "|&", ";;", ";", "&", "|", "(", ")")


# --- lexing ------------------------------------------------------------------------------

def match_paren(s, j):
    """Index of the ")" closing the "(" just before s[j]."""
    depth = 1
    while j < len(s):
        ch = s[j]
        if ch == "\\":
            j += 2
            continue
        if ch == "'":
            e = s.find("'", j + 1)
            if e < 0:
                raise ValueError("unterminated quote")
            j = e + 1
            continue
        if ch == '"':
            j = skip_dquote(s, j + 1)
            continue
        if ch == "`":
            j = match_backtick(s, j + 1) + 1
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return j
        j += 1
    raise ValueError("unbalanced parenthesis")


def skip_dquote(s, j):
    """Index just past the '"' closing a double-quoted string whose body starts at s[j]."""
    while j < len(s):
        ch = s[j]
        if ch == "\\":
            j += 2
            continue
        if ch == '"':
            return j + 1
        if s.startswith("$(", j):
            j = match_paren(s, j + 2) + 1
            continue
        if ch == "`":
            j = match_backtick(s, j + 1) + 1
            continue
        j += 1
    raise ValueError("unterminated quote")


def match_backtick(s, j):
    while j < len(s):
        if s[j] == "\\":
            j += 2
            continue
        if s[j] == "`":
            return j
        j += 1
    raise ValueError("unterminated backtick")


class Word:
    def __init__(self):
        self.text = ""        # the word with quotes removed; expansions kept as written
        self.expands = False  # holds a parameter, command or arithmetic expansion
        self.quoted = False
        self.subs = []        # command substitutions the shell would run


class Lexer:
    def __init__(self, s):
        self.s = s
        self.i = 0
        self.tokens = []
        self.pending = []  # heredocs whose body starts after the next newline
        self.ops = 0

    def run(self):
        s = self.s
        while self.i < len(s):
            c = s[self.i]
            if c in " \t\r":
                self.i += 1
            elif s.startswith("\\\n", self.i):
                self.i += 2
            elif c == "\n":
                self.i += 1
                self.read_heredocs()
                self.op("\n")
            elif c == "#":
                while self.i < len(s) and s[self.i] != "\n":
                    self.i += 1
            elif c in "<>" and s.startswith("(", self.i + 1):
                end = match_paren(s, self.i + 2)
                w = Word()
                w.expands = True
                w.subs.append(s[self.i + 2:end])
                self.i = end + 1
                self.tokens.append(("word", w))
            elif self.redirect():
                pass
            else:
                for op in OPERATORS:
                    if s.startswith(op, self.i):
                        self.i += len(op)
                        self.op(";" if op == ";;" else op)
                        break
                else:
                    self.tokens.append(("word", self.word()))
        return self.tokens

    def op(self, op):
        self.tokens.append(("op", op))
        self.ops += 1

    def redirect(self):
        s, j = self.s, self.i
        while j < len(s) and s[j].isdigit():
            j += 1
        for op in REDIRECTS:
            if s.startswith(op, j):
                if j > self.i and op.startswith("&"):
                    return False
                break
        else:
            return False
        self.i = j + len(op)
        while self.i < len(s) and s[self.i] in " \t":
            self.i += 1
        target = self.word()
        if op in ("<<", "<<-"):
            self.pending.append((target.text, op == "<<-", target.quoted, self.ops))
        else:
            self.tokens.append(("redir", target))
        return True

    def read_heredocs(self):
        s = self.s
        for delim, strip, quoted, seg in self.pending:
            lines = []
            while self.i < len(s):
                e = s.find("\n", self.i)
                line = s[self.i:] if e < 0 else s[self.i:e]
                self.i = len(s) if e < 0 else e + 1
                if (line.lstrip("\t") if strip else line) == delim:
                    break
                lines.append(line)
            self.tokens.append(("heredoc", seg, "\n".join(lines), quoted))
        self.pending = []

    def word(self):
        s, w, buf = self.s, Word(), []
        while self.i < len(s):
            c = s[self.i]
            if c in " \t\r\n;&|()<>":
                break
            if c == "\\":
                if s.startswith("\\\n", self.i):
                    self.i += 2
                    continue
                buf.append(s[self.i + 1:self.i + 2])
                w.quoted = True
                self.i += 2
                continue
            if c == "'":
                e = s.find("'", self.i + 1)
                if e < 0:
                    raise ValueError("unterminated quote")
                buf.append(s[self.i + 1:e])
                w.quoted = True
                self.i = e + 1
                continue
            if c == '"':
                self.i += 1
                w.quoted = True
                self.dquote(w, buf)
                continue
            if s.startswith("$'", self.i):
                j = self.i + 2
                while j < len(s) and s[j] != "'":
                    j += 2 if s[j] == "\\" else 1
                if j >= len(s):
                    raise ValueError("unterminated quote")
                buf.append(s[self.i:j + 1])
                w.expands = w.quoted = True
                self.i = j + 1
                continue
            if c in "$`" and self.dollar(w, buf):
                continue
            buf.append(c)
            self.i += 1
        w.text = "".join(buf)
        return w

    def dquote(self, w, buf):
        s = self.s
        while self.i < len(s):
            c = s[self.i]
            if c == '"':
                self.i += 1
                return
            if c == "\\":
                nx = s[self.i + 1:self.i + 2]
                if nx in ("$", "`", '"', "\\"):
                    buf.append(nx)
                    self.i += 2
                    continue
                if nx == "\n":
                    self.i += 2
                    continue
            if c in "$`" and self.dollar(w, buf):
                continue
            buf.append(c)
            self.i += 1
        raise ValueError("unterminated quote")

    def dollar(self, w, buf):
        """Consume an expansion at self.i; False when the "$" is literal."""
        s, i = self.s, self.i
        if s[i] == "`":
            end = match_backtick(s, i + 1)
            inner = s[i + 1:end].replace("\\`", "`").replace("\\$", "$").replace("\\\\", "\\")
            w.subs.append(inner)
        elif s.startswith("$(", i):
            end = match_paren(s, i + 2)
            if not s.startswith("$((", i):
                w.subs.append(s[i + 2:end])
        elif s.startswith("${", i):
            end = s.find("}", i + 2)
            if end < 0:
                raise ValueError("unterminated parameter")
        else:
            nx = s[i + 1:i + 2]
            if not nx or not (nx.isalnum() or nx in "_@*#?$!-"):
                return False
            end = i + 1
            if nx.isalpha() or nx == "_":
                while end + 1 < len(s) and (s[end + 1].isalnum() or s[end + 1] == "_"):
                    end += 1
        buf.append(s[i:end + 1])
        w.expands = True
        self.i = end + 1
        return True


def expansions(text):
    """Command substitutions in text, expanded as inside double quotes (a heredoc body)."""
    lx, w, buf = Lexer(text), Word(), []
    while lx.i < len(text):
        if text[lx.i] == "\\":
            lx.i += 2
        elif not (text[lx.i] in "$`" and lx.dollar(w, buf)):
            lx.i += 1
    return w.subs


class Segment:
    def __init__(self):
        self.words, self.redirs, self.heredocs, self.op = [], [], [], None


def segments(command):
    segs = [Segment()]
    heredocs = []
    for tok in Lexer(command).run():
        if tok[0] == "op":
            segs[-1].op = tok[1]
            segs.append(Segment())
        elif tok[0] == "word":
            segs[-1].words.append(tok[1])
        elif tok[0] == "redir":
            segs[-1].redirs.append(tok[1])
        else:
            heredocs.append(tok[1:])
    for seg, body, quoted in heredocs:
        segs[seg].heredocs.append((body, quoted))
    return segs


# --- reading a segment -------------------------------------------------------------------

def base(text):
    return os.path.basename(text)


def command_of(words):
    """(index of the word the shell runs as the command, wrappers passed on the way)."""
    i, via = 0, []
    while i < len(words):
        t = words[i].text
        if ASSIGN.match(t):
            i += 1
            continue
        if words[i].expands:
            return None, via
        if t in RESERVED:
            i += 1
            continue
        b = base(t)
        if b not in WRAPPERS:
            return i, via
        via.append(b)
        i += 1
        while i < len(words) and words[i].text.startswith("-") and words[i].text != "-":
            o = words[i].text
            i += 1
            if o == "--":
                break
            if b == "command" and o in ("-v", "-V"):
                return None, via
            if o in WRAPPERS[b]:
                i += 1
        if b in ("timeout", "gtimeout"):
            i += 1
    return None, via


def shell_string(args):
    """(the -c string word or None, whether the shell reads its commands from stdin)."""
    i, has_c = 0, False
    while i < len(args):
        t = args[i].text
        if t == "--":
            i += 1
            break
        if t in ("-o", "+o", "-O", "+O"):
            i += 2
            continue
        if len(t) > 1 and t[0] in "-+":
            has_c = has_c or (t[0] == "-" and not t.startswith("--") and "c" in t[1:])
            i += 1
            continue
        break
    if has_c:
        return (args[i] if i < len(args) else None), False
    return None, i >= len(args)


def selection(toks, drop):
    """pgrep arguments selecting what toks select: options in order, then the patterns."""
    out, i = [], 0
    while i < len(toks):
        t = toks[i]
        if t == "--" or not (t.startswith("-") and len(t) > 1):
            return out + toks[i:]  # getopt stops at the first operand: the rest are patterns
        j = 1
        while j < len(t):
            ch = t[j]
            if ch in ARG_LETTERS:
                val = t[j + 1:]
                if not val:
                    i += 1
                    if i >= len(toks):
                        return None
                    val = toks[i]
                if ch != "d":  # an output delimiter selects nothing
                    out += ["-" + ch, val]
                break
            if ch not in drop:
                out.append("-" + ch)
            j += 1
        i += 1
    return out


def is_signal(t):
    if not (t.startswith("-") and len(t) > 1):
        return False
    name = t[1:].upper()
    return name.isdigit() or name in SIGNALS or (name.startswith("SIG") and name[3:] in SIGNALS)


def observe(args):
    """{pid: description} that `pgrep -l args` reports, or None when pgrep fails."""
    r = subprocess.run(["pgrep", "-l"] + args, capture_output=True, text=True, timeout=5)
    if r.returncode not in (0, 1):
        return None
    found = {}
    for line in r.stdout.splitlines():
        parts = line.split(None, 1)
        if parts and parts[0].isdigit():
            found[parts[0]] = parts[1] if len(parts) > 1 else ""
    return found


def measure_pkill(args):
    if any(w.expands for w in args):
        return None
    toks = [w.text for w in args]
    if toks and is_signal(toks[0]):
        toks = toks[1:]  # pkill reads a signal only as its first argument
    sel = selection(toks, drop={"I"})  # -I (confirm) is pkill's alone
    return None if sel is None else observe(sel)


def measure_pgrep(args):
    if any(w.expands for w in args):
        return None
    sel = selection([w.text for w in args], drop={"q"})
    return None if sel is None else observe(sel)


def measure_killall(args):
    if any(w.expands for w in args):
        return None
    toks = [w.text for w in args]
    regex, effective, users, ttys, only, i = False, "-e" in toks, [], [], None, 0
    while i < len(toks) and toks[i].startswith("-") and len(toks[i]) > 1:
        a = toks[i]
        if a in ("-d", "-s", "-l", "-help"):
            return {}  # lists or reports; signals nothing
        if a == "-m":
            regex = True
        elif a in ("-u", "-t", "-c"):
            i += 1
            if i >= len(toks):
                return None
            if a == "-u":
                users.append(toks[i])
            elif a == "-t":
                ttys.append(toks[i])
            else:
                only = toks[i]
        elif a not in ("-v", "-q", "-z", "-I", "-e") and not is_signal(a):
            return None
        i += 1
    names = toks[i:]
    opts = [("-u" if effective else "-U"), users[0]] if users else []
    opts += ["-t", ttys[0]] if ttys else []
    if not names and only is None:
        # killall -u user with no name signals every process of that user.
        return observe(opts + ["."]) if opts else None
    found = {}
    for n in names or [only]:
        r = observe(opts + ([n] if regex else ["-x", n]))
        if r is None:
            return None
        found.update(r)
    if names and only is not None:
        keep = observe(opts + ["-x", only])
        if keep is None:
            return None
        found = {p: d for p, d in found.items() if p in keep}
    return found


def simple_pgrep(text):
    """The words after pgrep when text is one plain pgrep command, else None."""
    segs = [s for s in segments(text) if s.words]
    if len(segs) != 1 or segs[0].op not in (None, "\n"):
        return None
    ci, _ = command_of(segs[0].words)
    if ci is None or base(segs[0].words[ci].text) != "pgrep":
        return None
    return segs[0].words[ci + 1:]


def runs_kill(seg):
    ci, via = command_of(seg.words)
    return ci is not None and base(seg.words[ci].text) == "kill", via


def feeds_kill(segs, k):
    """segs[k] pipes into a kill that reads it: `| xargs kill`, `| while read …; do kill …; done`."""
    nxt = segs[k + 1] if k + 1 < len(segs) else None
    if nxt is None or not nxt.words:
        return False
    if nxt.words[0].text in ("while", "until"):
        depth = 0
        for seg in segs[k + 1:]:
            if not seg.words:
                continue
            first = seg.words[0].text
            if first in ("while", "until", "for", "select"):
                depth += 1
            if runs_kill(seg)[0]:
                return True
            if first == "done":
                depth -= 1
                if depth == 0:
                    return False
        return False
    kills, via = runs_kill(nxt)
    return kills and "xargs" in via


def describe(words):
    return " ".join(w.text for w in words)[:80]


def scan(command, hits, depth=0):
    if depth > 4:
        return
    segs = segments(command)
    for k, seg in enumerate(segs):
        for w in seg.words + seg.redirs:
            for sub in w.subs:
                scan(sub, hits, depth + 1)
        ci, _ = command_of(seg.words)
        from_stdin = False
        if ci is not None:
            name, args = base(seg.words[ci].text), seg.words[ci + 1:]
            if name in SHELLS:
                string, from_stdin = shell_string(args)
                if string is not None:
                    scan(string.text, hits, depth + 1)
            elif name == "eval":
                scan(" ".join(w.text for w in args), hits, depth + 1)
            elif name == "pkill":
                hits.append((describe(seg.words[ci:]), measure_pkill(args)))
            elif name == "killall":
                hits.append((describe(seg.words[ci:]), measure_killall(args)))
            elif name == "kill":
                for w in args:
                    for sub in w.subs:
                        inner = simple_pgrep(sub)
                        if inner is not None:
                            hits.append(("kill … $(" + sub.strip()[:60] + ")", measure_pgrep(inner)))
            elif name == "pgrep" and seg.op in ("|", "|&") and feeds_kill(segs, k):
                hits.append((describe(seg.words[ci:]) + " | … kill", measure_pgrep(args)))
        for body, quoted in seg.heredocs:
            if from_stdin:
                scan(body, hits, depth + 1)
            elif not quoted:
                for sub in expansions(body):
                    scan(sub, hits, depth + 1)


def decide(command):
    """The hook's output for a Bash command, or None for no decision."""
    if "kill" not in command:
        return None
    hits = []
    try:
        scan(command, hits)
    except ValueError:
        return None  # the shell would reject it too
    union = {}
    for _, found in hits:
        union.update(found or {})
    union.pop(str(os.getpid()), None)
    if len(union) <= LIMIT:
        return None
    parts = [
        f"`{c}` matched {len(m)}, e.g.: " + ", ".join(d[:40] for d in list(m.values())[:8])
        for c, m in hits if m
    ]
    return {"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "ask",
        "permissionDecisionReason": (
            f"Process kill: {len(union)} processes matched before it runs (limit {LIMIT}). "
            + " | ".join(parts)
        ),
    }}


def main():
    if sys.platform != "darwin":
        return
    data = json.load(sys.stdin)
    out = decide((data.get("tool_input") or {}).get("command") or "")
    if out:
        print(json.dumps(out))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
