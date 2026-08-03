# Strategy Search Status 2026-07-19

## Current Scope

Research target: MOEX Brent futures (`BR`) strategy search for a future bot stack.

Status: research only. No paper/live permission is opened.

Current paper gate remains blocked by the latest candidate review:

- `data/reports/candidate_review_20260719_225454.md`

## Data Built Today

MOEX ISS 60-minute candles were collected for all locally known BR contracts:

- Securities discovered from local MOEX ISS history: `49`
- Newly collected candle files: `46`
- Existing candle files reused: `3`
- Newly collected rows: `82,296`
- Full BR candle inventory after collection: `88,646` rows, `49` contracts
- Collection report: `data/reports/moex_iss_asset_candles_BR_20260719_231916.md`

Two continuous chains were built from those candles:

1. Raw last-trade chain:
   - Symbol: `BR_last_trade@MOEX_ISS`
   - Method: `sticky_volume_leader_last_trade`
   - Rows: `1,309`
   - Period: `2021-09-01` to `2026-07-19`
   - Rolls: `48`
   - Report: `data/reports/moex_iss_last_trade_continuous_BR_20260719_231924.md`

2. Return-stitched last-trade chain:
   - Symbol: `BR_last_trade_return_stitched@MOEX_ISS`
   - Method: `sticky_volume_leader_last_trade_return_stitched`
   - Rows: `1,309`
   - Period: `2021-09-01` to `2026-07-19`
   - Rolls: `48`
   - Fallback days: `1`
   - Fallback roll days: `1`
   - Report: `data/reports/moex_iss_last_trade_return_stitched_BR_20260719_231935.md`

The return-stitched last-trade chain is now the preferred BR research chain for mean-reversion screens because it removes direct old-contract/new-contract price jumps while using closes that match Finam daily bars much better than MOEX settlement/history closes.

## First Tests

Baseline on full last-trade return-stitched chain with MOEX ISS exchange fees plus broker assumption `0.45 RUB/contract`:

- `breakout_high_low`: `+40.16%`, max DD `50.64%`, `27` trades
- `mean_reversion_sma`: `+20.23%`, max DD `33.93%`, `198` trades
- `momentum_sma`: `-11.59%`, max DD `66.41%`, `89` trades
- Report: `data/reports/backtests/baseline_backtest_moex_iss_continuous_20260719_231946.md`

Walk-forward strict window (`252/63`, no holdout exclusion in this single run):

- `breakout_high_low`: `oos_negative`
- `mean_reversion_sma`: `oos_negative`
- `momentum_sma`: `oos_negative`
- Report: `data/reports/backtests/walk_forward_moex_iss_continuous_20260719_231954_298125.md`

Walk-forward short window (`80/20`, no holdout exclusion in this single run):

- `breakout_high_low`: `screening_pass`
- `mean_reversion_sma`: `oos_negative`
- `momentum_sma`: `oos_negative`
- Report: `data/reports/backtests/walk_forward_moex_iss_continuous_20260719_231959_816471.md`

## Robustness Matrix

Matrix run:

- Symbol: `BR_last_trade_return_stitched@MOEX_ISS`
- Method: `sticky_volume_leader_last_trade_return_stitched`
- Holdout excluded before train/test windows: `252` bars
- Windows: `252/63` and `80/20`
- Broker fee sweep: `0.45`, `1.0`, `2.0` RUB/contract
- Extra cost sweep: `0`, `10`, `25`, `50` bps
- Roll exclusion sweep: `0`, `1`, `2` bars around roll days
- Rows: `216`
- Failures: `0`
- Screening passes: `21`
- Report: `data/reports/brent_research_matrix_20260719_232050.md`

Screening pass distribution:

- `short_80_20` + `breakout_high_low`: `12/36` configurations passed
- `strict_252_63` + `mean_reversion_sma`: `9/36` configurations passed
- All other window/strategy families: `0` passes

Important interpretation:

- Short-window breakout passes only when `roll_window=0`. It becomes `oos_negative` when excluding `+/-1` or `+/-2` bars around rolls. This is not robust enough.
- Strict-window mean reversion passes in some configurations, including `roll_window=1`, but not under wider `roll_window=2` or stronger `25-50 bps` stress in the best family. This is a research hypothesis, not a candidate.
- Momentum remains rejected.

## Current Verdict

No strategy is eligible for paper mode.

The search did produce two research leads:

1. `strict_252_63 mean_reversion_sma` on last-trade return-stitched BR.
2. `short_80_20 breakout_high_low`, but this is currently roll-sensitive and lower priority.

Neither lead passes a robust final gate yet.

## Focused Mean-Reversion Pack 2026-07-20

A focused robustness pack was run for the remaining `mean_reversion_sma` lead:

- Symbol: `BR_last_trade_return_stitched@MOEX_ISS`
- Method: `sticky_volume_leader_last_trade_return_stitched`
- Strategy filter: `mean_reversion_sma`
- Holdout excluded before walk-forward matrix: `252` bars
- Windows:
  - `strict_189_42`
  - `strict_252_42`
  - `strict_252_63`
  - `strict_252_84`
  - `strict_315_63`
- Broker fee sweep: `0.45`, `1.0`, `2.0`, `5.0` RUB/contract
- Extra cost sweep: `0`, `10`, `25`, `50`, `75` bps
- Roll exclusion sweep: `0`, `1`, `2`, `3` bars around rolls
- Matrix rows: `400`
- Failures: `0`
- Screening passes: `72`
- Report: `data/reports/brent_research_matrix_20260720_001410.md`

Pass-rate summary:

- By cost:
  - `0 bps`: `28/80`
  - `10 bps`: `24/80`
  - `25 bps`: `20/80`
  - `50 bps`: `0/80`
  - `75 bps`: `0/80`
- By window:
  - `strict_189_42`: `28/80`
  - `strict_252_42`: `16/80`
  - `strict_252_63`: `16/80`
  - `strict_252_84`: `8/80`
  - `strict_315_63`: `4/80`
- By broker fee:
  - all tested broker fees had `18/100` passes, so broker fixed fee was not the main driver at this scale.

Interpretation:

- The lead is sensitive to extra bps stress: it fully dies at `50-75 bps`.
- Some conservative configurations still pass with `25 bps`, `broker=5 RUB`, and wider roll filters.
- Because at least one conservative configuration survived the focused pack, one preregistered holdout check was allowed.

## Preregistered Holdout 2026-07-20

Single holdout check:

- Strategy: `mean_reversion_sma`
- Dataset: `BR_last_trade_return_stitched@MOEX_ISS`
- Cost: `25 bps`
- Broker fee: `5 RUB/contract`
- Roll-window exclusion: `+/-3` bars
- Holdout: last `252` raw bars, filtered to `196` bars after roll-window exclusion
- Parameters selected only on pre-holdout train: `lookback=20`, `threshold_pct=2.0`
- Report: `data/reports/holdout_candidate_20260720_001532.md`

Holdout result:

- Strategy return: `-6.48%`
- Buy-and-hold return: `+68.71%`
- Excess return: `-75.19%`
- Max drawdown: `21.19%`
- Trades: `18`
- Verdict: `holdout_fail`

Updated verdict:

- `mean_reversion_sma` is rejected as a paper candidate.
- Current strategy candidate: `none`.
- Paper/live gate remains closed.

## Expanded Strategy Families 2026-07-20

Three new long/flat strategy families were added to the research engine:

- `atr_breakout`: breakout only when close exceeds the prior range by an ATR buffer.
- `trend_volatility`: trend-following gated by realized volatility.
- `roll_aware_breakout`: breakout with explicit flat windows around roll dates.

Implementation files:

- `src/moex_futures_bot/backtest.py`
- `tools/run_walk_forward.py`
- `tools/run_brent_research_matrix.py`
- `tools/run_baselines.py`

Exploratory matrix:

- Symbol: `BR_last_trade_return_stitched@MOEX_ISS`
- Method: `sticky_volume_leader_last_trade_return_stitched`
- Strategy filters: `atr_breakout`, `trend_volatility`, `roll_aware_breakout`
- Holdout excluded before walk-forward matrix: `252` bars
- Windows:
  - `strict_252_63`
  - `short_80_20`
- Broker fee sweep: `0.45`, `2.0`, `5.0` RUB/contract
- Extra cost sweep: `0`, `10`, `25`, `50` bps
- Roll exclusion sweep: `0`, `1`, `2` bars around rolls
- Matrix rows: `216`
- Failures: `0`
- Screening passes: `32`
- Report: `data/reports/brent_research_matrix_20260720_014157.md`

Expanded-family result:

- All `32` screening passes came from `atr_breakout`.
- All `32` screening passes were in `short_80_20`.
- `strict_252_63` produced no paper-quality pass for any new family.
- `trend_volatility` produced no screening passes.
- `roll_aware_breakout` produced no screening passes.

Interpretation:

- `atr_breakout` is a live research lead, not a candidate.
- It is encouraging that some short-window ATR configurations survive `25-50 bps`, broker fee `2-5 RUB`, and roll-window `1-2`.
- It is not eligible for holdout because strict-window confirmation is absent.
- Current strategy candidate remains `none`.

## Test Factory 2026-07-22

The first reproducible experiment factory was added.

Files:

- Config: `configs/experiments/brent_research_v1.json`
- Runner: `tools/run_experiment_factory.py`
- Summary helper: `tools/summarize_experiment_results.py`
- Plan: `docs/TEST_FACTORY_PLAN.md`

Factory run:

- Run ID: `brent_research_v1_20260722_160940`
- Report: `data/reports/factory/brent_research_v1_20260722_160940/report.md`
- Rows: `432`
- Failures: `0`
- Screening passes: `52`
- Holdout eligible: `false`
- Paper candidate: `false`

Factory statuses:

- `momentum_sma`: `rejected`
- `breakout_high_low`: `research_lead_short_only`
- `mean_reversion_sma`: `research_lead`
- `atr_breakout`: `research_lead`
- `trend_volatility`: `rejected`
- `roll_aware_breakout`: `rejected`

Interpretation:

- The factory is now the main way to compare strategy families.
- No current family is holdout-eligible.
- The next useful work is not opening paper mode; it is adding new families/features into the factory and improving execution-realism tests.

## Idea Autopilot 2026-07-22

The first automatic idea-generation and routing layer was added.

Files:

- Idea space: `configs/idea_space/brent_v1.json`
- Generator: `tools/generate_strategy_ideas.py`
- Autopilot runner: `tools/run_idea_autopilot.py`
- Plan: `docs/IDEA_AUTOPILOT_PLAN.md`

Safety:

- Auto paper: disabled.
- Auto live: disabled.
- Real orders: disabled.
- Holdout: excluded until a candidate is frozen in writing.

Smoke run:

- Run ID: `brent_idea_space_v1_20260722_163421`
- Ideas: `12`
- Rows: `48`
- Failures: `0`
- Screening passes: `0`

Daily run:

- Run ID: `brent_idea_space_v1_20260722_164402`
- Report: `data/reports/idea_autopilot/brent_idea_space_v1_20260722_164402/report.md`
- Ideas: `60`
- Rows: `1440`
- Failures: `0`
- Screening passes: `390`
- Holdout eligible: `false`
- Paper candidate: `false`
- Live candidate: `false`

Daily routing:

- `focused_pack`: `5` ideas
- `needs_rework_or_strict_confirmation`: `34` ideas
- `archive`: `21` ideas

Top focused-pack ideas:

- `mean_reversion_sma_838aa6df2d`: `lookback=20`, `threshold_pct=1.0`, 14 passes, 6 strict, 8 short.
- `mean_reversion_sma_82383b82a0`: `lookback=20`, `threshold_pct=2.0`, 9 passes, 5 strict, 4 short.
- `mean_reversion_sma_4370f80634`: `lookback=10`, `threshold_pct=2.0`, 8 passes, 4 strict, 4 short.

Interpretation:

- The autopilot can now generate, test, and route ideas automatically.
- It did not find a holdout-eligible idea in the first daily run.
- Next step is an automatic focused-pack runner for the 5 routed ideas, still without touching holdout.

## Next Plan

1. Add a dedicated candidate-review report for the last-trade return-stitched matrix.
2. Extract the selected parameters fold-by-fold for the strict mean-reversion lead.
3. Run a focused robustness pack on that lead only:
   - `roll_window=0,1,2,3`
   - `cost_bps=0,10,25,50,75`
   - broker fee `0.45,1.0,2.0,5.0`
   - train/test variants around `252/63`
4. Run a one-time holdout only if a single preregistered configuration survives the focused pack.
5. If holdout survives, move to execution realism:
   - compare signal close vs actionable next-session prices
   - estimate spread/slippage from candles/order book where available
   - verify contract roll operational rules
6. If holdout fails, expand the strategy search families rather than tuning these same three:
   - volatility breakout with ATR filters
   - trend plus volatility regime filter
   - calendar/roll-aware flat filters
   - carry/term-structure research if MOEX data supports it
