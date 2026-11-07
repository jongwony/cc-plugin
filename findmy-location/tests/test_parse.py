import contextlib
import importlib.util
import io
import json
import pathlib
import subprocess
import unittest
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "findmy_location.py"
spec = importlib.util.spec_from_file_location("findmy_location", SCRIPT)
fl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fl)

NB = " "
LIST_ROW = f"\t\t\t\t12 텍스트 Description: Phone A, 6.3km, 집{NB}· 지금{NB}· 4분의 3 충전된 배터리 ID: ListEntityRow-ListEntityRow"
SELECTED_ROW = "13 버튼 (selected) Watch B, 세부사항 열기, 집 | 6.3km, 예시시 견본동, 지금 ID: ListEntityRow-ListEntityRow"
SELECTED_WITH_BATTERY = f"13 버튼 (selected) Phone A, 세부사항 열기, 집 | 6.3km, 예시시 견본동, 지금{NB}· 4분의 3 충전된 배터리 ID: ListEntityRow"
NOT_FOUND = "14 텍스트 Description: Tag C, 발견된 위치 없음 ID: ListEntityRow"
OLD = f"15 텍스트 Description: Buds D, 6.3km, 집{NB}· 5개월 전 ID: ListEntityRow"
PAUSED = f"16 텍스트 Description: Phone A, 6.3km, 집{NB}· 일시 정지됨 ID: ListEntityRow"


class ParseRow(unittest.TestCase):
    def test_list_row(self):
        self.assertEqual(fl.parse_row(LIST_ROW), {"name": "Phone A", "place_label": "집", "distance": "6.3km", "address": None, "freshness": "지금"})

    def test_selected_row_has_address(self):
        self.assertEqual(fl.parse_row(SELECTED_ROW), {"name": "Watch B", "place_label": "집", "distance": "6.3km", "address": "예시시 견본동", "freshness": "지금"})

    def test_selected_row_drops_battery(self):
        row = fl.parse_row(SELECTED_WITH_BATTERY)
        self.assertEqual((row["address"], row["freshness"]), ("예시시 견본동", "지금"))

    def test_not_found_row(self):
        self.assertEqual(fl.parse_row(NOT_FOUND)["freshness"], "발견된 위치 없음")

    def test_freshness_gate(self):
        self.assertTrue(fl.is_fresh(fl.parse_row(LIST_ROW)))
        self.assertTrue(fl.is_fresh({"freshness": "3분 전"}))
        for line in (OLD, PAUSED, NOT_FOUND):
            self.assertFalse(fl.is_fresh(fl.parse_row(line)), line)

    def test_pick_prefers_primary_then_fallback(self):
        rows = [fl.parse_row(PAUSED), fl.parse_row(SELECTED_ROW)]
        self.assertEqual(fl.pick(rows, ["Phone A", "Watch B"])["name"], "Watch B")
        self.assertIsNone(fl.pick(rows, ["Phone A"]))
        rows = [fl.parse_row(LIST_ROW), fl.parse_row(SELECTED_ROW)]
        self.assertEqual(fl.pick(rows, ["Phone A", "Watch B"])["name"], "Phone A")

    def test_unsubstituted_option_counts_as_unset(self):
        self.assertEqual(fl.configured("${user_config.primary_device}"), "")
        self.assertEqual(fl.configured(" Phone A "), "Phone A")

    def test_unconfigured_exits_without_reading_find_my(self):
        self.assertEqual(fl.main(["--primary", "", "--fallback", ""]), 2)


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


def run_main(read_rows, select=lambda name: True, clock=None):
    clock = clock or FakeClock()
    calls = []
    run_at = []
    with contextlib.ExitStack() as stack:
        stack.enter_context(mock.patch.object(fl, "read_rows", side_effect=read_rows))
        stack.enter_context(mock.patch.object(fl, "select", side_effect=select))
        stack.enter_context(mock.patch.object(fl, "osa", return_value="com.example.front"))
        stack.enter_context(mock.patch.object(fl.subprocess, "run", side_effect=lambda cmd, **kw: (calls.append(cmd), run_at.append(clock.now))))
        stack.enter_context(mock.patch.object(fl.time, "monotonic", side_effect=clock.monotonic))
        stack.enter_context(mock.patch.object(fl.time, "sleep", side_effect=clock.sleep))
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = fl.main(["--primary", "Phone A", "--fallback", "Watch B"])
    run_main.run_at = run_at
    return code, json.loads(out.getvalue()), calls


RESTORE = ["open", "-b", "com.example.front"]


class Orchestration(unittest.TestCase):
    def test_reread_that_turned_stale_keeps_fresh_target(self):
        reads = iter([[fl.parse_row(LIST_ROW)], [fl.parse_row(PAUSED)]])
        code, out, _ = run_main(lambda timeout=30: next(reads))
        self.assertEqual((code, out["status"], out["device"]["freshness"]), (0, "ok", "지금"))

    def test_reread_without_the_row_keeps_fresh_target(self):
        reads = iter([[fl.parse_row(LIST_ROW)], []])
        code, out, _ = run_main(lambda timeout=30: next(reads))
        self.assertEqual((code, out["device"]["name"]), (0, "Phone A"))

    def test_fresh_reread_supplies_address(self):
        selected = SELECTED_WITH_BATTERY
        reads = iter([[fl.parse_row(LIST_ROW)], [fl.parse_row(selected)]])
        code, out, _ = run_main(lambda timeout=30: next(reads))
        self.assertEqual(out["device"]["address"], "예시시 견본동")

    def test_focus_returns_when_a_read_fails_in_the_wait(self):
        reads = iter([[fl.parse_row(PAUSED)]])

        def read(timeout=30):
            try:
                return next(reads)
            except StopIteration:
                raise fl.OcuError("ocu js exited 1: permission denied")

        code, out, calls = run_main(read)
        self.assertEqual((code, out["status"]), (3, "error"))
        self.assertIn("permission denied", out["message"])
        self.assertEqual(calls[-1], RESTORE)

    def test_wait_stays_within_the_deadline(self):
        clock = FakeClock()
        timeouts = []

        def read(timeout=30):
            timeouts.append(timeout)
            clock.now += min(timeout, 4)
            return [fl.parse_row(PAUSED)]

        code, out, calls = run_main(read, clock=clock)
        self.assertEqual((code, out["status"], out["activated_findmy"]), (1, "stale_or_missing", True))
        self.assertTrue(all(t <= fl.WAIT_S for t in timeouts[1:]))
        foreground = run_main.run_at[-1] - run_main.run_at[0]
        self.assertEqual(calls[0], ["open", "-b", fl.FINDMY])
        self.assertLessEqual(foreground, fl.WAIT_S + 1)
        self.assertEqual(calls[-1], RESTORE)

    def test_timeout_at_the_deadline_ends_the_wait_as_stale(self):
        clock = FakeClock()
        reads = iter([[fl.parse_row(PAUSED)]])

        def read(timeout=30):
            try:
                return next(reads)
            except StopIteration:
                clock.now += timeout
                raise fl.OcuError("ocu js timed out", timed_out=True)

        code, out, calls = run_main(read, clock=clock)
        self.assertEqual((code, out["status"]), (1, "stale_or_missing"))
        self.assertEqual(calls[-1], RESTORE)


class OcuFailures(unittest.TestCase):
    def proc(self, code=0, stdout="", stderr=""):
        return subprocess.CompletedProcess(["ocu"], code, stdout, stderr)

    def test_nonzero_exit_is_an_error_with_stderr_tail(self):
        with mock.patch.object(fl.subprocess, "run", return_value=self.proc(1, "", "Accessibility not granted")):
            with self.assertRaisesRegex(fl.OcuError, "Accessibility not granted"):
                fl.read_rows()

    def test_timeout_is_an_error(self):
        with mock.patch.object(fl.subprocess, "run", side_effect=subprocess.TimeoutExpired("ocu", 5)):
            with self.assertRaises(fl.OcuError) as caught:
                fl.read_rows(timeout=5)
        self.assertTrue(caught.exception.timed_out)

    def test_unparsable_output_is_an_error(self):
        with mock.patch.object(fl.subprocess, "run", return_value=self.proc(0, "help text, no rows")):
            with self.assertRaisesRegex(fl.OcuError, "unreadable"):
                fl.read_rows()

    def test_empty_list_is_rows_not_an_error(self):
        with mock.patch.object(fl.subprocess, "run", return_value=self.proc(0, "[]\n")):
            self.assertEqual(fl.read_rows(), [])

    def test_first_read_failure_prints_error_and_exits_3(self):
        def read(timeout=30):
            raise fl.OcuError("ocu js exited 1: boom")

        code, out, calls = run_main(read)
        self.assertEqual((code, out["status"]), (3, "error"))
        self.assertIn("read_at", out)
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
