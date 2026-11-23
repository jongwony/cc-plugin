"""UTC date ranges: [start, end) with end exclusive."""

from datetime import date, datetime, timedelta, timezone


def parse(s):
    return date.fromisoformat(s)


def chunks(start, end, days):
    """Split [start, end) into consecutive windows of at most `days` days."""
    cur = start
    while cur < end:
        nxt = min(cur + timedelta(days=days), end)
        yield cur, nxt
        cur = nxt


def rfc3339(d):
    return f"{d.isoformat()}T00:00:00Z"


def unix(d):
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp())


def from_unix(ts):
    return datetime.fromtimestamp(int(ts), tz=timezone.utc).date().isoformat()


def today_utc():
    return datetime.now(timezone.utc).date()


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
