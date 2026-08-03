"""Instrument registry and discovery rules."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Iterable

from .finam_client import FinamAsset


@dataclass(frozen=True)
class Instrument:
    symbol: str
    ticker: str
    name: str
    mic: str
    family: str
    status: str = "paper_candidate"
    notes: str = ""

    def to_dict(self) -> dict[str, str]:
        return asdict(self)


def discover_moex_commodity_futures(assets: Iterable[FinamAsset]) -> list[Instrument]:
    instruments: list[Instrument] = []
    for asset in assets:
        if asset.type != "FUTURES" or asset.mic != "RTSX" or asset.is_archived:
            continue

        family = _classify_family(asset)
        if not family:
            continue

        instruments.append(
            Instrument(
                symbol=asset.symbol,
                ticker=asset.ticker,
                name=asset.name,
                mic=asset.mic,
                family=family,
                notes="Discovered from Finam /v1/assets",
            )
        )
    return sorted(instruments, key=lambda item: (item.family, item.name, item.symbol))


def _classify_family(asset: FinamAsset) -> str | None:
    name = asset.name.upper()
    ticker = asset.ticker.upper()
    symbol = asset.symbol.upper()

    if name.startswith("BR-") or ticker.startswith("BR") or re.search(r"(^|[^A-Z])BR[A-Z0-9]", symbol):
        return "brent"
    if name.startswith("GOLD-") or ticker.startswith("GD") or ticker == "GLDRUBF":
        return "gold"
    if name.startswith(("NG-", "NGM-", "TTF-")) or ticker.startswith(("NG", "NGM", "TTF")):
        return "gas"
    return None

