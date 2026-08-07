# Candidate Review

Generated: 2026-07-20T00:16:37

## Status

- Paper mode status: `blocked`.
- Live trading status: `out_of_scope`.
- Current strategy candidate: `none`.
- Holdout status: one preregistered conservative mean-reversion candidate was tested and failed.
- Further holdout reuse for the same three baseline families is disallowed; expand strategy families first.

## Evidence

- Brent matrix: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/brent_research_matrix_20260720_001410.md`
- Brent holdout check: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/holdout_candidate_20260720_001532.md`
- Brent roll-gap audit: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/moex_iss_roll_gaps_BR_20260719_211855.md`
- Brent settlement return-stitched chain: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/moex_iss_return_stitched_BR_20260719_212548.md`
- Brent last-trade return-stitched chain: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/moex_iss_last_trade_return_stitched_BR_20260719_231935.md`
- Finam vs MOEX ISS cross-check: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/finam_vs_moex_iss_20260719_212740.md`
- Finam vs MOEX ISS candle cross-check: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/finam_vs_moex_iss_candles_20260719_225300.md`
- Data decision: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/data_decision_20260719_225300.md`
- GLDRUBF SWAPRATE vs RUSFAR: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/gldrubf_swaprate_vs_rusfar_20260719_213114.md`

## Brent Decision

- Broker-close research data was upgraded to `BR_last_trade_return_stitched@MOEX_ISS`, built from MOEX ISS intraday-last candle closes.
- The focused mean-reversion matrix used the last-trade return-stitched chain, excluded latest 252 bars as holdout, and tested 5 train/test windows, broker fees 0.45/1.0/2.0/5.0 RUB, cost reserves 0/10/25/50/75 bps, and roll-window exclusions 0/1/2/3 bars.
- The focused matrix produced 400 rows, 72 `screening_pass` rows, and 0 failures.
- The edge fully disappears at 50/75 bps, but a conservative preregistered configuration survived at 25 bps, 5 RUB broker fee, and roll-window 3.
- The single preregistered holdout selected `lookback=20`, `threshold_pct=2.0` from pre-holdout data only.
- Holdout result: strategy -6.48%, buy-and-hold +68.71%, excess -75.19%, max drawdown 21.19%, 18 trades.
- `mean_reversion_sma` is rejected as a paper candidate.
- `breakout_high_low` remains rejected because it was roll-sensitive in the prior matrix.
- `momentum_sma` remains rejected.

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
- user explicitly accepts paper mode.

Current gate verdict: `no_paper_candidate`.