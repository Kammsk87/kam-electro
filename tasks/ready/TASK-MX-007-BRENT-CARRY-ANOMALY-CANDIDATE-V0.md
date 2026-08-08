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

## Status: PRE_REGISTERED_WAITING_FOR_OOS_COHORT

The rule below is FROZEN. Two things must still be true before it may execute,
and neither is a formality.

1. **The confirmation window.** The rule may be developed on history, but its
   confirming evidence must come from data generated after 2026-08-08. The Track A
   quote cohort runs to 2026-10-01 and supplies exactly that window. Running the
   full task before then would produce a result the lifecycle cannot accept.
2. **The rule was frozen in this file on 2026-08-08**, before any backtest,
   as MX-006 was. Any edit to it after the first run voids the task; an edit
   before the first run is legitimate and must be committed separately.

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

## Frozen rule — FROZEN 2026-08-08, before the confirmation window exists

Status: `PRE_REGISTERED_WAITING_FOR_OOS_COHORT`.

Frozen while the forward cohort is still physically being collected, so nobody
— including the author — can have seen the data this rule will be confirmed on.
That is the cleanest preregistration state available, and it expires the moment
the cohort closes on 2026-10-01.

```
identity     model_id br_carry_v0, reset_ts 2026-08-08T00:00:00+00:00
universe     BR front/second pair, hourly spread bars, both legs co-traded
feature      annualised roll yield RY = (F1-F2)/F1 * 365/dt,
             dt = calendar days between the two contracts' EXPIRIES
             (features/term_structure.annualised_roll_yield)

entry        long the spread  when RY <= q10_expanding(t) and DTE > 7
             short the spread when RY >= q90_expanding(t) and DTE > 7
exit         RY crosses back through q50_expanding(t), or timeout, whichever first
timeout      5 trading days = 75 hourly bars at 15 bars/day
dte filter   no new entry when the front leg has 7 or fewer TRADING DAYS to its
             venue lasttradedate; open positions are closed at DTE = 7
costs        cost_model rev2, two legs, non-scalper, TRADE_OUT, POLUNETTO margin;
             TICK_FLOOR and TICK_FLOOR_STRESS both reported
position     one at a time; a roll closes the position
search space moex.br.calendar_spread.1h   (NOT a new space - see below)
variants     exactly ONE. No grid over the quantile pair, the DTE cut, or the
             timeout. A second variant is a second trial and is deflated as one.
```

### Three corrections to the proposed specification, and why each was necessary

**1. Quantiles are expanding-window, not the sample's own p10/p90.**

The proposal fixed the thresholds at RY < −0.58%/yr and RY > +34.30%/yr, and the
exit at the median +8.47%/yr. Those three numbers are the p10, p90 and p50 **of
the 2024+ sample this rule will be tested on**. No decision taken in 2024 could
have known them. Using them as constants is look-ahead bias, and it is not
repairable after a run.

`q10_expanding(t)`, `q50_expanding(t)` and `q90_expanding(t)` are computed from
RY observations **strictly before bar t**, with a warm-up of 500 bars before any
entry is permitted. The rule's economic content is unchanged — trade the tails of
the carry distribution — but each decision uses only what was knowable.

**2. The timeout is 5 trading days, not 3.**

The proposal derived 3 days from an OU half-life of 31.1 bars. That figure is the
**contango** half-life, and contango is 1,253 of 10,613 bars — under 12% of the
sample. The backwardation half-life, governing the other 88%, is 88.6 bars ≈ 5.9
trading days. Choosing the horizon from the regime that governs an eighth of the
data is choosing the number that suits.

5 trading days is taken from the dominant regime, rounded down. It also sits
inside the TASK-MX-002 breakeven table at 4.29 ticks per leg, which is the
threshold the execution adapter is to be given.

This is a judgement, not an error, and the operator may change it — **before the
first run and by editing this file**, not afterwards.

**3. The search space stays `moex.br.calendar_spread.1h`.**

The proposal named a new space, `moex.br.calendar_spread.carry_1h`. That would
reset the trial count to zero and escape the two trials already recorded.

A new space per hypothesis makes every hypothesis a family of one, and the
multiplicity correction evaporates — which is the failure mode the whole ledger
exists to prevent. Same instrument pair, same mechanism family, same space. This
rule will be deflated against 2 prior trials plus itself.

### Units, stated because they have already caused one defect

`DTE > 7` is **trading days** to the front leg's venue `lasttradedate`, not
calendar days and not bars. MX-004's `dte_buckets` counts bars; this is a
different quantity and the implementation must not reuse that function's units.

### What the DTE filter costs

Excluding the final week deliberately avoids the window where MX-001 measured
**4.1× the dispersion**. That is a trade-off, not a free improvement: the rule is
declining to trade where the spread moves most, in exchange for avoiding the roll
and liquidity risk concentrated there. It must be reported as such, and the
result must state how many entries the filter suppressed.

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
