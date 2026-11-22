"""Find and cache Korail's published timetable files.

Network access is limited to two read-only calls on korail.com: the timetable
board list (JSON) and the attachment download. Both are cached on disk; a run
whose cache is fresh sends nothing.
"""

from __future__ import annotations

import json
import re
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

BOARD_URL = (
    "https://www.korail.com/com/userBoard.do"
    "?schBcid=ticketTable&mode=list&page=1&schStr=&bdCode=&Device=BH&Version=999999999"
)
FILE_BASE_URL = "https://www.korail.com/file/cubedata/COMMON/"
REFERER = "https://www.korail.com/ticket/search"
USER_AGENT = "rail-route-readonly"
BOARD_TTL = 24 * 3600

KINDS = {
    "ktx": re.compile(r"^KTX\s*시간표"),
    "general": re.compile(r"^일반열차\s*시간표"),
}
_EFFECTIVE = re.compile(r"(20\d{2})[.\s년]+(\d{1,2})[.\s월]+(\d{1,2})")


@dataclass(frozen=True)
class Source:
    kind: str
    title: str
    effective: str  # YYYYMMDD
    registered: str
    file_id: str


def default_cache_dir() -> Path:
    return Path.home() / ".cache" / "rail-route"


def _get(url: str, timeout: float = 30.0) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Referer": REFERER})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def load_board(cache: Path, *, refresh: bool = False, offline: bool = False) -> dict:
    path = cache / "board.json"
    fresh = path.exists() and time.time() - path.stat().st_mtime < BOARD_TTL
    if path.exists() and (offline or (fresh and not refresh)):
        return json.loads(path.read_text(encoding="utf-8"))
    if offline:
        raise RuntimeError(f"offline and no cached board list at {path}")
    data = _get(BOARD_URL)
    payload = json.loads(data)
    cache.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return payload


def effective_date(title: str, registered: str) -> str:
    m = _EFFECTIVE.search(title)
    if not m:
        return registered.replace("-", "")
    y, mo, d = m.groups()
    return f"{y}{int(mo):02d}{int(d):02d}"


def choose(board: dict, kind: str, date: str) -> Source:
    pattern = KINDS[kind]
    cands = []
    for item in board.get("boardList", []):
        title = str(item.get("bdTitle", "")).strip()
        files = item.get("fileId") or []
        if not pattern.search(title) or not files:
            continue
        fid = str(files[0]).lstrip("/")
        if not fid.lower().endswith((".xlsx", ".xlsm")):
            continue
        reg = str(item.get("regdt", ""))
        cands.append(Source(kind, title, effective_date(title, reg), reg, fid))
    usable = [c for c in cands if c.effective <= date]
    if not usable:
        raise RuntimeError(f"no published {kind} timetable in effect on {date}")
    return max(usable, key=lambda c: (c.effective, c.registered))


def fetch_file(cache: Path, src: Source, *, offline: bool = False) -> Path:
    path = cache / "files" / src.file_id.replace("/", "_")
    if path.exists():
        return path
    if offline:
        raise RuntimeError(f"offline and {src.title} is not cached at {path}")
    data = _get(FILE_BASE_URL + src.file_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path
