# TASK-MX-002 - FORTS Broker Tariff And Spread Margin Measurement v0

## Lifecycle

- Current stage: `DATA_HEALTH`
- Entered from: `TASK-MX-001`, failure route `DATA_REQUEST`
- Next permitted transition: `DISCOVERY` for the BR calendar contour if the
  measured inputs clear the frontier below, otherwise `REJECTED_FAMILY` with
  status `FEE_UNFEASIBLE`.
- This task produces no candidate and tests no signal. It closes two numbers.

## Objective

`TASK-MX-001` established that the BR front/second calendar contour is decided
by exactly two unmeasured quantities, and by nothing else it measured:

1. the per-contract **broker commission** on FORTS;
2. the FORTS **inter-contract spread margin discount** for BR calendar pairs.

Measure both, append them to the fee schedule as a new dated entry, and re-run
`tools/stage0_br_calendar_feasibility.py` unchanged.

## Pre-registered decision frontier

**Frozen 2026-08-06, before any tariff or margin figure was obtained.** The
verdict is a lookup in this table, not a judgement made after seeing the numbers.

Minimum spread-margin discount `d` required for the median spread move to cover
the all-in cost, as a function of the broker fee `b` per contract per side.
Derived from the measured dispersion in
[stage0_br_calendar_feasibility_20260806.md](../../moex-futures-bot/data/reports/stage0_br_calendar_feasibility_20260806.md)
and the frozen 51.64 ₽ two-leg round trip.

| broker fee `b` | 1d | 3d | 5d | 10d |
|---|---:|---:|---:|---:|
| 0 ₽ | none | none | none | 12% |
| 1 ₽ | none | none | 3% | 14% |
| 2 ₽ | 13% | none | 6% | 16% |
| 3 ₽ | 32% | none | 10% | 18% |
| 5 ₽ | 70% | 1% | 18% | 21% |
| 10 ₽ | DEAD | 33% | 37% | 31% |

At zero discount the maximum tolerable broker fee is 1.34 ₽ at 1d, 4.84 ₽ at 3d,
0.34 ₽ at 5d, and the 10d horizon is dead at any broker fee.

**Verdict rule.** Let `b` and `d` be the measured values.

- If at least one horizon clears its cell, the contour survives Stage 0 and may
  proceed to a Stage 1 protocol **for that horizon only**. The surviving horizon
  is named in the result and no other horizon is authorised.
- If no horizon clears, the contour is closed with status `FEE_UNFEASIBLE`. It
  does not return by re-testing a different horizon, a different pair, or a
  filtered subset of the same data. It returns only as a recorded structural
  variant with a new task ID.
- A horizon clearing by less than 10% of the median move is recorded as
  `MARGINAL` and does not by itself authorise Stage 1.

Note the shape of the table before the data arrives: **1d is the hardest
horizon, not the easiest.** Its move is small relative to a fixed round trip.
Any result that reports 1d as the most attractive horizon is a sign of an error
in the cost path, not a discovery.

## Why the current numbers cannot stand

- `holdout_ledger_BR_20260722.json` carries `broker_fee_rub_per_contract: 5.0`
  with no derivation recorded anywhere in the repository. Under the schedule
  contract a bare number is not admissible evidence, and 5 ₽ sits close to the
  boundary that decides three of the four horizons.
- `configs/costs/moex_forts_fee_schedule_2026-08-06.json` lists both quantities
  in `undetermined`. Every floor it currently produces is a lower bound.
- The funding term in `TASK-MX-001` charges the full sum of both legs' initial
  margin. FORTS grants inter-contract discounts; the true figure is lower by an
  unknown amount, and that amount moves the 5d and 10d verdicts by tens of
  percent of the median move.

## Blocking input - this task cannot be self-served

Neither quantity exists in retained data. ISS `params` carries `initialmargin`
per single contract and no inter-contract field. Obtaining them requires one of:

- **(A)** the operator supplies the broker's published FORTS tariff page and the
  MOEX inter-contract spread margin table as local documents; or
- **(B)** the operator grants an explicit, bounded, one-time authorisation to
  fetch those two published specifications, naming the exact URLs.

Absent (A) or (B) this task is `BLOCKED_ON_OPERATOR` and must report as such
rather than substituting a plausible figure. Inventing a tariff would recreate
precisely the defect this task exists to remove.

**Do not** attempt to recover the tariff from an account statement, a broker
session, or any credentialed source. Read-only published specifications only.

## Evidence basis hierarchy

Record which basis the measurement achieved. They are not interchangeable:

| basis | meaning | strength |
|---|---|---|
| `REALISED` | measured from executed round trips | strongest; unavailable, no MOEX order has ever been placed |
| `PUBLISHED_BROKER_TARIFF` | the broker's dated published rate for the operator's tier | the realistic target for this task |
| `PUBLISHED_VENUE_PARAMS` | read from ISS contract params | what the exchange leg already has |
| `ASSUMED` | not admissible | the status of the current 5 ₽ |

A `PUBLISHED_BROKER_TARIFF` figure must carry the tier it belongs to. A tariff
that varies with turnover is not a constant, and the tier the operator would
actually occupy must be named.

## Safety boundary

Read-only. Do not: read `.env` or any credential; open a broker session; read
account, position or order history; place or simulate an order; start a service;
modify `check_paper_gate.py`; alter the holdout ledger; promote any strategy; or
rewrite existing schedule entries. New evidence is **appended** as a new dated
entry so results computed under the 2026-08-06 schedule stay reproducible.

Do not modify `tools/stage0_br_calendar_feasibility.py`. Its logic is frozen for
this comparison. If the script needs a fix, that is a separate task and the
Stage 0 verdict is recomputed from scratch under the new code.

## Required work

1. Obtain, under (A) or (B), the broker's per-contract FORTS commission for BR
   and the MOEX inter-contract spread margin treatment for BR calendar pairs.
   Record the source, its date, and the tier.
2. Append a new dated entry to
   `configs/costs/moex_forts_fee_schedule_2026-08-06.json`'s successor file with
   `basis` set from the hierarchy above. Move the two items out of
   `undetermined`. Leave measured spread and slippage in `undetermined` — this
   task does not touch them.
3. Extend `cost_model.py` minimally: a `broker_fee_rub` component in the floor,
   and a `margin_discount` field so the funding term can be computed from a
   cited figure rather than a caller's assumption. Keep the refusal semantics —
   an unmeasured discount raises rather than defaulting to zero or to 70%.
4. **Model the exercise route.** ISS params carry `exercisefee` (2.95 ₽ for
   BRU6) against `buysellfee` (8.87 ₽). Letting the near leg settle at expiry is
   cheaper than trading out of it. Because `TASK-MX-001` found the dispersion
   concentrated 4.1x in the front leg's final week, the exit route materially
   changes the economics of exactly the window where the movement is. Add an
   `exit_route` of `TRADE_OUT` or `EXPIRY_SETTLE` to the floor and report both.
5. Re-run `tools/stage0_br_calendar_feasibility.py` unchanged and apply the
   frozen verdict rule above.
6. Extend `tools/test_cost_model.py` to cover the new components, including that
   an unmeasured discount raises and that `EXPIRY_SETTLE` is never the default.

## Acceptance

- No network call except an explicitly authorised, operator-named fetch under
  (B); no credential, account, broker-session, order or service path.
- Every new number carries source, date, tier and basis. No `ASSUMED` value is
  promoted into `derived_floor`.
- The self-check passes and the previously frozen 22 checks still pass unchanged.
- The result states the verdict by lookup in the frozen frontier, names the
  surviving horizon if any, and states `FEE_UNFEASIBLE` if none.
- `check_paper_gate.py` still returns `blocked`.
- If the inputs cannot be obtained, the result says `BLOCKED_ON_OPERATOR` and
  proposes nothing in their place.

## Multiplicity

Like `TASK-MX-001`, this is a contour record and consumes no multiplicity
budget. No signal is tested and no parameter is selected.

## Allowlisted deliverables

1. `moex-futures-bot/configs/costs/moex_forts_fee_schedule_<new date>.json`
2. `moex-futures-bot/src/moex_futures_bot/cost_model.py` (extend, do not rewrite)
3. `moex-futures-bot/tools/test_cost_model.py` (extend)
4. `tasks/results/TASK-MX-002-FORTS-BROKER-TARIFF-AND-SPREAD-MARGIN-MEASUREMENT-V0-RESULT.md`
