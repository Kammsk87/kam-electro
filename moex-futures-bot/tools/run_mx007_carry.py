#!/usr/bin/env python3
"""TASK-MX-007 runner — the frozen carry rule, its attacks, and the ledger record.

**Refuses to touch real data before the cohort closes.** The rule was frozen at
commit 28cd9732 on 2026-08-08 and its confirming evidence must come from data
generated after that date; the Track A cohort closes 2026-10-01. The guard is in
the code rather than in anyone's memory, because a freeze enforced by discipline
alone is a freeze that ends the first time someone is curious.

    --data synthetic   (default) end-to-end pipeline on constructed series
    --data real        refuses until COHORT_CLOSES

Everything statistical comes from the shared kernel. Nothing here selects a
parameter: the rule has exactly one variant, frozen in the task card.

Safety: read-only. No credential, no broker, no order path.
"""

from __future__ import annotations

import argparse
import json
import random
import statistics
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))
sys.path.insert(0, str(REPO_ROOT))

from moex_futures_bot.cost_model import require_floor
from moex_futures_bot.features.term_structure import (
    annualised_roll_yield, build_spread_bars, load_hourly_bars,
)
from moex_futures_bot.strategies.brent_carry import FROZEN, CarryError, run_carry
from shared_kernel.p_value_deflation import (
    DeflationError, benjamini_hochberg, deflated_sharpe_ratio, purge_and_embargo, sharpe_moments,
)
from shared_kernel.trials_ledger import TRIAL_RECORD, TrialRecord, TrialsLedger

COHORT_CLOSES = date(2026, 10, 1)
FREEZE_COMMIT = "28cd9732"
SCHEDULE = PROJECT_ROOT / "configs" / "costs" / "moex_forts_fee_schedule_2026-08-06_rev2.json"
CALENDAR = PROJECT_ROOT / "data" / "specs" / "moex_forts_br_expiration_calendar.json"
RUSFAR_PCT = 16.38
NULL_DRAWS = 1000
SEED = 20260809


@dataclass(frozen=True)
class SynthBar:
    ts: datetime
    near: str
    far: str
    spread: float
    near_close: float
    far_close: float
    expiry_gap_days: int
    regime: str


def synthetic():
    """A constructed series with a known mean-reverting carry component.

    Deliberately not calibrated to Brent. Its only job is to prove the pipeline
    runs end to end and that every attack produces a number.
    """
    rng = random.Random(SEED)
    bars, ry = [], []
    t0 = datetime(2026, 1, 5, 10, 0)
    level = 0.0
    for i in range(FROZEN["warmup_bars"] + 2000):
        day, hour = divmod(i, FROZEN["bars_per_trading_day"])
        level = 0.97 * level + rng.gauss(0, 0.25)
        near = 80.0
        far = 80.0 + level * 0.05
        bars.append(SynthBar(t0 + timedelta(days=day, hours=hour), "BRSYN1", "BRSYN2",
                             far - near, near, far, 31,
                             "CONTANGO" if far > near else "BACKWARDATION"))
        ry.append(annualised_roll_yield(bars[-1]))
    expiry = {"BRSYN1": bars[-1].ts.date() + timedelta(days=365)}
    cal = sorted({b.ts.date() for b in bars})
    return bars, ry, expiry, cal


def real():
    if date.today() < COHORT_CLOSES:
        raise SystemExit(
            f"COHORT_NOT_CLOSED: the rule was frozen at {FREEZE_COMMIT} on 2026-08-08 and its "
            f"confirming evidence must come from data generated after it. The cohort closes "
            f"{COHORT_CLOSES}. Running now would spend the hermeticity the freeze was for.\n"
            "Use --data synthetic to exercise the pipeline."
        )
    raw = load_hourly_bars(PROJECT_ROOT / "data" / "market" / "moex_iss" / "candles")
    bars, _ = build_spread_bars(raw)
    ry = [annualised_roll_yield(b) for b in bars]
    cal_doc = json.loads(CALENDAR.read_text(encoding="utf-8"))
    expiry = {k: date.fromisoformat(v) for k, v in cal_doc["expirations"].items()}
    cal = sorted({b.ts.date() for b in bars})
    return bars, ry, expiry, cal


def t_stat(values):
    if len(values) < 2:
        return None
    sd = statistics.stdev(values)
    return statistics.fmean(values) / (sd / len(values) ** 0.5) if sd else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", choices=("synthetic", "real"), default="synthetic")
    ap.add_argument("--record", action="store_true", help="append to the trials ledger (real data only)")
    args = ap.parse_args()

    bars, ry, expiry, cal = synthetic() if args.data == "synthetic" else real()
    rng = random.Random(SEED)
    out_all = {"data": args.data, "frozen_rule": FROZEN, "freeze_commit": FREEZE_COMMIT}

    for basis in ("TICK_FLOOR", "TICK_FLOOR_STRESS"):
        floor = require_floor(as_of="2026-08-06", instrument="BR", execution_basis=basis,
                              legs=2, schedule_path=SCHEDULE)
        try:
            out = run_carry(bars, ry, expiry_dates=expiry, calendar=cal,
                            roundtrip_rub=floor.roundtrip_rub,
                            rub_per_price_point=floor.rub_per_price_point,
                            margin_blocked_rub=floor.margin_blocked_rub,
                            annual_rate_pct=RUSFAR_PCT)
        except CarryError as exc:
            out_all[basis] = {"error": str(exc)}
            continue

        s = out.summary()
        if out.trades:
            s["t_stat_gross"] = t_stat(out.gross)
            s["cost_floor_rub"] = floor.roundtrip_rub
            s["gross_clears_floor"] = s["gross_mean_rub"] > floor.roundtrip_rub

            holds = [t.bars_held for t in out.trades]
            elig = [i for i, v in enumerate(ry) if v is not None and i < len(bars) - 2]
            means = []
            for _ in range(NULL_DRAWS):
                tot = 0.0
                for h in holds:
                    i = rng.choice(elig)
                    j = min(i + h, len(bars) - 1)
                    if bars[j].near != bars[i].near:
                        continue
                    d = rng.choice((1, -1))
                    tot += -d * (bars[j].spread - bars[i].spread) * floor.rub_per_price_point
                means.append(tot / len(holds))
            s["matched_null_mean"] = statistics.fmean(means)
            s["matched_null_p"] = (sum(1 for m in means if m >= s["gross_mean_rub"]) + 1) / (len(means) + 1)

            starts = [t.entry_ts.timestamp() for t in out.trades]
            ends = [t.exit_ts.timestamp() for t in out.trades]
            tr, te = purge_and_embargo(starts, ends, starts[len(starts) // 2], max(ends),
                                       embargo=FROZEN["timeout_trading_days"] * 15 * 3600)
            s["purged_train_n"], s["purged_test_n"] = len(tr), len(te)
            if tr:
                s["net_mean_purged_train"] = statistics.fmean([out.trades[i].net_rub for i in tr])
            if te:
                s["net_mean_purged_test"] = statistics.fmean([out.trades[i].net_rub for i in te])
            try:
                m = sharpe_moments(out.net)
                s.update({"sharpe_per_trade": m["sharpe_per_period"], "skew": m["skew"],
                          "kurtosis": m["kurtosis"], "n_obs": m["n_obs"]})
            except DeflationError as exc:
                s["moments"] = f"UNAVAILABLE: {exc}"
        out_all[basis] = s

    if args.record and args.data == "real":
        ledger = TrialsLedger(REPO_ROOT / "data" / "trials_ledger.jsonl")
        s = out_all.get("TICK_FLOOR", {})
        if s.get("n_obs"):
            ledger.append(TrialRecord(
                trial_id=f"MX007.{FROZEN['model_id']}",
                record_type=TRIAL_RECORD, search_space=FROZEN["search_space"],
                family="br_calendar_spread", task_id="TASK-MX-007",
                evidence_path="tasks/results/TASK-MX-007-BRENT-CARRY-ANOMALY-CANDIDATE-V0-RESULT.md",
                params=dict(FROZEN), p_value=s.get("matched_null_p"),
                sharpe_per_period=s.get("sharpe_per_trade"), n_obs=s.get("n_obs"),
                skew=s.get("skew"), kurtosis=s.get("kurtosis"),
                metrics={k: v for k, v in s.items() if isinstance(v, (int, float, bool, str))}))
            fam = ledger.pvalue_family(FROZEN["search_space"])
            q = benjamini_hochberg([r.p_value for r in fam])
            out_all["deflation"] = {r.trial_id: {"raw_p": r.p_value, "bh_q": qq}
                                    for r, qq in zip(fam, q)}
            var_sr = ledger.sharpe_variance(FROZEN["search_space"])
            try:
                d = deflated_sharpe_ratio(
                    sharpe_per_period=s["sharpe_per_trade"],
                    n_trials=ledger.trial_count(FROZEN["search_space"]),
                    var_sr_across_trials=var_sr, skew=s["skew"],
                    kurtosis=s["kurtosis"], n_obs=s["n_obs"])
                out_all["dsr"] = d.dsr
                out_all["dsr_citation"] = d.citation()
            except DeflationError as exc:
                out_all["dsr"] = "DSR_UNAVAILABLE"
                out_all["dsr_reason"] = str(exc)
    elif args.record:
        out_all["ledger"] = "NOT RECORDED: synthetic runs do not consume multiplicity budget"

    print(json.dumps(out_all, indent=2, ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
