# TASK-AH-014 - AH-012 Quarantined Paper Observer v0

## Operator authorization and purpose

The operator explicitly authorizes a paper-only forward observer for the
original frozen AH-012 `primary_10_90` rule despite its underpowered 23-event
historical sample. This authorization is for evidence collection only. It does
not authorize live orders, a paper candidate promotion, `promising_count`,
model_id/RESET_TS changes, scaling, or any change to the AH-012 rule.

## Frozen observer rule

Reuse AH-012 primary rule exactly, without its 8/92 or 12/88 neighbours:

- same train-frozen top-30 universe and 10/90 absolute Asia tail thresholds;
- 08:00 UTC Asia-to-Europe event, both long and short tails required;
- entry after the completed 08:00-09:00 bar at the next 1h open;
- equal dollar long/short baskets, 3h exit;
- complete 11 and 22 bps-per-leg paper cost columns, both legs and both
  entry/exit legs; funding is not credited;
- `BAR_OPEN_PAPER_REFERENCE_ONLY`, never represented as executable fill.

The observer must report no-trade days and all excluded days, not manufacture
one-sided trades. It must keep each decision, price reference, realized
outcome, and data-quality flag append-only by date.

## Isolation and hard safety

- Use public keyless market data only. No execution, account, position, order,
  secret, approval, coordinator, KILL, or live configuration endpoints/files.
- Do not alter existing paper runners or their state.
- No timer, service, cron, or automatic restart. One bounded detached observer
  process may self-stop after 365 days or after 100 valid calendar-day events,
  whichever happens first.
- It must survive individual public-data errors by recording `DATA_BAD` for
  that day, never retrying into a different rule.
- The process must not start until syntax, deterministic unit, smoke,
  no-trading-endpoint static scan, lessons checker, and a dry one-cycle test
  pass. Create an approval-free paper-only manifest proving its process ID,
  start/end boundaries, and zero order paths.

## Evidence target and decisions

At 30, 60, and 100 valid independent calendar days, write a read-only summary:
event count, no-trade count, excluded count, symbols, gross/net mean/median,
long/short PnL, both cost tiers, market beta, drawdown, and top-symbol/day PnL
share. Do not make interim promotion language.

At 100 days, the observer may only recommend execution-data research if the
original rule has positive mean and median after 22 bps per leg, no excessive
concentration, and no data-quality failure. Any verdict remains
`QUARANTINED_PAPER_OBSERVER_ONLY` until an independent OOS/execution review.

## Deliverables

1. `scripts/analysis/ah012_quarantined_paper_observer.mjs`
2. `scripts/test_ah012_quarantined_paper_observer.mjs`
3. `reference/AH012_QUARANTINED_PAPER_OBSERVER_PROTOCOL_2026-07-30.md`
4. `tasks/results/TASK-AH-014-AH012-QUARANTINED-PAPER-OBSERVER-V0-RESULT.md`
5. Runtime logs outside git under the existing research logs area, plus an
   append-only manifest and a documented read-only summary command.

Commit and push source/docs/result before launch. Then start the one bounded
paper-only observer, verify it emitted its first no-trade or data-quality
record, and report the PID/run ID. Never commit runtime logs.
