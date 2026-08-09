# TASK-MX-008 - Natural Gas (NG) Venue Calibration v0

## Lifecycle

- Stage: `DATA_HEALTH`. Venue calibration, candidate-independent, per Gate 1 of
  `docs/ORDERBOOK_EXECUTION_PLAN.md`.
- Multiplicity: `CONTOUR_RECORD`. No signal tested, no parameter selected.
- Search space when a rule eventually exists: `moex.ng.calendar_spread.1h`.
  Separate from BR because it is a different instrument with different
  economics — not a device to reset a trial count.

## The handoff was wrong, and NG is real

`docs/PROJECT_HANDOFF_FOR_EXTERNAL_AI_2026-08-06.md` states that gas «was not
found in the observed Finam demo asset list» and placed it out of scope. Checked
against the venue on 2026-08-09: **FORTS lists 7 live NG contracts** plus 7 NGM
mini contracts, and TTF (Dutch gas) as a separate asset.

The handoff looked at a Finam demo account's instrument list, which is not the
exchange's. The scope exclusion is withdrawn.

## Three corrections to the proposed specification

Checked against ISS, not assumed. Each was asserted in the request and each is
wrong.

| asserted | actual |
|---|---|
| lot size 10 MMBtu | **`LOTVOLUME` = 100** |
| min price step 0.001 | **correct** |
| «NG expires on the first trading day of the month» | **false.** NG-8.26 expires 2026-08-27, NG-9.26 on 2026-09-28, NG-10.26 on 2026-10-28 — late in its **own** month |

The expiry rule is the opposite of BR's, which expires at the *start* of its
contract month. Two instruments on one venue with two different conventions is
exactly why `moex_forts_br_expiration_calendar.json` reports deviations instead
of enforcing an assumed rule, and the NG calendar must be built the same way.

## The finding that decides the task

**NG's tick is three times coarser relative to its contract than BR's**, and
that inverts the comparison a tick count suggests.

| | ₽/tick | notional ₽ | tick in bps | observed spread | spread in bps |
|---|---:|---:|---:|---:|---:|
| NGQ6 | 8.22 | 22,119 | **3.71** | 2 ticks | **7.43** |
| NGU6 | 8.22 | 22,686 | 3.62 | 2 ticks | 7.24 |
| BRU6 | 8.22 | 68,441 | 1.20 | 3 ticks | 3.60 |
| BRV6 | 8.22 | 67,023 | 1.23 | 4 ticks | 4.90 |

The rouble value of one tick is **identical** — both are USD-denominated with the
same `STEPPRICE` — but an NG contract is a third the size. NG looks tighter in
ticks and is twice as expensive to cross in the only units that matter.

Two-leg round trip at the spread actually quoted:

```
NG (NGQ6/NGU6)   fee 11.88 + crossing 32.87 =  44.75 RUB   20.23 bps of a leg
BR (BRU6/BRV6)   fee 36.44 + crossing 57.52 =  93.96 RUB   13.73 bps of a leg
```

NG is cheaper in roubles and **47% more expensive in basis points**. Whether that
matters depends on how far the NG spread travels, which is Stage 0 and is not
this task.

## What is genuinely favourable

- **Front and second are both liquid.** NGQ6 8,192 lots and 180.6 mln ₽ per day;
  NGU6 2,809 lots and 63.5 mln ₽. The second leg carries more lots than BR's
  second leg does.
- **The third leg dies exactly as BR's does** — NGV6 at 137 lots and 3.4 mln ₽.
  The front/second restriction carries over unchanged.
- **Margin is 2.5x lighter.** Under polunetto the NG pair blocks 6,680 ₽ against
  BR's 16,480 ₽, so the funding term that killed BR's 10-day horizon is far
  smaller here.
- **The exchange fee is three times lower per side**, 2.90 ₽ against 9.11 ₽.

## Required work

1. `tools/fetch_ng_specifications.py` → `data/specs/moex_forts_ng_specs.json`
   and `data/specs/moex_forts_ng_expiration_calendar.json`, built the same way
   as the BR calendar: authoritative `LSTTRADE` per contract, deviations from the
   modal pattern **reported and never rejected**.
2. Extend the fee schedule with an `NG` entry. The exchange fee, exercise fee,
   margin and tick economics are all published venue params and go in as
   `PUBLISHED_VENUE_PARAMS`. The broker component is `OPERATOR_ATTESTED` and
   carries the same caveats as BR's — and must be confirmed, since a per-contract
   broker fee that is flat in roubles is proportionally three times heavier on a
   contract a third the size.
3. Confirm the NCC calendar-spread margining rule applies to NG. It is published
   per intermonth spread group; BR's is «нетто through the second monthly
   expiration». **Do not assume NG inherits it.**
4. Extend `cost_model.py` — entry only, no new algebra. The rouble-primitive
   design already handles a different tick and a different notional; if it needs
   changing, that is a finding.
5. Extend the collector to NG front/second, in a **separate cohort directory**,
   so the BR cohort's validity register is untouched.
6. `tools/test_cost_model.py` gains NG cases, including one that pins the
   bps-vs-ticks inversion so nobody later compares the two instruments in ticks.

## Explicitly out of scope

- No strategy, no signal, no Stage 0 verdict for NG. This task calibrates the
  venue.
- **No effect on BR.** The BR cohort, its frozen thresholds, the MX-007 freeze
  and the trials ledger's BR spaces are untouched. NG records go to their own
  search space.
- NGM (mini gas) is noted and not calibrated. NRQ6 shows 85,732 lots a day at a
  1-tick spread and a 63 ₽ margin, which makes it interesting and a separate
  question.

## Safety boundary

Read-only public venue metadata and market data. No credential, no broker, no
order, no paper, no live. `check_paper_gate.py` stays blocked.

## Allowlisted deliverables

1. `moex-futures-bot/tools/fetch_ng_specifications.py`
2. `moex-futures-bot/data/specs/moex_forts_ng_specs.json`
3. `moex-futures-bot/data/specs/moex_forts_ng_expiration_calendar.json`
4. `moex-futures-bot/configs/costs/moex_forts_fee_schedule_<new date>.json`
5. `moex-futures-bot/src/moex_futures_bot/cost_model.py` (extend)
6. `moex-futures-bot/tools/test_cost_model.py` (extend)
7. `tasks/results/TASK-MX-008-NG-VENUE-CALIBRATION-V0-RESULT.md`
