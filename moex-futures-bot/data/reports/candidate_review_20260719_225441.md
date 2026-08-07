# Candidate Review

Generated: 2026-07-19T22:54:41

## Status

- Paper mode status: `blocked`.
- Live trading status: `out_of_scope`.
- Current strategy candidate: `none`.
- Holdout status: latest 252 bars are reserved and were excluded from the development matrix.
- Holdout must not be touched until one candidate definition is frozen in writing.

## Evidence

- Brent matrix: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/brent_research_matrix_20260719_215827.md`
- Brent roll-gap audit: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/moex_iss_roll_gaps_BR_20260719_211855.md`
- Brent return-stitched chain: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/moex_iss_return_stitched_BR_20260719_212548.md`
- Finam vs MOEX ISS cross-check: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/finam_vs_moex_iss_candles_20260719_225300.md`
- Finam vs MOEX ISS candle cross-check: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/finam_vs_moex_iss_candles_20260719_225300.md`
- Data decision: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/data_decision_20260719_225300.md`
- GLDRUBF SWAPRATE vs RUSFAR: `/Users/aleksandr/Documents/New project KAM/moex-futures-bot/data/reports/gldrubf_swaprate_vs_rusfar_20260719_213114.md`

## Brent Decision

- The raw Brent mean-reversion signal was falsified by return-stitched validation earlier in the session.
- The development matrix used `BR_return_stitched@MOEX_ISS`, excluded the latest 252 bars as holdout, and tested broker fees 0.45/1.0/2.0 RUB, cost reserves 0/10/25/50 bps, and roll-window exclusions 0/1/2 bars.
- The matrix produced 216 strategy rows and 21 `screening_pass` rows, but no robust candidate.
- Strict-window mean reversion passes only for roll-window 1/2 and low cost reserves 0/10 bps; it fails at 25/50 bps.
- Short-window breakout passes only with roll-window 0; it disappears when roll windows are excluded.
- No strategy currently survives across strict/short windows, cost stress, and roll-window exclusion.

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