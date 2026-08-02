# AH-041 — Triad Structural Strategies, Protocol v0

**Task:** TASK-AH-041-TRIAD-STRUCTURAL-STRATEGIES-V0
**Date:** 2026-08-03
**Label:** `DISCOVERY_NOT_PROOF`. Research only. No candidate was created, promoted, or paper-started.

## 0. Why three, and why never pooled

The triad exists to test three *mechanically independent* payers at once — a cross-sectional
dispersion payer, a contractual cash-flow payer, and an information-diffusion payer — without
letting a positive result in one launder a negative result in another.

**PnL is never pooled.** There is no combined equity curve, no blended verdict, and no field in the
output that sums one member's returns into another's. Each member carries its own data gate, its own
statistics, and its own verdict. A shipped test asserts the report contains no `combined_pnl`,
`pooled`, `total_pnl`, `portfolio_pnl`, `aggregate_verdict`, or `triad_pnl` key, and that no single
top-level `verdict` field exists.

## 1. Members

### Member 1 — `CS_RELATIVE_STRENGTH_24H`

Cross-sectional, market-neutral, daily rebalance on the frozen AH-005A liquid universe.

| Element | Specification |
|---|---|
| Signal | Daily 7-day return minus the universe median of that return |
| Legs | Long the top quintile, short the bottom quintile, equal notional |
| Exposure | Gross 1.0 (0.5 per side), net 0 by construction |
| Entry | The open of the day **after** the decision date |
| Exit | The next open, i.e. a 24h hold |
| Eligibility | At least 30 days of history, and no single-day move above 25% inside the lookback |
| Costs | 11 bps per gross roundtrip, applied to both legs; 22 bps double-cost stress |
| Null | Shuffled-rank, 1,000 samples, seeded |

### Member 2 — `FUNDING_PERSISTENCE_CARRY`

Executable **only** with causal synchronized spot price, perpetual price, funding rate *with its
publication timestamp*, borrow rate, basis, and both-leg execution quotes. Required fields:

```
ts, spot_price, perp_price, funding_rate, funding_publish_ts,
borrow_rate, basis, spot_bid, spot_ask, perp_bid, perp_ask
```

The fixed carry threshold must be shown to cover funding, borrow, basis drift and both execution legs
before any evaluation runs. Missing any field is `DATA_INADEQUATE`.

### Member 3 — `NEWS_FORCED_FLOW_REACTION`

Executable **only** with causal `first_seen` news time, an event label, aligned price, and execution
data. Required fields:

```
news:        first_seen_ts, event_label, symbol
news_prices: ts, symbol, price, bid, ask
```

The mechanical rule is pre-declared in code, before any news data is inspected:

| Field | Value |
|---|---|
| Direction | `FADE_THE_IMPULSE` — forced flow is price-insensitive; take the other side |
| Entry | First execution-quality quote strictly after `first_seen_ts + 60s` |
| Exit | Fixed 4h horizon from entry, no discretionary override |

`first_seen_ts` must be our own ingest time, not a publisher timestamp. Future-dated `published_at`
values have been observed on this lane, so a publisher timestamp is not causal.

## 2. The substitution rule

**A missing field is never approximated, and candles are never substituted for it.**

This is the rule the task exists to enforce. Funding, borrow, basis, execution quotes and news labels
cannot be derived from an OHLC series; a price move is not a news event. The gate returns
`DATA_INADEQUATE` naming every missing field, and `substitution_refused: true` is recorded on the
member. A shipped test supplies *only* daily bars and asserts that neither member 2 nor member 3
becomes executable.

Null, `undefined` and empty-string values count as missing, not as data.

## 3. Evaluation protocol for any executable member

| Element | Value |
|---|---|
| Splits | Chronological 55 / 20 / 15 / 10 (train / validation / holdout / forward) |
| Purge | 2 days — a decision whose outcome window crosses a split boundary is dropped |
| Embargo | 7 days — the feature warm-up head of each evaluated split is dropped |
| Reported | Holdout and forward separately, plus combined OOS |
| Null | 1,000 matched shuffled-rank samples, seeded, preserving dates, eligible set and both leg sizes |
| Robustness | Remove-best symbol, remove-best day, double cost, concentration |
| Neighbours | Two fixed lookbacks, 6d and 8d, **measured on validation** |
| Overlap | Exact trade-timestamp ledger overlap against every blocked family |

### Why neighbours are measured on validation

The task requires two fixed neighbours. It does not name a segment, and the project chronology rules
prohibit parameter surfaces on the holdout: a three-point surface would convert one pre-registered
look into three. Neighbours are therefore evaluated on **validation**, which satisfies the
requirement without spending holdout looks. This is a deliberate, stated choice.

### Purge and embargo

Without them, a decision made at the end of train resolves inside validation, and a holdout
decision's feature window reaches back into validation. Both are dropped explicitly and counted.

## 4. Blocked families and the overlap gate

These families are already rejected or quarantined and are blocked as duplicates:

`FAILED_BREAKOUT` · `RAW_MOMENTUM` · `TREND_CONTINUATION` · `WALLET_FOLLOW` ·
`PAIRS_RELATIVE_VALUE` · `HMM_REGIME`

Declared a priori, before measurement:

| Member | Declared adjacency |
|---|---|
| `CS_RELATIVE_STRENGTH_24H` | `RAW_MOMENTUM`, `PAIRS_RELATIVE_VALUE` |
| `FUNDING_PERSISTENCE_CARRY` | none |
| `NEWS_FORCED_FLOW_REACTION` | none |

Cross-sectional relative strength is momentum-adjacent by construction. It differs from the rejected
raw-momentum family in being market-neutral and cross-sectional rather than directional and
time-series — but **that distinction is a claim, not a measurement**. It can only be settled by exact
trade-timestamp and daily-return overlap against each blocked family.

**Those per-trade ledgers were not retained alongside the AH-005A archive.** The overlap gate
therefore reports `UNAVAILABLE`, and because member 1 has declared adjacency, the gate is
`blocking: true`.

### The gate is ordered so a passport draft is unreachable while overlap is unmeasured

```
DATA_INADEQUATE
  → OOS_FAIL_REJECT_FAMILY
  → ROBUSTNESS_FAIL_DEPRIORITIZE
  → DUPLICATE_OR_OVERLAP_BLOCKED      ← reached whenever overlap.status !== 'MEASURED'
  → CANDIDATE_PASSPORT_DRAFT
```

A shipped test constructs a result that passes every statistical gate and asserts the verdict is
still `DUPLICATE_OR_OVERLAP_BLOCKED`. A positive pocket does not promote.

## 5. Determinism and safety

Output is deterministic: a seeded PRNG (mulberry32), no clock, no randomness, no environment read,
and no embedded timestamp. Two runs of the same inputs are byte-identical.

The static scan asserts over comment-stripped source of both shipped files: imports restricted to
`node:fs`, `node:path`, `node:url`; no network, process, service, shell, credential, environment,
exchange, account, order or position surface; no trading runtime state; no destructive filesystem
call; exactly two writes in the engine, both guarded by an explicit `--out`; and no write at all in
the test file. One audited sentinel-fenced region holds the denylists themselves, because a list of
forbidden tokens must name them.

## 6. Usage

```bash
# Gate-only run: no data supplied, three DATA_INADEQUATE verdicts, writes nothing
node scripts/analysis/ah041_triad_structural_strategies.mjs

# Full run when the canonical datasets exist
node scripts/analysis/ah041_triad_structural_strategies.mjs \
  --universe <frozen AH-005A universe manifest> \
  --daily-bars <daily OHLC archive> \
  --carry <causal spot/perp/funding/borrow/basis/execution rows> \
  --news <first_seen + label rows> --news-prices <aligned execution rows> \
  --out data/ah041_triad_structural_strategies_2026-08-03
```

Nothing is written without an explicit `--out`.

## 7. What this protocol cannot deliver

1. It cannot make a member executable. If the causal fields do not exist, the answer is
   `DATA_INADEQUATE` — permanently, until the data is collected.
2. It cannot clear the overlap gate. That needs retained per-trade ledgers for the blocked families,
   which do not currently exist.
3. It cannot establish an edge. Even a member passing every gate reaches only
   `CANDIDATE_PASSPORT_DRAFT`, which is a research state, not a paper or live authorization.
4. It applies no multiplicity correction across the AH series. Any p-value it reports is
   uncorrected and must be deflated against the programme's documented prior-trial count before it
   means anything.
