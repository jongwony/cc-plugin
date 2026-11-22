"""Enumerate itineraries from a set of origins to a set of destinations on one
service day.

A ride is one continuous stay on one train. An itinerary is a chain of rides
that change trains at the same station, with min_slack <= wait <= max_wait at
every change. How a ride is ticketed (whole, or split into segments on the same
train) is decided later from observed seat states; see seats.py.
"""

from __future__ import annotations

import bisect
from collections import defaultdict
from dataclasses import dataclass, field

from .model import Trip


def train_key(no: str) -> str:
    """Korail's web pads train numbers ("064"); the timetable does not ("64")."""
    return no.lstrip("0") or "0"


@dataclass(frozen=True)
class Ride:
    trip: Trip
    i: int  # boarding stop index
    j: int  # alighting stop index

    @property
    def dep(self) -> int:
        return self.trip.stops[self.i].t

    @property
    def arr(self) -> int:
        return self.trip.stops[self.j].t

    @property
    def dep_station(self) -> str:
        return self.trip.stops[self.i].station

    @property
    def arr_station(self) -> str:
        return self.trip.stops[self.j].station


@dataclass
class Itinerary:
    rides: list[Ride]
    # Other change stations that also satisfy the slack rule for the same
    # trains, one tuple per alternative.
    alternatives: list[tuple[str, ...]] = field(default_factory=list)

    @property
    def transfers(self) -> int:
        return len(self.rides) - 1

    @property
    def dep(self) -> int:
        return self.rides[0].dep

    @property
    def arr(self) -> int:
        return self.rides[-1].arr

    @property
    def duration(self) -> int:
        return self.arr - self.dep

    @property
    def waits(self) -> list[int]:
        return [b.dep - a.arr for a, b in zip(self.rides, self.rides[1:])]

    @property
    def run_days_unknown(self) -> bool:
        return any(r.trip.run_days is None for r in self.rides)

    def key(self) -> tuple:
        return (
            tuple(train_key(r.trip.train_no) for r in self.rides),
            self.rides[0].dep_station,
            self.rides[-1].arr_station,
        )


def ktx_minutes(it: Itinerary) -> int:
    """Minutes on KTX-class trains (KTX, KTX-산천, KTX-이음, KTX-청룡; former
    SRT services are labelled KTX in the integrated timetable)."""
    return sum(r.arr - r.dep for r in it.rides if r.trip.train_type.upper().startswith("KTX"))


def trips_for_day(trips: list[Trip], weekday: int, include_unknown: bool = True) -> list[Trip]:
    out = []
    for t in trips:
        r = t.runs_on(weekday)
        if r or (r is None and include_unknown):
            out.append(t)
    return out


def search(
    trips: list[Trip],
    origins: set[str] | str,
    dests: set[str] | str,
    *,
    min_slack: int = 15,
    max_wait: int = 240,
    max_transfers: int = 2,
    after: int | None = None,
    arrive_by: int | None = None,
    links: dict[str, list[tuple[str, int]]] | None = None,
    collapse: bool = True,
) -> list[Itinerary]:
    """``links`` adds cross-station transfers: station -> [(other, transit
    minutes)]. Such a change needs transit + min_slack before the next train.

    ``collapse`` keeps one change point per train sequence (the largest
    smallest wait) and lists the others; without it every change point is its
    own itinerary, so seat checks can choose among them."""
    origins = {origins} if isinstance(origins, str) else set(origins)
    dests = {dests} if isinstance(dests, str) else set(dests)
    limit = arrive_by if arrive_by is not None else float("inf")

    boardings: dict[str, list[tuple[int, Trip, int]]] = defaultdict(list)
    for t in trips:
        for k, s in enumerate(t.stops[:-1]):
            boardings[s.station].append((s.t, t, k))
    for v in boardings.values():
        v.sort(key=lambda e: e[0])

    groups: dict[tuple, list[list[Ride]]] = defaultdict(list)

    def extend(chain: list[Ride], trip: Trip, i: int, seen: set[str], used: set[str]) -> None:
        for x in range(i + 1, len(trip.stops)):
            stop = trip.stops[x]
            if stop.t > limit:
                return
            if stop.station in origins:
                continue
            ride = Ride(trip, i, x)
            if stop.station in dests:
                it = chain + [ride]
                groups[Itinerary(it).key()].append(it)
                return  # never ride through a destination
            if len(chain) >= max_transfers or stop.station in seen:
                continue
            for station, transit in [(stop.station, 0)] + (links or {}).get(stop.station, []):
                if station in seen or station in origins:
                    continue
                lst = boardings.get(station, ())
                lo = bisect.bisect_left(lst, stop.t + transit + min_slack, key=lambda e: e[0])
                for t0, b, k in lst[lo:]:
                    if t0 - stop.t > max_wait or t0 > limit:
                        break
                    bk = train_key(b.train_no)
                    if bk in used:
                        continue
                    extend(chain + [ride], b, k, seen | {stop.station, station}, used | {bk})

    for o in origins:
        for t0, t, k in boardings.get(o, ()):
            if after is not None and t0 < after:
                continue
            extend([], t, k, {o}, {train_key(t.train_no)})

    if collapse:
        found = [_pick(options) for options in groups.values()]
    else:
        found = [Itinerary(o) for options in groups.values() for o in options]
    found.sort(key=lambda it: (it.arr, it.transfers, -it.dep, it.key()))
    return found


def _pick(options: list[list[Ride]]) -> Itinerary:
    """Same trains, several possible change points: keep the one with the
    largest smallest wait and list the others."""

    def score(rides: list[Ride]) -> tuple[int, ...]:
        waits = [b.dep - a.arr for a, b in zip(rides, rides[1:])]
        return (min(waits), sum(waits)) if waits else (0, 0)

    best = max(options, key=score)
    points = lambda rides: tuple(r.arr_station for r in rides[:-1])  # noqa: E731
    others = sorted({points(o) for o in options if points(o) != points(best)})
    return Itinerary(list(best), others)
