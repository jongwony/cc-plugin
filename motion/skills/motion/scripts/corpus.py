#!/usr/bin/env python3
"""Read the awesome-opus5-5-videos corpus live and report on it.

  corpus.py examples [--category motion] [--limit 6] [--tag svg]
      Recognition material: who made each video, where to watch it, its poster;
      without --category, a few of every kind.
      Prompt text is never printed.
  corpus.py axes
      First line: the current kinds (categories), from every row. Then, per
      axis: share of non-partial prompts that mention it, overall and per
      category, plus the spread across categories, which informs the slow/fast split.
      Axes and their patterns: references/axes.json.

Stdlib only. The corpus is fetched on every run; nothing is cached.
"""
import argparse
import collections
import http.client
import json
import re
import sys
import urllib.request
from pathlib import Path

CORPUS_URL = (
    "https://raw.githubusercontent.com/yihui-dev/awesome-opus5-5-videos/main/data/videos.json"
)

# Each axis is a decision a prompt can fix, keyed by its name in SKILL.md or
# references/fast-axes.md; its pattern detects that a prompt mentions it, not that
# the decision was made.
SKILL_DIR = Path(__file__).resolve().parent.parent
AXES = json.loads((SKILL_DIR / "references" / "axes.json").read_text())


def warn_unnamed_axes():
    """An axes.json key no longer named in bold in SKILL.md or fast-axes.md measures a decision the skill dropped."""
    names = set()
    for f in (SKILL_DIR / "SKILL.md", SKILL_DIR / "references" / "fast-axes.md"):
        names |= set(re.findall(r"\*\*(.+?)\*\*", f.read_text()))
    for k in AXES:
        if k not in names:
            print(f"warning: axes.json key {k!r} is not a decision named in SKILL.md or fast-axes.md", file=sys.stderr)


def load():
    try:
        with urllib.request.urlopen(CORPUS_URL, timeout=60) as r:
            v = json.load(r)
    except (OSError, ValueError, http.client.HTTPException) as e:
        sys.exit(f"corpus unreachable ({e}); proceed from the person's own words")
    # Third-party schema: rows missing the fields every command needs are skipped.
    return [x for x in v if isinstance(x, dict) and isinstance(x.get("category"), str)]


def cmd_examples(v, a):
    rows = [x for x in v if a.category in (None, x["category"])]
    if a.tag:
        rows = [x for x in rows if a.tag in (x.get("tech_tags") or [])]
    if not rows:
        cats = sorted({x["category"] for x in v})
        sys.exit(f"no entries for category={a.category!r} tag={a.tag!r}; categories: {', '.join(cats)}")
    rows.sort(key=lambda x: x.get("added") or "", reverse=True)
    # Without --category, the newest few of every kind, so a newcomer can point at a kind.
    kinds = [a.category] if a.category else sorted({x["category"] for x in rows})
    for k in kinds:
        print(f"{k}:")
        for x in [x for x in rows if x["category"] == k][: a.limit]:
            print(f"- @{x.get('author', '?')} [{', '.join(x.get('tech_tags') or [])}]")
            for label, key in (("watch", "skillry_url"), ("original post", "post_url"), ("poster", "poster_url")):
                if x.get(key):
                    print(f"  {label}: {x[key]}")


def cmd_axes(v, _a):
    warn_unnamed_axes()
    print("kinds:", ", ".join(sorted({x["category"] for x in v})))
    full = [x for x in v if isinstance(x.get("prompt"), str) and not x.get("prompt_partial")]
    if not full:
        sys.exit("no complete prompts in the corpus")
    cats = sorted({x["category"] for x in full})
    groups = {"ALL": full, **{c: [x for x in full if x["category"] == c] for c in cats}}
    print("n (non-partial):", {k: len(g) for k, g in groups.items()})
    width = max(map(len, AXES)) + 2
    head = "axis".ljust(width) + "".join(k[:11].rjust(12) for k in groups) + "   spread"
    print(head)
    out = []
    for ax, pat in AXES.items():
        rate = {
            k: sum(bool(re.search(pat, x["prompt"], re.I)) for x in g) / len(g)
            for k, g in groups.items()
        }
        per_cat = [rate[c] for c in cats]
        out.append((max(per_cat) - min(per_cat), ax, rate))
    for spread, ax, rate in sorted(out):
        cells = "".join(f"{rate[k] * 100:11.0f}%" for k in groups)
        print(ax.ljust(width) + cells + f"   {spread * 100:6.0f}")
    print("tech_tags by category:")
    for c in cats:
        tags = collections.Counter(t for x in groups[c] for t in x.get("tech_tags") or [])
        print(f"  {c}: " + ", ".join(f"{t} {n}" for t, n in tags.most_common(6)))


def positive(s):
    n = int(s)
    if n < 1:
        raise argparse.ArgumentTypeError("must be at least 1")
    return n


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("examples")
    e.add_argument("--category")
    e.add_argument("--tag")
    e.add_argument("--limit", type=positive, default=None)
    sub.add_parser("axes")
    a = p.parse_args()
    if a.cmd == "examples" and a.limit is None:
        a.limit = 6 if a.category else 2
    v = load()
    {"examples": cmd_examples, "axes": cmd_axes}[a.cmd](v, a)


if __name__ == "__main__":
    main()
