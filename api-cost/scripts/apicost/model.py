"""Normalized cost row and the per-account collection status."""

from dataclasses import asdict, dataclass, field
from typing import Optional

FIELDS = (
    "date",
    "vendor",
    "account",
    "scope",
    "api_key",
    "item",
    "cost",
    "currency",
    "source",
    "as_of",
)


@dataclass(frozen=True)
class Row:
    date: str  # YYYY-MM-DD, the vendor's daily bucket (UTC)
    vendor: str  # anthropic | openai | gemini
    account: str  # personal | work
    scope: Optional[str]  # workspace id, project id, or GCP project id
    api_key: Optional[str]  # api key id where the vendor reports one
    item: Optional[str]  # model, line item, or SKU
    cost: float  # vendor-billed amount, in `currency`, before credits
    currency: str  # ISO-4217, upper case
    source: str  # the endpoint or table the amount was read from
    as_of: str  # when the vendor's data was last refreshed, else fetch time

    def as_dict(self):
        return asdict(self)


@dataclass
class Status:
    vendor: str
    account: str
    state: str  # verified | unverified
    reason: Optional[str] = None
    rows: int = 0
    start: Optional[str] = None
    end: Optional[str] = None
    notes: list = field(default_factory=list)

    def as_dict(self):
        return asdict(self)


class CollectError(Exception):
    """A vendor call failed; the message is safe to show (no secrets)."""
