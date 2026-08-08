# TASK-MX-007 - Brent Carry Anomaly, New Candidate Identity v0

## Lifecycle

- **New candidate identity**, `model_id` `br_carry_v0`. Starts at `DATA_HEALTH`.
- It is **not** a structural variant of `br_calendar_zscore_v0`. That identity
  routed to `QUARANTINE`, which is terminal, and the machine refuses
  `structural_variant()` from it — verified 2026-08-08, `IllegalTransition`.
- Per `docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`, a return to a quarantined
  neighbourhood requires a new task ID, a recorded structural difference, **and
  confirmation on data generated after the failure was recorded**. The failure
  was recorded 2026-08-08.

## Status: DRAFT, not runnable

Two things must exist before this may execute, and neither is a formality.

1. **The confirmation window.** The rule may be developed on history, but its
   confirming evidence must come from data generated after 2026-08-08. The Track A
   quote cohort runs to 2026-10-01 and supplies exactly that window. Running the
   full task before then would produce a result the lifecycle cannot accept.
2. **The rule must be frozen in this file before any backtest of it is run**,
   as MX-006's was. The frozen-rule section below is deliberately incomplete; it
   is filled in and committed *before* the first run, not after.

## The structural difference, stated precisely

`br_calendar_zscore_v0` asked whether the **price** spread's deviation from its
own recent mean predicts its direction. It does not: gross +36.41 ₽ per trade at
t = 0.63, indistinguishable from a matched null.

`br_carry_v0` asks a different question, from a different feature: whether the
**annualised roll yield** — a carry quantity, computed from the expiry gap and
built in `TASK-MX-004` *before* the MX-006 failure — carries information about
the spread's subsequent path, conditioned on the front leg's days to expiry.

That is a different mechanism, not a re-parameterisation. The distinction that
makes it admissible: the feature existed before the failure, so the hypothesis is
not reverse-engineered from which trades lost.

## What this task may NOT do, and why

**No regime filter derived from MX-006's own results.** The obvious next move —
restrict trading by curve regime because one regime lost — is inadmissible three
times over:

1. **It is tuning wearing a structural costume.** The split was chosen after
   seeing which subset lost. That is the search the ledger exists to count.
2. **The premise, as first stated, was backwards.** Per-regime net means at the
   tick floor: contango −189.43 ₽ over 25 trades at the 3d timeout against
   backwardation −8.17 ₽ over 172. The losses concentrated in **contango**, the
   small subsample, not in backwardation.
3. **It would not rescue the rule anyway.** The backwardation-only subset implies
   a gross of roughly 48.27 ₽ against the 53.44 ₽ round-trip floor. The best
   subset still does not pay for the trade, and the filter would have been fitted
   on 25 contango observations.

If a regime condition is ever used, it must be motivated by a stated economic
mechanism written down before the data is looked at, and confirmed on the
post-2026-08-08 window. Not by this failure's residuals.

## Frozen rule — TO BE COMPLETED BEFORE THE FIRST RUN

Left deliberately blank. Filling it in after a run, or filling it in with
parameters chosen by scanning MX-006's output, voids the task.

    universe   BR front/second pair
    feature    annualised roll yield, from features/term_structure.py
    condition  <to be declared: the carry threshold and the DTE condition>
    entry      <to be declared>
    exit       <to be declared>
    horizon    <to be declared, from the TASK-MX-002 breakeven table>
    costs      cost_model rev2, two legs, non-scalper, TRADE_OUT, POLUNETTO;
               TICK_FLOOR and TICK_FLOOR_STRESS both reported
    identity   model_id br_carry_v0, reset_ts set at freeze time

## Pre-registered kill conditions

Declared now, before the rule is:

- **K1.** Gross mean per trade below the round-trip floor in force closes the
  contour. MX-006 established the number that matters: an edge of 36.41 ₽ against
  a 53.44 ₽ floor cannot be fixed downstream of itself.
- **K2.** Indistinguishable from a matched null at 1,000 seeded draws closes it,
  regardless of headline P&L.
- **K3.** BH-adjusted q above 0.10 in `moex.br.calendar_spread.1h`, or DSR below
  0.95, closes it. The space currently holds 2 trials; this task's variants add
  to that count and are deflated against it.
- **K4.** A positive result on history that does not reproduce on the
  post-2026-08-08 window is not a result. The lifecycle requires the confirmation
  and this task inherits it.

## Multiplicity

Every declared variant is a `TRIAL_RECORD` in `moex.br.calendar_spread.1h`. The
space holds 2 trials today. Declaring many variants to raise the chance one
passes raises the deflation they are all judged against — which is the intended
behaviour, not a side effect.

## Safety boundary

Read-only research on local history plus the forward quote cohort. No order, no
account, no credential, no paper, no live. `check_paper_gate.py` stays blocked.

## Allowlisted deliverables

1. `moex-futures-bot/src/moex_futures_bot/strategies/brent_carry.py`
2. `moex-futures-bot/tools/test_brent_carry.py`
3. `moex-futures-bot/tools/run_mx007_carry.py`
4. `tasks/results/TASK-MX-007-BRENT-CARRY-ANOMALY-CANDIDATE-V0-RESULT.md`
