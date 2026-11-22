"""Seat states observed on korail.com, and what they mean for an itinerary.

Seats file (JSON):

    {
      "observations": [
        {"dep": "대전", "arr": "서울", "passengers": 2,
         "trains": {"108": "seat", "112": "standing_plus_seat"}}
      ],
      "extra_trains": [
        {"train_no": "4301", "train_type": "무궁화",
         "stops": [["대전", "18:03"], ["천안", "19:10"]]}
      ]
    }

An observation records what one korail.com direct query for a station pair
showed, per train, for a passenger count. Later observations override earlier
ones. ``extra_trains`` adds trains seen on korail.com that the published
timetable lacks (temporary trains, usually numbered 4xxx or 9xxx).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from .model import ALL_DAYS, Stop, Trip
from .router import Itinerary, Ride, train_key

SEATED = {"seat", "near_soldout"}
NOT_SEATED = {"standing_plus_seat", "waitlist", "soldout", "insufficient"}
STATUSES = SEATED | NOT_SEATED

# Labels korail.com prints, mapped to the vocabulary above.
KORAIL_LABELS = {
    "일반실": "seat",
    "예약가능": "seat",
    "매진임박": "near_soldout",
    "입석 + 좌석": "standing_plus_seat",
    "입석+좌석": "standing_plus_seat",
    "예약대기": "waitlist",
    "매진": "soldout",
    "좌석부족": "insufficient",
}


def _hm(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


@dataclass
class SeatBook:
    # (train_key, dep, arr, passengers) -> status
    states: dict[tuple[str, str, str, int], str] = field(default_factory=dict)
    extra: list[Trip] = field(default_factory=list)

    @classmethod
    def load(cls, path: str | Path | None) -> "SeatBook":
        if not path:
            return cls()
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls.from_dict(data)

    @classmethod
    def from_dict(cls, data: dict) -> "SeatBook":
        book = cls()
        for obs in data.get("observations", []):
            n = int(obs["passengers"])
            for no, status in obs.get("trains", {}).items():
                if status not in STATUSES:
                    raise ValueError(f"unknown seat status {status!r} for train {no}")
                book.states[(train_key(no), obs["dep"], obs["arr"], n)] = status
        for x in data.get("extra_trains", []):
            stops, prev = [], -1
            for station, hhmm in x["stops"]:
                t = _hm(hhmm)
                while t < prev:  # past midnight
                    t += 1440
                stops.append(Stop(station, t))
                prev = t
            book.extra.append(
                Trip(str(x["train_no"]), x.get("train_type", "?"), ALL_DAYS, "관측", tuple(stops), ("observed",))
            )
        return book

    def status(self, train_no: str, dep: str, arr: str, n: int) -> str | None:
        return self.states.get((train_key(train_no), dep, arr, n))


@dataclass
class RideCheck:
    ride: Ride
    state: str  # "seated" | "unknown" | "blocked"
    tickets: list[tuple[int, int]]  # stop-index segments to buy when seated
    next_queries: list[tuple[str, str]]  # station pairs still worth querying


def check_ride(ride: Ride, book: SeatBook, n: int) -> RideCheck:
    t, i, j = ride.trip, ride.i, ride.j
    st = lambda a, b: book.status(t.train_no, t.stops[a].station, t.stops[b].station, n)  # noqa: E731
    name = lambda a: t.stops[a].station  # noqa: E731

    # Confirmed cover: fewest observed seated segments chaining i -> j.
    best: dict[int, list[tuple[int, int]]] = {i: []}
    for a in range(i, j):
        if a not in best:
            continue
        for b in range(a + 1, j + 1):
            if st(a, b) in SEATED and (b not in best or len(best[a]) + 1 < len(best[b])):
                best[b] = best[a] + [(a, b)]
    if j in best:
        return RideCheck(ride, "seated", best[j], [])

    whole = st(i, j)
    if whole is None:
        return RideCheck(ride, "unknown", [], [(name(i), name(j))])

    # The whole ride is not seated: look for one split point on the same train.
    pending: list[tuple[str, str]] = []
    for x in range(i + 1, j):
        first, second = st(i, x), st(x, j)
        if first in NOT_SEATED or second in NOT_SEATED:
            continue
        for (a, b), s in (((i, x), first), ((x, j), second)):
            if s is None and (name(a), name(b)) not in pending:
                pending.append((name(a), name(b)))
    return RideCheck(ride, "unknown" if pending else "blocked", [], pending)


@dataclass
class ItinCheck:
    it: Itinerary
    rides: list[RideCheck]

    @property
    def state(self) -> str:
        states = {r.state for r in self.rides}
        if "blocked" in states:
            return "blocked"
        return "unknown" if "unknown" in states else "seated"

    @property
    def tickets(self) -> int:
        return sum(len(r.tickets) for r in self.rides)


def check(it: Itinerary, book: SeatBook, n: int) -> ItinCheck:
    return ItinCheck(it, [check_ride(r, book, n) for r in it.rides])


def apply_policy(checks: list[ItinCheck], transfers: str) -> list[ItinCheck]:
    """auto: keep itineraries with at most one transfer while any of them is
    still alive (seated or unknown); otherwise allow two."""
    if transfers == "1":
        return [c for c in checks if c.it.transfers <= 1]
    if transfers == "2":
        return checks
    alive_short = [c for c in checks if c.it.transfers <= 1 and c.state != "blocked"]
    return [c for c in checks if c.it.transfers <= 1] if alive_short else checks


def plan(checks: list[ItinCheck], priority=None) -> list[dict]:
    """Station-pair queries that would settle the open itineraries. One
    korail.com direct query per pair lists every train on it. Whole-ride
    queries come before split queries; within each, the pair whose best open
    itinerary has the lowest ``priority`` (its score if it turned out seated)
    comes first, then the pair touching the most itineraries."""
    prio = priority or (lambda c: c.it.arr)
    pairs: dict[tuple[str, str], dict] = {}
    for c in checks:
        if c.state != "unknown":
            continue
        for rc in c.rides:
            whole = (rc.ride.dep_station, rc.ride.arr_station)
            for pair in rc.next_queries:
                e = pairs.setdefault(
                    pair,
                    {"dep": pair[0], "arr": pair[1], "split": pair != whole, "trains": set(), "itineraries": set(), "first": None, "best": None},
                )
                p = prio(c)
                e["best"] = p if e["best"] is None else min(e["best"], p)
                e["split"] = e["split"] and pair != whole
                e["trains"].add(rc.ride.trip.train_no)
                e["itineraries"].add(c.it.key())
                t = rc.ride.trip
                k = next(n for n, s in enumerate(t.stops) if s.station == pair[0])
                e["first"] = min(e["first"], t.stops[k].t) if e["first"] is not None else t.stops[k].t
    out = sorted(pairs.values(), key=lambda e: (e["split"], e["best"], -len(e["itineraries"]), e["first"]))
    return [
        {
            "dep": e["dep"],
            "arr": e["arr"],
            "query_from": f"{(e['first'] % 1440) // 60:02d}:00",
            "split": e["split"],
            "trains": sorted(e["trains"], key=lambda s: int(s) if s.isdigit() else 0),
            "itineraries": len(e["itineraries"]),
        }
        for e in out
    ]


def rank(
    checks: list[ItinCheck],
    book: SeatBook,
    n: int,
    weights: dict[str, float],
    last_mile: dict[str, int] | None = None,
) -> list[tuple[ItinCheck, dict]]:
    """Fully seated itineraries, best score first."""
    out = [(c, score(c, book, n, weights, last_mile or {})) for c in checks if c.state == "seated"]
    out.sort(key=lambda e: (e[1]["total"], e[0].it.arr, e[0].tickets))
    seen, best = set(), []
    for c, sc in out:  # one row per train sequence: its best change point
        if c.it.key() not in seen:
            seen.add(c.it.key())
            best.append((c, sc))
    return best


SLOW_TYPES = ("ITX-마음", "ITX-새마을", "새마을", "무궁화", "누리로")


def near_soldout_segments(c: ItinCheck, book: SeatBook, n: int) -> int:
    count = 0
    for rc in c.rides:
        t = rc.ride.trip
        for a, b in rc.tickets:
            if book.status(t.train_no, t.stops[a].station, t.stops[b].station, n) == "near_soldout":
                count += 1
    return count


def slow_minutes(it: Itinerary) -> int:
    return sum(r.arr - r.dep for r in it.rides if any(r.trip.train_type.startswith(s) for s in SLOW_TYPES))


def score(c: ItinCheck, book: SeatBook, n: int, weights: dict[str, float], last_mile: dict[str, int]) -> dict:
    """Lower is better. Every term is in minutes-equivalent."""
    it = c.it
    home_arr = it.arr + last_mile.get(it.rides[-1].arr_station, 0)
    terms = {
        "arrival_at_home": float(home_arr),
        "transfers": weights["transfer"] * it.transfers,
        "wait": weights["wait"] * sum(it.waits),
        "risk": weights["risk"] * near_soldout_segments(c, book, n),
        "slow": weights["slow"] * slow_minutes(it),
    }
    terms["total"] = sum(terms.values())
    return terms
