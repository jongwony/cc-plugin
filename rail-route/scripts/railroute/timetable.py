"""Parse Korail's published timetable workbooks into trips.

Two layouts are handled:

- KTX workbook: one row per train. A header row holds '열차번호', '편성', the
  station names, then a column whose header starts with '비고' (run days).
  Several such blocks (하행/상행) sit side by side in one sheet.
- 일반열차 workbook: transposed. Column ``j`` holds row labels ('시발역',
  '열차종별', '열차번호', station names, '비고', '종착역'); each column to its
  right is one train. Blocks repeat vertically and horizontally.

A time cell of 00:00 means the train does not stop there. Any other non-time
text in a time cell (e.g. '대구선경유') also means no stop.
"""

from __future__ import annotations

import datetime as _dt
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from .model import ALL_DAYS, WEEKDAY_CHARS, Stop, Trip

_TIME = re.compile(r"^(\d{1,2}):(\d{2})(?::\d{2})?$")
_STATION_SUFFIX = re.compile(r"\((출발|도착)\)$")

TYPE_ALIASES = {
    "KTX산천": "KTX-산천",
    "KTX_산천": "KTX-산천",
    "KTX이음": "KTX-이음",
    "KTX_이음": "KTX-이음",
    "KTX청룡": "KTX-청룡",
    "KTX_청룡": "KTX-청룡",
}


def norm(cell: object) -> str:
    if cell is None:
        return ""
    if isinstance(cell, (_dt.time, _dt.datetime)):
        return cell.strftime("%H:%M")
    if isinstance(cell, float) and cell.is_integer():
        cell = int(cell)
    return re.sub(r"\s+", "", str(cell).replace("\xa0", ""))


def parse_time(s: str) -> int | None:
    """Minutes after midnight, or None when the cell is not a stop."""
    m = _TIME.match(s)
    if not m:
        return None
    h, mm = int(m.group(1)), int(m.group(2))
    if h == 0 and mm == 0:
        return None
    if h > 23 or mm > 59:
        return None
    return h * 60 + mm


def parse_run_days(remark: str) -> frozenset[int] | None:
    """'' and '매일' → every day; a string of weekday characters → those days;
    anything else → None (unknown).

    Route notes ('중앙선경유') are not run days and are dropped first; a remark
    cell holding a time (an empty cell formatted as 00:00) counts as empty."""
    r = remark.replace(",", "").replace("·", "")
    r = re.sub(r"[^\s,]*경유", "", r)
    if _TIME.match(r):
        r = ""
    if r in ("", "매일"):
        return ALL_DAYS
    if r and all(c in WEEKDAY_CHARS for c in r):
        return frozenset(WEEKDAY_CHARS.index(c) for c in r)
    return None


def norm_type(s: str) -> str:
    return TYPE_ALIASES.get(s, s)


def norm_station(s: str) -> str:
    return _STATION_SUFFIX.sub("", s)


@dataclass
class RawTrip:
    train_no: str
    train_type: str
    remark: str
    stops: list[tuple[str, int]]  # (station, minutes mod 1440)
    source: str


def parse_ktx_rows(rows: Sequence[Sequence[str]], source: str) -> list[RawTrip]:
    out: list[RawTrip] = []
    for i, row in enumerate(rows):
        for j, cell in enumerate(row):
            if cell != "열차번호":
                continue
            header = row
            station_cols: list[int] = []
            remark_col = None
            for k in range(j + 2, len(header)):
                h = header[k]
                if h.startswith("비고"):
                    remark_col = k
                    break
                if h == "" or h == "열차번호":
                    break
                station_cols.append(k)
            for r in rows[i + 1 :]:
                if j >= len(r):
                    continue
                if r[j] == "열차번호":
                    break
                if not r[j].isdigit():
                    continue
                stops = []
                for k in station_cols:
                    if k < len(r):
                        t = parse_time(r[k])
                        if t is not None:
                            stops.append((norm_station(header[k]), t))
                remark = r[remark_col] if remark_col is not None and remark_col < len(r) else ""
                ttype = r[j + 1] if j + 1 < len(r) else ""
                if stops:
                    out.append(RawTrip(r[j], norm_type(ttype), remark, stops, source))
    return out


def _cell(rows: Sequence[Sequence[str]], i: int, j: int) -> str:
    if 0 <= i < len(rows) and 0 <= j < len(rows[i]):
        return rows[i][j]
    return ""


def parse_general_rows(rows: Sequence[Sequence[str]], source: str) -> list[RawTrip]:
    out: list[RawTrip] = []
    for i, row in enumerate(rows):
        for j, cell in enumerate(row):
            if cell != "열차번호" or _cell(rows, i - 1, j) != "열차종별":
                continue
            # Train columns: to the right, until the next label column.
            cols: list[int] = []
            for k in range(j + 1, len(row)):
                if row[k] == "열차번호":
                    break
                if row[k].isdigit():
                    cols.append(k)
            # Origin row: the nearest '시발역' label above; its time is 3 rows down
            # (names, other-language names, English names, time).
            origin_row = next(
                (x for x in range(i - 1, max(i - 10, -1), -1) if _cell(rows, x, j) == "시발역"),
                None,
            )
            station_rows: list[int] = []
            remark_row = terminus_row = None
            x = i + 1
            while x < len(rows):
                label = _cell(rows, x, j)
                if label.startswith("비고"):
                    remark_row = x
                elif label == "종착역":
                    terminus_row = x
                    break
                elif label in ("열차번호", "열차종별", "시발역"):
                    break
                elif label and remark_row is None:
                    station_rows.append(x)
                x += 1
            for k in cols:
                stops: list[tuple[str, int]] = []
                for x in station_rows:
                    t = parse_time(_cell(rows, x, k))
                    if t is not None:
                        stops.append((norm_station(_cell(rows, x, j)), t))
                for label_row in (origin_row, terminus_row):
                    if label_row is None:
                        continue
                    name = norm_station(_cell(rows, label_row, k))
                    t = parse_time(_cell(rows, label_row + 3, k))
                    if name and t is not None and (name, t) not in stops:
                        stops.append((name, t))
                remark = _cell(rows, remark_row, k) if remark_row is not None else ""
                if _TIME.match(remark):
                    remark = ""
                ttype = norm_type(_cell(rows, i - 1, k))
                if stops:
                    out.append(RawTrip(row[k], ttype, remark, stops, source))
    return out


def order_stops(times: Iterable[tuple[str, int]]) -> tuple[Stop, ...]:
    """Order a train's stops in time and lift past-midnight times above 1440.

    The train starts right after the largest gap on the 24-hour circle: a train
    runs well under a day, so its idle gap is always the largest one."""
    uniq = sorted(set(times), key=lambda s: (s[1], s[0]))
    if not uniq:
        return ()
    ts = [t for _, t in uniq]
    # gaps[n]: minutes from stop n to stop n+1 going round the clock.
    gaps = [ts[n + 1] - ts[n] for n in range(len(ts) - 1)] + [ts[0] + 1440 - ts[-1]]
    start = (max(range(len(ts)), key=lambda n: gaps[n]) + 1) % len(ts)
    ordered = uniq[start:] + uniq[:start]
    base = ordered[0][1]
    return tuple(Stop(name, base + (t - base) % 1440) for name, t in ordered)


def merge_trips(raws: Iterable[RawTrip]) -> list[Trip]:
    """One Trip per train number: the same train listed on several sheets keeps
    the union of its stops and the first non-empty remark."""
    groups: dict[str, list[RawTrip]] = {}
    for r in raws:
        groups.setdefault(r.train_no, []).append(r)
    trips = []
    for no, rs in groups.items():
        remark = next((r.remark for r in rs if r.remark), "")
        ttype = next((r.train_type for r in rs if r.train_type), "")
        stops = order_stops(s for r in rs for s in r.stops)
        sources = tuple(dict.fromkeys(r.source for r in rs))
        trips.append(Trip(no, ttype, parse_run_days(remark), remark, stops, sources))
    return trips


def rows_of(ws) -> list[list[str]]:
    return [[norm(c) for c in r] for r in ws.iter_rows(values_only=True)]


def load_workbook_trips(path: str, layout: str, label: str) -> list[RawTrip]:
    from openpyxl import load_workbook

    wb = load_workbook(path, read_only=True, data_only=True)
    parse = parse_ktx_rows if layout == "ktx" else parse_general_rows
    out: list[RawTrip] = []
    for name in wb.sheetnames:
        if name == "보는방법":
            continue
        out.extend(parse(rows_of(wb[name]), f"{label}/{name}"))
    wb.close()
    return out
