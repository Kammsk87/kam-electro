# Open directions register

Maintained under §5 of `docs/BOTALIN_CHIEF_SCIENTIST_PROTOCOL_2026-08-04.md`, which requires
the standing agenda to hold every open direction with its blocking condition, every closure
with its reopen criterion, and the list of constants that currently bind.

Closures live in the catalogue as `closure_decision` records and are queryable with
`node scripts/analysis/query_research_warehouse_catalog.mjs closures`. This document is the
human-readable face of that registry plus the part the schema has no record type for: what is
**open**, and why it is the only thing open.

State as of 2026-08-05. Eleven closures.

---

## 1. The single alpha target

### B7 — open-interest collapse on a rising price

**Source:** `EDGE.DATA.HL_CASCADE`, `VERIFIED_READ_ONLY`. 35,029 snapshots at 60s, 232 assets,
2026-07-11 onward, carrying our own poll timestamp.

**Thesis:** price rising while open interest falls sharply means the move is funded by
capitulation — shorts closing or being liquidated — rather than by new money. Such a move has
no position behind it and should decay.

**Why this one and not another.** The recorder was built for exactly this. Its header states
the design thesis as *"cascade = OI collapse + oracle/mark divergence"*, and it exists because
Hyperliquid publishes no liquidation feed, so the footprint had to be recorded instead. This is
the only surviving hypothesis whose data was collected on purpose for it.

**What the funding cutoff of 2026-08-05 did and did not settle.** It closed funding *velocity*
and the settlement window, both `CLOSED_MEASURED`. It did not touch open interest, the
oracle/mark gap, or the exchange-reported `premium` field — a field check established that
`premium` is **not** `(mark − oracle)/oracle`, so those are two distinct quantities and both
remain unmeasured.

**Declared before any work, from what neighbouring measurements already establish:**

- the cost floor is 16 bps and this is a single-leg directional trade;
- the funding cutoff found standard errors near 2 bps on 34,950 observations, so a comparable
  design here can resolve roughly 6 bps at t = 3 — enough to exclude a 16 bps effect, not
  enough to establish a 5 bps one;
- **the bucket-balance check comes first.** The funding sort degenerated to two states because
  the series is quantised; OI is a float and should not, but that must be shown by reporting
  the tie fraction before any return is measured, not assumed.

**Prior that should temper expectation:** every forced-flow measurement so far saturates below
the floor. Sweep continuation reaches 8.27 bps at the largest one-in-a-thousand and stops
there.

---

## 2. Core infrastructure — the only asset

### Guard → G3

`LAW.EXEC.FLOW_DEPTH_AGREEMENT_PREDICTS_ADVERSE`: +0.715 bps at t = 20.1 over 779,540
observations, `null_test`, `oos` and `remove_best` all PASS. The only record in the catalogue
with three green checks.

**Blocked on:** a second, non-overlapping archive span of at least 10 days per out-of-sample
segment, per the law's own review criterion. Recorders are running. This costs waiting, not
work.

**Gate definition is already written** — `docs/BOTALIN_G3_PROTOCOL_FOR_GUARDS_2026-08-05.md`.
G3 as stated in the gate battery asks for expectancy positive net of all costs; a guard has no
expectancy, so it was literally unpassable. G3 for a guard is a **paired replay of one
exhaustive synthetic intent stream**, with and without the veto, under identical execution
mechanics. The measured object is the per-executed-intent difference, never a P&L.

### Staleness, and the L2 decision

This is the crux of G3 and it is quantified.

Book cadence is **10,000 ms at the median**, with 0.0 percent of intervals under 5 seconds. An
intent arriving uniformly inside an interval therefore carries a mean staleness near 5 seconds.

The pilot of 2026-08-05 measured what that costs, using the tick stream for entry timing since
the book cannot express sub-interval offsets:

| delay | separation retained |
|---:|---:|
| 1 s | 82 % |
| 3 s | 81 % |
| **5 s** | **54 %** |
| 8 s | 31 % |

The decay is carried by the VETO side rising toward zero, from −0.27 to −0.08 bps: the adverse
move the guard detects is largely consumed within the first seconds. That is a mechanism, not
an artifact.

**Neither pre-set branch fired.** It does not collapse by 2 seconds, so this is no outright
infrastructure closure; it does not hold to 5–7 seconds, so the guard is not clearly viable on
the present feed. The half-life sits at the cadence itself.

**The L2 calibration this implies.** A direct L2 feed is not merely "faster". It moves the mean
staleness of a real decision from about five seconds to about zero, which on this curve is
**roughly a doubling of the retained effect**. That is the number the decision to build it
should be argued against.

The pilot is one symbol and one day — 17,260 evaluations against the 779,540 behind the
headline, t = 1.92 even at offset 0, and its five rows share snapshots and states. It is a
shape indication, not a curve to quote.

---

## 3. Closed, with what would reopen each

Full text in the registry; the reopen clause is what matters here.

| decision | disposition | reopens only on |
|---|---|---|
| `CD.PRICE_PATTERN_CATEGORY` | CLOSED_MEASURED | a mechanism naming who pays, at a horizon where the round trip is under 5 % of the available move |
| `CD.OFI_AS_DIRECTION` | CLOSED_MEASURED | order-book data at **event** resolution, plus the G3 staleness curve |
| `CD.SELECTION_ON_INSAMPLE_RANK` | CLOSED_MEASURED | ≥10 independent transitions with resolvably positive Spearman **and** the winner beating the median in a majority |
| `CD.MAKER_EXECUTION_ROUTE` | CLOSED_MEASURED | a maker fee below the prevailing spread on our universe — not a better queue model |
| `CD.SWEEP_CONTINUATION` | CLOSED_MEASURED | a round trip under ~8 bps, or a conditioner not from the pre-sweep book that orders the top notional row |
| `CD.CARRY_CURRENT_IMPLEMENTATION` | CLOSED_MEASURED | a venue where premium and a tradeable spot leg exist on the **same** asset |
| `CD.FUNDING_VELOCITY` | CLOSED_MEASURED | a materially longer horizon **and** a construct shown not to degenerate, tie fraction reported first |
| `CD.WEEKLY_XSECT_MOMENTUM` | **CLOSED_UNDERPOWERED** | ~4× the sample resolving at t = 3 with the ordering intact **and** a positive net median at 32 bps |
| `CD.CROSS_EXCHANGE_LEADLAG` | DATA_BLOCKED | a second tick venue **with a measured clock offset**, plus a pre-declared spread expectation above 16 bps |
| `CD.SECTOR_IMBALANCE` | DATA_BLOCKED | a versioned **point-in-time** taxonomy; present-day labels applied backwards are look-ahead |
| `CD.NEWS_LANE` | DATA_BLOCKED | fixed extractor, >30 % joinability, **and** residual move surviving our actual p50 detection delay above 16 bps |

One entry is `CLOSED_UNDERPOWERED` and it must not be read as the others. For the weekly
cross-section the *published* effect is excluded at 2.6–5.2 standard errors; the residual is
not, and the ordering is monotone. It is absence of evidence.

Three attempted reopens have already been refused under these clauses — Hawkes against the
sweep family, and the two data routes at triage. That is the register working as intended: the
question "is this worth a ticket?" was answered before a ticket existed.

---

## 4. Constants that currently bind, and their derivations

Required by §5 clause 3, and added because an unexamined constant closed thirty-seven
hypotheses at the wrong level for months.

| constant | value | derivation |
|---|---:|---|
| round trip, single leg | **16 bps** | `DC.COST.RESEARCH_FLOOR_IS_FEE_ONLY` — audited; the superseded 11 bps was fees only |
| round trip, two legs | 32 bps | same |
| book cadence | 10,000 ms p50 | measured on `AAVEUSDT.guard.txt`, 0.0 % of intervals under 5 s |
| mean decision staleness | ~5 s | half the cadence, for intents arriving uniformly |
| power target | t = 3 | declared per task, reported before the verdict |

The 11 bps figure survives only as an optimistic bound for comparison against the historical
record and must not be used to judge new work.

---

## 5. Standing method rules that closed things this week

Not theory — each earned its place by inverting or falsifying a verdict.

- **R6, verify the harness against an independent computation.** Four defects in five tasks,
  every one caught by cross-checking and none by reading: a power check applied to one sign
  only; a sort pooled across symbols whose scales differ by orders of magnitude; a
  rolling-window statistic used where the contract named the non-overlapping one; and an
  endpoint difference on a quantised series that collapsed 63 percent of observations into one
  bucket.
- **R7, overlapping windows are not a sample size.**
- **Check that the data can support the question before modelling the answer.** The decisive
  finding came from this in the news audit, the lead-lag triage, the sector triage and the
  staleness pilot — four out of four.
- **A short span is not a small sample.** The funding cutoff closed `CLOSED_MEASURED` on 25
  days because 34,950 observations gave 2 bps standard errors, contradicting a stated
  prediction of `UNDERPOWERED`.

---

## 6. What is deliberately not on this list

No new hypothesis generation from price history, order flow as direction, or in-sample
ranking. Those are closed as **methods**, not as families, and four of the eleven closures are
of that kind. A programme that only ever closes strategies keeps rediscovering the same way of
being wrong.
