#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""Personal spaced-repetition (SRS) card store + SM-2-style grade/schedule engine.

Standard library only. State lives in ~/.claude/srs/cards.json (override the
directory with the SRS_DATA_DIR env var, e.g. for tests). A card is a dict:

    id, front, back, source_refs (list[str]), due (YYYY-MM-DD),
    interval_days (number), ease (number), reps (int), lapses (int),
    last_reviewed (YYYY-MM-DD or null)

Subcommands: due | grade <id> <again|hard|good|easy> | add | review
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

EASE_FLOOR = 1.3
GRADES = ("again", "hard", "good", "easy")

# New-card defaults. interval_days starts at 0; the `reps == 0` guards in
# apply_grade give a first review an absolute interval so 0 is never multiplied.
DEFAULTS = {
    "source_refs": [],
    "interval_days": 0,
    "ease": 2.5,
    "reps": 0,
    "lapses": 0,
    "last_reviewed": None,
}


# --- state file -----------------------------------------------------------

def data_dir() -> Path:
    return Path(os.environ.get("SRS_DATA_DIR", str(Path.home() / ".claude" / "srs")))


def cards_path() -> Path:
    return data_dir() / "cards.json"


def load_cards() -> list:
    path = cards_path()
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def save_cards(cards: list) -> None:
    d = data_dir()
    d.mkdir(parents=True, exist_ok=True)
    path = cards_path()
    tmp = path.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(cards, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.replace(tmp, path)  # atomic on the same filesystem


def today_str() -> str:
    return date.today().isoformat()


def find_card(cards: list, card_id: str):
    for card in cards:
        if card.get("id") == card_id:
            return card
    return None


# --- scheduling -----------------------------------------------------------

def apply_grade(card: dict, grade: str) -> dict:
    """Apply an SM-2-style update to `card` in place and return it.

    `reps` is read BEFORE it is updated so the first-review guards work off the
    pre-update repetition count.
    """
    reps = int(card.get("reps", DEFAULTS["reps"]))
    ease = float(card.get("ease", DEFAULTS["ease"]))
    interval = float(card.get("interval_days", DEFAULTS["interval_days"]))
    lapses = int(card.get("lapses", DEFAULTS["lapses"]))

    if grade == "again":
        interval = 1
        ease -= 0.2
        lapses += 1
        reps = 0  # a lapse restarts the ladder
    elif grade == "hard":
        interval = 1 if reps == 0 else interval * 1.2
        ease -= 0.15
        reps += 1
    elif grade == "good":
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 3
        else:
            interval = interval * ease
        reps += 1
    elif grade == "easy":
        interval = 3 if reps == 0 else interval * (ease + 0.15) * 1.3
        ease += 0.15
        reps += 1
    else:
        raise ValueError(f"unknown grade {grade!r}; expected one of {GRADES}")

    ease = max(ease, EASE_FLOOR)
    today = date.today()
    card["interval_days"] = interval
    card["ease"] = ease
    card["reps"] = reps
    card["lapses"] = lapses
    card["last_reviewed"] = today.isoformat()
    card["due"] = (today + timedelta(days=round(interval))).isoformat()
    return card


# --- subcommands ----------------------------------------------------------

def cmd_due(_args) -> int:
    today = today_str()
    cards = load_cards()
    due = [c for c in cards if c.get("due", today) <= today]
    due.sort(key=lambda c: (c.get("due", ""), str(c.get("id", ""))))
    json.dump(due, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


def cmd_grade(args) -> int:
    grade = args.grade.lower()
    if grade not in GRADES:
        print(f"[ERROR] grade must be one of {', '.join(GRADES)}", file=sys.stderr)
        return 2
    cards = load_cards()
    card = find_card(cards, args.id)
    if card is None:
        print(f"[ERROR] no card with id {args.id!r}", file=sys.stderr)
        return 1
    apply_grade(card, grade)
    save_cards(cards)
    print(
        f"{args.id}: {grade} -> due {card['due']} "
        f"(interval {round(card['interval_days'])}d, ease {card['ease']:.2f}, "
        f"reps {card['reps']}, lapses {card['lapses']})"
    )
    return 0


def _new_card(fields: dict) -> dict:
    card = dict(DEFAULTS)
    card["source_refs"] = list(fields.get("source_refs", []) or [])
    card["id"] = fields["id"]
    card["front"] = fields.get("front", "")
    card["back"] = fields.get("back", "")
    # carry through any explicitly-provided scheduling fields, else default
    for key in ("interval_days", "ease", "reps", "lapses", "last_reviewed"):
        if key in fields and fields[key] is not None:
            card[key] = fields[key]
    # a fresh card is due today unless the caller pins a date
    card["due"] = fields.get("due") or today_str()
    return card


def cmd_add(args) -> int:
    if args.id is not None:
        fields = {
            "id": args.id,
            "front": args.front or "",
            "back": args.back or "",
            "source_refs": args.source_ref or [],
        }
        if args.due:
            fields["due"] = args.due
    else:
        # no --id flag: read a JSON object from stdin
        raw = sys.stdin.read()
        if not raw.strip():
            print("[ERROR] add: provide --id ... or pipe a JSON object on stdin", file=sys.stderr)
            return 2
        fields = json.loads(raw)
        if "id" not in fields:
            print("[ERROR] add: stdin JSON object needs an 'id' field", file=sys.stderr)
            return 2

    cards = load_cards()
    if find_card(cards, fields["id"]) is not None:
        print(f"card {fields['id']!r} already exists, skipping", file=sys.stderr)
        return 0
    card = _new_card(fields)
    cards.append(card)
    save_cards(cards)
    print(f"added {card['id']} (due {card['due']})")
    return 0


def _read_grade(prompt: str):
    """Read a grade from stdin. Accepts full words, first letters, 1-4,
    plus s(kip)/q(uit). Returns a grade string, 'skip', 'quit', or None on EOF.
    """
    aliases = {
        "1": "again", "a": "again", "again": "again",
        "2": "hard", "h": "hard", "hard": "hard",
        "3": "good", "g": "good", "good": "good",
        "4": "easy", "e": "easy", "easy": "easy",
        "s": "skip", "skip": "skip",
        "q": "quit", "quit": "quit",
    }
    while True:
        try:
            raw = input(prompt)
        except EOFError:
            return None
        choice = aliases.get(raw.strip().lower())
        if choice is not None:
            return choice
        print("  enter: 1/again  2/hard  3/good  4/easy  s/skip  q/quit")


def cmd_review(_args) -> int:
    today = today_str()
    cards = load_cards()
    due = [c for c in cards if c.get("due", today) <= today]
    due.sort(key=lambda c: (c.get("due", ""), str(c.get("id", ""))))
    if not due:
        print("No cards due. ✨")
        return 0

    print(f"{len(due)} card(s) due.\n")
    reviewed = 0
    for idx, card in enumerate(due, 1):
        print(f"[{idx}/{len(due)}] {card.get('id', '?')}")
        print(f"  Q: {card.get('front', '')}")
        try:
            input("  (press Enter to reveal)")
        except EOFError:
            print("\n(input closed) stopping.")
            break
        print(f"  A: {card.get('back', '')}")
        if card.get("source_refs"):
            print(f"  refs: {', '.join(card['source_refs'])}")

        grade = _read_grade("  grade [1/2/3/4 | a/h/g/e | s/q]: ")
        if grade is None:
            print("\n(input closed) stopping.")
            break
        if grade == "quit":
            print("stopping.")
            break
        if grade == "skip":
            print("  skipped.\n")
            continue

        apply_grade(card, grade)
        save_cards(cards)  # persist after each grade so a mid-session quit keeps progress
        reviewed += 1
        print(
            f"  -> {grade}: next due {card['due']} "
            f"(interval {round(card['interval_days'])}d)\n"
        )

    print(f"\nReviewed {reviewed} card(s).")
    return 0


# --- entry point ----------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="srs", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("due", help="print cards due today or earlier, as JSON")

    p_grade = sub.add_parser("grade", help="apply a grade to a card and reschedule it")
    p_grade.add_argument("id")
    p_grade.add_argument("grade", help="again | hard | good | easy")

    p_add = sub.add_parser("add", help="append a card (--id ... or JSON on stdin)")
    p_add.add_argument("--id")
    p_add.add_argument("--front")
    p_add.add_argument("--back")
    p_add.add_argument("--source-ref", action="append", dest="source_ref",
                       help="provenance ref; repeat for multiple")
    p_add.add_argument("--due", help="override the initial due date (YYYY-MM-DD)")

    sub.add_parser("review", help="interactive review loop over due cards")
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    handlers = {
        "due": cmd_due,
        "grade": cmd_grade,
        "add": cmd_add,
        "review": cmd_review,
    }
    return handlers[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
