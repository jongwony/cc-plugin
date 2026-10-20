#!/usr/bin/env python3
"""Read the awesome-opus5-5-videos corpus live and report on it.

  corpus.py examples --category motion [--limit 6] [--tag svg]
      Recognition material: who made each video, where to watch it, its poster.
      Prompt text is never printed.
  corpus.py axes
      Per axis: share of non-partial prompts that mention it, overall and per
      category, plus the spread across categories, which informs the slow/fast split.

Stdlib only. The corpus is fetched on every run; nothing is cached.
"""
import argparse
import collections
import json
import re
import sys
import urllib.request

CORPUS_URL = (
    "https://raw.githubusercontent.com/yihui-dev/awesome-opus5-5-videos/main/data/videos.json"
)

# Each axis is a decision a prompt can fix; the pattern detects that the prompt
# mentions it, not that the decision was made.
AXES = {
    "where_shown": r"\b\d{3,4}\s*[x×]\s*\d{3,4}\b|\b(16:9|9:16|1:1|4:5)\b|square|vertical|portrait|landscape|1080p|4k",
    "length": r"\b\d+\s*(s|sec|secs|seconds?|-second|min|minutes?)\b|\bseconds?\b",
    "story_order": r"scene|act \d|\bbeat|storyboard|timeline|sequence|intro|outro|ending|start(s)? with|→|->",
    "sound": r"audio|music|sound|\bsong\b|\bbpm\b|voice|narrat",
    "look": r"style|aesthetic|dribbble|cinematic|minimal|retro|brutalist|inspired by|look like"
    r"|colou?r|palette|black and white|monochrome|gradient|neon",
    "words_on_screen": r"font|typograph|typeface|\btext\b|title|caption|kinetic type",
    "smoothness": r"\b\d{2}\s*fps\b|frame rate",
    "loop": r"\bloop",
    "checking": r"verify|validate|screenshot|preview|fix anything|check (it|the|each|every)",
    "render_tech": r"canvas|svg|three\.?js|webgl|shader|glsl|gsap|\bcss\b|p5|d3",
    "interactivity": r"interactiv|playable|click|drag|hover|mouse|keyboard",
    "subject_narration": r"explain|visuali[sz]e|narrat|voice-?over|data|history|recipe",
    "motion_feel": r"spring|eas(e|ing)|physics|bounce|morph|particle",
}


def load():
    with urllib.request.urlopen(CORPUS_URL, timeout=60) as r:
        v = json.load(r)
    # Third-party schema: rows missing the fields every command needs are skipped.
    return [x for x in v if isinstance(x, dict) and isinstance(x.get("category"), str)]


def cmd_examples(v, a):
    rows = [x for x in v if x["category"] == a.category]
    if a.tag:
        rows = [x for x in rows if a.tag in (x.get("tech_tags") or [])]
    if not rows:
        cats = sorted({x["category"] for x in v})
        sys.exit(f"no entries for category={a.category!r} tag={a.tag!r}; categories: {', '.join(cats)}")
    rows.sort(key=lambda x: x.get("added") or "", reverse=True)
    for x in rows[: a.limit]:
        print(f"- @{x.get('author', '?')} [{', '.join(x.get('tech_tags') or [])}]")
        for label, key in (("watch", "skillry_url"), ("original post", "post_url"), ("poster", "poster_url")):
            if x.get(key):
                print(f"  {label}: {x[key]}")


def cmd_axes(v, _a):
    full = [x for x in v if isinstance(x.get("prompt"), str) and not x.get("prompt_partial")]
    if not full:
        sys.exit("no complete prompts in the corpus")
    cats = sorted({x["category"] for x in full})
    groups = {"ALL": full, **{c: [x for x in full if x["category"] == c] for c in cats}}
    print("n (non-partial):", {k: len(g) for k, g in groups.items()})
    head = "axis".ljust(18) + "".join(k[:11].rjust(12) for k in groups) + "   spread"
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
        print(ax.ljust(18) + cells + f"   {spread * 100:6.0f}")
    print("tech_tags by category:")
    for c in cats:
        tags = collections.Counter(t for x in groups[c] for t in x.get("tech_tags") or [])
        print(f"  {c}: " + ", ".join(f"{t} {n}" for t, n in tags.most_common(6)))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("examples")
    e.add_argument("--category", required=True)
    e.add_argument("--tag")
    e.add_argument("--limit", type=int, default=6)
    sub.add_parser("axes")
    a = p.parse_args()
    v = load()
    {"examples": cmd_examples, "axes": cmd_axes}[a.cmd](v, a)


if __name__ == "__main__":
    main()
