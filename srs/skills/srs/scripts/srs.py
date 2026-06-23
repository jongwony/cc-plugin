#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.9"
# dependencies = []
# ///
"""Personal SRS card generator + Anki push (via AnkiConnect).

Anki owns review, scheduling, and visualization; this tool owns capture and
provenance. Flashcards drafted from your Extended Mind (notes, decks, Claude
sessions) are staged in a ledger at ~/.claude/srs/cards.json, then pushed into
Anki through the AnkiConnect addon (HTTP, localhost:8765). The ledger records
what has been pushed so re-running (e.g. from /loop) never double-sends.

Overrides: SRS_DATA_DIR (store dir); ANKICONNECT_URL (default
http://127.0.0.1:8765).

A staged card:
    id, front, back, source_refs (list[str]), tags (list[str]), deck (str),
    added (YYYY-MM-DD), pushed (YYYY-MM-DD or null), anki_note_id (int or null)

`source_refs` is provenance back into the Extended Mind (e.g. "note-123#p2",
"deck.html#slide-3"); on push each becomes an Anki tag `src::<ref>`.

Subcommands: add | list | push
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

DEFAULT_DECK = "Extended Mind"
DEFAULT_MODEL = "Basic"
ANKICONNECT_URL = os.environ.get("ANKICONNECT_URL", "http://127.0.0.1:8765")


# --- staging ledger ------------------------------------------------------

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


def ref_to_tag(ref: str) -> str:
    # Anki tags are space-separated, so a single tag cannot contain spaces.
    return "src::" + "_".join(ref.split())


# --- AnkiConnect (stdlib urllib; protocol-level, no Anki SDK) -------------

def anki_invoke(action: str, **params):
    """POST one AnkiConnect action and return its result, or raise RuntimeError
    on an AnkiConnect-level error / malformed response. Connection failures
    surface as urllib.error.URLError for the caller to translate."""
    body = json.dumps({"action": action, "version": 6, "params": params}).encode("utf-8")
    req = urllib.request.Request(
        ANKICONNECT_URL, data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        try:
            data = json.loads(resp.read().decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"non-JSON response from {ANKICONNECT_URL}: {exc}") from exc
    if not isinstance(data, dict) or set(data.keys()) != {"result", "error"}:
        raise RuntimeError(f"unexpected AnkiConnect response: {data!r}")
    if data["error"] is not None:
        raise RuntimeError(data["error"])
    return data["result"]


def card_to_note(card: dict) -> dict:
    tags = list(card.get("tags", []) or [])
    tags += [ref_to_tag(r) for r in (card.get("source_refs") or [])]
    return {
        "deckName": card.get("deck") or DEFAULT_DECK,
        "modelName": DEFAULT_MODEL,
        "fields": {"Front": card.get("front", ""), "Back": card.get("back", "")},
        "tags": tags,
        "options": {"allowDuplicate": False, "duplicateScope": "deck"},
    }


# --- subcommands ---------------------------------------------------------

def _new_card(fields: dict) -> dict:
    return {
        "id": fields["id"],
        "front": fields.get("front", ""),
        "back": fields.get("back", ""),
        "source_refs": list(fields.get("source_refs") or []),
        "tags": list(fields.get("tags") or []),
        "deck": fields.get("deck") or DEFAULT_DECK,
        "added": today_str(),
        "pushed": None,
        "anki_note_id": None,
    }


def cmd_add(args) -> int:
    if args.id is not None:
        fields = {
            "id": args.id,
            "front": args.front or "",
            "back": args.back or "",
            "source_refs": args.source_ref or [],
            "tags": args.tag or [],
        }
        if args.deck:
            fields["deck"] = args.deck
    else:
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
        print(f"card {fields['id']!r} already staged, skipping", file=sys.stderr)
        return 0
    card = _new_card(fields)
    cards.append(card)
    save_cards(cards)
    print(f"staged {card['id']} (deck '{card['deck']}', not yet pushed)")
    return 0


def cmd_list(args) -> int:
    cards = load_cards()
    if args.unpushed:
        cards = [c for c in cards if not c.get("pushed")]
    json.dump(cards, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


def cmd_push(args) -> int:
    cards = load_cards()
    pending = [c for c in cards if args.all or not c.get("pushed")]
    if not pending:
        print("Nothing to push. ✨")
        return 0

    notes = [card_to_note(c) for c in pending]
    decks = sorted({n["deckName"] for n in notes})

    if args.dry_run:
        print(f"# dry-run: would push {len(pending)} card(s) to {ANKICONNECT_URL}")
        print(f"# ensure decks exist: {decks}")
        json.dump({"action": "addNotes", "notes": notes}, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0

    try:
        for deck in decks:
            anki_invoke("createDeck", deck=deck)  # idempotent
        results = anki_invoke("addNotes", notes=notes)
    except urllib.error.URLError as exc:
        print(
            f"[ERROR] cannot reach AnkiConnect at {ANKICONNECT_URL}: {exc.reason}\n"
            f"        Is Anki running with the AnkiConnect addon installed? (open -a Anki)",
            file=sys.stderr,
        )
        return 1
    except RuntimeError as exc:
        print(f"[ERROR] AnkiConnect: {exc}", file=sys.stderr)
        return 1

    # addNotes returns a parallel list: a note id on success, null when Anki
    # rejected the note (most commonly a duplicate within the deck).
    pushed = failed = 0
    for card, note_id in zip(pending, results):
        if note_id is not None:
            card["pushed"] = today_str()
            card["anki_note_id"] = note_id
            pushed += 1
        else:
            failed += 1
            print(f"  ! {card['id']}: rejected by Anki (likely a duplicate)", file=sys.stderr)
    save_cards(cards)

    summary = f"pushed {pushed} card(s) to Anki"
    if failed:
        summary += f", {failed} rejected"
    print(summary + f" (decks: {', '.join(decks)})")
    return 0 if failed == 0 else 1


# --- entry point ---------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="srs", description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_add = sub.add_parser("add", help="stage a card (--id ... or JSON on stdin)")
    p_add.add_argument("--id")
    p_add.add_argument("--front")
    p_add.add_argument("--back")
    p_add.add_argument("--source-ref", action="append", dest="source_ref",
                       help="provenance ref; repeat for multiple (→ Anki tag src::<ref>)")
    p_add.add_argument("--tag", action="append", dest="tag", help="extra Anki tag; repeat")
    p_add.add_argument("--deck", help=f"target Anki deck (default '{DEFAULT_DECK}')")

    p_list = sub.add_parser("list", help="list staged cards as JSON")
    p_list.add_argument("--unpushed", action="store_true", help="only cards not yet pushed")

    p_push = sub.add_parser("push", help="push staged cards into Anki via AnkiConnect")
    p_push.add_argument("--all", action="store_true", help="re-push every card, not just un-pushed")
    p_push.add_argument("--dry-run", action="store_true",
                        help="print the AnkiConnect payload without sending")
    return parser


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    return {"add": cmd_add, "list": cmd_list, "push": cmd_push}[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
