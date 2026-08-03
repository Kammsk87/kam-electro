# TASK-AH-013 - Session-Handoff Cross-Sectional Tails 1h v0

## Objective

Test a distinct, fixed hypothesis: after the Asia-to-Europe handoff, the
relative overnight losers outperform relative winners within the same
market-neutral basket. It differs from AH-012 by selecting cross-sectional
tails each day rather than requiring independent absolute overnight extremes.
It is a new discovery test, not a repair of AH-012 and not a paper/live
candidate.

## Boundary

Use only the committed AH-005A 109-symbol archive and matching pre-OOS
development history. Research-only: no network, orders, keys, live/paper
processes, coordinator/approval/KILL/config changes, model_id, RESET_TS, or
promising_count changes.

Relevant lessons: LESSON-003, LESSON-007, LESSON-013, LESSON-016,
LESSON-017, LESSON-019, LESSON-021.

## Frozen construction

- Universe: top 30 non-tokenized crypto perpetuals by train-only hourly
  turnover. Freeze and report the list before OOS outcomes.
- Development: before `2026-03-20T00:00:00Z`; OOS through the AH-005A
  manifest-fixed end timestamp, split into three consecutive calendar folds.
- At `08:00 UTC` each day, compute every eligible symbol's overnight return
  from `00:00 UTC` open to `08:00 UTC` close, using closed bars only.
- Select the daily lowest 20% as the long basket and highest 20% as the short
  basket, with ascending symbol-name tie break. No absolute threshold, no
  volatility, volume, SMA/ATR, funding, wallet, news, or post-hoc filter.
- Estimate each symbol beta to the equal-weight market basket from development
  data only, with a fixed 90-day rolling lookback, 60-observation minimum,
  monthly rebalance, and equal weights. Scale the dollar-neutral baskets so
  their estimated combined beta is within absolute 0.05; skip the date if that
  cannot be achieved without a negative basket weight.
- Entry: next independent 1h open after the completed 08:00-09:00 bar,
  labelled `BAR_OPEN_IDEAL_FILL_ONLY`. Exit exactly three hours later.
- One cohort per calendar day only; missing input, entry, or exit bars exclude
  that day and must be counted.

## Economics and validation

- Charge full entry and exit costs to both legs at 11 and 22 bps per leg,
  including reconstitution turnover. Funding is excluded only as an ideal-fill
  limitation, never as an economic benefit.
- Matched null: at least 1,000 same-day, same-universe, same number-of-legs,
  liquidity-matched random long/short partitions; fixed seed and two-sided
  day-clustered test statistic.
- Report every OOS fold and combined: events, days, symbols, mean, median,
  p5/p95, win rate, gross/net at both cost tiers, turnover, market beta,
  long/short PnL, null p, remove-best-symbol/three-symbols/day, and PnL shares.
- Neighbours only: daily 15/85 and 25/75 cross-sectional tails, with every
  other rule unchanged. They are robustness disclosures, never rescue settings.

## Gates

Advance only to `CANDIDATE_PASSPORT_DRAFT` if every OOS fold has positive net
median at 22 bps per leg, combined OOS mean and median are positive, null
p < 0.05, remove-best-three symbols and remove-best-day remain positive, no
symbol supplies more than 25% of PnL, at least 100 calendar days and 20 symbols
produce signals, and both neighbour variants have non-negative median at the
same cost. Otherwise return `ROBUSTNESS_FAIL_REJECT_FAMILY`,
`DATA_INADEQUATE`, or `DUPLICATE_OR_OVERLAP`.

## Overlap stop

Stop if the result relies on own-price MA distance, AH-011 all-hour
dispersion-reversal construction, FADE tokenized geometry, local
breakout/wick/volume, funding, wallet copying, news, or cross-venue prices.

## Deliverables

1. `scripts/analysis/ah013_session_handoff_cross_sectional_tails.mjs`
2. `scripts/test_ah013_session_handoff_cross_sectional_tails.mjs`
3. `reference/AH013_SESSION_HANDOFF_CROSS_SECTIONAL_TAILS_1H_PROTOCOL_2026-07-30.md`
4. `data/ah013_session_handoff_cross_sectional_tails_2026-07-30.{csv,json}`
5. `tasks/results/TASK-AH-013-SESSION-HANDOFF-CROSS-SECTIONAL-TAILS-1H-V0-RESULT.md`

Run syntax, deterministic unit, smoke, static no-trading scan, lessons
checker, full run, then commit and push allowlisted files only.
