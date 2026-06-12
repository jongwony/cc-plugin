#!/usr/bin/env uv run --quiet --script
# /// script
# requires-python = ">=3.8"
# dependencies = []
# ///
"""Scan Apple Notes for Apple-Pencil handwriting (drawing attachments).

Reads a consistent snapshot of NoteStore.sqlite (including WAL, via the sqlite
backup API), lists drawing attachments (com.apple.paper / com.apple.drawing*)
with their note title, Apple's on-device handwriting-recognition text, and the
on-disk rendered FallbackImage path. Emits one JSON object per line.

Watermark state (for the polling loop) lives outside the repo so on-demand
browsing and scheduled polling share it:
  ~/.local/state/notes-handwriting/watermark   (Core Data epoch float)

The watermark only moves via an explicit `--update-watermark VALUE` call —
the caller passes the max `modified_raw` of the rows it actually consumed,
so rows that arrive between scan and consumption are never skipped.
"""
import argparse
import glob
import json
import os
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone

GROUP = os.path.expanduser("~/Library/Group Containers/group.com.apple.notes")
STATE_FILE = os.path.expanduser("~/.local/state/notes-handwriting/watermark")
APPLE_EPOCH = 978307200  # Core Data reference date offset to Unix epoch
DRAWING_UTIS = ("com.apple.paper", "com.apple.drawing.2", "com.apple.drawing")


def snapshot_db(tmpdir: str) -> str:
    """Consistent snapshot of the live DB (WAL frames included) via the sqlite backup API."""
    dst_path = os.path.join(tmpdir, "NoteStore.sqlite")
    try:
        src = sqlite3.connect(f"file:{os.path.join(GROUP, 'NoteStore.sqlite')}?mode=ro", uri=True)
        try:
            dst = sqlite3.connect(dst_path)
            try:
                src.backup(dst)
            finally:
                dst.close()
        finally:
            src.close()
    except sqlite3.Error as exc:
        sys.exit(f"cannot open Notes database under {GROUP} ({exc}) — "
                 "either Notes has no local data on this Mac, or this process "
                 "lacks Full Disk Access (System Settings > Privacy & Security)")
    return dst_path


def find_image(identifier: str):
    """Map attachment ZIDENTIFIER to its rendered fallback image (newest generation)."""
    pattern = os.path.join(GROUP, "Accounts", "*", "FallbackImages", identifier, "*", "FallbackImage.*")
    hits = glob.glob(pattern)
    return max(hits, key=os.path.getmtime) if hits else None


def read_watermark() -> float:
    try:
        with open(STATE_FILE) as f:
            return float(f.read().strip())
    except (OSError, ValueError):
        return 0.0


def write_watermark(value: float) -> None:
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        f.write(repr(value))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--all", action="store_true", help="ignore watermark, list every drawing (newest first)")
    ap.add_argument("--limit", type=int, default=20, help="max rows")
    ap.add_argument("--update-watermark", type=float, metavar="MODIFIED_RAW",
                    help="write the watermark to this value and exit (pass the max "
                         "modified_raw of the rows actually consumed); no scan is performed")
    args = ap.parse_args()

    if args.update_watermark is not None:
        current = read_watermark()
        if args.update_watermark > current:
            write_watermark(args.update_watermark)
            print(f"watermark advanced to {args.update_watermark}", file=sys.stderr)
        else:
            print(f"watermark unchanged ({current} >= {args.update_watermark})", file=sys.stderr)
        return 0

    since = 0.0 if args.all else read_watermark()
    # Loop mode walks oldest-first so a LIMIT-truncated batch leaves the newer rows
    # above the watermark for the next poll; --all browsing stays newest-first.
    order = "DESC" if args.all else "ASC"

    with tempfile.TemporaryDirectory() as tmpdir:
        db = snapshot_db(tmpdir)
        con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
        placeholders = ",".join("?" * len(DRAWING_UTIS))
        base_select = f"""
            SELECT a.Z_PK, a.ZIDENTIFIER, a.ZTYPEUTI, a.ZMODIFICATIONDATE,
                   a.ZHANDWRITINGSUMMARY, n.ZTITLE1
            FROM ZICCLOUDSYNCINGOBJECT a
            LEFT JOIN ZICCLOUDSYNCINGOBJECT n ON a.ZNOTE = n.Z_PK
            WHERE a.ZTYPEUTI IN ({placeholders})
              AND IFNULL(a.ZMARKEDFORDELETION, 0) = 0
        """
        rows = con.execute(
            base_select +
            f" AND a.ZMODIFICATIONDATE > ? ORDER BY a.ZMODIFICATIONDATE {order} LIMIT ?",
            (*DRAWING_UTIS, since, args.limit),
        ).fetchall()
        if not args.all and rows and len(rows) == args.limit:
            # Complete the tie group at the boundary timestamp: the scalar watermark
            # (`> cursor`) would otherwise strand unconsumed rows that share the
            # boundary's ZMODIFICATIONDATE behind it forever.
            boundary, seen = rows[-1][3], {r[0] for r in rows}
            extra = con.execute(
                base_select + " AND a.ZMODIFICATIONDATE = ?",
                (*DRAWING_UTIS, boundary),
            ).fetchall()
            rows += [r for r in extra if r[0] not in seen]
        con.close()

    for pk, identifier, uti, mod, summary, title in rows:
        image = find_image(identifier)
        print(json.dumps({
            "attachment_pk": pk,
            "attachment_id": identifier,
            "uti": uti,
            "modified": datetime.fromtimestamp((mod or 0) + APPLE_EPOCH, tz=timezone.utc)
                        .astimezone().isoformat(timespec="seconds"),
            "modified_raw": mod,
            "note_title": title,
            "handwriting_text": summary or None,
            "image_path": image,
            "image_bytes": os.path.getsize(image) if image else None,
        }, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    sys.exit(main())
