# TASK-MX-001 Stage 0 - BR calendar spread feasibility

Generated: 2026-08-06. Lifecycle stage `DATA_HEALTH`. This is a feasibility measurement,
not a strategy, not a candidate, and not evidence of edge.

## Cost floor in force

```
51.64 RUB per contract round trip (2-leg, non-scalper, execution basis TICK_FLOOR) = 7.46 bps at 88.33 LOWER BOUND = 35.96 fee [PUBLISHED_VENUE_PARAMS] + 15.68 execution [THEORETICAL LOWER BOUND. Assumes the bid-ask spread equals one minimum price step and that a round trip crosses it once in total per leg. The true spread is at least this and usually wider, especially away from the front contract. Any report quoting a TICK_FLOOR result must label it a lower bound.], schedule MOEX.FORTS.FEE.SCHEDULE v1.0.0 entry ISS_PUBLISHED_PARAMS_2026_08 effective 2026-08-06, source data/market/moex_iss/params/security={BRQ6,BRU6,BRV6}/params.parquet
```

- two-leg round trip, tick floor: **51.64 RUB** (7.46 bps of one leg)
- two-leg round trip, tick-floor stress: **67.32 RUB**
- this is a LOWER BOUND: no broker commission in this schedule; the exchange leg only; no measured bid-ask spread on this venue; data/market/finam/orderbook/ is empty; no measured slippage; no MOEX order has ever been placed by this project

## front/second spread

Constant-pair daily observations from 2024-01-01: 646

| horizon | n windows | median abs | p75 | p90 | share > floor | share > stress |
|---|---:|---:|---:|---:|---:|---:|
| 1d | 618 | 78 ₽ | 180 ₽ | 412 ₽ | 64.2% | 55.7% |
| 3d | 562 | 133 ₽ | 288 ₽ | 626 ₽ | 79.0% | 72.1% |
| 5d | 506 | 157 ₽ | 361 ₽ | 847 ₽ | 84.6% | 79.6% |
| 10d | 366 | 235 ₽ | 423 ₽ | 1254 ₽ | 89.9% | 86.6% |

- mean-reversion half-life: 4.2 trading days over 24 constant-pair regimes
- typical absolute deviation from the pair's own mean: 148 ₽

Five-day moves by the near leg's remaining life:

| bucket | n | median abs | share > floor |
|---|---:|---:|---:|
| 0-5 dte (final week) | 27 | 517 ₽ | 96.3% |
| 6-15 dte | 270 | 165 ₽ | 87.8% |
| 16+ dte | 202 | 125 ₽ | 78.2% |

## second/third spread

Constant-pair daily observations from 2024-01-01: 646

| horizon | n windows | median abs | p75 | p90 | share > floor | share > stress |
|---|---:|---:|---:|---:|---:|---:|
| 1d | 618 | 102 ₽ | 204 ₽ | 368 ₽ | 73.5% | 64.9% |
| 3d | 562 | 141 ₽ | 274 ₽ | 525 ₽ | 79.4% | 73.8% |
| 5d | 506 | 180 ₽ | 343 ₽ | 627 ₽ | 82.0% | 78.3% |
| 10d | 366 | 227 ₽ | 443 ₽ | 917 ₽ | 85.2% | 82.5% |

- mean-reversion half-life: 5.3 trading days over 24 constant-pair regimes
- typical absolute deviation from the pair's own mean: 145 ₽

Five-day moves by the near leg's remaining life:

| bucket | n | median abs | share > floor |
|---|---:|---:|---:|
| 16+ dte | 463 | 157 ₽ | 81.2% |

## Cost sensitivity - how wide can the real spread be before K1 fails

The floor assumes a one-tick bid-ask. The true spread is unmeasured. This is the
widest true spread, in ticks per leg, at which the median move still clears the
round trip. One tick is 0.01 price points = 7.84 ₽ per leg.

| horizon | median abs move | breakeven spread (ticks/leg) | breakeven cost |
|---|---:|---:|---:|
| 1d | 78 ₽ | 2.7 | 78 ₽ |
| 3d | 133 ₽ | 6.2 | 133 ₽ |
| 5d | 157 ₽ | 7.7 | 157 ₽ |
| 10d | 235 ₽ | 12.7 | 235 ₽ |

Fee alone is 35.96 ₽, so any horizon whose median move is below
that figure is dead on fees regardless of the book.

## K2b - hourly co-trading adequacy

Measured on the two specific ranked contracts, not on a count of how many
contracts happened to print in the slot.

60-minute candle coverage: 646 of 646 trading dates in the window, 10165 slots.

| leg pair | share of 60m slots with both legs printing |
|---|---:|
| leg 1 / leg 2 | 97.2% |
| leg 2 / leg 3 | 92.4% |
| leg 3 / leg 4 | 75.9% |

## K3b - margin funding

Initial margin, both legs, conservative: 32,018 ₽. RUSFAR median from 2024-01-01: 16.38%.

| horizon | funding cost | vs median abs move (front/second) |
|---|---:|---|
| 1d | 21 ₽ | move exceeds funding |
| 3d | 62 ₽ | move exceeds funding |
| 5d | 104 ₽ | move exceeds funding |
| 10d | 208 ₽ | move exceeds funding |

FORTS grants inter-contract spread margin discounts. This uses the full sum of both legs,
which is conservative; the exact discount is `undetermined` and would reduce these figures.

### All-in: trade cost AND funding together

K3b as pre-registered compares funding against the move on its own. A position pays
both. This is the number that decides whether a horizon can pay for itself, and it is
harsher than either gate taken separately.

| horizon | median abs move | round trip | funding | all-in | headroom |
|---|---:|---:|---:|---:|---:|
| 1d | 78 ₽ | 52 ₽ | 21 ₽ | 72 ₽ | 7.6% |
| 3d | 133 ₽ | 52 ₽ | 62 ₽ | 114 ₽ | 14.4% |
| 5d | 157 ₽ | 52 ₽ | 104 ₽ | 156 ₽ | 0.7% |
| 10d | 235 ₽ | 52 ₽ | 208 ₽ | 260 ₽ | -10.5% |

**Horizons where the median move does not cover the all-in cost: [10].** Those horizons are not viable at the median even before a signal is applied.

## Verdicts against pre-registered kill conditions

| gate | verdict |
|---|---|
| K1 volatility floor | PASS |
| K2a mean-reversion amplitude | PASS (half-life 4.2d, typical deviation 148 ₽ vs floor 52 ₽) |
| K2b leg-3 data adequacy | PASS |
| K3a expiry-window anomaly | CONCENTRATED in the final week (median 517 ₽ vs 125 ₽, ratio 4.1x) |
| K3b margin funding | PASS as pre-registered (funding alone); but all-in cost exceeds the median move at horizons [10] |

## What this cannot conclude

- It says nothing about whether any signal predicts the spread. Stage 0 tests arithmetic, not edge.
- Every cost figure is a lower bound: no broker commission, no measured spread, no slippage.
- Dispersion measured on daily closes is not dispersion capturable at a decision time.
- Passing K1 does not authorise a strategy; it authorises writing a Stage 1 protocol.

Lifecycle: entered `DATA_HEALTH`, left `DATA_HEALTH`. No candidate created. `check_paper_gate.py` unchanged and still blocked.
