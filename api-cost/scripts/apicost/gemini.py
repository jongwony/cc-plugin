"""Gemini API spend from a Cloud Billing export table in BigQuery, via the `bq` CLI.

The Gemini API has no cost endpoint; the billing export is the billed record.
`cost` is before credits, matching the other vendors.
"""

import json
import os
import re
import subprocess

from . import dates
from .model import CollectError, Row

SERVICES = ("Gemini API", "Generative Language API")
TABLE_RE = re.compile(r"^[A-Za-z0-9_.:-]+\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+$")

QUERY = """
SELECT
  FORMAT_DATE('%Y-%m-%d', DATE(usage_start_time)) AS day,
  project.id AS project_id,
  sku.description AS sku,
  currency,
  SUM(cost) AS cost
FROM `{table}`
WHERE service.description IN UNNEST(@services)
  AND DATE(usage_start_time) >= @start
  AND DATE(usage_start_time) < @end
GROUP BY day, project_id, sku, currency
ORDER BY day
"""


def build_cmd(table, start, end):
    if not TABLE_RE.match(table):
        raise CollectError(f"billing table is not project.dataset.table: {table!r}")
    return [
        "bq",
        "query",
        "--use_legacy_sql=false",
        "--format=json",
        "--max_rows=100000",
        "--parameter=services:ARRAY<STRING>:" + json.dumps(list(SERVICES)),
        f"--parameter=start:DATE:{start.isoformat()}",
        f"--parameter=end:DATE:{end.isoformat()}",
        QUERY.format(table=table),
    ]


def run_bq(cmd, gcloud_account):
    env = dict(os.environ)
    if gcloud_account:
        env["CLOUDSDK_CORE_ACCOUNT"] = gcloud_account
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=300)
    except FileNotFoundError:
        raise CollectError("bq CLI not found (install the Google Cloud SDK)") from None
    if p.returncode != 0:
        raise CollectError(f"bq query failed: {(p.stderr or p.stdout).strip()[:2000]}")
    out = p.stdout.strip()
    return json.loads(out) if out else []


def collect(account, table, gcloud_account, start, end, run=run_bq):
    rows = []
    as_of = dates.now_iso()
    source = f"gemini:bigquery:{table}"
    for r in run(build_cmd(table, start, end), gcloud_account):
        rows.append(
            Row(
                date=r["day"],
                vendor="gemini",
                account=account,
                scope=r.get("project_id"),
                api_key=None,
                item=r.get("sku"),
                cost=float(r.get("cost") or 0),
                currency=(r.get("currency") or "USD").upper(),
                source=source,
                as_of=as_of,
            )
        )
    notes = ["billing export lags usage by up to a day or more; recent days may be partial"]
    return rows, notes
