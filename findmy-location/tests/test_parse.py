import importlib.util
import pathlib
import unittest

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


if __name__ == "__main__":
    unittest.main()
