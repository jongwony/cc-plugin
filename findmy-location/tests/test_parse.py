import contextlib
import importlib.util
import io
import json
import pathlib
import shutil
import subprocess
import unittest
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "findmy_location.py"
spec = importlib.util.spec_from_file_location("findmy_location", SCRIPT)
fl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fl)

NB = " "
DEVICES = ["Phone A", "Watch B"]
LIST_ROW = f"\t\t\t\t12 텍스트 Description: Phone A, 6.3km, 집{NB}· 지금{NB}· 4분의 3 충전된 배터리 ID: ListEntityRow-ListEntityRow"
SELECTED_ROW = "13 버튼 (selected) Watch B, 세부사항 열기, 집 | 6.3km, 예시시 견본동, 지금 ID: ListEntityRow-ListEntityRow"
SELECTED_WITH_BATTERY = f"13 버튼 (selected) Phone A, 세부사항 열기, 집 | 6.3km, 예시시 견본동, 지금{NB}· 4분의 3 충전된 배터리 ID: ListEntityRow"
NOT_FOUND = "14 텍스트 Description: Phone A, 발견된 위치 없음 ID: ListEntityRow"
OLD = f"15 텍스트 Description: Phone A, 6.3km, 집{NB}· 5개월 전 ID: ListEntityRow"
PAUSED = f"16 텍스트 Description: Phone A, 6.3km, 집{NB}· 일시 정지됨 ID: ListEntityRow"
OTHER = f"17 텍스트 Description: Buds D, 6.3km, 집{NB}· 지금 ID: ListEntityRow"
ODD_NAMES = ['Phone, A', 'Phone "A"', "User's iPhone", "Phone $DEVICE_COLOR", "Phone []"]


def row(line, devices=DEVICES):
    rows = fl.match_rows([line], devices)
    return rows[0] if rows else None


class ParseRow(unittest.TestCase):
    def test_list_row(self):
        self.assertEqual(row(LIST_ROW), {"name": "Phone A", "place_label": "집", "distance": "6.3km", "address": None, "freshness": "지금",
                                         "text": f"Phone A, 6.3km, 집{NB}· 지금{NB}· 4분의 3 충전된 배터리"})

    def test_selected_row_has_address(self):
        self.assertEqual(row(SELECTED_ROW), {"name": "Watch B", "place_label": "집", "distance": "6.3km", "address": "예시시 견본동", "freshness": "지금",
                                             "text": "Watch B, 세부사항 열기, 집 | 6.3km, 예시시 견본동, 지금"})

    def test_selected_row_drops_battery(self):
        parsed = row(SELECTED_WITH_BATTERY)
        self.assertEqual((parsed["address"], parsed["freshness"]), ("예시시 견본동", "지금"))

    def test_selected_row_away_from_a_named_place(self):
        line = ("21 버튼 (selected) Phone A, 세부사항 열기, 43km, 예시시 견본리, 지금 ID: ListEntityRow-ListEntityRow, "
                "Secondary Actions: Cancel, Scroll Down, Scroll Up, 세부사항 열기, 36분, 재생")
        parsed = row(line)
        self.assertEqual({k: parsed[k] for k in ("name", "place_label", "distance", "address", "freshness")},
                         {"name": "Phone A", "place_label": None, "distance": "43km", "address": "예시시 견본리", "freshness": "지금"})
        self.assertTrue(fl.is_fresh(parsed))

    def test_selected_row_away_with_battery_and_comma_address(self):
        parsed = row(f"21 버튼 (selected) Phone A, 세부사항 열기, 43km, 예시시, 견본리, 3분 전{NB}· 4분의 3 충전된 배터리 ID: ListEntityRow")
        self.assertEqual((parsed["place_label"], parsed["distance"], parsed["address"], parsed["freshness"]), (None, "43km", "예시시, 견본리", "3분 전"))

    def test_list_row_without_distance_at_a_place(self):
        parsed = row(f"12 텍스트 Description: Watch B, 집{NB}· 4시간 전 ID: ListEntityRow")
        self.assertEqual((parsed["distance"], parsed["place_label"], parsed["freshness"]), (None, "집", "4시간 전"))
        self.assertFalse(fl.is_fresh(parsed))

    def test_not_found_row(self):
        self.assertEqual(row(NOT_FOUND)["freshness"], "발견된 위치 없음")

    def test_row_of_an_unconfigured_device_is_ignored(self):
        self.assertIsNone(row(OTHER))

    def test_names_with_punctuation(self):
        for name in ODD_NAMES:
            parsed = row(f"12 텍스트 Description: {name}, 6.3km, 집{NB}· 지금 ID: ListEntityRow", [name])
            self.assertEqual((parsed["name"], parsed["distance"], parsed["place_label"], parsed["freshness"]), (name, "6.3km", "집", "지금"), name)
            parsed = row(f"13 버튼 (selected) {name}, 세부사항 열기, 집 | 6.3km, 예시시 견본동, 지금 ID: ListEntityRow", [name])
            self.assertEqual((parsed["name"], parsed["address"]), (name, "예시시 견본동"), name)

    def test_name_is_anchored_by_the_row_grammar(self):
        other = [f"12 텍스트 Description: Phone, A, 6.3km, 집{NB}· 지금 ID: ListEntityRow",
                 "13 버튼 (selected) Phone, A, 세부사항 열기, 집 | 6.3km, 예시시 견본동, 지금 ID: ListEntityRow",
                 "14 텍스트 Description: Phone, A, 발견된 위치 없음 ID: ListEntityRow"]
        for line in other:
            self.assertEqual(fl.match_rows([line], ["Phone"]), [], line)
        own = [f"12 텍스트 Description: Phone, 6.3km, 집{NB}· 지금 ID: ListEntityRow",
               "13 버튼 (selected) Phone, 세부사항 열기, 집 | 6.3km, 예시시 견본동, 지금 ID: ListEntityRow",
               "14 텍스트 Description: Phone, 발견된 위치 없음 ID: ListEntityRow"]
        for line in own:
            self.assertEqual([r["name"] for r in fl.match_rows([line], ["Phone"])], ["Phone"], line)
        both = fl.match_rows([own[0], other[0]], ["Phone", "Phone, A"])
        self.assertEqual([(r["name"], r["freshness"]) for r in both], [("Phone", "지금"), ("Phone, A", "지금")])

    def test_two_rows_of_one_name_are_ambiguous_and_not_picked(self):
        lines = [f"12 텍스트 Description: Phone, 6.3km, 집{NB}· 지금 ID: ListEntityRow", f"13 텍스트 Description: Phone, 2.1km, 회사{NB}· 지금 ID: ListEntityRow"]
        rows = fl.match_rows(lines, ["Phone"])
        self.assertEqual(rows, [{"name": "Phone", "ambiguous": True, "freshness": None}])
        self.assertIsNone(fl.pick(rows, ["Phone"]))

    def test_place_and_address_with_comma(self):
        parsed = row(f"12 텍스트 Description: Phone A, 6.3km, 예시시, 견본동{NB}· 지금 ID: ListEntityRow")
        self.assertEqual((parsed["distance"], parsed["place_label"]), ("6.3km", "예시시, 견본동"))
        parsed = row("13 버튼 (selected) Phone A, 세부사항 열기, 집 | 6.3km, 예시시, 견본동, 지금 ID: ListEntityRow")
        self.assertEqual((parsed["address"], parsed["freshness"]), ("예시시, 견본동", "지금"))

    def test_list_row_without_distance(self):
        parsed = row(f"12 텍스트 Description: Phone A, 집{NB}· 지금 ID: ListEntityRow")
        self.assertEqual((parsed["distance"], parsed["place_label"], parsed["freshness"]), (None, "집", "지금"))

    def test_freshness_gate(self):
        self.assertTrue(fl.is_fresh(row(LIST_ROW)))
        self.assertTrue(fl.is_fresh({"freshness": "3분 전"}))
        for line in (OLD, PAUSED, NOT_FOUND):
            self.assertFalse(fl.is_fresh(row(line)), line)

    def test_pick_prefers_primary_then_fallback(self):
        rows = [row(PAUSED), row(SELECTED_ROW)]
        self.assertEqual(fl.pick(rows, DEVICES)["name"], "Watch B")
        self.assertIsNone(fl.pick(rows, ["Phone A"]))
        rows = [row(LIST_ROW), row(SELECTED_ROW)]
        self.assertEqual(fl.pick(rows, DEVICES)["name"], "Phone A")


class Config(unittest.TestCase):
    def devices_from(self, argv, stdin=""):
        seen = []
        with mock.patch.object(fl, "locate", side_effect=lambda devices, result: seen.append(devices) or result.update(status="ok")):
            with contextlib.redirect_stdout(io.StringIO()) as out:
                code = fl.main(argv, io.StringIO(stdin))
        return code, seen, out.getvalue()

    def test_stdin_keeps_names_as_data(self):
        for name in ODD_NAMES:
            code, seen, _ = self.devices_from(["--devices-stdin"], name + "\nWatch B\n")
            self.assertEqual((code, seen), (0, [[name, "Watch B"]]), name)

    def test_unsubstituted_or_empty_line_counts_as_unset(self):
        _, seen, _ = self.devices_from(["--devices-stdin"], "${user_config.primary_device}\nWatch B\n")
        self.assertEqual(seen, [["Watch B"]])
        _, seen, _ = self.devices_from(["--devices-stdin"], "Phone A\n${user_config.fallback_device}\n")
        self.assertEqual(seen, [["Phone A"]])
        _, seen, _ = self.devices_from(["--devices-stdin"], "Phone A\n")
        self.assertEqual(seen, [["Phone A"]])

    def test_unconfigured_names_the_stdin_setup(self):
        code, seen, out = self.devices_from(["--devices-stdin"], "\n\n")
        self.assertEqual((code, seen), (2, []))
        message = json.loads(out)["message"]
        self.assertIn("--values-stdin <<'FINDMY_LOCATION_CONFIG_END'", message)
        self.assertIn('"primary_device"', message)

    def test_flags_still_work(self):
        _, seen, _ = self.devices_from(["--primary", "Phone A", "--fallback", ""])
        self.assertEqual(seen, [["Phone A"]])


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.now += seconds


RESTORE = ["open", "-b", "com.example.front"]


ACTIVATE = ["open", "-b", fl.FINDMY]


def run_main(read_rows, clock=None, front=("com.example.front", None), restore_reason=None, activate_reason=None):
    clock = clock or FakeClock()
    calls, run_at, selected = [], [], []

    def bounded(cmd):
        calls.append(cmd)
        run_at.append(clock.now)
        reason = {tuple(RESTORE): restore_reason, tuple(ACTIVATE): activate_reason}.get(tuple(cmd))
        return (None, reason) if reason else ("", None)

    with contextlib.ExitStack() as stack:
        stack.enter_context(mock.patch.object(fl, "read_rows", side_effect=read_rows))
        stack.enter_context(mock.patch.object(fl, "select", side_effect=lambda text: selected.append(text) or True))
        stack.enter_context(mock.patch.object(fl, "front_app", return_value=front))
        stack.enter_context(mock.patch.object(fl, "run_bounded", side_effect=bounded))
        stack.enter_context(mock.patch.object(fl.time, "monotonic", side_effect=clock.monotonic))
        stack.enter_context(mock.patch.object(fl.time, "sleep", side_effect=clock.sleep))
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = fl.main(["--primary", "Phone A", "--fallback", "Watch B"])
    run_main.run_at = run_at
    run_main.selected = selected
    return code, json.loads(out.getvalue()), calls


def reads_of(*batches):
    batches = iter(batches)
    return lambda devices, timeout=30: next(batches)


class Orchestration(unittest.TestCase):
    def test_reread_that_turned_stale_keeps_fresh_target(self):
        code, out, _ = run_main(reads_of([row(LIST_ROW)], [row(PAUSED)]))
        self.assertEqual((code, out["status"], out["device"]["freshness"]), (0, "ok", "지금"))

    def test_reread_without_the_row_keeps_fresh_target(self):
        code, out, _ = run_main(reads_of([row(LIST_ROW)], []))
        self.assertEqual((code, out["device"]["name"]), (0, "Phone A"))

    def test_fresh_reread_supplies_address(self):
        code, out, _ = run_main(reads_of([row(LIST_ROW)], [row(SELECTED_WITH_BATTERY)]))
        self.assertEqual(out["device"]["address"], "예시시 견본동")
        self.assertNotIn("text", out["device"])

    def test_select_gets_the_matched_row_text(self):
        run_main(reads_of([row(LIST_ROW)], [row(SELECTED_WITH_BATTERY)]))
        self.assertEqual(run_main.selected, [row(LIST_ROW)["text"]])

    def test_activation_reports_restored_focus(self):
        code, out, calls = run_main(reads_of([row(PAUSED)], [row(LIST_ROW)], [row(SELECTED_WITH_BATTERY)]))
        self.assertEqual((code, out["activated_findmy"], out["focus_restored"]), (0, True, True))
        self.assertEqual(calls, [ACTIVATE, RESTORE])

    def test_read_failure_after_activation_keeps_focus_diagnostics(self):
        batches = iter([[row(PAUSED)]])

        def read(devices, timeout=30):
            try:
                return next(batches)
            except StopIteration:
                raise fl.OcuError("ocu js exited 1: boom")

        code, out, calls = run_main(read, restore_reason="open exited 1: no such app")
        self.assertEqual((code, out["status"], out["activated_findmy"]), (3, "error", True))
        self.assertEqual((out["focus_restored"], out["focus_note"]), (False, "open exited 1: no such app"))
        self.assertIn("boom", out["message"])

    def test_activation_failure_is_an_error_without_waiting(self):
        clock = FakeClock()
        reads = []

        def read(devices, timeout=30):
            reads.append(timeout)
            return [row(PAUSED)]

        code, out, calls = run_main(read, clock=clock, activate_reason="open exited 1: unable to find application")
        self.assertEqual((code, out["status"], out["activated_findmy"]), (3, "error", False))
        self.assertEqual(out["activation_error"], "open exited 1: unable to find application")
        self.assertEqual((len(reads), clock.now, calls), (1, 0.0, [ACTIVATE]))

    def test_focus_returns_when_a_read_fails_in_the_wait(self):
        batches = iter([[row(PAUSED)]])

        def read(devices, timeout=30):
            try:
                return next(batches)
            except StopIteration:
                raise fl.OcuError("ocu js exited 1: permission denied")

        code, out, calls = run_main(read)
        self.assertEqual((code, out["status"]), (3, "error"))
        self.assertIn("permission denied", out["message"])
        self.assertEqual(calls[-1], RESTORE)

    def test_wait_stays_within_the_deadline(self):
        clock = FakeClock()
        timeouts = []

        def read(devices, timeout=30):
            timeouts.append(timeout)
            clock.now += min(timeout, 4)
            return [row(PAUSED)]

        code, out, calls = run_main(read, clock=clock)
        self.assertEqual((code, out["status"], out["activated_findmy"]), (1, "stale_or_missing", True))
        self.assertTrue(all(t <= fl.WAIT_S for t in timeouts[1:]))
        self.assertEqual(calls[0], ACTIVATE)
        self.assertLessEqual(run_main.run_at[-1] - run_main.run_at[0], fl.WAIT_S + 1)
        self.assertEqual(calls[-1], RESTORE)

    def test_timeout_at_the_deadline_ends_the_wait_as_stale(self):
        clock = FakeClock()
        batches = iter([[row(PAUSED)]])

        def read(devices, timeout=30):
            try:
                return next(batches)
            except StopIteration:
                clock.now += timeout
                raise fl.OcuError("ocu js timed out", timed_out=True)

        code, out, calls = run_main(read, clock=clock)
        self.assertEqual((code, out["status"]), (1, "stale_or_missing"))
        self.assertEqual(calls[-1], RESTORE)

    def test_unknown_front_app_is_reported_not_restored(self):
        code, out, calls = run_main(reads_of([row(PAUSED)], [row(LIST_ROW)], [row(SELECTED_WITH_BATTERY)]), front=(None, "osascript exited 1: not authorized"))
        self.assertEqual((code, out["focus_restored"]), (0, False))
        self.assertIn("not authorized", out["focus_note"])
        self.assertEqual(calls, [ACTIVATE])

    def test_failed_restore_is_reported(self):
        code, out, _ = run_main(reads_of([row(PAUSED)], [row(LIST_ROW)], [row(SELECTED_WITH_BATTERY)]), restore_reason="open exited 1: no such app")
        self.assertEqual((out["focus_restored"], out["focus_note"]), (False, "open exited 1: no such app"))

    def test_no_activation_leaves_focus_fields_empty(self):
        _, out, calls = run_main(reads_of([row(SELECTED_WITH_BATTERY)]))
        self.assertEqual((out["activated_findmy"], out["focus_restored"], out["focus_note"]), (False, None, None))
        self.assertEqual(calls, [])

    def test_every_status_carries_the_same_fields(self):
        keys = set(run_main(reads_of([row(SELECTED_WITH_BATTERY)]))[1])

        def fail(devices, timeout=30):
            raise fl.OcuError("boom")

        self.assertEqual(set(run_main(fail)[1]), keys)
        with contextlib.redirect_stdout(io.StringIO()) as out:
            fl.main(["--primary", ""])
        self.assertEqual(set(json.loads(out.getvalue())), keys)


class Subprocesses(unittest.TestCase):
    def proc(self, code=0, stdout="", stderr=""):
        return subprocess.CompletedProcess(["x"], code, stdout, stderr)

    def test_marker_line_is_decoded_whatever_the_payload(self):
        lines = [f"12 텍스트 Description: {n}, 6.3km, 집{NB}· 지금 ID: ListEntityRow" for n in ODD_NAMES]
        stdout = "help: returns [] or [\"x\"]\nFINDMY_ROWS [\"stale\"]\n" + fl.MARKER + json.dumps(lines) + "\n"
        with mock.patch.object(fl.subprocess, "run", return_value=self.proc(0, stdout)):
            self.assertEqual([r["name"] for r in fl.read_rows(ODD_NAMES)], ODD_NAMES)

    def test_empty_marker_payload_is_no_rows(self):
        with mock.patch.object(fl.subprocess, "run", return_value=self.proc(0, "help []\n" + fl.MARKER + "[]\n")):
            self.assertEqual(fl.read_rows(DEVICES), [])

    def test_output_without_marker_is_an_error(self):
        with mock.patch.object(fl.subprocess, "run", return_value=self.proc(0, '["Phone A, 지금"]')):
            with self.assertRaisesRegex(fl.OcuError, "unreadable"):
                fl.read_rows(DEVICES)

    def test_extractor_error_payload_is_an_error(self):
        with mock.patch.object(fl.subprocess, "run", return_value=self.proc(0, fl.MARKER + '{"error": "getAXState returned object, not text"}\n')):
            with self.assertRaisesRegex(fl.OcuError, "getAXState returned object"):
                fl.read_rows(DEVICES)

    def test_nonzero_exit_is_an_error_with_stderr_tail(self):
        with mock.patch.object(fl.subprocess, "run", return_value=self.proc(1, "", "Accessibility not granted")):
            with self.assertRaisesRegex(fl.OcuError, "Accessibility not granted"):
                fl.read_rows(DEVICES)

    def test_timeout_is_an_error(self):
        with mock.patch.object(fl.subprocess, "run", side_effect=subprocess.TimeoutExpired("ocu", 5)):
            with self.assertRaises(fl.OcuError) as caught:
                fl.read_rows(DEVICES, timeout=5)
        self.assertTrue(caught.exception.timed_out)

    def test_front_app_failures_carry_a_reason(self):
        cases = [
            (self.proc(1, "", "not authorized"), "not authorized"),
            (subprocess.TimeoutExpired("osascript", 5), "timed out"),
            (self.proc(0, "\n"), "no front app"),
        ]
        for outcome, reason in cases:
            kwargs = {"side_effect": outcome} if isinstance(outcome, Exception) else {"return_value": outcome}
            with mock.patch.object(fl.subprocess, "run", **kwargs):
                front, why = fl.front_app()
            self.assertIsNone(front)
            self.assertIn(reason, why)

    def test_front_app_success(self):
        with mock.patch.object(fl.subprocess, "run", return_value=self.proc(0, "com.example.front\n")):
            self.assertEqual(fl.front_app(), ("com.example.front", None))

    def test_first_read_failure_prints_error_and_exits_3(self):
        def read(devices, timeout=30):
            raise fl.OcuError("ocu js exited 1: boom")

        code, out, calls = run_main(read)
        self.assertEqual((code, out["status"]), (3, "error"))
        self.assertIn("read_at", out)
        self.assertEqual(calls, [])



@unittest.skipUnless(shutil.which("node"), "node is not installed")
class JavaScript(unittest.TestCase):
    def run_js(self, prelude, body):
        code = prelude + "\n" + body
        proc = subprocess.run(["node", "--input-type=module", "-e", code], capture_output=True, text=True, timeout=30)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return proc.stdout

    def fake_app(self, state="\"\"", matches="[]"):
        return (
            "const out = []; const clicked = [];\n"
            "globalThis.nodeRepl = { write: s => out.push(s) };\n"
            "globalThis.cua = { getApp: async () => ({\n"
            "  getAXState: async () => " + state + ",\n"
            "  query: async () => ({ matches: " + matches + " }),\n"
            "  click: async i => clicked.push(i) }) };\n"
            "process.on('beforeExit', () => console.log(JSON.stringify({ out, clicked })));\n"
        )

    def test_select_clicks_the_exact_row_not_the_first_prefix(self):
        text = f"Phone, 6.3km, 집{NB}· 지금"
        matches = json.dumps([
            {"index": 1, "title": f"Phone, A, 6.3km, 집{NB}· 지금", "identifier": "ListEntityRow"},
            {"index": 2, "title": text, "identifier": "ListEntityRow"},
        ])
        out = json.loads(self.run_js(self.fake_app(matches=matches), "const TEXT = " + json.dumps(text) + ";" + fl.SELECT))
        self.assertEqual((out["clicked"], out["out"]), ([2], ["selected"]))

    def test_select_without_an_exact_row_clicks_nothing(self):
        matches = json.dumps([{"index": 1, "title": "Phone, A, 6.3km, 집 · 지금", "identifier": "ListEntityRow"}])
        out = json.loads(self.run_js(self.fake_app(matches=matches), 'const TEXT = "Phone, 6.3km, 집 · 지금";' + fl.SELECT))
        self.assertEqual((out["clicked"], out["out"]), ([], ["not_found"]))

    def test_extractor_keeps_list_rows_from_text_state(self):
        state = json.dumps("\t\t12 텍스트 Description: Phone A, 6.3km ID: ListEntityRow-ListEntityRow\n\t\t13 generic element Description: Phone A ID: VKPointFeature")
        out = json.loads(self.run_js(self.fake_app(state=state), fl.READ.read_text()))
        self.assertEqual(out["out"], ["\n" + fl.MARKER + json.dumps(["12 텍스트 Description: Phone A, 6.3km ID: ListEntityRow-ListEntityRow"], ensure_ascii=False, separators=(",", ":")) + "\n"])

    def test_extractor_reports_a_non_text_state(self):
        out = json.loads(self.run_js(self.fake_app(state="({ text: 'x' })"), fl.READ.read_text()))
        self.assertIn('"error":"getAXState returned object, not text"', out["out"][0])


if __name__ == "__main__":
    unittest.main()
