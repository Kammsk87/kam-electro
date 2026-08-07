# TASK-MX-001 Result - MOEX Cost Model And Stage 0 Feasibility v0

Date: 2026-08-06
Branch: `task/BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0` (uncommitted)
Evidence: [stage0_br_calendar_feasibility_20260806.md](../../moex-futures-bot/data/reports/stage0_br_calendar_feasibility_20260806.md)

## Lifecycle footer

- Entered: `DATA_HEALTH`. Left: `DATA_HEALTH`.
- Evidence gate: Stage 0 feasibility, **CONDITIONAL**. Not a pass.
- Failure route: `DATA_REQUEST`. Two unmeasured cost terms decide the verdict and
  neither is obtainable from retained data.
- Next queued task and owner: broker-tariff and spread-margin measurement,
  Data Scout. No Stage 1 protocol may be written until it returns.
- `promising_count` unchanged. `check_paper_gate.py` still returns `blocked`.
  No candidate created, no paper, no live.

## What was delivered

**Part A — frozen cost model.** MOEX publishes its own fees per contract and
this project already had them: `data/market/moex_iss/params/` carries
`buysellfee`, `scalperfee`, `minstep`, `stepprice` and `initialmargin` per
security. The schedule is read from those, not transcribed from a tariff page.

- `configs/costs/moex_forts_fee_schedule_2026-08-06.json`
- `src/moex_futures_bot/cost_model.py`
- `tools/test_cost_model.py` — 22 checks, all passing

The contract ported from `scripts/analysis/cost_model.mjs`: a floor may not be a
bare number; `as_of` is mandatory; a missing schedule raises rather than
defaulting; every returned value carries its schedule entry and measurement.

One venue-specific change was necessary. FORTS charges a **flat rouble fee per
contract per side**, so `cost_bps` is structurally wrong as a primitive: the
same contract costs a different number of basis points at a different price. The
model returns roubles and derives bps only against a declared reference price.

**Part B — Stage 0 feasibility.** `tools/stage0_br_calendar_feasibility.py`.
No entry rule, no exit rule, no tunable parameter.

## What the prior configuration was doing

`configs/idea_space/brent_v1.json` swept `cost_bps: [0, 10, 25, 50]` and called
25 "robust". The measured exchange fee is **2.60 bps** round trip on one BR leg.
The declared robustness threshold was roughly ten times the fee it was standing
in for. An undocumented `broker_fee_rub_per_contract: 5.0` also appears in
`holdout_ledger_BR_20260722.json` with no derivation recorded anywhere.

An arbitrary constant errs in both directions. On fees this one was far too
harsh and may have discarded ideas that costs did not actually kill; on spread
and slippage in the illiquid legs it was blind. Prior published results keep
their frozen constants so they stay reproducible; the schedule binds new work
from 2026-08-06 onward.

## Stage 0 measurement

Cost floor in force, two-leg round trip, one-tick execution assumption:
**51.64 ₽** = 35.96 fee + 15.68 execution. Labelled a lower bound.

Front/second BR spread, 646 constant-pair daily observations from 2024-01-01.
Windows spanning a roll are excluded — a window that spans a roll measures the
roll jump, not the spread.

| horizon | n | median abs | p75 | share > floor |
|---|---:|---:|---:|---:|
| 1d | 618 | 78 ₽ | 180 ₽ | 64.2% |
| 3d | 562 | 133 ₽ | 288 ₽ | 79.0% |
| 5d | 506 | 157 ₽ | 361 ₽ | 84.6% |
| 10d | 366 | 235 ₽ | 423 ₽ | 89.9% |

Mean-reversion half-life 4.2 trading days over 24 constant-pair regimes; typical
absolute deviation from the pair's own mean 148 ₽ against a 52 ₽ floor.

## Verdicts

| gate | verdict |
|---|---|
| K1 volatility floor | PASS |
| K2a mean-reversion amplitude | PASS — half-life 4.2d, deviation 148 ₽ vs floor 52 ₽ |
| K2b leg-3 data adequacy | PASS — leg2/leg3 co-trade in 92.4% of 60-minute slots |
| K3a expiry-window anomaly | CONCENTRATED — final-week median 517 ₽ vs 125 ₽ at 16+ dte, ratio 4.1x |
| K3b margin funding | PASS as pre-registered; **all-in cost exceeds the median move at 10d** |

None of the five pre-registered conditions fired as a kill. That is not the same
as a green light, for the reasons below.

## Why the verdict is CONDITIONAL and not PASS

**The headroom is thin and it is hostage to two numbers nobody has measured.**

All-in cost as measured, against the median move:

| horizon | median move | round trip | funding | all-in | headroom |
|---|---:|---:|---:|---:|---:|
| 1d | 78 ₽ | 52 ₽ | 21 ₽ | 72 ₽ | +7.6% |
| 3d | 133 ₽ | 52 ₽ | 62 ₽ | 114 ₽ | +14.4% |
| 5d | 157 ₽ | 52 ₽ | 104 ₽ | 156 ₽ | +0.7% |
| 10d | 235 ₽ | 52 ₽ | 208 ₽ | 260 ₽ | **−10.5%** |

Now move the two unmeasured terms.

Adding the 5 ₽/contract broker fee that the spent holdout already assumed, and
keeping full margin on both legs:

| horizon | 1d | 3d | 5d | 10d |
|---|---:|---:|---:|---:|
| headroom | −18.8% | −0.5% | −11.9% | −19.0% |

**Every horizon is negative at the median.** The contour dies.

Same broker fee, but applying a 70% FORTS inter-contract spread margin discount:

| horizon | 1d | 3d | 5d | 10d |
|---|---:|---:|---:|---:|
| headroom | +0.1% | +32.2% | +34.5% | +43.0% |

**Three of four horizons are comfortably viable.** The contour is healthy.

The same measurement supports both conclusions. The deciding inputs are the
broker tariff and the spread margin discount, and this project has neither. That
is a `DATA_REQUEST`, not a feasibility pass.

Two further reasons not to read the gates as a green light:

- **K2b measures bar existence, not tradeable size.** Leg 3 prints in 92.4% of
  hourly slots on a median of 741 lots and 49 mln ₽ per day. A bar exists; a
  fill at size does not follow. K2b clears the data-health question only.
- **K3a says the dispersion is where the risk is.** Four times the movement sits
  in the front leg's final week, which is exactly the window of worst roll and
  liquidity risk. Any contour that harvests that dispersion is trading the roll,
  and must say so.

## Three defects found and fixed in this task's own code

Recorded because the pipeline's value is that it catches these, and because the
first run reported figures that were wrong.

1. **K2b counted the wrong thing.** The first implementation asked whether at
   least N+1 contracts printed in a slot, which credits leg3/leg4 on a slot where
   legs 1, 2, 5 and 6 traded and leg 3 did not. Rewritten to name the two
   specific ranked contracts. First run reported 89.9% for leg2/leg3; corrected
   92.4%.
2. **Days-to-expiry was wrong for live contracts.** Expiry was taken as the last
   date a contract printed, which for contracts still alive at the end of the
   sample is the end of the data, labelling live contracts as being in their
   final week. First run reported a 4.5x final-week ratio on n=28; corrected
   4.1x after excluding still-alive contracts.
3. **K3b was too lenient as pre-registered.** It compares funding against the
   move in isolation, but a position pays funding *and* the round trip. The
   combined figure is reported alongside the gate as declared. The gate is not
   silently redefined: K3b passes as written, and the all-in table shows why
   that pass is not reassuring.

## What this task cannot conclude

- Nothing about whether any signal predicts the BR calendar spread. Stage 0
  tests arithmetic, not edge.
- Nothing about executability. There is no MOEX book data at all:
  `data/market/finam/orderbook/` is empty, so `execution_basis="MEASURED"`
  raises by design. Under the pipeline protocol every MOEX task is
  `DATA_INADEQUATE` for tick-level fill claims until a quote source exists.
- Dispersion measured on daily closes is not dispersion capturable at a decision
  time.
- The funding term treats posted initial margin as forgone at RUSFAR. That is an
  assumption about collateral opportunity cost, not a measurement.

## Multiplicity

This Stage 0 record consumes **no multiplicity budget**: no signal was tested and
no parameter was selected. It is a contour record, not a hypothesis trial, and
should be entered in the trials ledger as such. Recording it as a trial would
inflate the deflation count against future genuine tests.

## Next queued task

`TASK-MX-002-FORTS-BROKER-TARIFF-AND-SPREAD-MARGIN-MEASUREMENT-V0` — obtain the
per-contract broker commission and the FORTS inter-contract spread margin
discount for BR, append them to the schedule as a new dated entry, and re-run
this script unchanged. The Stage 0 verdict flips on those two numbers and on
nothing else that was measured here.
