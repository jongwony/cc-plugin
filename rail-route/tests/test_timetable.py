import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from railroute.model import ALL_DAYS
from railroute.timetable import (
    merge_trips,
    norm,
    order_stops,
    parse_general_rows,
    parse_ktx_rows,
    parse_run_days,
    parse_time,
)


class CellTests(unittest.TestCase):
    def test_norm(self):
        self.assertEqual(norm("비 고"), "비고")
        self.assertEqual(norm("大\xa0田"), "大田")
        self.assertEqual(norm(dt.time(5, 7)), "05:07")
        self.assertEqual(norm(1803.0), "1803")

    def test_time(self):
        self.assertEqual(parse_time("05:07"), 307)
        self.assertIsNone(parse_time("00:00"))
        self.assertIsNone(parse_time("대구선경유"))
        self.assertEqual(parse_time("13:20:00"), 800)

    def test_run_days(self):
        self.assertEqual(parse_run_days("매일"), ALL_DAYS)
        self.assertEqual(parse_run_days(""), ALL_DAYS)
        self.assertEqual(parse_run_days("00:00"), ALL_DAYS)
        self.assertEqual(parse_run_days("금토일"), frozenset({4, 5, 6}))
        self.assertEqual(parse_run_days("월"), frozenset({0}))
        self.assertEqual(parse_run_days("중앙선경유"), ALL_DAYS)
        self.assertIsNone(parse_run_days("명절"))


class KtxLayoutTests(unittest.TestCase):
    rows = [
        ["", "경부선 하행", "", "", "", "", "", "경부선 상행", "", "", "", ""],
        ["", "열차번호", "편성", "서울", "대전", "부산", "비고", "열차번호", "편성", "부산", "서울", "비고(정차역)"],
        ["", "", "", "首尔", "大田", "釜山", "", "", "", "釜山", "首尔", ""],
        ["", "1", "KTX", "05:13", "00:00", "07:50", "매일", "2", "KTX산천", "05:09", "07:53", "금토일"],
    ]

    def test_side_by_side_blocks(self):
        raws = parse_ktx_rows(self.rows, "t")
        by_no = {r.train_no: r for r in raws}
        self.assertEqual(by_no["1"].stops, [("서울", 313), ("부산", 470)])
        self.assertEqual(by_no["1"].remark, "매일")
        self.assertEqual(by_no["2"].train_type, "KTX-산천")
        self.assertEqual(by_no["2"].remark, "금토일")


class GeneralLayoutTests(unittest.TestCase):
    rows = [
        ["동해선 하행", "", ""],
        ["시발역", "부전", "동대구"],
        ["", "釜田", "東大邱"],
        ["", "Bujeon", "Dongdaegu"],
        ["", "05:11", "06:25"],
        ["열차종별", "ITX-마음", "누리로"],
        ["열차번호", "1801", "1851"],
        ["부전", "05:11", "00:00"],
        ["남창", "05:39", "00:00"],
        ["경주", "06:43", "대구선경유"],
        ["서경주", "06:55", "07:19"],
        ["비고", "", "토일"],
        ["종착역", "동해", "포항"],
        ["", "東海", "浦項"],
        ["", "Donghae", "Pohang"],
        ["", "09:35", "07:50"],
    ]

    def test_transposed_block(self):
        raws = {r.train_no: r for r in parse_general_rows(self.rows, "t")}
        self.assertEqual(
            raws["1801"].stops,
            [("부전", 311), ("남창", 339), ("경주", 403), ("서경주", 415), ("동해", 575)],
        )
        # origin row adds 동대구 for a train whose origin lies outside the sheet
        self.assertIn(("동대구", 385), raws["1851"].stops)
        self.assertNotIn("경주", [s for s, _ in raws["1851"].stops])
        self.assertEqual(raws["1851"].remark, "토일")
        self.assertEqual(raws["1801"].train_type, "ITX-마음")


class OrderTests(unittest.TestCase):
    def test_wraps_midnight(self):
        stops = order_stops([("부산", 4), ("서울", 20 * 60 + 49), ("구포", 23 * 60 + 50)])
        self.assertEqual([s.station for s in stops], ["서울", "구포", "부산"])
        self.assertEqual(stops[-1].t, 1440 + 4)

    def test_merge_union_across_sheets(self):
        from railroute.timetable import RawTrip

        trips = merge_trips(
            [
                RawTrip("1886", "무궁화", "", [("남창", 388), ("경주", 458)], "a"),
                RawTrip("1886", "무궁화", "", [("경주", 458), ("동대구", 512)], "b"),
            ]
        )
        self.assertEqual(len(trips), 1)
        self.assertEqual([s.station for s in trips[0].stops], ["남창", "경주", "동대구"])
        self.assertEqual(trips[0].sources, ("a", "b"))


if __name__ == "__main__":
    unittest.main()
