# Strategy Research Adaptation

This project borrows the research discipline from the Botalin crypto workflow, but adapts it to MOEX futures through Finam Trade API.

## What Transfers Directly

- Keep all discovery and validation read-only until an explicit go decision.
- Use paper mode before any live order path.
- Treat a strategy as promising only after a verdict, not after a good-looking early sample.
- Track strategy lifecycle statuses instead of free-form optimism.
- Use day-clustered sample counts so one active day cannot masquerade as independent evidence.
- Keep both optimistic and pessimistic cost assumptions in reports.
- If thresholds, exclusions, or guards change, create a new model id or reset the evaluation clock.
- Keep a signal journal with entry, stop, target, reason, risk, order result, and post-trade notes.
- Remove stale claims from dashboards or reports when a strategy fails to reproduce.

## What Must Change For MOEX Futures

- Funding/insurance/oracle features from crypto do not transfer directly.
- MOEX commodity futures need contract-roll logic: front-month selection, expiry calendar, and symbol remapping.
- Costs must include broker commission, exchange/NCC fees, spread, slippage, and possible evening/weekend liquidity differences.
- Margin checks must use futures initial margin and account limits, not crypto wallet balance.
- Stop logic must account for exchange sessions, clearing, price bands, and order type support in the broker API.
- Data quality checks need separate handling for official MOEX market data, Finam market data, and broker demo data.

## Initial Strategy Lifecycle

Use these statuses for every hypothesis:

- `idea`: untested concept.
- `needs_data`: not enough independent trading days.
- `reject_pocket`: one-day or one-regime effect only.
- `guard`: usable only as a filter, not an entry strategy.
- `paper_candidate`: preregistered and ready for paper simulation.
- `paper_active`: running in paper mode with immutable rules.
- `needs_reconciliation`: result changed or cannot be reproduced.
- `failed`: below threshold after costs or failed guard.
- `promising`: passed preregistered paper verdict with enough data.
- `live_candidate`: ready for a separate explicit go/no-go review.

## Minimum Gates

Before `paper_active`:

- Instrument is confirmed by API symbol and order book.
- Historical data source is selected and documented.
- Entry, exit, stop, invalidation, and no-trade conditions are written down.
- Fees, spread, and slippage assumptions are written down.
- A daily loss limit and max position are defined.

Before `promising`:

- At least 20 independent trading days, unless explicitly marked as an early experiment.
- Positive after pessimistic costs.
- No single day or single volatility event explains most of the result.
- Re-run from a clean data snapshot reproduces the report.
- All rule changes since preregistration are documented.

Before any live order:

- Separate explicit user go.
- Broker account id is verified by API.
- One-symbol smoke test in paper mode has run end to end.
- Kill switch works.
- Live size starts at one contract or lower if supported.
- Daily max loss, max orders, and max position are enforced in code.

## Current Finam Findings

Read-only probe confirmed:

- Auth works with the saved Finam token.
- `/v1/assets` returned 8637 instruments.
- MOEX/RTSX futures discovered:
  - `GLDRUBF@RTSX`
  - `GDU6@RTSX` (`GOLD-9.26`)
  - `BRQ6@RTSX` (`BR-8.26`)
  - `BRU6@RTSX` (`BR-9.26`)
  - `BRV6@RTSX` (`BR-10.26`)
- Order book reads worked for those symbols.
- MOEX gas futures were not found in the current Finam demo asset list.
- NYMEX gas futures were found: `NGQ26@XNYM`, `NGU26@XNYM`, `NGV26@XNYM`, `QGQ26@XNYM`, `QGU26@XNYM`.
- UI demo account `951464` did not match REST account endpoint `/v1/accounts/951464`; the API account id still needs verification before order work.

## Next Implementation Slice

Build only read-only and paper components:

- `finam_client`: auth, assets, order book, and contract params.
- `instrument_registry`: selected symbols, names, contract month, roll notes.
- `paper_engine`: consumes snapshots, produces hypothetical fills.
- `risk_gate`: max daily loss, max position, max orders, no-trade states.
- `journal`: JSONL events for signal, decision, simulated order, fill, and verdict.

No live order methods should be implemented until the account id is verified and a separate go is given.

## Baseline Backtests

The first strategy tests are controls, not candidates:

- `momentum_sma`;
- `breakout_high_low`;
- `mean_reversion_sma`.

They are allowed to become `baseline_positive` or `baseline_negative`, but not
`promising`. A strategy can only move toward paper after a separate review of
sample size, costs, liquidity, and out-of-sample behavior.

Walk-forward checks are required before any `paper_candidate` status:

- parameters are selected on a train window only;
- the following test window is scored as out-of-sample;
- every OOS fold is compared with buy-and-hold over the same window;
- `screening_pass` requires at least 8 OOS folds, positive average test return, positive average excess return over buy-and-hold, at least 60% positive excess folds, and one-sided sign-test p <= 0.25;
- short-contract walk-forward runs are weaker evidence than long-history checks;
- `screening_pass` is still only a research status, not a permission to trade.
- after strategy-family exploration, freeze the candidate definition and reserve
  the latest available ~12 months as a one-shot holdout;
- do not tune parameters, filters, costs, or roll rules on the holdout result.

GLDRUBF-specific blocker:

- GLDRUBF is treated as a separate research object until its perpetual-futures
  funding/swap mechanics are modeled.
- Any gold verdict that ignores GLDRUBF funding is preliminary and must not be
  promoted to paper mode.
- MOEX ISS history contains `SWAPRATE` for GLDRUBF, and provisional long-pays
  funding adjustment nearly removes the 2023-2026 raw buy-and-hold return.
- Walk-forward checks must include MOEX exchange fees where available and an
  explicit broker-fee assumption. The broker fee must be replaced with the
  actual account tariff before any paper decision.
- Mixing GLDRUBF and dated GOLD contracts in one family is methodologically weak
  unless carry/funding/basis differences are modeled.
