from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

from .model import Trip, fmt_dur, fmt_time
from .router import Itinerary, ktx_minutes, search, train_key, trips_for_day
from .config import Config
from .seats import ItinCheck, SeatBook, apply_policy, check, plan, rank, score
from .source import Source, choose, default_cache_dir, fetch_file, load_board
from .timetable import load_workbook_trips, merge_trips

WEEKDAYS = "월화수목금토일"
NOTE = (
    "코레일이 공개한 계획 시간표 기준입니다. 임시열차·운휴·지연과 실시간 잔여석은 반영하지 않습니다. "
    "역마다 시각이 1~3분 다를 수 있습니다(정차 시간이 시간표에 한 칸으로만 적혀 있음)."
)
STATE_LABEL = {"seated": "좌석 확인", "unknown": "확인 필요", "blocked": "불가"}


def load_trips(date: str, cache: Path, refresh: bool, offline: bool) -> tuple[list[Trip], list[Source]]:
    board = load_board(cache, refresh=refresh, offline=offline)
    sources = [choose(board, "ktx", date), choose(board, "general", date)]
    raws = []
    for src in sources:
        path = fetch_file(cache, src, offline=offline)
        raws.extend(load_workbook_trips(str(path), src.kind, src.kind))
    return merge_trips(raws), sources


def hm(s: str | None) -> int | None:
    if not s:
        return None
    s = s.replace(":", "")
    return int(s[:2]) * 60 + int(s[2:])


def ride_dict(c, rc=None) -> dict:
    t = c.trip
    d = {
        "train_type": t.train_type,
        "train_no": t.train_no,
        "dep_station": c.dep_station,
        "dep_time": fmt_time(c.dep),
        "arr_station": c.arr_station,
        "arr_time": fmt_time(c.arr),
        "run_days": t.remark or "매일",
        "observed_only": "observed" in t.sources,
    }
    if rc is not None:
        d["seat_state"] = rc.state
        d["tickets"] = [[t.stops[a].station, t.stops[b].station] for a, b in rc.tickets]
    return d


def it_dict(it: Itinerary, ic: ItinCheck | None = None) -> dict:
    return {
        "transfers": it.transfers,
        "dep_time": fmt_time(it.dep),
        "arr_time": fmt_time(it.arr),
        "duration_min": it.duration,
        "waits_min": it.waits,
        "state": ic.state if ic else None,
        "rides": [ride_dict(r, ic.rides[k] if ic else None) for k, r in enumerate(it.rides)],
        "alternative_transfer_points": [list(a) for a in it.alternatives],
    }


def render_it(n: int, it: Itinerary, ic: ItinCheck | None) -> list[str]:
    head = f"{n:>2}. {fmt_time(it.dep)} {it.rides[0].dep_station} → {fmt_time(it.arr)} {it.rides[-1].arr_station}"
    head += f"  환승 {it.transfers}회, 총 {fmt_dur(it.duration)}"
    if ic:
        head += f"  [{STATE_LABEL[ic.state]}]"
    if it.run_days_unknown:
        head += " ⚠운행일 확인필요"
    lines = [head]
    for k, r in enumerate(it.rides):
        if k:
            prev = it.rides[k - 1].arr_station
            where = r.dep_station if prev == r.dep_station else f"{prev}→{r.dep_station} 이동 포함"
            lines.append(f"      ↳ {where} 환승 대기 {fmt_dur(it.waits[k - 1])}")
        t = r.trip
        days = f" [{t.remark}]" if t.remark and t.remark not in ("매일",) else ""
        line = f"      {t.train_type} {t.train_no}{days}  {r.dep_station} {fmt_time(r.dep)} → {r.arr_station} {fmt_time(r.arr)}"
        if ic and ic.rides[k].state == "seated" and len(ic.rides[k].tickets) > 1:
            cut = [t.stops[b].station for _, b in ic.rides[k].tickets[:-1]]
            line += f"  (같은 열차, {'·'.join(cut)}에서 구간을 나눠 발권)"
        elif ic and ic.rides[k].state != "seated":
            line += f"  — {STATE_LABEL[ic.rides[k].state]}"
        lines.append(line)
    if it.alternatives:
        lines.append("      (같은 열차 조합의 다른 환승역: " + ", ".join("/".join(a) for a in it.alternatives) + ")")
    return lines


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="rail-route", description="코레일 공개 시간표로 환승·구간분할 경로 찾기")
    p.add_argument("command", choices=["search", "plan", "rank"])
    p.add_argument("--date", required=True, help="YYYYMMDD")
    p.add_argument("--from", dest="origins", help="출발역(쉼표로 여러 개). 생략하면 --home-from의 역들")
    p.add_argument("--to", dest="dests", help="도착역(쉼표로 여러 개). 생략하면 --home-to의 역들")
    p.add_argument("--config", type=Path, help="로컬 설정(기본 ~/.config/rail-route/config.json|toml)")
    p.add_argument("--home-from", help="설정의 출발 쪽 집 이름(역까지 걸리는 분)")
    p.add_argument("--home-to", help="설정의 도착 쪽 집 이름(역에서 걸리는 분)")
    p.add_argument("--leave-after", help="집에서 이 시각 이후 출발(HHMM, --home-from 필요)")
    p.add_argument("--w-transfer", type=float, help="환승 1회당 점수(분), 기본 60")
    p.add_argument("--w-wait", type=float, help="대기 1분당 점수, 기본 0.5")
    p.add_argument("--w-risk", type=float, help="매진임박 구간 1개당 점수, 기본 20")
    p.add_argument("--w-slow", type=float, help="ITX·무궁화 탑승 1분당 점수, 기본 0.2")
    p.add_argument("--after", help="이 시각 이후 출발(HHMM)")
    p.add_argument("--arrive-by", help="이 시각까지 도착(HHMM, 자정 넘기면 2430처럼)")
    p.add_argument("--min-slack", type=int, default=15, help="최소 환승 여유(분)")
    p.add_argument("--max-wait", type=int, default=240, help="최대 환승 대기(분)")
    p.add_argument(
        "--transfers",
        choices=["auto", "1", "2"],
        default="auto",
        help="auto: 1회 환승 이하 후보가 살아 있는 동안 그것만 / 1 / 2",
    )
    p.add_argument(
        "--ktx-main-min",
        type=int,
        default=0,
        help="KTX급 열차 탑승이 이 분 미만인 경로는 제외(ITX·무궁화는 짧은 연결 구간으로만)",
    )
    p.add_argument("--passengers", type=int, default=1)
    p.add_argument("--seats", type=Path, help="관측한 좌석 상태 JSON")
    p.add_argument("--limit", type=int, default=20)
    p.add_argument("--json", action="store_true")
    p.add_argument("--cache-dir", type=Path, default=default_cache_dir())
    p.add_argument("--refresh", action="store_true", help="게시판 목록을 다시 받음")
    p.add_argument("--offline", action="store_true", help="캐시만 사용")
    a = p.parse_args(argv)

    day = dt.datetime.strptime(a.date, "%Y%m%d").date()
    trips, sources = load_trips(a.date, a.cache_dir, a.refresh, a.offline)
    book = SeatBook.load(a.seats)
    known = {train_key(t.train_no) for t in trips}
    todays = trips_for_day(trips, day.weekday()) + [t for t in book.extra if train_key(t.train_no) not in known]

    cfg = Config.load(a.config)
    first_mile, last_mile = cfg.home(a.home_from), cfg.home(a.home_to)
    weights = dict(cfg.weights)
    for k in ("transfer", "wait", "risk", "slow"):
        v = getattr(a, f"w_{k}")
        if v is not None:
            weights[k] = v
    split = lambda s: {x.strip() for x in s.split(",") if x.strip()}  # noqa: E731
    origins = split(a.origins) if a.origins else set(first_mile)
    dests = split(a.dests) if a.dests else set(last_mile)
    if not origins or not dests:
        p.error("출발역·도착역이 없습니다: --from/--to 또는 설정의 --home-from/--home-to를 주세요")
    its = search(
        todays,
        origins,
        dests,
        min_slack=a.min_slack,
        max_wait=a.max_wait,
        max_transfers=2,
        after=hm(a.after),
        arrive_by=hm(a.arrive_by),
        links=cfg.links,
        collapse=a.command == "search",
    )
    if a.ktx_main_min:
        its = [it for it in its if ktx_minutes(it) >= a.ktx_main_min]
    leave = hm(a.leave_after)
    if leave is not None:
        its = [it for it in its if it.dep - first_mile.get(it.rides[0].dep_station, 0) >= leave]
    all_checks = [check(it, book, a.passengers) for it in its]
    # rank weighs transfers itself; auto only narrows search/plan.
    policy = "2" if a.command == "rank" and a.transfers == "auto" else a.transfers
    checks = apply_policy(all_checks, policy)

    header = {
        "date": a.date,
        "weekday": WEEKDAYS[day.weekday()],
        "from": sorted(origins),
        "to": sorted(dests),
        "passengers": a.passengers,
        "note": NOTE,
        "weights": weights,
        "sources": [{"title": s.title, "effective": s.effective} for s in sources],
    }
    title = (
        f"# {day.isoformat()}({WEEKDAYS[day.weekday()]}) {','.join(sorted(origins))} → {','.join(sorted(dests))}"
        f", {a.passengers}명, 환승 여유 {a.min_slack}~{a.max_wait}분"
    )
    text = [title, "출처: " + " / ".join(s.title for s in sources), NOTE, ""]

    if a.command == "search":
        out = checks
        header["itineraries"] = [it_dict(c.it, c if a.seats else None) for c in out]
        for n, c in enumerate(out[: a.limit], 1):
            text += render_it(n, c.it, c if a.seats else None)
        text.append(f"후보 {len(out)}건" + (f" (상위 {a.limit}건 표시)" if len(out) > a.limit else ""))
    elif a.command == "plan":
        queries = plan(checks, lambda c: score(c, book, a.passengers, weights, last_mile)["total"])
        header["queries"] = queries
        open_n = len({c.it.key() for c in checks if c.state == "unknown"})
        text.append(f"확인이 필요한 후보 {open_n}건 — korail.com 직통 조회 {len(queries)}번")
        for n, q in enumerate(queries, 1):
            kind = "구간분할" if q["split"] else "전 구간"
            text.append(
                f"{n:>2}. {q['dep']} → {q['arr']}  ({q['query_from']} 이후, {kind}) "
                f"열차 {', '.join(q['trains'])} / 후보 {q['itineraries']}건"
            )
    else:
        ranked = rank(checks, book, a.passengers, weights, last_mile)
        header["ranked"] = []
        for c, sc in ranked:
            d = it_dict(c.it, c)
            d["score"] = sc
            if first_mile:
                d["leave_home"] = fmt_time(c.it.dep - first_mile.get(c.it.rides[0].dep_station, 0))
            header["ranked"].append(d)
        header["open"] = len({c.it.key() for c in apply_policy(all_checks, a.transfers) if c.state == "unknown"})
        text.append(f"{a.passengers}명 모두 좌석이 확인된 경로 {len(ranked)}건 (점수가 낮을수록 좋음)")
        text.append(
            f"점수 = 집 도착(분) + 환승×{weights['transfer']:g} + 대기분×{weights['wait']:g}"
            f" + 매진임박 구간×{weights['risk']:g} + ITX·무궁화 탑승분×{weights['slow']:g}"
        )
        for n, (c, sc) in enumerate(ranked[: a.limit], 1):
            text += render_it(n, c.it, c)
            home = fmt_time(int(sc["arrival_at_home"]))
            text.append(
                f"      점수 {sc['total']:.1f} = 집 도착 {home}({sc['arrival_at_home']:.0f}) + 환승 {sc['transfers']:.0f}"
                f" + 대기 {sc['wait']:.1f} + 매진임박 {sc['risk']:.0f} + 느린 열차 {sc['slow']:.1f}"
            )
        if header["open"]:
            text.append(f"(확인이 끝나지 않은 후보 {header['open']}건 — plan으로 다음 조회를 받으세요)")

    if a.json:
        json.dump(header, sys.stdout, ensure_ascii=False, indent=2)
        print()
    else:
        print("\n".join(text))
    return 0
