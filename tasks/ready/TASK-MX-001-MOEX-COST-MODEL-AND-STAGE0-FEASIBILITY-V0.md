# TASK-MX-001 - MOEX Cost Model And Stage 0 Feasibility v0

## Lifecycle

- Current stage: `DATA_HEALTH`
- Next permitted transition: `DISCOVERY` for a named BR term-structure contour, or
  `DATA_REQUEST` if the cost floor cannot be established from retained sources.
- Governing documents: `docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`,
  `reference/BOTALIN_RESEARCH_PIPELINE_PROTOCOL_2026-08-03.md`.
- This task cannot produce a candidate. Its ceiling is a frozen cost model plus a
  Stage 0 verdict on one named execution contour.

## Objective

Give the MOEX research pipeline the thing it has never had: a cost floor that
carries its own derivation. Then spend that floor on the cheapest possible check
— Stage 0 feasibility for the BR calendar-spread contour — before any spread
strategy code is written.

This task adopts the Botalin research pipeline for the MOEX venue. It ports the
cost-model *contract*, not the crypto numbers.

## Why this task exists

Three measured facts, each of which the current pipeline gets wrong:

1. `configs/idea_space/brent_v1.json` sweeps `cost_bps: [0, 10, 25, 50]` and
   declares `robust_min_cost_bps: 25`. None of the four values is derived from
   anything. `src/moex_futures_bot/backtest.py` additionally defaults
   `exchange_fee_rub` and `broker_fee_rub` to `0.0`. Botalin already paid for
   this exact mistake: a bare `11` bps constant was hardcoded in six engines,
   was wrong by roughly 5 bps, and **37 hypotheses were judged against it**
   (`reference/BOTALIN_COST_MODEL_AUDIT_2026-08-04.md`,
   `scripts/analysis/cost_model.mjs`).

2. MOEX publishes the real fee per contract. `data/market/moex_iss/params/`
   already contains `buysellfee`, `scalperfee`, `minstep`, `stepprice` and
   `initialmargin` per security. The floor does not need to be guessed; it needs
   to be read.

3. FORTS charges a **flat rouble fee per contract**, not a percentage of
   notional. A `cost_bps` constant is therefore structurally wrong: the same
   contract costs a different number of basis points at a different price. The
   primitive unit must be RUB per contract per leg, with bps derived only when a
   reference price is supplied.

## Architecture to establish

Two layers, per the shared-kernel decision:

- **Shared kernel (venue-agnostic)**: the cost-model contract — a floor may not
  be a bare number; every returned value carries the schedule entry it came from
  and the measurement behind that entry; a missing schedule raises rather than
  defaulting; `as_of` is required so a historical result stays reproducible.
- **MOEX venue adapter**: the FORTS fee schedule derived from ISS contract
  params, the rouble-primitive cost algebra, the scalper/non-scalper
  distinction, and the tick-floor execution proxy.

## Safety boundary

Read-only research. Do not: read `.env` or any credential; call Finam or any
broker endpoint; place, simulate or route an order; start a service; modify
`check_paper_gate.py` to return anything other than `blocked`; promote any
strategy; alter the holdout ledger; or retrofit the six existing engines'
frozen `cost_bps` values — their published results must stay reproducible, so
this schedule binds work from 2026-08-06 onward only.

## Required work

### Part A — frozen cost model

1. Build `configs/costs/moex_forts_fee_schedule_2026-08-06.json` from the
   retained ISS params. Every rate carries `basis`, `source`, and the securities
   it was measured on. Entries are appended, never rewritten.
2. Implement `src/moex_futures_bot/cost_model.py` enforcing the contract above.
   Required behaviour:
   - `require_floor` refuses to return anything without an explicit `as_of`
     (`YYYY-MM-DD`), an instrument, an explicit `legs` of 1 or 2, and an explicit
     `execution_basis`;
   - the returned object exposes RUB per contract round trip as primitive and
     bps only when `reference_price` is supplied;
   - `scalper=True` (intraday close, FORTS `scalperfee`) is never the default;
   - `execution_basis="MEASURED"` raises, because
     `data/market/finam/orderbook/` is **empty** — there is no measured spread or
     slippage for this venue;
   - `execution_basis="TICK_FLOOR"` is permitted but the result is labelled a
     LOWER BOUND and any report quoting it must say so;
   - a citation string that makes it impossible to quote the floor bare.
3. Deterministic self-check script `tools/test_cost_model.py`, runnable without
   pytest (the venv has none), asserting: missing schedule raises; absent
   `as_of` raises; bad `legs` raises; `MEASURED` raises; bps depends on
   reference price; scalper is not silently applied; citation carries provenance.

### Part B — Stage 0 feasibility, BR calendar spread

4. `tools/stage0_br_calendar_feasibility.py`. **No strategy code.** For the
   front/second BR pair, using retained ISS daily history and 60-minute candles:
   - the round-trip cost of the two-leg contour in RUB, from the frozen model;
   - the realised dispersion of the front/second spread over pre-declared
     holding horizons (1, 3, 5, 10 trading days);
   - the share of horizon moves exceeding the round-trip cost;
   - the same for the second/third pair, flagged against the measured liquidity
     of leg 3 (median 741 lots/day, 49 mln RUB/day, 2024+).
5. Report `tasks/results/TASK-MX-001-...-RESULT.md` with the lifecycle footer
   required by `docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`.

## Pre-registered kill conditions

**Amendment record.** The kill set below was widened by the operator on
2026-08-06, after Part A was delivered and **before any Part B measurement was
run**. No spread statistic existed at the time of the amendment. The original
K2 and K3 are retained as K2b and K3b rather than replaced, because a kill
condition that disappears once it becomes inconvenient is not a kill condition.

- **K1 — volatility floor.** Measured on the front/second pair, on windows where
  the contract pair is unchanged for the whole horizon. The contour is closed
  if, at every declared horizon (1, 3, 5, 10 trading days), **both**: the share
  of absolute spread moves exceeding the round-trip floor is below 20%, and the
  median absolute move is below the floor. Reported alongside p75 and p90. It is
  not rescued by adding a signal.
- **K2a — mean-reversion amplitude.** Fit the spread's own reversion inside each
  constant-pair regime. The contour is closed if the half-life exceeds the
  longest declared horizon, or if the typical deviation from the pair's own mean
  is below the round-trip floor — a spread that reverts too slowly, or too
  narrowly, cannot pay for the trade that harvests it.
- **K2b — leg-3 data adequacy.** If leg 3 cannot supply a same-hour co-traded
  60-minute bar alongside leg 2 on at least 60% of hours, the second/third pair
  is `DATA_INADEQUATE` and no three-point curve feature may be built from
  candles. This is a data-health verdict, not a signal verdict.
- **K3a — expiry-window anomaly.** Partition spread moves by the front leg's
  days to expiry. If the measured dispersion is concentrated in the final
  expiry window, any contour that trades outside that window is closed, and any
  contour that trades inside it must declare the roll and liquidity risk it is
  accepting.
- **K3b — margin funding.** Using RUSFAR as the rouble funding rate and the ISS
  `initialmargin` of both legs, if the funding cost of carrying the spread over
  a horizon exceeds the measured spread dispersion at that horizon, the
  multi-day contour is closed regardless of K1.

Passing Stage 0 means the contour is not arithmetically dead. It proves nothing
about any signal.

## Acceptance

- No network, credential, broker, order or service path in any deliverable.
- Self-check script passes deterministically.
- Every cost number in the report is traceable to a schedule entry; no bare
  constants.
- Unmeasured components appear in an explicit `undetermined` list rather than as
  a silent zero or an invented value.
- `check_paper_gate.py` still returns `blocked`. No candidate, no paper, no live.
- The report states what the task cannot conclude.

## Allowlisted deliverables

1. `moex-futures-bot/configs/costs/moex_forts_fee_schedule_2026-08-06.json`
2. `moex-futures-bot/src/moex_futures_bot/cost_model.py`
3. `moex-futures-bot/tools/test_cost_model.py`
4. `moex-futures-bot/tools/stage0_br_calendar_feasibility.py`
5. `tasks/results/TASK-MX-001-MOEX-COST-MODEL-AND-STAGE0-FEASIBILITY-V0-RESULT.md`
