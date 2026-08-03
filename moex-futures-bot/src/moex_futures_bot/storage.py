"""Local storage paths for market data and research state."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from .config import PROJECT_ROOT


@dataclass(frozen=True)
class StoragePaths:
    root: Path
    market_root: Path
    finam_root: Path
    moex_iss_root: Path
    moex_iss_history_root: Path
    moex_iss_params_root: Path
    moex_iss_continuous_root: Path
    bars_root: Path
    bars_parquet_root: Path
    continuous_bars_root: Path
    orderbook_root: Path
    reports_root: Path
    backtest_reports_root: Path
    research_db: Path
    state_db: Path
    paper_journal: Path


def default_storage_paths(project_root: Path = PROJECT_ROOT) -> StoragePaths:
    data_root = project_root / "data"
    market_root = data_root / "market"
    finam_root = market_root / "finam"
    moex_iss_root = market_root / "moex_iss"
    return StoragePaths(
        root=data_root,
        market_root=market_root,
        finam_root=finam_root,
        moex_iss_root=moex_iss_root,
        moex_iss_history_root=moex_iss_root / "history",
        moex_iss_params_root=moex_iss_root / "params",
        moex_iss_continuous_root=moex_iss_root / "continuous_bars",
        bars_root=finam_root / "bars",
        bars_parquet_root=finam_root / "bars_parquet",
        continuous_bars_root=finam_root / "continuous_bars",
        orderbook_root=finam_root / "orderbook",
        reports_root=data_root / "reports",
        backtest_reports_root=data_root / "reports" / "backtests",
        research_db=data_root / "research.duckdb",
        state_db=data_root / "bot_state.sqlite",
        paper_journal=data_root / "paper_journal.jsonl",
    )


def init_storage(paths: StoragePaths) -> None:
    for path in (
        paths.root,
        paths.market_root,
        paths.finam_root,
        paths.moex_iss_root,
        paths.moex_iss_history_root,
        paths.moex_iss_params_root,
        paths.moex_iss_continuous_root,
        paths.bars_root,
        paths.bars_parquet_root,
        paths.continuous_bars_root,
        paths.orderbook_root,
        paths.reports_root,
        paths.backtest_reports_root,
    ):
        path.mkdir(parents=True, exist_ok=True)


def safe_symbol(symbol: str) -> str:
    cleaned = symbol.replace("@", "__")
    return re.sub(r"[^A-Za-z0-9_.=-]+", "_", cleaned)


def bars_partition_path(
    symbol: str,
    timeframe: str,
    trading_date: date,
    paths: StoragePaths | None = None,
    suffix: str = "parquet",
) -> Path:
    storage_paths = paths or default_storage_paths()
    return (
        storage_paths.bars_root
        / f"timeframe={timeframe}"
        / f"symbol={safe_symbol(symbol)}"
        / f"date={trading_date.isoformat()}.{suffix}"
    )


def orderbook_partition_path(
    symbol: str,
    depth: int,
    trading_date: date,
    paths: StoragePaths | None = None,
    suffix: str = "parquet",
) -> Path:
    storage_paths = paths or default_storage_paths()
    return (
        storage_paths.orderbook_root
        / f"depth={depth}"
        / f"symbol={safe_symbol(symbol)}"
        / f"date={trading_date.isoformat()}.{suffix}"
    )
