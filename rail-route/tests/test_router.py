import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from railroute.model import ALL_DAYS, Stop, Trip  # noqa: E402
from railroute.router import ktx_minutes, search, trips_for_day  # noqa: E402


def hm(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def trip(no, *stops, days=ALL_DAYS, ttype="KTX", remark=""):
    return Trip(no, ttype, days, remark, tuple(Stop(s, hm(t)) for s, t in stops))


def nos(its):
    return [[r.trip.train_no for r in it.rides] for it in its]


class SlackTests(unittest.TestCase):
    def test_15_minutes_ok_14_not(self):
        a = trip("1", ("A", "08:00"), ("X", "09:00"))
        ok = trip("2", ("X", "09:15"), ("B", "10:00"))
        short = trip("3", ("X", "09:14"), ("B", "09:50"))
        its = search([a, ok, short], "A", "B")
        self.assertEqual(nos(its), [["1", "2"]])
        self.assertEqual(its[0].waits, [15])

    def test_max_wait(self):
        a = trip("1", ("A", "08:00"), ("X", "09:00"))
        b = trip("2", ("X", "13:00"), ("B", "14:00"))
        c = trip("3", ("X", "13:01"), ("B", "14:00"))
        self.assertEqual(nos(search([a, b, c], "A", "B", max_wait=240)), [["1", "2"]])


class StationRuleTests(unittest.TestCase):
    def test_transfer_only_at_same_station(self):
        a = trip("1", ("A", "08:00"), ("X", "09:00"))
        b = trip("2", ("Y", "09:30"), ("B", "10:00"))
        self.assertEqual(search([a, b], "A", "B"), [])

    def test_never_ride_through_destination(self):
        a = trip("1", ("A", "08:00"), ("B", "08:30"), ("X", "09:00"))
        b = trip("2", ("X", "09:30"), ("B", "10:00"))
        self.assertEqual(nos(search([a, b], "A", "B")), [["1"]])

    def test_padded_train_numbers_are_one_train(self):
        a = trip("64", ("A", "08:00"), ("X", "09:00"))
        b = trip("064", ("X", "09:30"), ("B", "10:00"))
        self.assertEqual(search([a, b], "A", "B"), [])


class SetTests(unittest.TestCase):
    def test_origin_and_destination_sets(self):
        a = trip("1", ("A", "08:00"), ("B", "09:00"))
        c = trip("2", ("A2", "08:00"), ("C", "09:30"))
        got = search([a, c], {"A", "A2"}, {"B", "C"})
        self.assertEqual(sorted(map(tuple, nos(got))), [("1",), ("2",)])

    def test_after_and_arrive_by(self):
        early = trip("1", ("A", "07:00"), ("B", "08:00"))
        mid = trip("2", ("A", "12:30"), ("B", "14:00"))
        late = trip("3", ("A", "21:00"), ("B", "23:00"))
        got = search([early, mid, late], "A", "B", after=hm("12:00"), arrive_by=hm("22:30"))
        self.assertEqual(nos(got), [["2"]])


class TransferDepthTests(unittest.TestCase):
    def test_two_transfers_enumerated_and_capped(self):
        a = trip("1", ("A", "08:00"), ("X", "09:00"))
        b = trip("2", ("X", "09:30"), ("Y", "10:00"))
        c = trip("3", ("Y", "10:30"), ("B", "11:00"))
        self.assertEqual(nos(search([a, b, c], "A", "B")), [["1", "2", "3"]])
        self.assertEqual(search([a, b, c], "A", "B", max_transfers=1), [])


class GroupingTests(unittest.TestCase):
    def test_same_trains_grouped_with_alternatives(self):
        a = trip("1", ("A", "08:00"), ("X", "09:00"), ("Y", "09:30"))
        b = trip("2", ("X", "09:50"), ("Y", "10:10"), ("B", "11:00"))
        its = search([a, b], "A", "B")
        self.assertEqual(len(its), 1)
        self.assertEqual(its[0].rides[0].arr_station, "X")
        self.assertEqual(its[0].alternatives, [("Y",)])


class MidnightTests(unittest.TestCase):
    def test_past_midnight_connection(self):
        a = Trip("1", "KTX", ALL_DAYS, "", (Stop("A", hm("23:00")), Stop("X", 1440 + 10)))
        b = Trip("2", "KTX", ALL_DAYS, "", (Stop("X", 1440 + 30), Stop("B", 1440 + 60)))
        its = search([a, b], "A", "B")
        self.assertEqual(its[0].waits, [20])
        self.assertEqual(its[0].duration, 120)


class KtxMinutesTests(unittest.TestCase):
    def test_counts_only_ktx_class(self):
        feeder = trip("1807", ("A", "16:00"), ("X", "17:00"), ttype="ITX-마음")
        main = trip("782", ("X", "17:30"), ("B", "20:10"), ttype="KTX-이음")
        slow = trip("1604", ("A", "15:00"), ("B", "21:00"), ttype="ITX-마음")
        its = {tuple(r.trip.train_no for r in it.rides): it for it in search([feeder, main, slow], "A", "B")}
        self.assertEqual(ktx_minutes(its[("1807", "782")]), 160)
        self.assertEqual(ktx_minutes(its[("1604",)]), 0)


class RunDayTests(unittest.TestCase):
    def test_filter(self):
        weekend = trip("1", ("A", "08:00"), ("B", "09:00"), days=frozenset({5, 6}))
        weekday = trip("2", ("A", "08:00"), ("B", "09:00"), days=frozenset(range(5)))
        unknown = trip("3", ("A", "08:00"), ("B", "09:00"), days=None)
        sunday = trips_for_day([weekend, weekday, unknown], 6)
        self.assertEqual([t.train_no for t in sunday], ["1", "3"])
        self.assertTrue(any(it.run_days_unknown for it in search(sunday, "A", "B")))


if __name__ == "__main__":
    unittest.main()
