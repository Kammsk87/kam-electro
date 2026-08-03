#!/usr/bin/env python3
"""Write the current consolidated candidate review."""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from moex_futures_bot.storage import default_storage_paths, init_storage


def main() -> int:
    paths = default_storage_paths(PROJECT_ROOT)
    init_storage(paths)
    autopilot_report = _latest(paths.reports_root, "idea_autopilot/*/report.md")
    factory_report = _latest(paths.reports_root, "factory/*/report.md")
    expanded_matrix_report = _latest(paths.reports_root, "brent_research_matrix_*.md")
    focused_matrix_report = _latest_containing(paths.reports_root, "brent_research_matrix_*.md", "Matrix rows: `400`")
    holdout_report = _latest(paths.reports_root, "holdout_candidate_*.md")
    roll_report = _latest(paths.reports_root, "moex_iss_roll_gaps_BR_*.md")
    stitched_report = _latest(paths.reports_root, "moex_iss_return_stitched_BR_*.md")
    last_trade_stitched_report = _latest(paths.reports_root, "moex_iss_last_trade_return_stitched_BR_*.md")
    source_report = _latest(paths.reports_root, "finam_vs_moex_iss_202*.md")
    candle_report = _latest(paths.reports_root, "finam_vs_moex_iss_candles_*.md")
    data_decision = _latest(paths.reports_root, "data_decision_*.md")
    swap_report = _latest(paths.reports_root, "gldrubf_swaprate_vs_rusfar_*.md")
    holdout_ledger = _latest(paths.reports_root, "holdout_ledger_BR_*.json")
    permutation_report = _latest(paths.reports_root, "permutation_control/*/report.md")

    report_path = paths.reports_root / f"candidate_review_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    report_path.write_text(
        _markdown(
            autopilot_report,
            factory_report,
            expanded_matrix_report,
            focused_matrix_report,
            holdout_report,
            roll_report,
            stitched_report,
            last_trade_stitched_report,
            source_report,
            candle_report,
            data_decision,
            swap_report,
            holdout_ledger,
            permutation_report,
        ),
        encoding="utf-8",
    )
    print(report_path)
    return 0


def _latest(root: Path, pattern: str) -> Path:
    matches = sorted(root.glob(pattern), key=lambda item: item.stat().st_mtime, reverse=True)
    return matches[0] if matches else Path("")


def _latest_containing(root: Path, pattern: str, needle: str) -> Path:
    matches = sorted(root.glob(pattern), key=lambda item: item.stat().st_mtime, reverse=True)
    for path in matches:
        try:
            if needle in path.read_text(encoding="utf-8"):
                return path
        except OSError:
            continue
    return Path("")


def _markdown(
    autopilot_report: Path,
    factory_report: Path,
    expanded_matrix_report: Path,
    focused_matrix_report: Path,
    holdout_report: Path,
    roll_report: Path,
    stitched_report: Path,
    last_trade_stitched_report: Path,
    source_report: Path,
    candle_report: Path,
    data_decision: Path,
    swap_report: Path,
    holdout_ledger: Path,
    permutation_report: Path,
) -> str:
    return "\n".join(
        [
            "# Candidate Review",
            "",
            f"Generated: {datetime.now().isoformat(timespec='seconds')}",
            "",
            "## Status",
            "",
            "- Paper mode status: `blocked`.",
            "- Live trading status: `out_of_scope`.",
            "- Current strategy candidate: `none`.",
            "- Holdout status: one preregistered conservative mean-reversion candidate was tested and failed.",
            "- Further holdout reuse for the failed mean-reversion family neighborhood is disallowed on the same holdout period.",
            "- Short-window leads require permutation/block-bootstrap calibration before any focused-pack escalation.",
            "",
            "## Evidence",
            "",
            f"- Brent idea autopilot: `{autopilot_report}`",
            f"- Brent experiment factory: `{factory_report}`",
            f"- Brent expanded-family matrix: `{expanded_matrix_report}`",
            f"- Brent focused mean-reversion matrix: `{focused_matrix_report}`",
            f"- Brent holdout check: `{holdout_report}`",
            f"- Brent roll-gap audit: `{roll_report}`",
            f"- Brent settlement return-stitched chain: `{stitched_report}`",
            f"- Brent last-trade return-stitched chain: `{last_trade_stitched_report}`",
            f"- Finam vs MOEX ISS cross-check: `{source_report}`",
            f"- Finam vs MOEX ISS candle cross-check: `{candle_report}`",
            f"- Data decision: `{data_decision}`",
            f"- GLDRUBF SWAPRATE vs RUSFAR: `{swap_report}`",
            f"- Brent holdout ledger: `{holdout_ledger}`",
            f"- Brent permutation control: `{permutation_report}`",
            "",
            "## Brent Decision",
            "",
            "- Broker-close research data was upgraded to `BR_last_trade_return_stitched@MOEX_ISS`, built from MOEX ISS intraday-last candle closes.",
            "- The focused mean-reversion matrix used the last-trade return-stitched chain, excluded latest 252 bars as holdout, and tested 5 train/test windows, broker fees 0.45/1.0/2.0/5.0 RUB, cost reserves 0/10/25/50/75 bps, and roll-window exclusions 0/1/2/3 bars.",
            "- The focused matrix produced 400 rows, 72 `screening_pass` rows, and 0 failures.",
            "- The edge fully disappears at 50/75 bps, but a conservative preregistered configuration survived at 25 bps, 5 RUB broker fee, and roll-window 3.",
            "- The single preregistered holdout selected `lookback=20`, `threshold_pct=2.0` from pre-holdout data only.",
            "- Holdout result: strategy -6.48%, buy-and-hold +68.71%, excess -75.19%, max drawdown 21.19%, 18 trades.",
            "- `mean_reversion_sma` is rejected as a paper candidate.",
            "- Holdout ledger now quarantines the `mean_reversion_sma` family neighborhood from focused-pack and holdout routing on the spent 2025-10-15 to 2026-07-19 holdout.",
            "- `breakout_high_low` remains rejected because it was roll-sensitive in the prior matrix.",
            "- `momentum_sma` remains rejected.",
            "- Expanded-family matrix tested `atr_breakout`, `trend_volatility`, and `roll_aware_breakout` on the last-trade return-stitched chain.",
            "- Expanded-family result: 216 rows, 32 `screening_pass` rows, 0 failures.",
            "- All expanded-family screening passes came from `atr_breakout` on the short 80/20 window only.",
            "- `atr_breakout` is a research lead, but not a holdout-eligible paper candidate because strict 252/63 confirmation is absent.",
            "- Targeted permutation control for `atr_breakout` on `short_80_20` observed 204/324 screening passes versus a 5-run block-shuffled null mean of 58.4 and null max of 80.",
            "- The ATR short-window lead is above this first rough null baseline, but 5 permutations are not enough for final calibration; it remains research-only.",
            "- `trend_volatility` and `roll_aware_breakout` remain rejected.",
            "- Experiment factory `brent_research_v1` ran 432 rows across six strategy families with 52 screening passes and 0 failures.",
            "- Factory status: `breakout_high_low` is `research_lead_short_only`, `mean_reversion_sma` is `research_lead`, `atr_breakout` is `research_lead`; `momentum_sma`, `trend_volatility`, and `roll_aware_breakout` are `rejected`.",
            "- Factory gate: `holdout_eligible=false`, `paper_candidate=false`.",
            "- Idea autopilot `brent_idea_space_v1` generated and tested fixed ideas without paper/live execution.",
            "- Latest daily autopilot run tested 60 ideas across 1440 rows with 390 screening passes and 0 failures.",
            "- Autopilot routing after holdout quarantine: 34 ideas to `needs_rework_or_strict_confirmation`, 18 ideas to `archive`, and 8 mean-reversion ideas to `archive_same_family_holdout_spent`.",
            "- Autopilot gate: `holdout_eligible=false`, `paper_candidate=false`, `live_candidate=false`.",
            "",
            "## GLDRUBF Decision",
            "",
            "- GLDRUBF remains blocked for strategy testing until exact SWAPRATE semantics are verified from contract specifications.",
            "- The RUSFAR cross-check did not confirm a simple one-to-one funding formula.",
            "- Prior raw gold returns remain unsuitable for strategy conclusions.",
            "",
            "## Source Quality",
            "",
            "- Finam daily close matches MOEX ISS last intraday candle close, not ISS history close.",
            "- Broker-close strategy tests should use Finam bars or ISS intraday-last bars.",
            "- ISS settleprice/history close remain separate settlement/funding fields.",
            "",
            "## Gate",
            "",
            "A strategy may move from `screening_pass` to `paper_candidate` only after all items are true:",
            "",
            "- candidate definition frozen before holdout;",
            "- return-stitched/back-adjusted data pass;",
            "- strict and short windows agree directionally;",
            "- pessimistic cost sweep survives;",
            "- roll-window exclusion does not remove the edge;",
            "- source close/session convention is documented and matched to the chosen research data;",
            "- orderbook spread/slippage review is complete;",
            "- observed screening passes are materially above block-shuffled null calibration for the relevant family/window;",
            "- no spent holdout family-neighborhood quarantine applies;",
            "- user explicitly accepts paper mode.",
            "",
            "Current gate verdict: `no_paper_candidate`.",
        ]
    )


if __name__ == "__main__":
    raise SystemExit(main())
