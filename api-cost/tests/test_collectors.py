import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from apicost import anthropic, dates, gemini, openai  # noqa: E402
from apicost.http import encode  # noqa: E402
from apicost.model import CollectError  # noqa: E402


class FakeGet:
    """Serves recorded-shape pages in order and records each call."""

    def __init__(self, pages):
        self.pages = list(pages)
        self.calls = []

    def __call__(self, url, params, headers):
        self.calls.append((url, dict(params), dict(headers)))
        return self.pages.pop(0)


def anth_row(day, model, cents, cost_type="tokens", ws="wrkspc_A", key="apikey_1"):
    return {
        "starting_at": f"{day}T00:00:00Z",
        "ending_at": f"{day}T00:00:00Z",
        "group": {"workspace_id": ws, "api_key_id": key, "model": model, "cost_type": cost_type,
                  "service_tier": None},
        "cost": {"currency": "USD", "amount": cents, "list_amount": cents, "requests": None},
    }


class AnthropicTest(unittest.TestCase):
    def test_parses_cents_and_paginates(self):
        get = FakeGet([
            {"data": [anth_row("2026-11-01", "claude-opus-5-5", "41280.000000")],
             "has_more": True, "next_page": "page_2", "data_refreshed_at": "2026-11-02T04:00:00Z"},
            {"data": [anth_row("2026-11-02", None, "150.000000", cost_type="web_search")],
             "has_more": False, "next_page": None, "data_refreshed_at": "2026-11-02T04:00:00Z"},
        ])
        rows, notes = anthropic.collect("work", "k", date(2026, 11, 1), date(2026, 11, 3), get=get,
                                        today=date(2026, 11, 23))
        self.assertEqual([r.cost for r in rows], [412.80, 1.50])
        self.assertEqual(rows[0].item, "claude-opus-5-5")
        self.assertEqual(rows[1].item, "web_search")
        self.assertEqual(rows[0].scope, "wrkspc_A")
        self.assertEqual(rows[0].as_of, "2026-11-02T04:00:00Z")
        self.assertEqual(get.calls[1][1]["page"], "page_2")
        self.assertIsNone(get.calls[0][1]["page"])
        h = get.calls[0][2]
        self.assertEqual(h["anthropic-beta"], anthropic.BETA)
        self.assertEqual(get.calls[0][1]["time_bucket_width"], "1d")
        self.assertTrue(any("refreshed" in n for n in notes))

    def test_non_token_cost_type_keeps_model(self):
        self.assertEqual(anthropic.item_of({"model": "m", "cost_type": "web_search"}), "m · web_search")

    def test_splits_ranges_over_31_days(self):
        get = FakeGet([{"data": [], "has_more": False}] * 2)
        anthropic.collect("personal", "k", date(2026, 9, 1), date(2026, 10, 15), get=get,
                          today=date(2026, 11, 23))
        spans = [(c[1]["starting_at"], c[1]["ending_at"]) for c in get.calls]
        self.assertEqual(spans, [("2026-09-01T00:00:00Z", "2026-10-02T00:00:00Z"),
                                 ("2026-10-02T00:00:00Z", "2026-10-15T00:00:00Z")])

    def test_clamps_to_earliest_served_day(self):
        s, e, notes = anthropic.clamp(date(2025, 12, 1), date(2026, 1, 10), date(2026, 3, 1))
        self.assertEqual(s, date(2026, 1, 1))
        self.assertTrue(notes)


class OpenAITest(unittest.TestCase):
    def test_parses_buckets_and_paginates(self):
        t1 = dates.unix(date(2026, 11, 1))
        t2 = dates.unix(date(2026, 11, 2))
        res = lambda v, li: {"object": "organization.costs.result", "amount": {"value": v, "currency": "usd"},  # noqa: E731
                             "line_item": li, "project_id": "proj_1", "api_key_id": "key_1"}
        get = FakeGet([
            {"object": "page", "data": [{"object": "bucket", "start_time": t1, "end_time": t2,
                                         "results": [res(0.06, "gpt-6, input")]}],
             "has_more": True, "next_page": "page_x"},
            {"object": "page", "data": [{"object": "bucket", "start_time": t2, "end_time": t2 + 86400,
                                         "results": [res(1.5, "gpt-6, output")]}],
             "has_more": False, "next_page": None},
        ])
        rows, _ = openai.collect("personal", "k", date(2026, 11, 1), date(2026, 11, 3), get=get)
        self.assertEqual([(r.date, r.cost, r.currency) for r in rows],
                         [("2026-11-01", 0.06, "USD"), ("2026-11-02", 1.5, "USD")])
        self.assertEqual(rows[0].scope, "proj_1")
        self.assertEqual(get.calls[1][1]["page"], "page_x")
        self.assertEqual(get.calls[0][2]["Authorization"], "Bearer k")
        self.assertEqual(get.calls[0][1]["group_by"], openai.GROUP_BY)

    def test_group_by_encodes_as_repeated_key(self):
        q = encode({"group_by": ["project_id", "line_item"], "page": None})
        self.assertEqual(q, "group_by=project_id&group_by=line_item")


class GeminiTest(unittest.TestCase):
    def test_parses_bq_rows(self):
        seen = {}

        def run(cmd, acct):
            seen["cmd"], seen["acct"] = cmd, acct
            return [{"day": "2026-11-01", "project_id": "p1", "sku": "Gemini 4 Neon input", "currency": "USD",
                     "cost": "0.42"}]

        rows, notes = gemini.collect("personal", "p.billing.gcp_billing_export_v1_X", "me@example.com",
                                     date(2026, 11, 1), date(2026, 11, 2), run=run)
        self.assertEqual(rows[0].cost, 0.42)
        self.assertEqual(rows[0].vendor, "gemini")
        self.assertEqual(seen["acct"], "me@example.com")
        self.assertIn("--parameter=start:DATE:2026-11-01", seen["cmd"])
        self.assertIn("`p.billing.gcp_billing_export_v1_X`", seen["cmd"][-1])

    def test_rejects_malformed_table(self):
        with self.assertRaises(CollectError):
            gemini.build_cmd("x`; DROP", date(2026, 1, 1), date(2026, 1, 2))


if __name__ == "__main__":
    unittest.main()
