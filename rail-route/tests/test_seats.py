import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from railroute.model import ALL_DAYS, Stop, Trip  # noqa: E402
from railroute.router import search  # noqa: E402
from railroute.config import DEFAULT_WEIGHTS, Config  # noqa: E402
from railroute.seats import SeatBook, apply_policy, check, plan, rank, score  # noqa: E402


def hm(s):
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def trip(no, *stops):
    return Trip(no, "KTX", ALL_DAYS, "", tuple(Stop(s, hm(t)) for s, t in stops))


def book(obs, n=2, extra=()):
    return SeatBook.from_dict(
        {
            "observations": [{"dep": d, "arr": a, "passengers": n, "trains": tr} for d, a, tr in obs],
            "extra_trains": list(extra),
        }
    )


LONG = trip("782", ("A", "18:00"), ("X", "19:00"), ("Y", "19:30"), ("B", "20:00"))


class RideTests(unittest.TestCase):
    def ride_state(self, b, n=2):
        it = search([LONG], "A", "B")[0]
        return check(it, b, n)

    def test_whole_seat(self):
        c = self.ride_state(book([("A", "B", {"782": "seat"})]))
        self.assertEqual(c.state, "seated")
        self.assertEqual(c.tickets, 1)

    def test_unknown_asks_whole_pair_first(self):
        c = self.ride_state(book([]))
        self.assertEqual(c.state, "unknown")
        self.assertEqual(c.rides[0].next_queries, [("A", "B")])

    def test_split_when_whole_blocked(self):
        b = book([("A", "B", {"782": "standing_plus_seat"}), ("A", "X", {"782": "near_soldout"}), ("X", "B", {"782": "seat"})])
        c = self.ride_state(b)
        self.assertEqual(c.state, "seated")
        self.assertEqual(c.rides[0].tickets, [(0, 1), (1, 3)])

    def test_split_queries_then_blocked(self):
        b = book([("A", "B", {"782": "soldout"})])
        c = self.ride_state(b)
        self.assertEqual(c.state, "unknown")
        self.assertEqual(set(c.rides[0].next_queries), {("A", "X"), ("X", "B"), ("A", "Y"), ("Y", "B")})
        b = book(
            [
                ("A", "B", {"782": "soldout"}),
                ("A", "X", {"782": "soldout"}),
                ("A", "Y", {"782": "insufficient"}),
            ]
        )
        self.assertEqual(self.ride_state(b).state, "blocked")

    def test_passenger_count_matters(self):
        b = book([("A", "B", {"782": "seat"})], n=1)
        self.assertEqual(self.ride_state(b, n=2).state, "unknown")
        self.assertEqual(self.ride_state(b, n=1).state, "seated")

    def test_padded_numbers_match(self):
        t = trip("64", ("A", "08:00"), ("B", "09:00"))
        it = search([t], "A", "B")[0]
        self.assertEqual(check(it, book([("A", "B", {"064": "seat"})]), 2).state, "seated")


class PlanRankTests(unittest.TestCase):
    def setUp(self):
        self.direct = trip("1604", ("A", "15:00"), ("B", "21:00"))
        self.f = trip("1807", ("A", "16:00"), ("X", "17:00"))
        self.g = trip("782", ("X", "17:30"), ("Y", "18:30"), ("B", "20:00"))

    def test_plan_groups_by_pair_and_orders(self):
        its = search([self.direct, self.f, self.g], "A", "B")
        q = plan([check(it, book([]), 2) for it in its])
        # The transfer itinerary arrives first, so its pairs lead.
        self.assertEqual([(e["dep"], e["arr"]) for e in q], [("A", "X"), ("X", "B"), ("A", "B")])
        self.assertTrue(all(not e["split"] for e in q))

    def test_rank_by_arrival(self):
        its = search([self.direct, self.f, self.g], "A", "B")
        b = book(
            [
                ("A", "B", {"1604": "seat"}),
                ("A", "X", {"1807": "seat"}),
                ("X", "B", {"782": "soldout"}),
                ("X", "Y", {"782": "near_soldout"}),
                ("Y", "B", {"782": "near_soldout"}),
            ]
        )
        zero = {"transfer": 0, "wait": 0, "risk": 0, "slow": 0}
        r = rank([check(it, b, 2) for it in its], b, 2, zero)
        self.assertEqual([c.it.rides[0].trip.train_no for c, _ in r], ["1807", "1604"])
        # Default weights: one transfer (60) + 30 min wait (15) + two near-soldout
        # segments (40) outweigh arriving 60 minutes earlier.
        r = rank([check(it, b, 2) for it in its], b, 2, DEFAULT_WEIGHTS)
        self.assertEqual([c.it.rides[0].trip.train_no for c, _ in r], ["1604", "1807"])
        sc = dict(r[1][1])
        self.assertEqual(sc["arrival_at_home"], hm("20:00"))
        self.assertEqual((sc["transfers"], sc["wait"], sc["risk"]), (60, 15, 40))

    def test_policy_auto_escalates_to_two(self):
        a = trip("1", ("A", "08:00"), ("X", "09:00"))
        b2 = trip("2", ("X", "09:30"), ("Y", "10:00"))
        c = trip("3", ("Y", "10:30"), ("B", "11:00"))
        d = trip("4", ("X", "09:40"), ("B", "12:00"))
        its = search([a, b2, c, d], "A", "B")
        alive = apply_policy([check(it, book([]), 2) for it in its], "auto")
        self.assertEqual({it.it.transfers for it in alive}, {1})
        dead = book([("X", "B", {"4": "soldout"})])
        checks = apply_policy([check(it, dead, 2) for it in its], "auto")
        self.assertEqual({it.it.transfers for it in checks}, {1, 2})


class ScoreTests(unittest.TestCase):
    def test_last_mile_and_slow_minutes(self):
        slow = Trip("1604", "ITX-마음", ALL_DAYS, "", (Stop("A", hm("15:00")), Stop("C", hm("20:00"))))
        fast = trip("306", ("A", "15:30"), ("B", "18:00"))
        its = search([slow, fast], "A", {"B", "C"})
        b = book([("A", "C", {"1604": "seat"}), ("A", "B", {"306": "seat"})])
        w = dict(DEFAULT_WEIGHTS)
        r = rank([check(it, b, 2) for it in its], b, 2, w, {"B": 120, "C": 10})
        by_no = {c.it.rides[0].trip.train_no: sc for c, sc in r}
        self.assertEqual(by_no["1604"]["arrival_at_home"], hm("20:10"))
        self.assertEqual(by_no["1604"]["slow"], 0.2 * 300)
        self.assertEqual(by_no["306"]["arrival_at_home"], hm("20:00"))
        self.assertEqual(by_no["306"]["slow"], 0)


class LinkTests(unittest.TestCase):
    def test_cross_station_needs_transit_plus_slack(self):
        a = trip("1", ("A", "08:00"), ("P", "09:00"))
        ok = trip("2", ("Q", "09:45"), ("B", "11:00"))
        short = trip("3", ("Q", "09:44"), ("B", "10:50"))
        cfg = Config.from_dict({"links": [["P", "Q", 30]]})
        its = search([a, ok, short], "A", "B", links=cfg.links)
        self.assertEqual([[r.trip.train_no for r in it.rides] for it in its], [["1", "2"]])
        self.assertEqual(search([a, ok], "A", "B"), [])

    def test_config_homes_and_weights(self):
        cfg = Config.from_dict({"homes": {"h": {"A": 10}}, "weights": {"wait": 1}})
        self.assertEqual(cfg.home("h"), {"A": 10})
        self.assertEqual(cfg.weights["wait"], 1.0)
        self.assertEqual(cfg.weights["transfer"], 60.0)
        with self.assertRaises(SystemExit):
            cfg.home("missing")


class ExtraTrainTests(unittest.TestCase):
    def test_observed_train_joins_graph(self):
        b = book([], extra=[{"train_no": "4303", "train_type": "무궁화", "stops": [["X", "18:03"], ["B", "20:49"]]}])
        a = trip("1888", ("A", "14:07"), ("X", "16:25"))
        its = search([a] + b.extra, "A", "B")
        self.assertEqual([[r.trip.train_no for r in it.rides] for it in its], [["1888", "4303"]])

    def test_unknown_status_rejected(self):
        with self.assertRaises(ValueError):
            book([("A", "B", {"1": "maybe"})])


if __name__ == "__main__":
    unittest.main()
