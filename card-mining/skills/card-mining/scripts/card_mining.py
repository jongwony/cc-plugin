#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""Card-mining Span sidecar + selection renderer (the deterministic glue).

This is the *thin* supporting tool for the card-mining Span Runbook. It does NOT
mine cards — the epistemic protocols (/ascend /inquire /induce /elicit) do that
at run time, and card drafting (front/back) is the model's heuristic job. This
script owns only the two deterministic concerns the recipe needs:

  (a) Run sidecar  — a per-run checkpoint ledger at
        ~/.claude/srs/runs/<run-id>/run.json
      One entry per Span stage (status + in/out capsule + source_refs), so a
      killed run can re-enter at the first non-completed stage (the resume
      handle). `init` / `capsule` / `status`.

  (b) Selection renderer — `render` turns user-picked rows of the stage-5
      selection table into card JSON in the *srs* plugin's `add` shape, emitted
      as JSONL on stdout. It does the deterministic join+validation:
        - keep only rows the user picked AND bucketed `memorize`
        - reject source-less candidates (provenance is mandatory)
        - pull source_refs from the table (the provenance SSOT), not the body
        - stamp a staleness tag so a card is traceable to its mining run/date
      front/back come from the model on stdin; this just assembles & validates.

Composition is by pipe, not import: `render ... | while read; do ... srs add`.
The sibling `srs` plugin owns the actual Anki push.

Overrides: SRS_DATA_DIR (store root; shared with the srs plugin, default
~/.claude/srs). Runs live under <store>/runs/.

Subcommands: init | capsule | status | render
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime
from pathlib import Path

# Stage skeleton mirrors the Span Runbook (card-mining-span.md). Stage 4
# (Sharpen / elicit) is conditional — mark it `skipped` when not run.
STAGES = [
    (1, "Recall"),    # /ascend  <topic>      -> session group
    (2, "Gather"),    # /inquire              -> bounded evidence + source_refs
    (3, "Abstract"),  # /induce               -> patterns + source_refs
    (4, "Sharpen"),   # /elicit  (optional)   -> carding-axis sharpened
    (5, "Select"),    # selection table       -> user picks ids (user gate)
    (6, "Render"),    # picked memorize rows  -> card notes
    (7, "Push"),      # srs add/push          -> Anki TEST deck (user gate on live)
]
STAGE_STATUSES = ["pending", "in_progress", "completed", "blocked", "skipped"]
# Treated as "done" when computing the resume handle.
DONE_STATUSES = {"completed", "skipped"}
DEFAULT_DECK = "TEST"  # recipe: TEST deck first; live push to a real deck is a user gate


# --- store layout (shared root with the srs plugin) ----------------------

def data_dir() -> Path:
    return Path(os.environ.get("SRS_DATA_DIR", str(Path.home() / ".claude" / "srs")))


def runs_dir() -> Path:
    return data_dir() / "runs"


def run_dir(run_id: str) -> Path:
    return runs_dir() / run_id


def run_path(run_id: str) -> Path:
    return run_dir(run_id) / "run.json"


def save_run(run: dict) -> None:
    d = run_dir(run["run_id"])
    d.mkdir(parents=True, exist_ok=True)
    path = run_path(run["run_id"])
    tmp = path.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(run, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.replace(tmp, path)  # atomic on the same filesystem


def load_run(run_id: str) -> dict:
    path = run_path(run_id)
    if not path.exists():
        raise SystemExit(f"[ERROR] no such run: {run_id!r} (expected {path})")
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def find_stage(run: dict, n: int) -> dict:
    for stage in run["stages"]:
        if stage["n"] == n:
            return stage
    raise SystemExit(f"[ERROR] run {run['run_id']!r} has no stage {n}")


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.strip().lower()).strip("-")
    return s[:40] or "run"


def read_stdin_json():
    """Parse a JSON value piped on stdin; return None when nothing is piped.

    Guarded by isatty() so an interactive invocation does not block waiting on
    stdin.
    """
    if sys.stdin.isatty():
        return None
    raw = sys.stdin.read()
    if not raw.strip():
        return None
    return json.loads(raw)


# --- subcommands ---------------------------------------------------------

def cmd_init(args) -> int:
    now = datetime.now()
    run_id = now.strftime("%Y%m%d-%H%M%S") + "-" + slugify(args.topic)
    if run_path(run_id).exists():
        raise SystemExit(f"[ERROR] run {run_id!r} already exists")
    stages = [
        {"n": n, "name": name, "status": "pending",
         "in": None, "out": None, "source_refs": [], "note": None}
        for n, name in STAGES
    ]
    run = {
        "run_id": run_id,
        "topic": args.topic,
        "created": now.isoformat(timespec="seconds"),
        "dry_run": bool(args.dry_run),
        "stages": stages,
        "updated": now.isoformat(timespec="seconds"),
    }
    save_run(run)
    # run_id on the first line so callers can capture it ($(... | head -1)).
    print(run_id)
    print(run_path(run_id))
    return 0


def cmd_capsule(args) -> int:
    """Write/update one stage's checkpoint capsule.

    A JSON object on stdin is a patch: its `in`/`out`/`note` keys replace the
    stage's, `source_refs` (if present) replaces the list, `status` sets status
    unless --status overrides. --status / --source-ref flags apply last.
    """
    run = load_run(args.run_id)
    stage = find_stage(run, args.stage)

    patch = read_stdin_json()
    if patch is not None:
        if not isinstance(patch, dict):
            raise SystemExit("[ERROR] capsule: stdin must be a JSON object")
        for key in ("in", "out", "note"):
            if key in patch:
                stage[key] = patch[key]
        if "source_refs" in patch:
            stage["source_refs"] = list(patch["source_refs"] or [])
        if "status" in patch and not args.status:
            if patch["status"] not in STAGE_STATUSES:
                raise SystemExit(f"[ERROR] capsule: bad status {patch['status']!r}")
            stage["status"] = patch["status"]

    if args.status:
        stage["status"] = args.status
    if args.source_ref:
        for ref in args.source_ref:
            if ref not in stage["source_refs"]:
                stage["source_refs"].append(ref)

    run["updated"] = now_iso()
    save_run(run)
    print(f"stage {stage['n']} {stage['name']}: {stage['status']} "
          f"(source_refs: {len(stage['source_refs'])})")
    return 0


def cmd_status(args) -> int:
    run = load_run(args.run_id)
    if args.json:
        json.dump(run, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0

    print(f"run: {run['run_id']}  (topic: {run['topic']!r})")
    print(f"created: {run['created']}   dry_run: {run['dry_run']}")
    resume = None
    for stage in run["stages"]:
        refs = stage["source_refs"]
        mark = f"  source_refs:{len(refs)}" if refs else ""
        print(f"  {stage['n']} {stage['name']:<9} [{stage['status']}]{mark}")
        if resume is None and stage["status"] not in DONE_STATUSES:
            resume = stage
    if resume is not None:
        print(f"resume -> stage {resume['n']} {resume['name']} "
              f"(re-enter with its input capsule)")
    else:
        print("resume -> all stages completed/skipped (harvest)")
    print(f"sidecar: {run_path(run['run_id'])}")
    return 0


def cmd_render(args) -> int:
    """Render user-picked memorize rows into card JSONL for `srs add`.

    Selection table is read from the sidecar (stage-5 `out.table`, a list of
    rows: id, claim, source_refs, bucket, confidence, proposed, reason). Card
    bodies (front/back/extra?/tags?) come on stdin keyed by row id — those are
    the model's stage-6 draft. Output is one JSON card per line on stdout (the
    srs `add` shape); the stage-6 capsule is persisted with the same cards plus
    the rejection log.
    """
    run = load_run(args.run_id)
    sel = find_stage(run, args.table_stage)
    out = sel.get("out") or {}
    table = out.get("table")
    if not table:
        raise SystemExit(
            f"[ERROR] stage {args.table_stage} has no selection table; "
            f"capsule its out.table first")
    rows = {str(r["id"]): r for r in table}

    picks = [p.strip() for p in args.pick.split(",") if p.strip()]
    if not picks:
        raise SystemExit("[ERROR] render: --pick is empty")

    bodies = read_stdin_json() or {}
    if not isinstance(bodies, dict):
        raise SystemExit("[ERROR] render: stdin card bodies must be a JSON object keyed by id")

    as_of = args.as_of or date.today().isoformat()
    cards: list = []
    rejected: list = []

    for pid in picks:
        row = rows.get(pid)
        if row is None:
            rejected.append((pid, "not in selection table"))
            continue
        if row.get("bucket") != "memorize":
            rejected.append((pid, f"bucket={row.get('bucket')!r} (only memorize -> cards)"))
            continue
        refs = list(row.get("source_refs") or [])
        if not refs:
            rejected.append((pid, "source-less candidate (rejected)"))
            continue
        body = bodies.get(pid) or {}
        front = (body.get("front") or "").strip()
        back = (body.get("back") or "").strip()
        if not front or not back:
            rejected.append((pid, "no front/back body provided on stdin"))
            continue
        if body.get("extra"):
            back = back + "\n\n" + str(body["extra"]).strip()
        # Staleness: a card mined from the session archive may drift from the
        # current understanding — tag it with run + as-of so it stays traceable.
        tags = list(body.get("tags") or [])
        tags += [f"mining-run::{run['run_id']}", f"mined-as-of::{as_of}"]
        cards.append({
            "id": f"{run['run_id']}::{pid}",
            "front": front,
            "back": back,
            "source_refs": refs,
            "tags": tags,
            "deck": args.deck,
        })

    # Persist the stage-6 capsule (resume-safe) and aggregate its source_refs.
    rstage = find_stage(run, 6)
    agg_refs: list = []
    for card in cards:
        for ref in card["source_refs"]:
            if ref not in agg_refs:
                agg_refs.append(ref)
    rstage["out"] = {
        "cards": cards,
        "rejected": [{"id": i, "why": w} for i, w in rejected],
        "as_of": as_of,
        "deck": args.deck,
        "picked": picks,
    }
    rstage["source_refs"] = agg_refs
    if rstage["status"] == "pending":
        rstage["status"] = "in_progress"
    run["updated"] = now_iso()
    save_run(run)

    for card in cards:
        sys.stdout.write(json.dumps(card, ensure_ascii=False) + "\n")
    for pid, why in rejected:
        print(f"  ! {pid}: {why}", file=sys.stderr)
    print(f"rendered {len(cards)} card(s), {len(rejected)} rejected "
          f"-> deck {args.deck!r} (as-of {as_of})", file=sys.stderr)
    # Non-zero only when the user picked rows but none rendered — a real miss.
    return 0 if cards or not picks else 1


# --- entry point ---------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="card_mining", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_init = sub.add_parser("init", help="create a run sidecar for a topic")
    p_init.add_argument("topic", help="the topic / vague recall to mine cards about")
    p_init.add_argument("--dry-run", action="store_true",
                        help="mark this run dry-run (selection table only, no live push)")

    p_cap = sub.add_parser("capsule", help="write/update a stage checkpoint capsule (JSON patch on stdin)")
    p_cap.add_argument("run_id")
    p_cap.add_argument("--stage", type=int, required=True, choices=range(1, 8), metavar="N")
    p_cap.add_argument("--status", choices=STAGE_STATUSES)
    p_cap.add_argument("--source-ref", action="append", dest="source_ref",
                       help="append a provenance ref; repeat for multiple")

    p_st = sub.add_parser("status", help="show per-stage status + resume handle")
    p_st.add_argument("run_id")
    p_st.add_argument("--json", action="store_true", help="dump the raw run ledger as JSON")

    p_rn = sub.add_parser("render", help="render picked memorize rows -> card JSONL for `srs add`")
    p_rn.add_argument("run_id")
    p_rn.add_argument("--pick", required=True, help="comma-separated selection-table row ids")
    p_rn.add_argument("--deck", default=DEFAULT_DECK,
                      help=f"target Anki deck (default {DEFAULT_DECK!r})")
    p_rn.add_argument("--as-of", dest="as_of", help="staleness date (default: today)")
    p_rn.add_argument("--table-stage", dest="table_stage", type=int, default=5,
                      help="stage whose out.table holds the selection table (default 5)")
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return {
        "init": cmd_init,
        "capsule": cmd_capsule,
        "status": cmd_status,
        "render": cmd_render,
    }[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
