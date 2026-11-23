"""OpenAI Organization Costs API: GET /v1/organization/costs.

Daily buckets only; `limit` counts buckets (1-180); `amount.value` is in the
lowercase ISO currency it names.
"""

from decimal import Decimal

from . import dates
from .http import get_json
from .model import Row

URL = "https://api.openai.com/v1/organization/costs"
SOURCE = "openai:/v1/organization/costs"
MAX_SPAN = 180
GROUP_BY = ["project_id", "line_item", "api_key_id"]


def collect(account, key, start, end, get=get_json):
    """Return (rows, notes). `get(url, params, headers)` returns parsed JSON."""
    headers = {"Authorization": f"Bearer {key}"}
    rows, notes = [], []
    as_of = dates.now_iso()
    for a, b in dates.chunks(start, end, MAX_SPAN):
        page = None
        while True:
            params = {
                "start_time": dates.unix(a),
                "end_time": dates.unix(b),
                "bucket_width": "1d",
                "group_by": GROUP_BY,
                "limit": MAX_SPAN,
                "page": page,
            }
            body = get(URL, params, headers)
            for bucket in body.get("data", []):
                day = dates.from_unix(bucket["start_time"])
                for r in bucket.get("results", []):
                    amt = r.get("amount") or {}
                    rows.append(
                        Row(
                            date=day,
                            vendor="openai",
                            account=account,
                            scope=r.get("project_id"),
                            api_key=r.get("api_key_id"),
                            item=r.get("line_item"),
                            cost=float(Decimal(str(amt.get("value", 0)))),
                            currency=(amt.get("currency") or "usd").upper(),
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
