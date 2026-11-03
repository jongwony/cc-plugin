#!/usr/bin/env python3
"""List the Tavily search/extract evidence a goal-research run's own tool record holds.

Usage:
  tavily_evidence.py claude <agent-<id>.jsonl> [--also <record>]...
  tavily_evidence.py codex  <rollout-*.jsonl>  [--also <record>]...

Follows the records the run spawned (Claude: `agent-<id>.meta.json` naming `parentAgentId`;
codex: first-line `thread_spawn.parent_thread_id`), recursively. `--also` adds an earlier
thread's record of the same runner kind. Prints JSON: `records`, `calls`, `undecoded`.
"""
import json
import os
import re
import sys

TAVILY_TOOLS = {"tavily_search", "tavily-search", "tavily_extract", "tavily-extract"}
SECRET_KEY = re.compile(r"(api[_-]?key|token|secret|authorization|password)", re.I)
URL_IN_RAW = re.compile(r'"url\\*"\s*:\s*\\*"(https?://[^"\\]+)')
PERSISTED = re.compile(r"(/\S+/tool-results/\S+?)(?=[\s\"']|$)")


def tool_name(name):
    tail = name.rsplit("__", 1)[-1]
    return tail if tail in TAVILY_TOOLS else None


def scrub(value):
    if isinstance(value, dict):
        return {k: ("<redacted>" if SECRET_KEY.search(k) else scrub(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [scrub(v) for v in value]
    return value


def requested(args):
    args = args or {}
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


def add_call(out, file, line, pass_no, tool, args, error, payload):
    base = {"file": file, "line": line, "pass": pass_no, "tool": tool,
            "requested": requested(args), "error": error}
    decoded = decode(payload)
    if decoded is None:
        text = raw_text(payload)
        persisted = PERSISTED.search(text)
        if persisted and os.path.isfile(persisted.group(1)):
            with open(persisted.group(1), encoding="utf-8", errors="replace") as fh:
                payload = fh.read()
            decoded = decode(payload)
            base["persisted"] = persisted.group(1)
    if decoded is None:
        text = raw_text(payload)
        out["undecoded"].append(dict(base, chars=len(text),
                                     urls_seen_in_raw=sorted(set(URL_IN_RAW.findall(text)))))
        return
    results, failed = summarize(decoded)
    out["calls"].append(dict(base, results=results, failed_results=failed))


def read_claude(path, out, seen):
    if path in seen:
        return
    if not os.path.isfile(path):
        out["unread"].append(path)
        return
    seen.add(path)
    agent = os.path.basename(path)[len("agent-"):-len(".jsonl")]
    out["records"].append({"file": path, "runner": "claude", "agent": agent})
    uses, pass_no = {}, -1
    with open(path, encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            content = (entry.get("message") or {}).get("content")
            if entry.get("type") == "user" and not entry.get("isMeta") and (isinstance(content, str) or (
                    isinstance(content, list) and any(c.get("type") == "text" for c in content))):
                pass_no += 1
            if not isinstance(content, list):
                continue
            for part in content:
                if part.get("type") == "tool_use":
                    uses[part.get("id")] = (part.get("name", ""), part.get("input"))
                elif part.get("type") == "tool_result" and part.get("tool_use_id") in uses:
                    name, args = uses[part["tool_use_id"]]
                    tool = tool_name(name)
                    if tool:
                        add_call(out, path, line_no, max(pass_no, 0), tool, args,
                                 bool(part.get("is_error")), part.get("content"))
    folder = os.path.dirname(path)
    for meta in sorted(os.listdir(folder)):
        if meta.endswith(".meta.json"):
            try:
                with open(os.path.join(folder, meta), encoding="utf-8") as fh:
                    parent = json.load(fh).get("parentAgentId")
            except (OSError, ValueError):
                continue
            if parent == agent:
                read_claude(os.path.join(folder, meta[:-len(".meta.json")] + ".jsonl"), out, seen)


def codex_first_line(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.loads(fh.readline())
    except (OSError, ValueError):
        return {}


def read_codex(path, out, seen, sessions):
    if path in seen:
        return
    if not os.path.isfile(path):
        out["unread"].append(path)
        return
    seen.add(path)
    meta = codex_first_line(path).get("payload") or {}
    thread = meta.get("id") or os.path.basename(path)[-len("00000000-0000-0000-0000-000000000000.jsonl"):-6]
    out["records"].append({"file": path, "runner": "codex", "thread": thread})
    turns = []
    with open(path, encoding="utf-8") as fh:
        for line_no, line in enumerate(fh, 1):
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            payload = entry.get("payload") or {}
            turn = payload.get("turn_id") if isinstance(payload, dict) else None
            if turn and turn not in turns:
                turns.append(turn)
            item = payload.get("item") if isinstance(payload, dict) else None
            if not (isinstance(item, dict) and item.get("type") == "McpToolCall"
                    and payload.get("type") == "item_completed"):
                continue
            tool = tool_name(item.get("tool", ""))
            if not tool:
                continue
            result = item.get("result") or {}
            error = bool(item.get("error")) or bool(result.get("isError")) or item.get("status") != "completed"
            structured = result.get("structuredContent")
            add_call(out, path, line_no, turns.index(turn) if turn in turns else None, tool,
                     item.get("arguments"), error,
                     structured if isinstance(structured, dict) and "results" in structured
                     else result.get("content"))
    for root, _, files in os.walk(sessions):
        for name in files:
            if name.startswith("rollout-") and name.endswith(".jsonl"):
                child = os.path.join(root, name)
                source = ((codex_first_line(child).get("payload") or {}).get("source") or {})
                sub = source.get("subagent") if isinstance(source, dict) else None
                spawn = sub.get("thread_spawn") if isinstance(sub, dict) else None
                if isinstance(spawn, dict) and spawn.get("parent_thread_id") == thread:
                    read_codex(child, out, seen, sessions)


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
    sessions = os.path.join(os.environ.get("CODEX_HOME") or os.path.expanduser("~/.codex"), "sessions")
    for record in records:
        if kind == "claude":
            read_claude(os.path.abspath(record), out, seen)
        else:
            read_codex(os.path.abspath(record), out, seen, sessions)
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main(sys.argv)
