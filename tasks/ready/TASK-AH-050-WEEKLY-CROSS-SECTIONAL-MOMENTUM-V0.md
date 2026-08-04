# TASK-AH-050 - Weekly Cross-Sectional Momentum v0

## Why this hypothesis and not another

Every family this programme has closed died the same way: a real effect smaller than the
round-trip cost. The cost audit of 2026-08-04 (`DC.COST.RESEARCH_FLOOR_IS_FEE_ONLY`) hardened
that floor from 11 bps to 16 bps single-leg and reopened nothing.

The floor is fixed in basis points. It is therefore not a constant obstacle — it is an
obstacle whose *relative* size is set entirely by the holding horizon. Every test this
programme has run held for 60 seconds to 15 minutes, where the available move is 7 to 9 bps
and 16 bps is roughly twice the whole signal. This task is the first to ask the question at a
horizon where the arithmetic is not hopeless before it starts.

The literature support is specific and it is not a general appeal to momentum. Liu, Tsyvinski
and Wu (*Common Risk Factors in Cryptocurrency*, Journal of Finance 77(2), 2022; NBER WP
25882) find that weekly-rebalanced cross-sectional momentum in crypto generates long-short
quintile spreads of 2.5 to 4.1 percent per week, and — critically for us — that the effect is
**stronger in larger coins**, the opposite of the equity market. Their double sort on size
then momentum reports 0.6 percent weekly and insignificant below the median size, against
**4.2 percent weekly and significant above it**. Our universe is entirely above their median.

## What the source paper does not do, and what this task must therefore do

Three deficiencies in the source are load-bearing and are corrected here rather than inherited.

1. **No costs at all.** The paper states plainly: *"this strategy does not take into account
   trading costs and the feasibility of short selling."* The words turnover and fee do not
   appear in it. Every number above is gross. This task's primary quantity is net of measured
   turnover at the audited floor, and the gross number is reported only alongside it.

2. **The primary horizon is selected on the outcome.** The paper says it uses three-week
   momentum *"because it generates the largest long-short spread in the data."* The four
   measured horizons are 2.7, 3.3, 4.1 and 2.5 percent. The honest unselected expectation is
   therefore about 3 percent, not 4.1. This task pre-declares three-week as primary — because
   the literature declared it, not because we searched — and treats one, two and four-week as
   **fixed neighbours that must not be swapped in**, exactly as AH-046 and AH-048 did.

3. **The sample is 2014-2018.** Mean market return was 1.3 percent per week. That regime is
   not ours. A failure to replicate on 2025-2026 data is a legitimate negative result about
   the present, not a bug.

## The frozen specification, declared before any outcome is inspected

- **Universe.** Symbols in the canonical cross-sectional bar archive with a complete weekly
  series over the evaluated span. No liquidity screen beyond that, because the archive is
  already restricted to instruments the programme can trade. The universe is frozen once and
  is not re-screened per week on any outcome-related quantity.
- **Signal.** Cumulative return over the trailing three completed weeks, computed on closes,
  with no overlap between the formation window and the holding week.
- **Portfolio.** Quintiles, formed at the close of the formation week, held exactly one week.
  **Equal-weighted.** The source is value-weighted by market capitalisation, which we do not
  carry; substituting dollar volume would be a different factor wearing the same name. The
  deviation is declared here rather than hidden.
- **Long-short.** Long the top quintile, short the bottom quintile, zero net investment.
- **Rebalance.** Weekly, non-overlapping. Overlapping formation windows are forbidden: they
  inflate apparent n and t, the failure this programme has already recorded once.
- **Costs.** Turnover is **measured, not assumed** — the fraction of each book replaced at
  each rebalance — and charged at 16 bps per side per unit of notional traded, with a 32 bps
  double-cost stress. The superseded 11/22 figures are reported only for comparison against
  the historical record.

## Stage 0 gate — run first, on train only

Before any Stage 1 implementation, measure on the train segment alone:

1. the cross-sectional dispersion of weekly returns, and the resulting long-short spread;
2. **all five quintile means**, not only the spread. Monotonicity across quintiles is a
   robustness criterion adopted from the source and is reported whether or not it holds;
3. measured turnover per rebalance, and the resulting cost in bps per week;
4. the number of complete non-overlapping weeks available, and the effect size detectable at
   t = 3 given the observed dispersion.

**Kill condition.** If the train long-short mean net of measured turnover cost is not
positive, or fewer than 30 non-overlapping weeks are available per out-of-sample segment, the
family closes at Stage 0 and no Stage 1 implementation is written.

**Power is declared before the result, not after.** With roughly one year of data the sample
is about 52 non-overlapping weeks. If the observed long-short dispersion implies that the
literature's own effect size would not be detectable at t = 3 in this sample, then a null
result is `UNDERPOWERED` and must be labelled as such — it is not evidence of absence. This
is the lesson recorded from TASK-AH-009 and it applies here in advance.

## Safety boundary

Read-only. No network beyond read-only reads of the existing archive, no parameter search, no
live/paper, services, collectors, configs, coordinator, approval, KILL, secrets, orders,
accounts or positions. Nothing written to the server. No raw market data committed.

The formation window, the holding period, the quintile breakpoints, the weighting and the
cost floor are frozen above. Searching over any of them is a parameter search and requires a
new task with a new identity.

## Acceptance

If Stage 0 passes, Stage 1 requires: chronological 55/20/15/10 splits with purge and embargo
sized to the three-week formation window; holdout and forward each at least 30 non-overlapping
weeks; positive net mean and median after measured turnover at 16 bps in both; non-negative
median at 32 bps; two-sided matched null at p < 0.05; survival of remove-best-symbol and
remove-best-week; no symbol above 25 percent of contribution; monotonicity across quintiles
reported; both neighbour horizons non-negative; and a measured exact overlap against the
rejected families.

If Stage 0 fails, the result is `STAGE_0_INFEASIBLE` or `UNDERPOWERED` and the family closes
with the measured gap to the cost floor stated explicitly.

## Deliverables

1. `scripts/analysis/ah050_weekly_cross_sectional_momentum.mjs`
2. `scripts/test_ah050_weekly_cross_sectional_momentum.mjs`
3. `reference/AH050_WEEKLY_CROSS_SECTIONAL_MOMENTUM_PROTOCOL_2026-08-04.md`
4. `data/ah050_weekly_cross_sectional_momentum_2026-08-04.{csv,json}`
5. `tasks/results/TASK-AH-050-WEEKLY-CROSS-SECTIONAL-MOMENTUM-V0-RESULT.md`

Run syntax, deterministic tests, static no-trading scan, the replay the gate permits, and
`git diff --check`. Commit only the allowlisted deliverables. Push requires separate approval.
