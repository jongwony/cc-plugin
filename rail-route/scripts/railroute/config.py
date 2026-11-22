"""The user's local rail-route config. It lives outside any repository.

~/.config/rail-route/config.json (or config.toml with the same shape):

    {
      "homes": {
        "south": {"STATION_A": 10, "STATION_B": 45},
        "north": {"STATION_C": 30}
      },
      "links": [["STATION_A", "STATION_B", 50]],
      "weights": {"transfer": 60, "wait": 0.5, "risk": 20, "slow": 0.2}
    }

``homes`` maps each home to station -> minutes between that home and the
station. ``links`` are cross-station transfers with their transit minutes.
"""

from __future__ import annotations

import json
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_WEIGHTS = {"transfer": 60.0, "wait": 0.5, "risk": 20.0, "slow": 0.2}


def default_path() -> Path:
    base = Path.home() / ".config" / "rail-route"
    toml = base / "config.toml"
    return toml if toml.exists() else base / "config.json"


@dataclass
class Config:
    homes: dict[str, dict[str, int]] = field(default_factory=dict)
    links: dict[str, list[tuple[str, int]]] = field(default_factory=dict)
    weights: dict[str, float] = field(default_factory=lambda: dict(DEFAULT_WEIGHTS))
    path: Path | None = None

    @classmethod
    def from_dict(cls, data: dict, path: Path | None = None) -> "Config":
        links: dict[str, list[tuple[str, int]]] = {}
        for a, b, m in data.get("links", []):
            links.setdefault(a, []).append((b, int(m)))
            links.setdefault(b, []).append((a, int(m)))
        weights = dict(DEFAULT_WEIGHTS)
        weights.update({k: float(v) for k, v in data.get("weights", {}).items()})
        homes = {h: {s: int(m) for s, m in mp.items()} for h, mp in data.get("homes", {}).items()}
        return cls(homes, links, weights, path)

    @classmethod
    def load(cls, path: Path | None) -> "Config":
        path = path or default_path()
        if not path.exists():
            return cls(path=None)
        raw = path.read_bytes()
        data = tomllib.loads(raw.decode()) if path.suffix == ".toml" else json.loads(raw)
        return cls.from_dict(data, path)

    def home(self, name: str | None) -> dict[str, int]:
        if name is None:
            return {}
        if name not in self.homes:
            known = ", ".join(self.homes) or "(none)"
            raise SystemExit(f"home {name!r} is not in {self.path or default_path()} — known: {known}")
        return self.homes[name]
