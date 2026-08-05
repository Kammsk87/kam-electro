# TASK-AH-054 — Swing Relative Strength 4H v0 — STAGE 0 RESULT

**Verdict: `STAGE_0_PASS`.**
**Label: `SAMPLE_AUDIT_NO_PNL`. `pnl_computed: false`. promising_count: 0.**
**Stage 1 is authorised. It has not been run.**

This is the first Stage 0 pass in the current programme. It certifies that the sample can
support a measurement — nothing about whether the signal works.

## Data

Public 4H klines, 109 symbols, 2023-01-01 → 2026-08-05, fetched with turnover so the universe
could be selected on measured liquidity from the same pull. 39 MB, no symbol empty, 1,087 to
7,875 bars each.

**Universe: top 30 by median daily turnover**, after excluding TAC and VANRY on
`LAW.BASIS.LIQUID_PERP_BELOW_COST` and dropping short series:

> BTC ETH SOL XRP DOGE HYPE WIF SUI ENA ADA LINK AVAX ONDO WLD NEAR POPCAT BNB LTC TRUMP ARB
> TIA OP GALA VIRTUAL INJ APT SEI BCH AAVE XAUT

## Sample

| | |
|---|---:|
| **entries** | **464** |
| declared minimum | 100 |
| train | 255 |
| **sealed and untouched** | **209** |
| span | 2023-02-20 → 2026-08-03 |

Per year: **108 / 152 / 131 / 73** — 2026 is partial. Four calendar years and several regimes.

## The funnel accounts for every bar

| | bars | share |
|---|---:|---:|
| considered | 202,301 | 100.0 % |
| rejected on the market filter | 93,279 | 46.1 % |
| rejected on relative strength | 85,760 | 42.4 % |
| rejected on the trigger | 22,061 | 10.9 % |
| rejected on overlap | 737 | 0.4 % |
| **entries** | **464** | **0.2 %** |

The sum is exact — a test asserts it, so no bar can be silently lost between conditions.

The BTC filter is satisfied on **713 of 1,264 days, 56 percent**, matching the figure measured
independently when the funding prior was grounded. It is a real regime split, not a rare-event
filter.

## Both sorts are healthy

| quantity | distinct | ties | bucket sizes | ratio | |
|---|---:|---:|---|---:|---|
| relative strength | 95.5 % | 4.5 % | 93 / 93 / 93 / 93 / 92 | **1.011** | balanced |
| `vol_burst` | 100 % | 0 % | 93 / 93 / 93 / 93 / 92 | **1.011** | balanced |

Relative strength spans −0.84 % at p05 to +34.1 % at p95, median +7.3 %. Against funding
velocity, which degenerated at a ratio of 16.08, this is a real cross-section.

## Independence and concentration

**Spacing between consecutive entries on the same symbol: minimum 43 bars** against a 42-bar
timeout. Not one pair overlaps — the rule is enforced, not merely declared.

Median spacing 224 bars, mean 398. Entries are widely separated in time.

**All 30 symbols produce events**, and the largest single share is **5.2 percent** (INJ and AAVE
at 24 each). No symbol can carry the result.

## What this does and does not establish

**Established:** the sample is large enough, the sorts are not degenerate, the entries are
independent, no symbol dominates, and the regime filter divides the span rather than selecting
a corner of it.

**Not established:** anything about return. **No PnL was computed**, by contract and by
construction — a test asserts that no return field appears in the Stage 0 output. The audit
cannot be read in the light of a result it has not seen.

## The pre-registered expectation, unchanged and still ahead of the measurement

Recorded in the task before the engine existed:

| | |
|---|---:|
| expected gross per trade | **+181 bps** (`LAW.XSECT.WEEKLY_MOMENTUM_BOUNDED`, top quintile) |
| entry + exit | 16 bps |
| funding over a 7-day hold, measured conditionally on the bull filter | ~1 bps |
| **expected net** | **~+164 bps** |

A gross materially above 181 means the added machinery — market filter, breakout trigger, stop,
trailing exit — contributes beyond the cross-sectional signal. Materially below means it costs
more than it adds, and the hard stop is the likely culprit: truncating the left tail raises the
win rate and usually lowers the mean.

## Stage 1, now authorised

Per-trade net after 16 bps and funding accrued over the actual hold; win rate; payoff ratio;
**median alongside mean**, because a positive mean with a near-zero median is the payoff-trap
signature already recorded twice; max drawdown; benchmark against buy-and-hold BTC over the
identical span; matched null at the identical entry rate; remove-best-symbol and
remove-best-year; and the measured overlap against AH-050's top quintile, which the task
requires because the signal class is shared with a family closed `CLOSED_UNDERPOWERED`.

The 209 sealed events stay sealed until Stage 1 declares its splits.

## Deliverables

1. `scripts/analysis/ah054_swing_relative_strength_4h.mjs`
2. `scripts/test_ah054_swing_relative_strength_4h.mjs` — 23/23 passing
3. `reference/AH054_SWING_RELATIVE_STRENGTH_4H_PROTOCOL_2026-08-05.md`
4. `data/ah054_swing_relative_strength_4h_2026-08-05.{csv,json}`
5. This result file

## Safety

Read-only. Public market-data endpoint only for the backfill — no credentials, and no account,
order, position or execution path. Nothing written to the server. No raw market data committed;
only the aggregate audit. Sealed segment untouched.
