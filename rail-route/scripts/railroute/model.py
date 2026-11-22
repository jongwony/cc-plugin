from __future__ import annotations

from dataclasses import dataclass, field

WEEKDAY_CHARS = "월화수목금토일"
ALL_DAYS = frozenset(range(7))


@dataclass(frozen=True)
class Stop:
    station: str
    t: int  # minutes after 00:00 of the train's service day; may exceed 1440


@dataclass(frozen=True)
class Trip:
    train_no: str
    train_type: str
    # None: the remark could not be mapped to weekdays (kept, flagged).
    run_days: frozenset[int] | None
    remark: str
    stops: tuple[Stop, ...]
    sources: tuple[str, ...] = field(default=())

    def runs_on(self, weekday: int) -> bool | None:
        if self.run_days is None:
            return None
        return weekday in self.run_days


def fmt_time(t: int) -> str:
    day, m = divmod(t, 1440)
    s = f"{m // 60:02d}:{m % 60:02d}"
    return s + (f"(+{day})" if day else "")


def fmt_dur(m: int) -> str:
    h, mm = divmod(m, 60)
    return f"{h}시간 {mm:02d}분" if h else f"{mm}분"
