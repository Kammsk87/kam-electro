# TASK-AH-012 - Session-Handoff Repricing 1h v0

## Objective

Test one fixed, indicator-free hypothesis: an extreme Asia-session move is
partly reversed in the first European trading hours. This is a discovery test,
not a paper or live candidate.

## Boundary

Use only the committed 109-symbol AH-005A archive plus matching pre-OOS
development history. Research-only: no network, orders, keys, live/paper
processes, coordinator/approval/KILL/config changes, model_id, RESET_TS, or
promising_count changes.

Relevant lessons: LESSON-003, LESSON-007, LESSON-013, LESSON-016,
LESSON-017, LESSON-019, LESSON-021.

## Frozen construction

- Universe: top 30 non-tokenized crypto perpetuals by train-only hourly
  turnover; record the frozen list before OOS outcomes.
- Development: before `2026-03-20T00:00:00Z`; OOS through the AH-005A
  manifest-fixed end timestamp, split into three consecutive calendar folds.
- Event time: exactly `08:00 UTC` Asia-to-Europe handoff.
- Overnight measure: each symbol's return from the `00:00 UTC` open to the
  `08:00 UTC` close, using only closed bars.
- Trigger: the train-only upper or lower tenth percentile of that measure.
- Direction is fixed reversal: long lower-tail moves, short upper-tail moves.
- Entry: next independent one-hour open after the completed 08:00-09:00 bar,
  labelled `BAR_OPEN_IDEAL_FILL_ONLY`.
- Exit: exactly three hours after entry. No stop, volume, SMA/ATR, funding,
  wallet, news, or post-hoc regime filter.
- Equal dollar long/short baskets when both tails are present. If only one tail
  is available, do not trade that timestamp.

## Economics and validation

- Charge full entry and exit costs to both legs at 11 and 22 bps per leg;
  disclose turnover and long/short PnL separately.
- Freeze eligibility, tie-breaks, minimum tail count, cohort overlap policy,
  and missing-bar exclusions before outcomes. Inference must be day-clustered.
- Matched null: at least 1,000 same-symbol, same-hour, same-tail-count,
  same-liquidity random dates; fixed seed and two-sided p-value.
- Report each OOS fold and combined: signals, days, symbols, mean, median,
  p5/p95, win rate, gross/net at both cost tiers, market beta, turnover,
  long/short PnL, matched-null, remove-best-symbol/three-symbols/day, and PnL
  concentration.
- Neighbour check only: train-only 8th/92nd and 12th/88th percentiles, all
  other rules unchanged. They are reports, never rescue settings.

## Gates

`CANDIDATE_PASSPORT_DRAFT` only if every OOS fold has positive median at 22
bps, combined mean and median are positive, null p < 0.05, remove-best-three
symbols and remove-best-day remain positive, no symbol contributes over 25% of
PnL, signals span at least 30 days and 20 symbols, and both neighbour variants
have non-negative median at 22 bps. Otherwise return `ROBUSTNESS_FAIL_REJECT_FAMILY`,
`DATA_INADEQUATE`, or `DUPLICATE_OR_OVERLAP`.

## Overlap stop

Stop as overlap if the effect depends on FADE tokenized geometry, local
breakout/wick/volume, own-price SMA/ATR distance, funding carry, wallet flow,
news, or cross-venue price differences.

## Deliverables

1. `scripts/analysis/ah012_session_handoff_repricing.mjs`
2. `scripts/test_ah012_session_handoff_repricing.mjs`
3. `reference/AH012_SESSION_HANDOFF_REPRICING_1H_PROTOCOL_2026-07-30.md`
4. `data/ah012_session_handoff_repricing_2026-07-30.{csv,json}`
5. `tasks/results/TASK-AH-012-SESSION-HANDOFF-REPRICING-1H-V0-RESULT.md`

Run syntax, deterministic unit, smoke, static no-trading scan, lessons
checker, full run, then commit and push the allowlisted files only.
