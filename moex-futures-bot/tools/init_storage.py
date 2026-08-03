#!/usr/bin/env python3
"""Initialize local storage directories and SQLite state database."""

from __future__ import annotations

import json
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.state_db import init_state_db
from moex_futures_bot.storage import default_storage_paths, init_storage


def main() -> int:
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)
    init_state_db(paths.state_db)

    print(json.dumps({
        "data_root": str(paths.root),
        "market_root": str(paths.market_root),
        "moex_iss_root": str(paths.moex_iss_root),
        "moex_iss_history_root": str(paths.moex_iss_history_root),
        "moex_iss_params_root": str(paths.moex_iss_params_root),
        "moex_iss_continuous_root": str(paths.moex_iss_continuous_root),
        "bars_root": str(paths.bars_root),
        "bars_parquet_root": str(paths.bars_parquet_root),
        "continuous_bars_root": str(paths.continuous_bars_root),
        "orderbook_root": str(paths.orderbook_root),
        "reports_root": str(paths.reports_root),
        "state_db": str(paths.state_db),
        "research_db": str(paths.research_db),
        "paper_journal": str(paths.paper_journal),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
