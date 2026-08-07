# Candidate Review

Generated: 2026-07-22T17:24:02

## Status

- Paper mode status: `blocked`.
- Live trading status: `out_of_scope`.
- Current strategy candidate: `none`.
- Holdout status: one preregistered conservative mean-reversion candidate was tested and failed.
- Further holdout reuse for the failed mean-reversion family neighborhood is disallowed on the same holdout period.
- Short-window leads require permutation/block-bootstrap calibration before any focused-pack escalation.

## Evidence

- Brent idea autopilot: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/idea_autopilot/brent_idea_space_v1_20260722_170629/report.md`
- Brent experiment factory: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/factory/brent_research_v1_20260722_160940/report.md`
- Brent expanded-family matrix: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/brent_research_matrix_20260720_014157.md`
- Brent focused mean-reversion matrix: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/brent_research_matrix_20260720_001410.md`
- Brent holdout check: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/holdout_candidate_20260720_001532.md`
- Brent roll-gap audit: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/moex_iss_roll_gaps_BR_20260719_211855.md`
- Brent settlement return-stitched chain: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/moex_iss_return_stitched_BR_20260719_212548.md`
- Brent last-trade return-stitched chain: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/moex_iss_last_trade_return_stitched_BR_20260719_231935.md`
- Finam vs MOEX ISS cross-check: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/finam_vs_moex_iss_20260719_212740.md`
- Finam vs MOEX ISS candle cross-check: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/finam_vs_moex_iss_candles_20260719_225300.md`
- Data decision: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/data_decision_20260719_225300.md`
- GLDRUBF SWAPRATE vs RUSFAR: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/gldrubf_swaprate_vs_rusfar_20260719_213114.md`
- Brent holdout ledger: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/holdout_ledger_BR_20260722.json`
- Brent permutation control: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/permutation_control/brent_idea_space_v1_permutation_20260722_171944/report.md`

## Brent Decision

- Broker-close research data was upgraded to `BR_last_trade_return_stitched@MOEX_ISS`, built from MOEX ISS intraday-last candle closes.
- The focused mean-reversion matrix used the last-trade return-stitched chain, excluded latest 252 bars as holdout, and tested 5 train/test windows, broker fees 0.45/1.0/2.0/5.0 RUB, cost reserves 0/10/25/50/75 bps, and roll-window exclusions 0/1/2/3 bars.
- The focused matrix produced 400 rows, 72 `screening_pass` rows, and 0 failures.
- The edge fully disappears at 50/75 bps, but a conservative preregistered configuration survived at 25 bps, 5 RUB broker fee, and roll-window 3.
- The single preregistered holdout selected `lookback=20`, `threshold_pct=2.0` from pre-holdout data only.
- Holdout result: strategy -6.48%, buy-and-hold +68.71%, excess -75.19%, max drawdown 21.19%, 18 trades.
- `mean_reversion_sma` is rejected as a paper candidate.
- Holdout ledger now quarantines the `mean_reversion_sma` family neighborhood from focused-pack and holdout routing on the spent 2025-10-15 to 2026-07-19 holdout.
- `breakout_high_low` remains rejected because it was roll-sensitive in the prior matrix.
- `momentum_sma` remains rejected.
- Expanded-family matrix tested `atr_breakout`, `trend_volatility`, and `roll_aware_breakout` on the last-trade return-stitched chain.
- Expanded-family result: 216 rows, 32 `screening_pass` rows, 0 failures.
- All expanded-family screening passes came from `atr_breakout` on the short 80/20 window only.
- `atr_breakout` is a research lead, but not a holdout-eligible paper candidate because strict 252/63 confirmation is absent.
- Targeted permutation control for `atr_breakout` on `short_80_20` observed 204/324 screening passes versus a 5-run block-shuffled null mean of 58.4 and null max of 80.
- The ATR short-window lead is above this first rough null baseline, but 5 permutations are not enough for final calibration; it remains research-only.
- `trend_volatility` and `roll_aware_breakout` remain rejected.
- Experiment factory `brent_research_v1` ran 432 rows across six strategy families with 52 screening passes and 0 failures.
- Factory status: `breakout_high_low` is `research_lead_short_only`, `mean_reversion_sma` is `research_lead`, `atr_breakout` is `research_lead`; `momentum_sma`, `trend_volatility`, and `roll_aware_breakout` are `rejected`.
- Factory gate: `holdout_eligible=false`, `paper_candidate=false`.
- Idea autopilot `brent_idea_space_v1` generated and tested fixed ideas without paper/live execution.
- Latest daily autopilot run tested 60 ideas across 1440 rows with 390 screening passes and 0 failures.
- Autopilot routing after holdout quarantine: 34 ideas to `needs_rework_or_strict_confirmation`, 18 ideas to `archive`, and 8 mean-reversion ideas to `archive_same_family_holdout_spent`.
- Autopilot gate: `holdout_eligible=false`, `paper_candidate=false`, `live_candidate=false`.

## GLDRUBF Decision

- GLDRUBF remains blocked for strategy testing until exact SWAPRATE semantics are verified from contract specifications.
- The RUSFAR cross-check did not confirm a simple one-to-one funding formula.
- Prior raw gold returns remain unsuitable for strategy conclusions.

## Source Quality

- Finam daily close matches MOEX ISS last intraday candle close, not ISS history close.
- Broker-close strategy tests should use Finam bars or ISS intraday-last bars.
- ISS settleprice/history close remain separate settlement/funding fields.

## Gate

A strategy may move from `screening_pass` to `paper_candidate` only after all items are true:

- candidate definition frozen before holdout;
- return-stitched/back-adjusted data pass;
- strict and short windows agree directionally;
- pessimistic cost sweep survives;
- roll-window exclusion does not remove the edge;
- source close/session convention is documented and matched to the chosen research data;
- orderbook spread/slippage review is complete;
- observed screening passes are materially above block-shuffled null calibration for the relevant family/window;
- no spent holdout family-neighborhood quarantine applies;
- user explicitly accepts paper mode.

Current gate verdict: `no_paper_candidate`.