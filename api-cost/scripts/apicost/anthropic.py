"""Anthropic Usage and Cost Analytics API: GET /v1/organizations/analytics/cost.

Amounts are decimal strings in cents (six decimals); `amount` is after discounts
and before credits. A request spans at most 31 days, and `starting_at` must be on
or after 2026-01-01 and within the last 365 days.
"""

from datetime import date, timedelta
from decimal import Decimal

from . import dates
from .http import get_json
from .model import Row

URL = "https://api.anthropic.com/v1/organizations/analytics/cost"
SOURCE = "anthropic:/v1/organizations/analytics/cost"
VERSION = "2023-06-01"
BETA = "analytics-usage-cost-2026-08-24"
EARLIEST = date(2026, 1, 1)
MAX_SPAN = 31
GROUP_BY = ["workspace_id", "api_key_id", "model", "cost_type"]


def clamp(start, end, today):
    """Clamp the range to what the API serves; return (start, end, notes)."""
    notes = []
    floor = max(EARLIEST, today - timedelta(days=365))
    if start < floor:
        notes.append(f"start moved from {start} to {floor}: the API serves no earlier data")
        start = floor
    return start, max(start, end), notes


def item_of(group):
    model = group.get("model")
    cost_type = group.get("cost_type")
    if model and cost_type and cost_type != "tokens":
        return f"{model} · {cost_type}"
    return model or cost_type


def collect(account, key, start, end, get=get_json, today=None):
    """Return (rows, notes). `get(url, params, headers)` returns parsed JSON."""
    start, end, notes = clamp(start, end, today or date.today())
    headers = {"x-api-key": key, "anthropic-version": VERSION, "anthropic-beta": BETA}
    rows = []
    for a, b in dates.chunks(start, end, MAX_SPAN):
        page = None
        while True:
            params = {
                "starting_at": dates.rfc3339(a),
                "ending_at": dates.rfc3339(b),
                "time_bucket_width": "1d",
                "group_by[]": GROUP_BY,
                "order_by": "time",
                "order": "asc",
                "limit": 1000,
                "page": page,
            }
            body = get(URL, params, headers)
            refreshed = body.get("data_refreshed_at")
            if refreshed:
                notes.append(f"data refreshed at {refreshed} for {a}..{b}; later usage is missing or partial")
            as_of = refreshed or dates.now_iso()
            for r in body.get("data", []):
                g = r.get("group") or {}
                c = r.get("cost") or {}
                cents = Decimal(str(c.get("amount", "0")))
                rows.append(
                    Row(
                        date=r["starting_at"][:10],
                        vendor="anthropic",
                        account=account,
                        scope=g.get("workspace_id"),
                        api_key=g.get("api_key_id"),
                        item=item_of(g),
                        cost=float(cents / 100),
                        currency=(c.get("currency") or "USD").upper(),
                        source=SOURCE,
                        as_of=as_of,
                    )
                )
            if not body.get("has_more"):
                break
            page = body.get("next_page")
            if not page:
                break
    return rows, notes
