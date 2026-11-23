"""Merge collector rows into one dataset and write it as JSON and CSV."""

import csv
import json
from collections import OrderedDict
from pathlib import Path

from .model import FIELDS, Row

KEY = ("date", "vendor", "account", "scope", "api_key", "item", "currency", "source")


def merge(rows):
    """Sum rows that share every dimension; drop exact-zero sums; sort by date."""
    acc = OrderedDict()
    for r in rows:
        k = tuple(getattr(r, f) for f in KEY)
        prev = acc.get(k)
        if prev is None:
            acc[k] = r
        else:
            acc[k] = Row(**{**prev.as_dict(), "cost": prev.cost + r.cost, "as_of": max(prev.as_of, r.as_of)})
    out = [Row(**{**r.as_dict(), "cost": round(r.cost, 6)}) for r in acc.values() if round(r.cost, 6) != 0]
    out.sort(key=lambda r: (r.date, r.vendor, r.account, r.scope or "", r.api_key or "", r.item or ""))
    return out


def totals(rows):
    """{(vendor, account, currency): total}"""
    t = {}
    for r in rows:
        k = (r.vendor, r.account, r.currency)
        t[k] = round(t.get(k, 0.0) + r.cost, 6)
    return t


def write(out_dir, rows, statuses, meta):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "costs.json").write_text(json.dumps([r.as_dict() for r in rows], ensure_ascii=False, indent=1) + "\n")
    with (out / "costs.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow(r.as_dict())
    status = dict(meta, accounts=[s.as_dict() for s in statuses])
    (out / "status.json").write_text(json.dumps(status, ensure_ascii=False, indent=1) + "\n")
    return out
