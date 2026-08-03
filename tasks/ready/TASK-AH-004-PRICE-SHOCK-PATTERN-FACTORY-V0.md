# TASK-AH-004 - Price Shock Pattern Factory v0

## Goal

Mine repeated, decision-time price patterns first, without requiring a payer thesis upfront. Find where price made an unusually large normalized move, identify whether similar precursors and follow-through occurred historically, and turn only reproducible patterns into explicit strategy passports for later validation.

This is a broad discovery/backtest task. It is not permission to fit a winner, start paper, or trade live.

## Scope and hard boundary

Work read-only in `/opt/botalin-edge`. Existing bars, AMEL events/outcomes, order-book snapshots, funding/OI, NEWS and wallet logs may be read only when present. No network pull unless a pre-existing keyless tool is already explicitly required by the task and records source provenance. Do not touch live/paper/coordinator/approval/KILL/config/keys/services/timers. `promising_count=0`; no paper candidate, model ID or `RESET_TS`.

## Pattern-first method

1. Use normalized moves, not raw points: return relative to ATR/rolling volatility and symbol price scale.
2. Scan all available decision-time horizons: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`.
3. Detect event families without indicator-name mining: impulse, gap-like discontinuity, acceleration/deceleration, range escape, failed continuation, reversal after extreme, compression-to-expansion, and session-boundary repricing.
4. For every event family, calculate recurrence across symbols/days and the conditional path after the event.
5. Cluster only on fields known at the event time: prior returns, realized volatility, range position, volume, spread/depth, OI/funding, news/wallet flags, session and market regime when available.
6. Search both continuation and reversal directions plus multiple causal exits. Exit parameters are selected on training data only, then frozen for validation and holdout.

## Candidate passport threshold

An interesting pattern becomes a `CANDIDATE_PASSPORT_DRAFT` only when it has all of:

- an exact decision-time event definition, entry, stop, target/timeout, universe and timeframe;
- at least 100 events, 5 symbols and 5 day clusters, unless a documented structural single-event universe makes this impossible;
- positive mean **and** median at ideal fill on holdout;
- matched-null advantage, remove-best-symbol/day survival and parameter-neighbourhood stability;
- no overlap with a rejected rule set; structural variants are allowed only when their trigger or exit logic materially differs;
- base and double-cost results. Execution replay is queued only if ideal-fill survives.

Payer/mechanism explanation is optional at this stage. If present, label it as a hypothesis, not proof.

## Required outputs

1. A ranked pattern atlas with event count, symbols/days, ideal-fill mean/median, null, concentration, cost stress and verdict.
2. A raw event table with event-time provenance and no outcome fields usable by the detector.
3. Zero or more strict passport drafts; no paper config.
4. A negative-result map that identifies whether failure is entry, exit, regime, concentration, cost, execution-data or lack of recurrence.
5. A route for each top pattern: `VALIDATION_NEXT`, `STRUCTURAL_VARIANT`, `EXECUTION_REPLAY`, `DATA_REQUEST`, `GUARD_ONLY`, or `REJECT`.

## Required lessons

Use `LESSON-003`, `LESSON-007`, `LESSON-016`, and `LESSON-021`. In particular: training gains are not evidence; every signal must pass ideal fill before execution is blamed; no rejected family may return under a renamed rule.

## Acceptance

Create a narrow script/test/report/data-result allowlist, run syntax, smoke and full tests, static no-trading scan, lessons checker, `git diff --check`, then commit and push only task artifacts. The result must explicitly say what it cannot conclude and that paper/live need a separate operator GO.
