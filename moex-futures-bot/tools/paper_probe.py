#!/usr/bin/env python3
"""Run a read-only data probe and paper-fill smoke test."""

from __future__ import annotations

import json
import sys
from decimal import Decimal
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.config import load_env, require_env
from moex_futures_bot.finam_client import ReadOnlyFinamClient
from moex_futures_bot.instrument_registry import discover_moex_commodity_futures
from moex_futures_bot.journal import Journal
from moex_futures_bot.paper_engine import PaperEngine
from moex_futures_bot.risk_gate import PaperRiskState, RiskConfig, RiskGate
from moex_futures_bot.state_db import append_paper_event, connect_state_db, init_state_db, upsert_instruments
from moex_futures_bot.storage import default_storage_paths, init_storage


def main() -> int:
    load_env(PROJECT_ROOT / ".env")
    secret = require_env("FINAM_SECRET_TOKEN")

    client = ReadOnlyFinamClient(secret)
    client.auth()
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)
    init_state_db(paths.state_db)

    assets = client.assets()
    instruments = discover_moex_commodity_futures(assets)
    selected = [item for item in instruments if item.family in {"brent", "gold"}]
    if not selected:
        print("No MOEX brent/gold futures discovered.")
        return 1

    journal = Journal(paths.paper_journal)
    engine = PaperEngine()
    allowed_symbols = tuple(item.symbol for item in selected)
    gate = RiskGate(RiskConfig(max_abs_position=Decimal("1"), allowed_symbols=allowed_symbols))
    state = PaperRiskState()
    state_conn = connect_state_db(paths.state_db)
    upsert_instruments(state_conn, selected)
    state_conn.commit()

    print("Discovered instruments:")
    print(json.dumps([item.to_dict() for item in selected], ensure_ascii=False, indent=2))

    try:
        for instrument in selected[:3]:
            orderbook = client.orderbook(instrument.symbol)
            quote = engine.quote(orderbook)
            decision = gate.check(instrument.symbol, "buy", Decimal("1"), state)
            event_payload = {
                "instrument": instrument.to_dict(),
                "quote": quote,
                "risk_decision": {"allowed": decision.allowed, "reason": decision.reason},
            }
            if decision.allowed:
                fill = engine.simulate_market_order(instrument.symbol, "buy", Decimal("1"), orderbook)
                event_payload["paper_fill"] = fill.to_dict()
                if fill.filled_qty:
                    gate.apply_paper_fill(instrument.symbol, "buy", fill.filled_qty, state)
            journal.append("paper_probe", event_payload)
            append_paper_event(state_conn, "paper_probe", event_payload, symbol=instrument.symbol)
            state_conn.commit()
            print(json.dumps(event_payload, ensure_ascii=False, indent=2))
    finally:
        state_conn.close()

    print(f"Journal: {paths.paper_journal}")
    print(f"State DB: {paths.state_db}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
