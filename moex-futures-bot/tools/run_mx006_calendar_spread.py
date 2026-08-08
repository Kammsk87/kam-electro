#!/usr/bin/env python3
"""TASK-MX-006 runner: the frozen rule, its attacks, and the ledger record.

Everything statistical comes from the shared kernel. Nothing here selects a
parameter: both timeouts were pre-declared and both are reported whatever they
show.
"""
from __future__ import annotations

import json
import random
import statistics
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))
sys.path.insert(0, str(REPO_ROOT))

from moex_futures_bot.cost_model import require_floor
from moex_futures_bot.features.term_structure import (
    build_spread_bars, load_hourly_bars, rolling_zscore,
)
from moex_futures_bot.strategies.brent_calendar_spread import FROZEN_RULE, run_calendar_spread
from shared_kernel.p_value_deflation import (
    DeflationError, benjamini_hochberg, deflated_sharpe_ratio, purge_and_embargo, sharpe_moments,
)
from shared_kernel.trials_ledger import TRIAL_RECORD, TrialRecord, TrialsLedger

SEARCH_SPACE = "moex.br.calendar_spread.1h"
SCHEDULE = PROJECT_ROOT / "configs" / "costs" / "moex_forts_fee_schedule_2026-08-06_rev2.json"
RUSFAR_PCT = 16.38          # median 2024+, as used in TASK-MX-001/002
NULL_DRAWS = 1000
SEED = 20260808


def matched_null(bars, zs, outcome, floor, rng):
    """Random entries with the same count and the same holding distribution.

    Not a shuffle of returns: the question is whether the *timing* carried
    information, so the null keeps everything except when the rule chose to act.
    """
    eligible = [i for i, z in enumerate(zs) if z is not None and i < len(bars) - 2]
    if not eligible or not outcome.trades:
        return None
    holds = [t.bars_held for t in outcome.trades]
    means = []
    for _ in range(NULL_DRAWS):
        total = 0.0
        for h in holds:
            i = rng.choice(eligible)
            j = min(i + h, len(bars) - 1)
            if bars[j].near != bars[i].near or bars[j].far != bars[i].far:
                continue
            d = rng.choice((1, -1))
            total += -d * (bars[j].spread - bars[i].spread) * floor.rub_per_price_point
        means.append(total / len(holds))
    return means


def t_stat(values):
    n = len(values)
    if n < 2:
        return None
    m = statistics.fmean(values)
    sd = statistics.stdev(values)
    return m / (sd / (n ** 0.5)) if sd else None


def main() -> int:
    raw = load_hourly_bars(PROJECT_ROOT / "data" / "market" / "moex_iss" / "candles")
    bars, coverage = build_spread_bars(raw)
    bars = [b for b in bars if b.ts.year >= 2024]
    zs = rolling_zscore(bars, FROZEN_RULE["z_window_bars"])
    rng = random.Random(SEED)

    results = {}
    ledger = TrialsLedger(REPO_ROOT / "data" / "trials_ledger.jsonl")

    for basis in ("TICK_FLOOR", "TICK_FLOOR_STRESS"):
        floor = require_floor(as_of="2026-08-06", instrument="BR", execution_basis=basis,
                              legs=2, schedule_path=SCHEDULE)
        for timeout in FROZEN_RULE["timeouts_trading_days"]:
            out = run_calendar_spread(
                bars, zs, timeout_days=timeout,
                roundtrip_rub=floor.roundtrip_rub,
                rub_per_price_point=floor.rub_per_price_point,
                margin_blocked_rub=floor.margin_blocked_rub,
                annual_rate_pct=RUSFAR_PCT, execution_basis=basis,
            )
            key = f"{basis}.{timeout}d"
            s = out.summary()
            if not out.trades:
                results[key] = s
                continue

            # t-statistic on the GROSS mean. A t-stat on a cost-inclusive net mean
            # only tests whether the cost differs from zero.
            s["t_stat_gross"] = t_stat(out.gross)
            s["t_stat_net_DO_NOT_QUOTE"] = t_stat(out.net)

            null = matched_null(bars, zs, out, floor, rng)
            if null:
                obs = s["gross_mean_rub"]
                worse = sum(1 for m in null if m >= obs)
                s["matched_null_mean"] = statistics.fmean(null)
                s["matched_null_p"] = (worse + 1) / (len(null) + 1)
                s["matched_null_draws"] = len(null)

            # remove-best-day and remove-best-regime
            by_day = {}
            for t in out.trades:
                by_day.setdefault(t.entry_ts.date(), []).append(t.net_rub)
            if len(by_day) > 1:
                best = max(by_day, key=lambda d: sum(by_day[d]))
                kept = [v for d, vs in by_day.items() if d != best for v in vs]
                s["net_mean_remove_best_day"] = statistics.fmean(kept) if kept else None
            for reg in ("CONTANGO", "BACKWARDATION"):
                kept = [t.net_rub for t in out.trades if t.regime != reg]
                s[f"net_mean_remove_{reg.lower()}"] = statistics.fmean(kept) if kept else None

            # purge and embargo: no train/test leakage through the holding window
            starts = [t.entry_ts.timestamp() for t in out.trades]
            ends = [t.exit_ts.timestamp() for t in out.trades]
            mid = starts[len(starts) // 2]
            tr, te = purge_and_embargo(starts, ends, mid, max(ends),
                                       embargo=timeout * 15 * 3600)
            s["purged_train_n"], s["purged_test_n"] = len(tr), len(te)
            s["purged_dropped"] = len(out.trades) - len(tr) - len(te)
            if tr:
                s["net_mean_purged_train"] = statistics.fmean([out.trades[i].net_rub for i in tr])
            if te:
                s["net_mean_purged_test"] = statistics.fmean([out.trades[i].net_rub for i in te])

            try:
                m = sharpe_moments(out.net)
                s["sharpe_per_trade"] = m["sharpe_per_period"]
                s["skew"], s["kurtosis"], s["n_obs"] = m["skew"], m["kurtosis"], m["n_obs"]
            except DeflationError as exc:
                s["moments"] = f"UNAVAILABLE: {exc}"
            results[key] = s

    # Record the two headline trials (TICK_FLOOR) in the ledger, then deflate.
    for timeout in FROZEN_RULE["timeouts_trading_days"]:
        s = results[f"TICK_FLOOR.{timeout}d"]
        if not s.get("trades"):
            continue
        try:
            ledger.append(TrialRecord(
                trial_id=f"MX006.{FROZEN_RULE['model_id']}.timeout{timeout}d",
                record_type=TRIAL_RECORD, search_space=SEARCH_SPACE,
                family="br_calendar_spread", task_id="TASK-MX-006",
                evidence_path="tasks/results/TASK-MX-006-BRENT-CALENDAR-SPREAD-STRATEGY-AND-TRIALS-LEDGER-V0-RESULT.md",
                params={**FROZEN_RULE, "timeout_days": timeout},
                p_value=s.get("matched_null_p"),
                sharpe_per_period=s.get("sharpe_per_trade"),
                n_obs=s.get("n_obs"), skew=s.get("skew"), kurtosis=s.get("kurtosis"),
                metrics={k: v for k, v in s.items() if isinstance(v, (int, float, str))},
            ))
        except Exception as exc:  # noqa: BLE001
            print(f"ledger append skipped for {timeout}d: {exc}")

    fam = ledger.pvalue_family(SEARCH_SPACE)
    if fam:
        q = benjamini_hochberg([r.p_value for r in fam])
        for r, qq in zip(fam, q):
            results.setdefault("deflation", {})[r.trial_id] = {"raw_p": r.p_value, "bh_q": qq}

    n_trials = ledger.trial_count(SEARCH_SPACE)
    var_sr = ledger.sharpe_variance(SEARCH_SPACE)
    for timeout in FROZEN_RULE["timeouts_trading_days"]:
        s = results.get(f"TICK_FLOOR.{timeout}d", {})
        if not s.get("n_obs"):
            continue
        try:
            d = deflated_sharpe_ratio(
                sharpe_per_period=s["sharpe_per_trade"], n_trials=max(n_trials, 1),
                var_sr_across_trials=var_sr, skew=s["skew"], kurtosis=s["kurtosis"],
                n_obs=s["n_obs"])
            s["dsr"] = d.dsr
            s["dsr_citation"] = d.citation()
        except DeflationError as exc:
            s["dsr"] = "DSR_UNAVAILABLE"
            s["dsr_reason"] = str(exc)

    results["_meta"] = {
        "coverage": coverage.as_dict(), "bars_2024plus": len(bars),
        "search_space": SEARCH_SPACE, "trials_in_space_after_this_run": n_trials,
        "sharpe_variance_across_trials": var_sr, "seed": SEED, "null_draws": NULL_DRAWS,
        "rusfar_pct": RUSFAR_PCT, "frozen_rule": FROZEN_RULE,
    }
    print(json.dumps(results, indent=2, ensure_ascii=False, default=str))
    out = PROJECT_ROOT / "data" / "reports" / "mx006_calendar_spread_20260808.json"
    out.write_text(json.dumps(results, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
