#!/usr/bin/env python3
"""List the Tavily search/extract evidence a goal-research run's own tool record holds.

Usage:
  tavily_evidence.py claude <agent-<id>.jsonl> [--also <record>]...
  tavily_evidence.py codex  <rollout-*.jsonl>  [--also <record>]...

Follows the records the run spawned (Claude: `agent-<id>.meta.json` naming `parentAgentId`;
codex: first-line `thread_spawn.parent_thread_id`), recursively. `--also` adds an earlier
thread's record of the same runner kind. Prints JSON:

  records    each record found: `file`, `runner`, and its `agent` or `thread`
  calls      each decoded Tavily call: `file`, `line`, `tool`, `requested`, `error`, `results`
             (`url`, `title`, `content_chars`), `failed_results`, `persisted` where the payload was
             saved apart; codex calls also carry `pass`
  undecoded  each Tavily payload or record line it could not decode: `file`, `line`, `reason`,
             `chars`, and `urls_status_unknown` — URLs found in the raw text, neither retrieved
             nor failed as far as the script can tell; an undecoded Tavily payload also carries
             its call's fields
  unread     each record, metadata file, saved payload or folder it could not open or list,
             as `path` and `error`

A file or folder the script cannot read lands in `unread`; a line or header it cannot parse
lands in `undecoded`. Exits non-zero when `unread` is not empty.
"""
import json
import os
import re
import sys

TAVILY_TOOLS = {"tavily_search", "tavily-search", "tavily_extract", "tavily-extract"}
SECRET_KEY = re.compile(r"(api[_-]?key|token|secret|authorization|password)", re.I)
URL_IN_RAW = re.compile(r'"url\\*"\s*:\s*\\*"(https?://[^"\\]+)')
PERSISTED = re.compile(r"(/[^\s\"'\\]+/tool-results/[^\s\"'\\]+)")


def tool_name(name):
    tail = str(name or "").rsplit("__", 1)[-1]
    return tail if tail in TAVILY_TOOLS else None


def scrub(value):
    if isinstance(value, dict):
        return {k: ("<redacted>" if SECRET_KEY.search(k) else scrub(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub(v) for v in value]
    return value


def requested(args):
    args = args if isinstance(args, dict) else {}
    out = {}
    for key in ("urls", "query"):
        if key in args:
            out[key] = args[key]
    return scrub(out)


def decode(payload):
    """Return a dict holding `results`, or None."""
    if isinstance(payload, dict) and "results" in payload:
        return payload
    if isinstance(payload, str):
        try:
            return decode(json.loads(payload))
        except ValueError:
            return None
    if isinstance(payload, dict) and isinstance(payload.get("content"), list):
        for part in payload["content"]:
            found = decode(part.get("text") if isinstance(part, dict) else None)
            if found:
                return found
    if isinstance(payload, list):
        for part in payload:
            found = decode(part.get("text") if isinstance(part, dict) else part)
            if found:
                return found
    return None


def summarize(decoded):
    results = []
    for r in decoded.get("results") or []:
        if isinstance(r, dict):
            body = r.get("raw_content") or r.get("content") or ""
            results.append({"url": r.get("url"), "title": r.get("title"),
                            "content_chars": len(body) if isinstance(body, str) else None})
    failed = decoded.get("failed_results") or []
    return results, scrub(failed)


def raw_text(payload):
    return payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)


def unread(out, path, error):
    entry = {"path": path, "error": str(error)}
    if entry not in out["unread"]:
        out["unread"].append(entry)


def undecoded(out, file, line, reason, text):
    if any(u.get("file") == file and u.get("line") == line for u in out["undecoded"]):
        return
    out["undecoded"].append({"file": file, "line": line, "reason": reason, "chars": len(text),
                             "urls_status_unknown": sorted(set(URL_IN_RAW.findall(text)))})


def add_call(out, file, line, pass_no, tool, args, error, payload):
    base = {"file": file, "line": line, "tool": tool, "requested": requested(args), "error": error}
    if pass_no is not None:
        base["pass"] = pass_no
    decoded = decode(payload)
    if decoded is None:
        text = raw_text(payload)
        persisted = PERSISTED.search(text)
        if persisted:
            base["persisted"] = persisted.group(1)
            try:
                with open(persisted.group(1), encoding="utf-8", errors="replace") as fh:
                    payload = fh.read()
            except OSError as err:
                unread(out, persisted.group(1), err)
            else:
                decoded = decode(payload)
    if decoded is None:
        text = raw_text(payload)
        out["undecoded"].append(dict(base, reason="Tavily payload not decoded", chars=len(text),
                                     urls_status_unknown=sorted(set(URL_IN_RAW.findall(text)))))
        return
    results, failed = summarize(decoded)
    out["calls"].append(dict(base, results=results, failed_results=failed))


def record_lines(path, out):
    """Yield (line_no, line) of a record; an unreadable record lands in `unread`."""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for line_no, line in enumerate(fh, 1):
                yield line_no, line
    except OSError as err:
        unread(out, path, err)


def read_claude(path, out, seen):
    if path in seen:
        return
    seen.add(path)
    if not os.path.isfile(path):
        unread(out, path, "no such record file")
        return
    agent = os.path.basename(path)[len("agent-"):-len(".jsonl")]
    out["records"].append({"file": path, "runner": "claude", "agent": agent})
    uses = {}
    for line_no, line in record_lines(path, out):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except ValueError:
            undecoded(out, path, line_no, "record line is not JSON", line)
            continue
        message = entry.get("message") if isinstance(entry, dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "tool_use":
                uses[part.get("id")] = (part.get("name", ""), part.get("input"))
            elif part.get("type") == "tool_result" and isinstance(part.get("tool_use_id"), str) \
                    and part["tool_use_id"] in uses:
                name, args = uses[part["tool_use_id"]]
                tool = tool_name(name)
                if tool:
                    add_call(out, path, line_no, None, tool, args,
                             bool(part.get("is_error")), part.get("content"))
    folder = os.path.dirname(path)
    try:
        metas = sorted(os.listdir(folder))
    except OSError as err:
        unread(out, folder, err)
        return
    for meta in metas:
        if meta.endswith(".meta.json"):
            meta_path = os.path.join(folder, meta)
            try:
                with open(meta_path, encoding="utf-8", errors="replace") as fh:
                    text = fh.read()
            except OSError as err:
                unread(out, meta_path, err)
                continue
            try:
                loaded = json.loads(text)
            except ValueError:
                undecoded(out, meta_path, 1, "agent metadata is not JSON", text)
                continue
            parent = loaded.get("parentAgentId") if isinstance(loaded, dict) else None
            if parent == agent:
                read_claude(os.path.join(folder, meta[:-len(".meta.json")] + ".jsonl"), out, seen)


def codex_header(path, out):
    """The rollout's first-line payload, or None; an unreadable file lands in `unread` and an
    unparseable header in `undecoded`."""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            line = fh.readline()
    except OSError as err:
        unread(out, path, err)
        return None
    try:
        first = json.loads(line)
    except ValueError:
        undecoded(out, path, 1, "rollout header is not JSON", line)
        return None
    payload = first.get("payload") if isinstance(first, dict) else None
    return payload if isinstance(payload, dict) else {}


def codex_children(sessions, out):
    """Map each parent thread id to the rollouts naming it in their header."""
    children = {}
    for root, _, files in os.walk(sessions, onerror=lambda err: unread(out, err.filename or sessions, err)):
        for name in sorted(files):
            if name.startswith("rollout-") and name.endswith(".jsonl"):
                child = os.path.join(root, name)
                head = codex_header(child, out)
                source = head.get("source") if isinstance(head, dict) else None
                sub = source.get("subagent") if isinstance(source, dict) else None
                spawn = sub.get("thread_spawn") if isinstance(sub, dict) else None
                if isinstance(spawn, dict) and spawn.get("parent_thread_id"):
                    children.setdefault(spawn["parent_thread_id"], []).append(child)
    return children


def read_codex(path, out, seen, children):
    if path in seen:
        return
    seen.add(path)
    if not os.path.isfile(path):
        unread(out, path, "no such record file")
        return
    meta = codex_header(path, out) or {}
    thread = meta.get("id") or os.path.basename(path)[-len("00000000-0000-0000-0000-000000000000.jsonl"):-6]
    out["records"].append({"file": path, "runner": "codex", "thread": thread})
    turns = []
    for line_no, line in record_lines(path, out):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except ValueError:
            undecoded(out, path, line_no, "record line is not JSON", line)
            continue
        payload = entry.get("payload") if isinstance(entry, dict) else None
        turn = payload.get("turn_id") if isinstance(payload, dict) else None
        if turn and turn not in turns:
            turns.append(turn)
        item = payload.get("item") if isinstance(payload, dict) else None
        if not (isinstance(item, dict) and item.get("type") == "McpToolCall"
                and payload.get("type") == "item_completed"):
            continue
        tool = tool_name(item.get("tool"))
        if not tool:
            continue
        result = item.get("result")
        result = result if isinstance(result, dict) else {}
        error = bool(item.get("error")) or bool(result.get("isError")) or item.get("status") != "completed"
        structured = result.get("structuredContent")
        add_call(out, path, line_no, turns.index(turn) if turn in turns else None, tool,
                 item.get("arguments"), error,
                 structured if isinstance(structured, dict) and "results" in structured
                 else result.get("content"))
    for child in children.get(thread, []):
        read_codex(child, out, seen, children)


def main(argv):
    if len(argv) < 3 or argv[1] not in ("claude", "codex"):
        sys.exit(__doc__)
    kind, records = argv[1], [argv[2]]
    rest = argv[3:]
    while rest:
        if rest[0] == "--also" and len(rest) > 1:
            records.append(rest[1])
            rest = rest[2:]
        else:
            sys.exit(__doc__)
    out = {"records": [], "calls": [], "undecoded": [], "unread": []}
    seen = set()
    if kind == "codex":
        sessions = os.path.join(os.environ.get("CODEX_HOME") or os.path.expanduser("~/.codex"), "sessions")
        children = codex_children(sessions, out)
    for record in records:
        if kind == "claude":
            read_claude(os.path.abspath(record), out, seen)
        else:
            read_codex(os.path.abspath(record), out, seen, children)
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write("\n")
    if out["unread"]:
        sys.exit(2)


if __name__ == "__main__":
    main(sys.argv)
