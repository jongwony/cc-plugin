"""api-cost: collect vendor-billed API spend into costs.json / costs.csv / status.json."""

import argparse
import os
import re
import sys
from datetime import timedelta

from . import anthropic, dates, gemini, normalize, openai
from .model import CollectError, Status

KEY_ENV = {
    ("anthropic", "personal"): "ANTHROPIC_ADMIN_KEY_PERSONAL",
    ("anthropic", "work"): "ANTHROPIC_ADMIN_KEY_WORK",
    ("openai", "personal"): "OPENAI_ADMIN_KEY_PERSONAL",
    ("openai", "work"): "OPENAI_ADMIN_KEY_WORK",
}
COLLECTORS = {"anthropic": anthropic.collect, "openai": openai.collect}
KEYLIKE = re.compile(r"sk-[A-Za-z0-9_*-]{4,}")


def redact(text, secret=None):
    """Drop the key and anything key-shaped from a message that will be printed or saved."""
    if secret:
        text = text.replace(secret, "[redacted]")
    return KEYLIKE.sub("[redacted]", text)


def parse_args(argv):
    p = argparse.ArgumentParser(prog="api-cost", description=__doc__)
    p.add_argument("--out", required=True, help="directory for costs.json, costs.csv and status.json")
    p.add_argument("--start", help="first UTC day, YYYY-MM-DD (default: --days before --end)")
    p.add_argument("--end", help="UTC day after the last one, YYYY-MM-DD (default: tomorrow, so today is included)")
    p.add_argument("--days", type=int, default=30, help="range length when --start is omitted (default 30)")
    p.add_argument("--vendors", default="anthropic,openai,gemini")
    p.add_argument("--accounts", default="personal,work")
    p.add_argument("--gemini-table", default=os.environ.get("API_COST_GEMINI_TABLE", ""),
                   help="personal Cloud Billing export table, project.dataset.table")
    p.add_argument("--gemini-gcloud-account", default=os.environ.get("API_COST_GEMINI_GCLOUD_ACCOUNT", ""),
                   help="gcloud account bq runs as for the personal billing table")
    return p.parse_args(argv)


ACCOUNTS = ("personal", "work")


def resolve_range(a, today):
    end = dates.parse(a.end) if a.end else today + timedelta(days=1)
    start = dates.parse(a.start) if a.start else end - timedelta(days=a.days)
    if start >= end:
        raise SystemExit(f"api-cost: empty range {start}..{end}")
    return start, end


def run(a, today=None, collectors=None, gemini_collect=None, env=None):
    today = today or dates.today_utc()
    env = os.environ if env is None else env
    collectors = collectors or COLLECTORS
    gemini_collect = gemini_collect or gemini.collect
    start, end = resolve_range(a, today)
    vendors = [v.strip() for v in a.vendors.split(",") if v.strip()]
    accounts = [x.strip() for x in a.accounts.split(",") if x.strip()]
    unknown = [x for x in accounts if x not in ACCOUNTS]
    if unknown:
        raise SystemExit(f"api-cost: unknown account {', '.join(unknown)}; use {', '.join(ACCOUNTS)}")
    rows, statuses = [], []

    def attempt(vendor, account, fn, secret=None):
        st = Status(vendor, account, "unverified", start=start.isoformat(), end=end.isoformat())
        try:
            got, notes = fn()
        except CollectError as e:
            st.reason = redact(str(e), secret)
        except Exception as e:  # a vendor's unexpected shape must not lose the other accounts
            st.reason = redact(f"unexpected {type(e).__name__}: {e}", secret)
        else:
            rows.extend(got)
            st.state, st.notes = "verified", notes
        statuses.append(st)

    for vendor in vendors:
        if vendor == "gemini":
            if "personal" not in accounts:
                continue
            if not a.gemini_table:
                statuses.append(Status("gemini", "personal", "unverified",
                                       reason="no personal billing export table configured",
                                       start=start.isoformat(), end=end.isoformat()))
                continue
            attempt("gemini", "personal",
                    lambda: gemini_collect("personal", a.gemini_table, a.gemini_gcloud_account, start, end))
            continue
        if vendor not in collectors:
            raise SystemExit(f"api-cost: unknown vendor {vendor}")
        for account in accounts:
            var = KEY_ENV[(vendor, account)]
            key = env.get(var, "").strip()
            if not key:
                statuses.append(Status(vendor, account, "unverified", reason=f"no admin key in {var}",
                                       start=start.isoformat(), end=end.isoformat()))
                continue
            attempt(vendor, account, lambda: collectors[vendor](account, key, start, end), secret=key)

    merged = normalize.merge(rows)
    for st in statuses:
        st.rows = sum(1 for r in merged if r.vendor == st.vendor and r.account == st.account)
    meta = {"generated_at": dates.now_iso(), "start": start.isoformat(), "end_exclusive": end.isoformat()}
    return merged, statuses, meta


def main(argv=None):
    a = parse_args(sys.argv[1:] if argv is None else argv)
    rows, statuses, meta = run(a)
    out = normalize.write(a.out, rows, statuses, meta)
    print(f"range {meta['start']} .. {meta['end_exclusive']} (end exclusive, UTC) -> {out}")
    for s in statuses:
        line = f"{s.vendor:9} {s.account:8} {s.state:10} rows={s.rows}"
        if s.reason:
            line += f"  reason: {s.reason}"
        print(line)
        for n in s.notes:
            print(f"    note: {n}")
    for (vendor, account, cur), total in sorted(normalize.totals(rows).items()):
        print(f"total {vendor:9} {account:8} {total:,.2f} {cur}")
    return 0
