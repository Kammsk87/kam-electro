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

## 1. The single alpha target — CLOSED 2026-08-05

> **Status: the directional-alpha research loop is complete.** B7 was reconnoitred the same day
> this register was written and closed as `CD.OI_COLLAPSE_REVERSION`, `CLOSED_MEASURED`. The
> declared short direction was refuted — price *continued* after an OI collapse on a rising
> price, −5.80 bps at t = −1.93, placing a +16 bps reversion 7.3 standard errors away. The
> degeneracy check passed first, at a quintile ratio of 1.06, so this is a measurement and not a
> collapsed sort. One figure is unresolved and must not be chased: the mirror event at 15
> minutes, +9.82 bps with the floor 1.28 standard errors away, a non-primary horizon of a
> non-primary set selected after the fact. Full detail in
> `reference/B7_OI_COLLAPSE_RECONNAISSANCE_2026-08-05.md`.
>
> **Section 2 is now the whole programme.** The section below is retained as written, because
> the reasoning that selected B7 is what a future reader needs in order to judge the closure.

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

**G3 PASSED on 2026-08-05** — the first G3 pass in the programme's history. 2,122,951 filled
intents, every point on the staleness axis resolved from t = 18.94 to t = 5.51, both controls
clear: the ALLOW mean is −1.614 bps against a +0.50 limit and the veto rate is 16.2 percent.
Detail in `tasks/results/G3-GUARD-EXECUTABLE-REPLAY-FULL-RUN-RESULT.md`.

**That is not replication, and the blocking condition is unchanged.** The run uses the SAME
26-day archive that produced the law. It establishes that the effect survives executable
mechanics — spread crossing, depth limits, tick-resolution entry, realistic staleness — on the
data it was found in, and says nothing about whether it recurs.

**Still blocked on:** a second, non-overlapping archive span of at least 10 days per
out-of-sample segment, per the law's own review criterion. Recorders are running. This costs
waiting, not work.

**Gate definition is already written** — `docs/BOTALIN_G3_PROTOCOL_FOR_GUARDS_2026-08-05.md`.
G3 as stated in the gate battery asks for expectancy positive net of all costs; a guard has no
expectancy, so it was literally unpassable. G3 for a guard is a **paired replay of one
exhaustive synthetic intent stream**, with and without the veto, under identical execution
mechanics. The measured object is the per-executed-intent difference, never a P&L.

### What a guard is worth, and what it is not

Recorded 2026-08-05 because the roadmap for an execution layer was being built on the wrong
arithmetic, and the wrong arithmetic here leads to a bad decision rather than a small error.

**The relation is additive, not multiplicative.**

```
Net = Signal − 16.0 bps (round trip) + 0.715 bps (guard)
```

- A signal with **zero** edge, passed through the guard, returns **−15.3 bps**. It does not
  become profitable. The guard cannot rescue a null signal, and no amount of execution work
  changes that.
- **Corrected 2026-08-05 by the G3 harness, downward by a further order of magnitude.** The
  0.715 bps figure is the ALLOW-versus-VETO *separation*, not what a trade receives. What a
  trade receives is

  ```
  per_executed_gain = mean(ALLOW) − mean(ALL) = veto_rate × separation
  ```

  **Measured on the full archive, 2,122,951 filled intents across 10 symbols and 26 days:**

  | | |
  |---|---:|
  | separation at ideal fill (the law's headline) | 0.715 bps |
  | separation under execution mechanics, zero offset | 0.5235 bps |
  | × veto rate 16.2 % → per executed intent | 0.0855 bps |
  | × 54 % staleness retention at realistic decision age | **0.0451 bps** |

  So the honest arithmetic is `Net = Signal − 16.00 + 0.045`, and the guard is **0.28 percent
  of one round trip**, not 4.5. Both earlier figures in this section overstated it; the error is
  recorded rather than quietly replaced because the roadmap was being sized against them.

  The one-symbol run that preceded this put retention at 27 percent and was itself unresolved;
  the full run puts it at 54 percent, matching the pilot's original shape indication exactly.

**What the guard is.** An incremental reduction in execution friction for a strategy that
already pays for itself. On a candidate like AH-054, whose gross is measured in hundreds of
basis points, 0.4 to 0.7 bps a trade compounds meaningfully across hundreds of trades. It is a
margin improvement, never a load-bearing element.

**The consequence for sequencing.** An execution layer is worth building *after* a signal
clears its own floor, not instead of finding one. Any proposal of the form "the guard turns a
weak signal into a profitable one" is refused on this arithmetic.

### Liquidity-bounded staleness — the mechanism is confirmed, the threshold is refused

Measured 2026-08-05 across 10 symbols on the full G3 run. Recorded because a plausible universe
rule was about to be adopted from it, and the data does not support that rule.

**Confirmed: staleness has two components and a feed upgrade touches only one.**

```
staleness = feed latency + inter-trade arrival time
```

Spearman of trade rate against median staleness at zero offset: **ρ = −0.939** across ten
symbols. On `AMATUSDT`, at 0.06 trades per second, a trade prints once every sixteen seconds; no
feed however fast can execute a decision earlier than the next counterparty arrives.

| symbol | trades/s | staleness | separation | retention @ 5 s |
|---|---:|---:|---:|---:|
| AAVE | 1.22 | 3,044 ms | 0.3101 | **33 %** |
| ARB | 0.97 | 4,090 | 0.4525 | 41 % |
| ADA | 0.77 | 5,360 | 0.2896 | 35 % |
| AVAX | 0.66 | 4,523 | 0.3673 | 44 % |
| BILL | 0.44 | 4,371 | 1.1222 | 58 % |
| BNB | 0.39 | 5,968 | 0.3915 | 57 % |
| BSB | 0.23 | 6,876 | 1.0285 | 73 % |
| B3 | 0.17 | 7,371 | 0.9196 | 71 % |
| AERGO | 0.11 | 7,095 | 1.2083 | **78 %** |
| AMAT | 0.06 | 8,884 | **−0.1167** | 50 % |

**Refused: a minimum trade-rate filter for the guard universe.** The proposal was to exclude
symbols below 1.0 trades per second on the grounds that the guard degrades there. Two things
are wrong with it.

- It inverts the measured relation. Trade rate against retention at the 50 percent offset is
  **ρ = −0.782**: the *illiquid* symbols retain the guard's edge **better**. AERGO keeps 78
  percent where AAVE keeps 33. The mechanism is obvious once measured — on a symbol that trades
  twice a minute, five seconds contains almost no information, so the state the guard read has
  not moved on. Separation against trade rate is ρ = −0.261, also the wrong sign for the rule.
- At a 1.0 threshold exactly **one** of ten symbols survives — AAVE at 1.22. ARB sits at 0.97
  and ADA at 0.77.

**What the evidence actually supports.** Only `AMATUSDT` shows a negative separation, at
t = −0.41, and it is the single most illiquid name in the set. That is **one observation at one
extreme**, not a threshold. Setting a universe rule from it would be fitting a boundary to a
single point.

**What would justify a threshold.** A trade-rate sweep on a universe wide enough to place the
sign change, with the separation resolved on both sides of it. The present ten symbols cannot
do that: nine are positive and one is negative.

**Consequence for the L2 decision.** A direct feed reduces the latency term only, so its value
is concentrated where that term is the binding one — the liquid core. On thin names the binding
term is the inter-trade interval and no feed changes it. That sharpens the earlier claim in
this section: the feed upgrade is worth arguing for on liquid symbols, and is close to
worthless on illiquid ones, for reasons that have nothing to do with the feed.

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

## 2b. AH-054 — measured, concentrated, and deliberately not spent

Stage 0 passed and Stage 1 ran on train only. Recorded here rather than in section 3 because the
family is **not closed** — it is waiting on time.

| | |
|---|---:|
| train trades | 255 |
| net mean | **+309.6 bps**, t = 2.36 |
| net median | −405.1 bps |
| win rate / payoff | 30.6 % / **4.67** |
| matched null | +15.5 bps, p95 +101.9 — **beaten clearly** |
| pre-registered prior | +181.3 bps vs +325.9 measured, **1.1 se** |

It fails on one thing: **2024 carries 92.8 percent of the total net**, and removing it takes
t from 2.36 to 0.44 on the remaining 108 trades.

**Why the sealed segment is not being spent, and why re-partitioning is not a way around it.**
Events fall 108 / 152 / 131 / 73 across 2023–2026, and the 55 percent boundary lands inside
2024. Extending train to cover three years means moving 2025 out of the sealed segment — which
is spending the holdout under another name. It would leave 73 events of one partial year as the
only independent evidence, down from 209.

Re-partitioning does not create data. It moves a boundary, and the boundary is the whole value.

**The blocking condition is calendar time, not analysis.** The archive keeps accumulating. In
six months the sealed segment is a genuinely independent two-year test across 2025 and 2026
rather than a thinner one, and the question it answers — does the effect survive outside 2024 —
is exactly the question that failed on train. Waiting makes the test stronger; spending it now
makes it weaker.

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
