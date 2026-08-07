# TASK-MX-002 Result — FORTS Broker Tariff And Spread Margin Measurement v0

Date: 2026-08-06
Evidence: [moex_forts_spread_margin_2026.md](../../moex-futures-bot/data/specs/moex_forts_spread_margin_2026.md),
[broker_forts_tariff_2026.NOT_OBTAINED.md](../../moex-futures-bot/data/specs/broker_forts_tariff_2026.NOT_OBTAINED.md),
[stage0_br_calendar_feasibility_20260806.md](../../moex-futures-bot/data/reports/stage0_br_calendar_feasibility_20260806.md)

## Lifecycle footer

- Entered `DATA_HEALTH`, left `DATA_HEALTH`.
- Evidence gate: Stage 0 feasibility, **PASS at all four horizons** by lookup in
  the frontier frozen on 2026-08-06 before any tariff figure existed.
- Failure route: not applicable. The contour survives Stage 0.
- Next queued task and owner: bid-ask spread collection, Data Scout. That is now
  the binding unknown and it blocks Stage 1, not Stage 0.
- `promising_count` unchanged. `check_paper_gate.py` returns `blocked`. No
  candidate created. Stage 0 authorises writing a Stage 1 protocol, nothing more.

## Verdict

Frozen-frontier lookup at **b = 0.45 ₽ per contract per side**, **d = 50.0%**:

| horizon | median move | round trip | funding | all-in | headroom | verdict |
|---|---:|---:|---:|---:|---:|---|
| 1d | 78 ₽ | 53.44 ₽ | 10.41 ₽ | 63.85 ₽ | +18.1% | CLEARS |
| 3d | 133 ₽ | 53.44 ₽ | 31.22 ₽ | 84.66 ₽ | +36.3% | CLEARS |
| 5d | 157 ₽ | 53.44 ₽ | 52.03 ₽ | 105.47 ₽ | +32.8% | CLEARS |
| 10d | 235 ₽ | 53.44 ₽ | 104.06 ₽ | 157.50 ₽ | +33.0% | CLEARS |

No horizon falls in the `MARGINAL` band (headroom below 10%). Under the frozen
rule all four are authorised for a Stage 1 protocol.

Cost floor in force:

```
53.44 RUB per contract round trip (2-leg, non-scalper, TRADE_OUT, execution basis
TICK_FLOOR) = 7.72 bps at 88.33 LOWER BOUND = 35.96 exchange fee + 1.80 broker
[OPERATOR_ATTESTED] + 15.68 execution, margin blocked 16,009 RUB under POLUNETTO
[INFERRED_BOUND; rule in force NETTO], schedule v1.1.0
```

## What actually moved the verdict

Not the broker tariff. **The margining rule.**

`TASK-MX-001` charged the full sum of both legs' initial margin — the no-netting
case — and the 10d horizon came out at −10.5%. MOEX and NCC publish that BR
calendar pairs are margined under **«нетто» through the second monthly
expiration**, which is exactly the front/second pair, blocking the interest-rate
risk rather than a leg's margin. The weaker «полунетто» rule blocks the greater
of the two legs. Either way the funding cost roughly halves, and 10d moves from
−10.5% to +33.0%.

The broker component is 1.80 ₽ on a two-leg round trip against a 53.44 ₽ floor.
It was never going to decide anything: the frozen frontier showed the contour
tolerates up to 12–20 ₽ per side on the multi-day horizons under the margin
bound. The month spent worrying about the tariff was, in hindsight, worry about
the smaller of the two unknowns — which is only visible because both were
quantified before either was resolved.

## Provenance, stated precisely

| component | value | basis |
|---|---|---|
| exchange fee | 8.99 ₽/contract/side | `PUBLISHED_VENUE_PARAMS` — ISS contract params |
| exercise fee | 3.00 ₽/contract | `PUBLISHED_VENUE_PARAMS` — ISS contract params |
| broker fee | 0.45 ₽/contract/side | **`OPERATOR_ATTESTED`** |
| margining rule | нетто for front/second | `PUBLISHED_VENUE_PARAMS` — NCC + MOEX |
| margin applied | полунетто, 16,009 ₽ | **`INFERRED_BOUND`** |
| bid-ask spread | 1 tick assumed | **unmeasured** |
| slippage | not modelled | **unmeasured** |

Two entries are weaker than the task hoped for and neither is what it asked for:

- **The broker tariff was never obtained as a document.** Finam returns HTTP 403
  to automated fetches on all three tariff paths. What exists is the operator's
  statement. A new basis level `OPERATOR_ATTESTED` was added rather than
  labelling it `PUBLISHED_BROKER_TARIFF`, because no publication was read. The
  operator states the plan as «ЕДП / Трейдер» while the only secondary source
  found associates 0.45 ₽ with «Инвестор»; the plan attribution is unconfirmed.
  The verdict is insensitive to this — 0.45 ₽ sits far below every breakeven.
- **The numeric interest-rate risk under нетто was never obtained.** The NCC
  static-parameters page is client-rendered. Полунетто is applied instead, as a
  declared upper bound on the funding cost. `cost_model.py` raises rather than
  computing a NETTO figure, so the bound can never be silently promoted into a
  measurement.

## The unknown that now binds

Every figure above is a **lower bound**, and the loosest term in it is the
assumed one-tick bid-ask spread. How wide the true spread can be before the
median move stops covering the all-in cost:

| horizon | breakeven spread, ticks per leg |
|---|---:|
| 1d | **1.90** |
| 3d | 4.08 |
| 5d | 4.29 |
| 10d | 5.94 |

The 1d horizon dies if the real spread exceeds roughly two ticks per leg. The
multi-day horizons tolerate four to six. Nothing in this project measures which
it is: `data/market/finam/orderbook/` is empty and no MOEX quote-tick source has
ever been collected.

That is the next data request, and it is a stronger blocker than either of the
two this task closed, because no operator statement can substitute for it.

## What this task cannot conclude

- Nothing about whether any signal predicts the spread. Stage 0 tests arithmetic.
  A contour that clears its cost floor at the median has earned a protocol, not a
  position.
- Nothing about executability. Under the pipeline protocol, 60-minute bars leave
  every MOEX task `DATA_INADEQUATE` for tick-level fill claims, so Stage 2 remains
  unreachable regardless of this result.
- The K3a finding stands: dispersion is concentrated 4.1x in the front leg's
  final week, which is where roll and liquidity risk are worst and where the
  one-tick assumption is least defensible. A Stage 1 protocol must declare
  whether it trades that window.

## Deliverables

1. `moex-futures-bot/configs/costs/moex_forts_fee_schedule_2026-08-06_rev2.json` —
   new dated entry; the 2026-08-06 file is unmodified so `TASK-MX-001` stays
   reproducible.
2. `moex-futures-bot/src/moex_futures_bot/cost_model.py` — broker component,
   margining rule, exit route. Extended, not rewritten.
3. `moex-futures-bot/tools/test_cost_model.py` — 33 checks, all passing; the
   original 22 pass unchanged against the original schedule.
4. `moex-futures-bot/data/specs/` — both intake records, including the failure.
5. This report.

`tools/stage0_br_calendar_feasibility.py` was **not modified**. It was re-run and
reproduced its dispersion figures identically; the verdict was computed by
frontier lookup, which is what the frontier was frozen for.

## Multiplicity

Contour record. No multiplicity budget consumed: no signal tested, no parameter
selected.

## Next queued task

`TASK-MX-003-MOEX-QUOTE-AND-SPREAD-COLLECTION-V0` — stand up a read-only quote
collector for the BR front and second contracts, measure the realised bid-ask,
and replace the `TICK_FLOOR` assumption with a `MEASURED` execution basis. Until
it returns, no Stage 1 result on this contour may claim executability, and the
1d horizon should not be worked at all.
