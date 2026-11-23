# api-cost

Collects what Anthropic, OpenAI and Gemini billed for API use into one dataset that a dashboard can read. The amounts come from each vendor's billing record. Nothing is estimated from token counts.

| Vendor | Source | Credential |
|---|---|---|
| Anthropic | Usage and Cost Analytics API, `GET /v1/organizations/analytics/cost` (beta) | Admin API key (`sk-ant-admin01-…`) |
| OpenAI | Organization Costs API, `GET /v1/organization/costs` | Admin key (`sk-admin-…`) |
| Gemini | Cloud Billing export table in BigQuery | gcloud account that can read the table |

Personal and work accounts are collected for Anthropic and OpenAI. Gemini is collected for the personal account only.

## Output

The run writes three files to the output directory:

- `costs.json` — one array of rows. Use this file as the dashboard's data file.
- `costs.csv` — the same rows.
- `status.json` — the range, and for each vendor and account: `verified` with a row count, or `unverified` with the reason.

Each row has these fields:

| Field | Meaning |
|---|---|
| `date` | UTC day, `YYYY-MM-DD` |
| `vendor` | `anthropic`, `openai` or `gemini` |
| `account` | `personal` or `work` |
| `scope` | Anthropic workspace, OpenAI project, or GCP project |
| `api_key` | API key id, where the vendor reports one |
| `item` | Model, line item, or SKU |
| `cost` | Billed amount before credits |
| `currency` | ISO code, for example `USD` |
| `source` | Endpoint or table the amount came from |
| `as_of` | When the vendor last refreshed the data, or when it was fetched |

To narrow a work account to your own keys or projects, filter on `api_key` or `scope`.

## Run

```bash
ANTHROPIC_ADMIN_KEY_PERSONAL="…" OPENAI_ADMIN_KEY_WORK="…" \
  python3 api-cost/scripts/api_cost.py --out ./out --days 30 \
  --gemini-table my-project.billing.gcp_billing_export_v1_XXXX --gemini-gcloud-account me@example.com
```

- Python 3 standard library only. The Gemini step also needs the `bq` CLI from the Google Cloud SDK.
- A key that is not set marks its account `unverified`. The other accounts still run.
- Recent days can be partial. Anthropic data refreshes within about 4 to 24 hours. The billing export can lag by a day or more.

Tests: `python3 -m unittest discover -s api-cost/tests`

## Get the admin keys

An admin key can read the whole organization's billing. Store it in a secret manager, and give it an expiry.

**Anthropic** ([guide](https://docs.anthropic.com/en/docs/manage-claude/admin-api-keys))

1. Sign in to the Claude Console as a member with the admin role.
2. Open `platform.claude.com/settings/admin-keys`.
3. Click **Create admin key**, enter a name, select an expiry, and click **Add**.
4. Copy the secret. It starts with `sk-ant-admin01-` and is shown only once.

An individual Console account has no Admin API. Create an organization first at `platform.claude.com/settings/organization`.

**OpenAI** ([guide](https://help.openai.com/en/articles/9687866-admin-and-audit-logs-api-for-the-api-platform))

1. Sign in to the API Platform as an organization owner.
2. Open the organization settings, then **Admin keys** (`platform.openai.com/settings/organization/admin-keys`).
3. Select **Create new admin key**, and give it read access to usage.
4. Copy the secret. It is shown only once.

Only organization owners can create these keys. For a work organization where you are not an owner, ask an owner to create the key.

**Gemini**

The Gemini API has no cost endpoint. To get cost data, turn on Cloud Billing export to BigQuery for the billing account that pays for your Gemini API key. The detailed usage cost table is named `gcp_billing_export_resource_v1_…`. Then give that table to `--gemini-table`.
