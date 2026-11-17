import contextlib
import importlib.util
import io
import json
import pathlib
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from unittest import mock

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "findmy_location.py"
spec = importlib.util.spec_from_file_location("findmy_location", SCRIPT)
fl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fl)

REAL_SLEEP = time.sleep
NB = " "
LIST_ROW = f"\t\t\t\t15 텍스트 Description: Phone A, 6.3km, 집{NB}· 지금{NB}· 거의 방전된 배터리 ID: ListEntityRow-ListEntityRow-ListEntityRow, Secondary Actions: Cancel, Scroll Down, Scroll Up"
SELECTED_ROW = "21 버튼 (selected) Phone A, 세부사항 열기, 43km, 예시시 견본리, 지금 ID: ListEntityRow-ListEntityRow, Secondary Actions: Cancel, Scroll Down, Scroll Up, 세부사항 열기, 36분, 재생"
NO_LOCATION = "13 텍스트 Description: Old B, 발견된 위치 없음 ID: ListEntityRow-ListEntityRow, Secondary Actions: Cancel, Name:이 기기 제거…"
MAP_PIN = "40 generic element Description: Phone A,지도 핀 ID: VKPointFeature"


def ocu_output(lines):
    return "help text [] ignored\n" + fl.MARKER + json.dumps(lines, ensure_ascii=False) + "\n"


def isolate(test, running=True):
    """Keep a test off the real Find My and the real lock: a temporary lock path, a stubbed app state and quit."""
    tmp = tempfile.TemporaryDirectory()
    test.addCleanup(tmp.cleanup)
    mock.patch.object(fl, "LOCK_PATH", pathlib.Path(tmp.name) / "session.lock").start()
    mock.patch.object(fl, "find_my_running", return_value=running).start()
    test.quit = mock.patch.object(fl, "quit_find_my", return_value=True).start()
    test.addCleanup(mock.patch.stopall)


def run_main(argv=()):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = fl.main(list(argv))
    return code, json.loads(out.getvalue())


class RowText(unittest.TestCase):
    def test_list_row_keeps_the_text_and_drops_the_actions_tail(self):
        self.assertEqual(fl.row_text(LIST_ROW), f"Phone A, 6.3km, 집{NB}· 지금{NB}· 거의 방전된 배터리")

    def test_selected_row_drops_the_marker_and_the_actions_tail(self):
        self.assertEqual(fl.row_text(SELECTED_ROW), "Phone A, 세부사항 열기, 43km, 예시시 견본리, 지금")

    def test_row_without_a_location(self):
        self.assertEqual(fl.row_text(NO_LOCATION), "Old B, 발견된 위치 없음")

    def test_read_rows_keeps_only_device_list_rows(self):
        with mock.patch.object(fl, "ocu_js", return_value=ocu_output([LIST_ROW, MAP_PIN, SELECTED_ROW])):
            self.assertEqual(fl.read_rows(), [fl.row_text(LIST_ROW), fl.row_text(SELECTED_ROW)])


class Output(unittest.TestCase):
    def setUp(self):
        self.status = mock.patch.object(fl, "locked_use_status", return_value=("unlocked", True, None)).start()
        isolate(self)

    def test_ok_prints_the_rows(self):
        with mock.patch.object(fl, "ocu_js", return_value=ocu_output([LIST_ROW])):
            code, result = run_main()
        self.assertEqual((code, result["status"], result["rows"], result["refreshed"]), (0, "ok", [fl.row_text(LIST_ROW)], False))

    def test_output_without_marker_is_an_error(self):
        with mock.patch.object(fl, "ocu_js", return_value="no marker here"):
            code, result = run_main()
        self.assertEqual((code, result["status"]), (3, "error"))
        self.assertIn("unreadable ocu js output", result["message"])

    def test_extractor_error_payload_is_an_error(self):
        with mock.patch.object(fl, "ocu_js", return_value=fl.MARKER + '{"error": "getAXState returned object, not text"}'):
            _, result = run_main()
        self.assertIn("getAXState returned object", result["message"])

    def test_nonzero_exit_is_an_error_with_its_tail(self):
        done = subprocess.CompletedProcess([], 1, "", "Accessibility not granted")
        with mock.patch.object(fl.subprocess, "run", return_value=done):
            _, result = run_main()
        self.assertEqual(result["message"], "ocu js exited 1: Accessibility not granted")

    def test_timeout_is_an_error(self):
        with mock.patch.object(fl.subprocess, "run", side_effect=subprocess.TimeoutExpired("ocu", 30)):
            _, result = run_main()
        self.assertEqual(result["message"], "ocu js timed out after 30s")

    def test_every_outcome_carries_the_same_fields(self):
        with mock.patch.object(fl, "ocu_js", return_value=ocu_output([])):
            _, ok = run_main()
        with mock.patch.object(fl, "ocu_js", side_effect=fl.OcuError("x")):
            _, error = run_main()
        self.assertEqual(set(ok), set(error))


class Refresh(unittest.TestCase):
    def setUp(self):
        mock.patch.object(fl, "locked_use_status", return_value=("unlocked", True, None)).start()
        mock.patch.object(fl.time, "sleep").start()
        isolate(self)

    def commands(self, front="com.example.Front", fail=None):
        calls = []

        def bounded(cmd):
            calls.append(cmd)
            if cmd[0] == "osascript":
                return front, (None if front else "osascript exited 1: denied")
            return (None, "open failed") if fail and cmd[-1] == fail else ("", None)
        mock.patch.object(fl, "run_bounded", side_effect=bounded).start()
        return calls

    def test_refresh_brings_find_my_forward_waits_and_returns_focus(self):
        calls = self.commands()
        with mock.patch.object(fl, "ocu_js", return_value=ocu_output([LIST_ROW])):
            code, result = run_main(["--refresh"])
        self.assertEqual((code, result["refreshed"], result["focus_restored"]), (0, True, True))
        self.assertIn(["open", "-b", fl.FINDMY], calls)
        self.assertEqual(calls[-1], ["open", "-b", "com.example.Front"])
        fl.time.sleep.assert_any_call(fl.REFRESH_WAIT_S)

    def test_focus_returns_when_the_read_fails(self):
        calls = self.commands()
        with mock.patch.object(fl, "ocu_js", side_effect=fl.OcuError("boom")):
            _, result = run_main(["--refresh"])
        self.assertEqual((result["status"], result["focus_restored"]), ("error", True))
        self.assertEqual(calls[-1], ["open", "-b", "com.example.Front"])

    def test_unknown_front_app_is_reported(self):
        self.commands(front=None)
        with mock.patch.object(fl, "ocu_js", return_value=ocu_output([LIST_ROW])):
            _, result = run_main(["--refresh"])
        self.assertEqual(result["focus_restored"], False)
        self.assertIn("front app unknown", result["message"])

    def test_find_my_that_cannot_be_opened_is_an_error_without_a_read(self):
        self.commands(fail=fl.FINDMY)
        with mock.patch.object(fl, "ocu_js") as ocu:
            _, result = run_main(["--refresh"])
        ocu.assert_not_called()
        self.assertIn("could not be brought forward", result["message"])


class LockedSession(unittest.TestCase):
    def setUp(self):
        mock.patch.object(fl.time, "sleep").start()
        isolate(self)

    def test_locked_and_available_wakes_the_display_then_reads(self):
        mock.patch.object(fl, "locked_use_status", return_value=("locked", True, None)).start()
        mock.patch.object(fl, "run_bounded", return_value=(None, "pgrep exited 1: no output")).start()
        with mock.patch.object(fl.subprocess, "Popen") as popen, mock.patch.object(fl, "ocu_js", return_value=ocu_output([LIST_ROW])):
            code, result = run_main()
        popen.assert_called_once()
        self.assertEqual(popen.call_args[0][0], fl.WAKE)
        self.assertEqual((code, result["locked_session"]), (0, True))

    def test_a_running_display_wake_is_reused(self):
        mock.patch.object(fl, "locked_use_status", return_value=("locked", True, None)).start()
        mock.patch.object(fl, "run_bounded", return_value=("4242", None)).start()
        with mock.patch.object(fl.subprocess, "Popen") as popen, mock.patch.object(fl, "ocu_js", return_value=ocu_output([])):
            run_main()
        popen.assert_not_called()

    def test_locked_and_unavailable_is_an_error_without_ocu(self):
        mock.patch.object(fl, "locked_use_status", return_value=("locked", False, "client not approved")).start()
        with mock.patch.object(fl, "ocu_js") as ocu:
            code, result = run_main()
        ocu.assert_not_called()
        self.assertEqual(code, 3)
        self.assertIn("client not approved", result["message"])

    def test_unlocked_session_does_not_wake(self):
        mock.patch.object(fl, "locked_use_status", return_value=("unlocked", True, None)).start()
        with mock.patch.object(fl, "wake_display") as wake, mock.patch.object(fl, "ocu_js", return_value=ocu_output([])):
            run_main()
        wake.assert_not_called()


class UnobservedRetry(unittest.TestCase):
    UNOBSERVED = subprocess.CompletedProcess([], 1, "", "Error: Locked Use " + fl.UNOBSERVED + ".")

    def setUp(self):
        self.wake = mock.patch.object(fl, "wake_display").start()
        self.addCleanup(mock.patch.stopall)

    def test_retries_once_after_waking(self):
        ok = subprocess.CompletedProcess([], 0, ocu_output([LIST_ROW]), "")
        with mock.patch.object(fl.subprocess, "run", side_effect=[self.UNOBSERVED, ok]):
            self.assertEqual(fl.read_rows(), [fl.row_text(LIST_ROW)])
        self.wake.assert_called_once_with(force=True)

    def test_second_unobserved_failure_is_the_error(self):
        with mock.patch.object(fl.subprocess, "run", side_effect=[self.UNOBSERVED, self.UNOBSERVED]):
            with self.assertRaises(fl.OcuError):
                fl.read_rows()
        self.wake.assert_called_once()

    def test_other_failures_are_not_retried(self):
        with mock.patch.object(fl.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "", "other")):
            with self.assertRaises(fl.OcuError):
                fl.read_rows()
        self.wake.assert_not_called()


class Lifecycle(unittest.TestCase):
    def setUp(self):
        mock.patch.object(fl, "locked_use_status", return_value=("unlocked", True, None)).start()
        mock.patch.object(fl.time, "sleep").start()

    def test_a_cold_start_waits_for_find_my_to_update_then_quits(self):
        isolate(self, running=False)
        mock.patch.object(fl, "run_bounded", side_effect=lambda cmd: ("com.example.Front", None) if cmd[0] == "osascript" else ("", None)).start()
        with mock.patch.object(fl, "ocu_js", return_value=ocu_output([LIST_ROW])):
            code, result = run_main()
        self.assertEqual((code, result["cold_start"], result["refreshed"], result["quit"]), (0, True, True, True))
        fl.time.sleep.assert_any_call(fl.REFRESH_WAIT_S)
        self.quit.assert_called_once()

    def test_a_running_find_my_is_read_without_waiting_and_quit(self):
        isolate(self, running=True)
        with mock.patch.object(fl, "ocu_js", return_value=ocu_output([LIST_ROW])):
            code, result = run_main()
        self.assertEqual((code, result["cold_start"], result["refreshed"], result["quit"]), (0, False, False, True))
        self.quit.assert_called_once()

    def test_find_my_is_quit_when_the_read_fails(self):
        isolate(self)
        with mock.patch.object(fl, "ocu_js", side_effect=fl.OcuError("boom")):
            code, result = run_main()
        self.assertEqual((code, result["quit"]), (3, True))
        self.quit.assert_called_once()

    def test_a_held_lock_is_waited_on_then_reported(self):
        isolate(self)
        with open(fl.LOCK_PATH, "w") as held:
            held.write("4242")
            held.flush()
            fl.fcntl.flock(held.fileno(), fl.fcntl.LOCK_EX)
            mock.patch.object(fl, "LOCK_WAIT_S", 0).start()
            with mock.patch.object(fl, "ocu_js") as ocu:
                code, result = run_main()
        ocu.assert_not_called()
        self.quit.assert_not_called()
        self.assertEqual(code, 3)
        self.assertIn("pid 4242", result["message"])

    def test_a_dead_holders_lock_is_taken(self):
        isolate(self)
        fl.LOCK_PATH.write_text("999999")
        with mock.patch.object(fl, "ocu_js", return_value=ocu_output([])):
            code, result = run_main()
        self.assertEqual((code, result["lock_waited_s"]), (0, 0))
        self.assertEqual(fl.LOCK_PATH.read_text(), "")

    def test_the_display_is_woken_after_the_wait_for_the_lock(self):
        isolate(self)
        order = []
        mock.patch.object(fl, "locked_use_status", side_effect=lambda: order.append("status") or ("locked", True, None)).start()
        mock.patch.object(fl, "wake_display", side_effect=lambda: order.append("wake")).start()
        entered = fl.Lifecycle.__enter__
        mock.patch.object(fl.Lifecycle, "__enter__", lambda self: order.append("lock") or entered(self)).start()
        with mock.patch.object(fl, "ocu_js", return_value=ocu_output([])):
            run_main()
        self.assertEqual(order, ["lock", "status", "wake"])

    def test_two_runs_take_turns(self):
        isolate(self)
        mock.patch.object(fl.time, "sleep", new=REAL_SLEEP).start()
        inside, overlaps = [0], []
        guard = threading.Lock()

        def slow_read(_args):
            with guard:
                inside[0] += 1
                overlaps.append(inside[0])
            REAL_SLEEP(0.3)
            with guard:
                inside[0] -= 1
            return ocu_output([])
        mock.patch.object(fl, "ocu_js", side_effect=slow_read).start()
        results = []

        def one():
            result = {}
            with fl.Lifecycle(result):
                fl.read_rows()
            results.append(result)
        threads = [threading.Thread(target=one) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(max(overlaps), 1)
        self.assertEqual(len(results), 2)


@unittest.skipUnless(shutil.which("node"), "node not installed")
class Extractor(unittest.TestCase):
    def run_js(self, state):
        prelude = (
            "const out = [];\n"
            "globalThis.nodeRepl = { write: s => out.push(s) };\n"
            "globalThis.cua = { getApp: async () => ({ getAXState: async () => " + state + " }) };\n"
            "process.on('beforeExit', () => console.log(JSON.stringify(out)));\n"
        )
        proc = subprocess.run(["node", "--input-type=module", "-e", prelude + fl.READ.read_text()], capture_output=True, text=True, timeout=30)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        return json.loads(proc.stdout)

    def test_extractor_keeps_list_rows_from_text_state(self):
        out = self.run_js(json.dumps(LIST_ROW + "\n" + MAP_PIN))
        self.assertEqual(out, ["\n" + fl.MARKER + json.dumps([LIST_ROW.strip()], ensure_ascii=False, separators=(",", ":")) + "\n"])

    def test_extractor_reports_a_non_text_state(self):
        out = self.run_js("({ text: 'x' })")
        self.assertIn('"error":"getAXState returned object, not text"', out[0])


if __name__ == "__main__":
    unittest.main()
