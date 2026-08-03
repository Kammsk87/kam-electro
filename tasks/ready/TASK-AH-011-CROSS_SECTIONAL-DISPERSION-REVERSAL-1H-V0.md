# TASK-AH-011 - Cross-Sectional Dispersion-Reversal 1h v0

## Objective

Test one fixed discovery hypothesis: after an unusually large dispersion of
one-hour returns across crypto perpetuals, the extreme leaders and laggards
partially converge over the next six hours. This is a market-neutral relative
value test, not a paper or live candidate.

## Safety and evidence boundary

Research-only. Use the AH-005A 109-symbol 1h archive and its provenance only.
Do not start or stop live or paper processes, change coordinator, approval,
KILL, configuration, model_id, RESET_TS, or promising_count; do not read
secrets or call order/account/position endpoints. No network fetches.

Relevant lessons: LESSON-003, LESSON-007, LESSON-013, LESSON-016,
LESSON-017, LESSON-019, LESSON-021.

## Frozen data and time splits

- Source universe: exactly the 109-symbol AH-005A archive.
- Development boundary: before `2026-03-20T00:00:00Z`.
- OOS: from that boundary through the archive's manifest-fixed end timestamp.
- Partition OOS into three consecutive calendar-time folds of equal length
  before examining outcomes.
- A symbol is eligible only with at least 95% continuous hourly bars in
  development and in every OOS fold. Exclude tokenized shares, commodities,
  duplicated symbols, and symbols without a valid next-bar open. Record every
  exclusion and its reason. Never replace or add a symbol after results are
  viewed.

## Frozen signal and construction

At the close of hour `t`:

1. Compute each eligible symbol's one-hour return.
2. Estimate the symbol beta to an equal-weight basket of the other eligible
   symbols using development data only. Exclude the signal symbol from its own
   hedge basket.
3. Compute the residual one-hour return by removing that beta-neutral market
   component.
4. Compute cross-sectional dispersion as the interquartile range of residual
   returns. Trade only when it exceeds the development 75th percentile.
5. Short the upper residual-return decile and long the lower decile, equal
   dollar-weighted within each leg and dollar-neutral across the two legs.

Primary entry is the next one-hour bar open, labelled
`BAR_OPEN_IDEAL_FILL_ONLY`. Exit exactly six hours later. There is no stop,
news, funding, wallet, volume, SMA/ATR, or post-hoc regime filter in this
primary rule. Record MFE/MAE only for a later passport, not to choose exits.

## Economics and controls

- Apply `11 bps` and `22 bps` per leg for every entry and exit: both long and
  short legs must bear their full round-trip cost.
- Funding receives no favourable assumption and is excluded from return.
- Generate at least 1,000 matched-null baskets with the same timestamps,
  number of legs, liquidity profile, holding period, cost model, and a fixed
  recorded seed.
- Report each OOS fold and combined OOS: N, symbols, days, mean, median,
  win rate, p5/p95, both cost tiers, null result, and MFE/MAE.
- Run remove-best-symbol, remove-best-three-symbols, and remove-best-day;
  report top-symbol, top-day, and top-three-symbol PnL shares.
- The only predeclared neighbour check is `8/92` and `12/88` quantile baskets,
  retaining the same six-hour exit and every other rule.

## Gates and verdicts

Only return `CANDIDATE_PASSPORT_DRAFT` when all are true:

1. Every OOS fold has positive net median after 22 bps per leg.
2. Combined OOS mean and median are positive after 22 bps per leg.
3. Matched-null p is below 0.05.
4. Combined return remains positive after remove-best-three-symbols and
   remove-best-day.
5. No symbol supplies more than 25% of combined PnL.
6. Signals span at least 30 calendar days and 20 symbols.
7. Both neighbour variants have non-negative net median after 22 bps.

Otherwise use `ROBUSTNESS_FAIL_REJECT_FAMILY`, `DATA_INADEQUATE`, or
`DUPLICATE_OR_OVERLAP` as appropriate. A passing result permits only a future
event-time execution replay at L2 size tiers; it does not create paper/live
status or change `promising_count=0`.

## Overlap stop

Stop and label overlap if the apparent effect relies on own-symbol SMA/ATR
distance, tokenized FADE geometry, local failed breakouts, volume/momentum,
volatility-compression expansion, funding carry, wallet copying, news, or any
cross-venue price difference.

## Deliverables

1. `scripts/analysis/ah011_cross_sectional_dispersion_reversal.mjs`
2. `scripts/test_ah011_cross_sectional_dispersion_reversal.mjs`
3. `reference/AH011_CROSS_SECTIONAL_DISPERSION_REVERSAL_1H_PROTOCOL_2026-07-30.md`
4. `data/ah011_cross_sectional_dispersion_reversal_2026-07-30.{csv,json}`
5. `tasks/results/TASK-AH-011-CROSS_SECTIONAL-DISPERSION-REVERSAL-1H-V0-RESULT.md`

Run `node --check`, deterministic unit tests, smoke mode, static scan for
trading endpoints/secrets, lessons checker, full run, then commit and push.
