---
name: api-cost
description: Collect what Anthropic, OpenAI and Gemini billed for API use — per day, account, workspace or project, API key and model — into costs.json and costs.csv for a dashboard. Use when the user asks what their API spend is, wants vendor cost data for a dashboard, or asks to refresh it. Not Claude Code's own /usage, and never an estimate from token counts.
---

# api-cost

## Settings

- `<out>`: `${user_config.output_dir}` where the host substituted a non-empty value; otherwise `${CLAUDE_PLUGIN_DATA}`.
- Gemini: `${user_config.gemini_billing_table}` (`project.dataset.table`) and `${user_config.gemini_gcloud_account}`; an empty table leaves Gemini unverified.
- Admin keys, one per vendor and account, passed only as environment variables: `ANTHROPIC_ADMIN_KEY_PERSONAL`, `ANTHROPIC_ADMIN_KEY_WORK`, `OPENAI_ADMIN_KEY_PERSONAL`, `OPENAI_ADMIN_KEY_WORK`. Where each lives in the user's secret store is the user's local rules' to say.
- Requires `python3` (standard library only; `brew install python` where absent) and, for Gemini, the `bq` CLI (`brew install --cask google-cloud-sdk`, or `gcloud components install bq`).

## Procedure

1. Settle the range: `--days N` (default 30, ending today, UTC) or `--start`/`--end` (end exclusive).
2. Run, reading each key inline from the secret store in the same command, with a missing entry left empty:
   `ANTHROPIC_ADMIN_KEY_PERSONAL="$(<read secret> 2>/dev/null)" … python3 "${CLAUDE_PLUGIN_ROOT}/scripts/api_cost.py" --out "<out>" --days N --gemini-table "<table>" --gemini-gcloud-account "<account>"`
3. Read the printed status: each vendor × account is `verified` with a row count or `unverified` with its reason. An unverified account is reported as such, never as zero spend.
4. Reply with the totals per vendor and account, the notes the run printed (data freshness, a clamped start), each unverified account with its reason, and the path of `costs.json`.
5. For a dashboard, `costs.json` (one array of rows) is the data file; `status.json` says which accounts it covers.

## Row

`date, vendor, account, scope, api_key, item, cost, currency, source, as_of` — `cost` is the vendor-billed amount before credits; `scope` is the Anthropic workspace, OpenAI project or GCP project; `item` is the model, line item or SKU.

## Boundaries

- Read-only against every vendor: cost endpoints and one BigQuery SELECT, nothing else.
- A key is never echoed, printed, logged or written to a file; error text is redacted before it is saved.
- Gemini is read for the personal account only.
- Recent days are partial: Anthropic's `data_refreshed_at` and the billing export's lag bound them, and the run's notes say so.
