import csv
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from apicost import cli, normalize  # noqa: E402
from apicost.model import FIELDS, CollectError, Row  # noqa: E402


def row(**kw):
    base = dict(date="2026-11-01", vendor="openai", account="work", scope="p", api_key="k", item="i",
                cost=1.0, currency="USD", source="s", as_of="2026-11-02T00:00:00Z")
    base.update(kw)
    return Row(**base)


class NormalizeTest(unittest.TestCase):
    def test_merges_duplicates_and_drops_zero(self):
        rows = normalize.merge([row(cost=1.25), row(cost=0.75), row(item="z", cost=0.0),
                                row(date="2026-10-31", cost=2.0)])
        self.assertEqual([(r.date, r.cost) for r in rows], [("2026-10-31", 2.0), ("2026-11-01", 2.0)])

    def test_totals_by_vendor_account_currency(self):
        t = normalize.totals([row(cost=1.0), row(cost=2.5), row(account="personal", cost=3.0)])
        self.assertEqual(t, {("openai", "work", "USD"): 3.5, ("openai", "personal", "USD"): 3.0})

    def test_writes_json_array_csv_and_status(self):
        with tempfile.TemporaryDirectory() as d:
            normalize.write(d, [row()], [], {"start": "2026-11-01"})
            data = json.loads((Path(d) / "costs.json").read_text())
            self.assertIsInstance(data, list)
            self.assertEqual(set(data[0]), set(FIELDS))
            with (Path(d) / "costs.csv").open() as f:
                self.assertEqual(next(csv.reader(f)), list(FIELDS))
            self.assertIn("accounts", json.loads((Path(d) / "status.json").read_text()))


class RunTest(unittest.TestCase):
    def args(self, *extra):
        return cli.parse_args(["--out", "/tmp/unused", "--start", "2026-11-01", "--end", "2026-11-03", *extra])

    def test_missing_key_is_unverified_and_others_still_run(self):
        calls = []

        def fake(account, key, start, end):
            calls.append((account, key))
            return [row(vendor="anthropic", account=account)], []

        def boom(account, key, start, end):
            raise CollectError("HTTP 401 from x")

        rows, statuses, meta = cli.run(
            self.args(), today=date(2026, 11, 23),
            collectors={"anthropic": fake, "openai": boom},
            env={"ANTHROPIC_ADMIN_KEY_PERSONAL": "a", "OPENAI_ADMIN_KEY_WORK": "b"},
        )
        by = {(s.vendor, s.account): s for s in statuses}
        self.assertEqual(by[("anthropic", "personal")].state, "verified")
        self.assertIn("ANTHROPIC_ADMIN_KEY_WORK", by[("anthropic", "work")].reason)
        self.assertEqual(by[("openai", "work")].reason, "HTTP 401 from x")
        self.assertEqual(by[("gemini", "personal")].state, "unverified")
        self.assertNotIn(("gemini", "work"), by)
        self.assertEqual(calls, [("personal", "a")])
        self.assertEqual(len(rows), 1)
        self.assertEqual(meta["end_exclusive"], "2026-11-03")

    def test_error_reason_is_redacted(self):
        def leak(account, key, start, end):
            raise CollectError(f"HTTP 401: Incorrect API key provided: {key} or sk-admin-abcd****wxyz")

        _, statuses, _ = cli.run(self.args("--vendors", "openai", "--accounts", "work"),
                                 today=date(2026, 11, 23), collectors={"openai": leak},
                                 env={"OPENAI_ADMIN_KEY_WORK": "secret-value-123"})
        self.assertNotIn("secret-value-123", statuses[0].reason)
        self.assertNotIn("sk-admin", statuses[0].reason)

    def test_unknown_account_exits_cleanly(self):
        with self.assertRaises(SystemExit):
            cli.run(self.args("--accounts", "personal,team"), today=date(2026, 11, 23), env={})

    def test_unexpected_error_keeps_other_accounts(self):
        def bad(account, key, start, end):
            raise KeyError("start_time")

        def good(account, key, start, end):
            return [row(vendor="anthropic", account=account), row(vendor="anthropic", account=account)], []

        rows, statuses, _ = cli.run(self.args("--vendors", "anthropic,openai", "--accounts", "work"),
                                    today=date(2026, 11, 23), collectors={"anthropic": good, "openai": bad},
                                    env={"ANTHROPIC_ADMIN_KEY_WORK": "a", "OPENAI_ADMIN_KEY_WORK": "b"})
        by = {(s.vendor, s.account): s for s in statuses}
        self.assertIn("KeyError", by[("openai", "work")].reason)
        self.assertEqual(by[("anthropic", "work")].rows, len(rows))

    def test_default_range_includes_today(self):
        a = cli.parse_args(["--out", "/tmp/unused", "--days", "7"])
        s, e = cli.resolve_range(a, date(2026, 11, 23))
        self.assertEqual((s, e), (date(2026, 11, 17), date(2026, 11, 24)))

    def test_gemini_uses_configured_table(self):
        got = {}

        def gem(account, table, acct, start, end):
            got.update(account=account, table=table, acct=acct)
            return [], []

        _, statuses, _ = cli.run(self.args("--vendors", "gemini", "--gemini-table", "p.d.t",
                                           "--gemini-gcloud-account", "me@example.com"),
                                 today=date(2026, 11, 23), gemini_collect=gem, env={})
        self.assertEqual(got, {"account": "personal", "table": "p.d.t", "acct": "me@example.com"})
        self.assertEqual(statuses[0].state, "verified")


if __name__ == "__main__":
    unittest.main()
