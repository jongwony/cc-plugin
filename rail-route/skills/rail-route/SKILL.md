---
name: rail-route
description: Find a Korean rail trip (KTX, ITX, 무궁화) where every passenger has a seat when direct trains are sold out — transfers, same-train segment splits and alternative stations — by combining Korail's published timetable with seat states read from korail.com in the user's Chrome. Use when the user wants a train trip found or booked around 매진, or asks for the best route across transfers.
---

# rail-route

## Prerequisites

- `uv` (`brew install uv`); the router declares its own Python ≥3.11 and `openpyxl`.
- Claude in Chrome connected to the user's Chrome, for reading korail.com.
- `R="${CLAUDE_PLUGIN_ROOT}/scripts/rail_route.py"`; every command below is `uv run -q --script "$R" <search|plan|rank> --date YYYYMMDD ...`.

## Inputs

- Settle before the first run: date, origin stations, destination stations, passenger count, earliest departure (`--after`), arrival deadline (`--arrive-by`), whether every passenger must be seated. A stated value is the user's; a value Claude fills in is shown as Claude's.
- Home config: read `~/.config/rail-route/config.json` (or `.toml`). It holds `homes` (home name → station → minutes between home and that station), `links` (cross-station transfers with transit minutes) and `weights`. When it is absent or lacks a home the trip needs, ask the user for station → minutes, never an address, and write it there. Pass `--home-from`/`--home-to`; their stations become the origin/destination sets when `--from`/`--to` are omitted, and `--leave-after` bounds leaving home.
- Long haul on KTX-class trains (KTX, KTX-산천, KTX-이음, KTX-청룡; former SRT services count): pass `--ktx-main-min MINUTES` on every run, from the user's value, so ITX/무궁화 serve only as short feeders. When the user has given none, ask for it; `0` turns the filter off.
- Transfers: `--transfers auto` (default) keeps one-transfer itineraries while any of them is still possible and escalates to two only when none is; `1`/`2` fix the limit.

## Loop

1. `plan --passengers N --seats FILE` lists station-pair queries, most promising first; whole rides come before same-train split pairs (`구간분할`). Start with an empty seats file (`{"observations": [], "extra_trains": []}`) kept in the scratchpad.
2. Query the top pairs on korail.com (below), record what each showed into the seats file, and run `plan` again. A pair already recorded for N passengers is not queried again.
3. `rank --passengers N --seats FILE` lists itineraries where every ride is seated for N passengers, scored by home arrival plus weighted transfers, wait, near-soldout segments and minutes on ITX/무궁화; present each with its score terms.
4. Stop when the user picks a ranked itinerary or the open count no longer matters to them. `search` shows the raw timetable candidates without seat states.

## Reading korail.com

- Work in a new tab at `https://www.korail.com/ticket/main`, pacing like a person: one query, then read.
- Set 인원 to the real passenger count first and answer 예 on "선택하신 인원이 확실한가요"; seat states differ by count, and a state read for another count is recorded under that count.
- Select 직통 in the 직통/환승 dropdown on every query: it carries over between queries and switches itself to 환승 after a pair with no direct train.
- Set the date and the hour from the plan's `query_from`; press 더보기 until the list passes the arrival deadline; read with `get_page_text`.
- Record one observation per query: `{"dep", "arr", "passengers", "trains": {train_no: status}}`, every train the list showed. Statuses: 일반실/특실 with a price or 예약가능 → `seat`; 매진임박 → `near_soldout` (seated, risky); 입석 + 좌석 → `standing_plus_seat` (part of the ride standing); 예약대기 → `waitlist`; 매진 → `soldout`; 좌석부족 → `insufficient` (fewer seats than passengers).
- A train korail.com lists that the plan never named (a temporary train, often 4xxx/9xxx) goes into `extra_trains` with the stops and times read from the list, then `plan` again.
- Times on korail.com can differ from the timetable by a few minutes; korail.com's are the ones to show the user.

## Boundaries

- Seat states come only from the korail.com pages the user's Chrome renders; the Korail app API, DynaPath tokens and any token generation stay out of this work.
- Each query is a deliberate step; scripted refresh or polling for cancellations is not part of this skill.
- A block (`비정상적인 요청으로 감지되어 차단되었습니다`, code -4001) or a CAPTCHA ends querying for the run: stop and hand it back to the user, with no retry through another browser or channel.
- Adding to 장바구니 starts after the user has signed in on that tab; payment is always the user's.
