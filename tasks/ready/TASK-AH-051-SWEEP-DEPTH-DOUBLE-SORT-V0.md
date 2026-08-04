# TASK-AH-051 - Sweep × Depth-Response Double Sort v0

## Why this and not another conditioning attempt

TASK-AH-048 declared FADE on large sweeps and measured the opposite: continuation of +7.56 bps
at 60s with t = 15.3 over 3,050 train events. That is the only directional effect this
programme has measured with a real magnitude. It closed at Stage 0 because it does not pay the
round trip — and the cost audit of 2026-08-04 widened that gap, since the audited floor is
16 bps rather than the 11 bps AH-048 was measured against.

The effect therefore needs a factor of roughly 2.1. What makes that worth attempting rather
than abandoning is that **the paying tail already exists**: 32 percent of AH-048's events at
900s exceeded 11 bps unconditionally. The open question is not whether large post-sweep moves
occur. It is whether they are identifiable **before** the event.

The instrument is taken from Liu, Tsyvinski & Wu, whose most useful finding came from a double
sort rather than a single one: sorting on size first and momentum within each size group
revealed that crypto momentum lives in the large coins — 4.2 percent weekly above the median
against 0.6 percent and insignificant below it. A single sort reports an average and hides the
structure. See `reference/BOTALIN_DIRECTION_LITERATURE_REVIEW_2026-08-04.md` §3.5.

## Lifecycle position

AH-048 is closed. This is **not** a silent retry of it. Per
`docs/MULTISTRATEGY_CANDIDATE_LIFECYCLE.md`, this is a documented structural variant with a new
model identity: a different event set, a declared direction that AH-048 discovered as a mirror,
and a conditioning dimension AH-048 did not carry.

That inheritance is a weakness and is declared here rather than discovered in review: **the
continuation direction was learned from AH-048's train segment.** Declaring it now does not
make it a prior belief. Consequently a positive result on this task's train segment is
discovery, not evidence, and Stage 1 must test it on data that was sealed at the time the
direction was learned.

## The frozen specification

**Event set.** Parent sweeps as reconstructed at the frozen 100 ms burst gap, restricted to
the **top decile of parent notional**, with the threshold fitted on the train segment only and
per symbol. This is deliberately wider than AH-048's 99th percentile: a double sort needs range
in its first dimension. AH-048's event set is approximately the top fifth of this one, so the
two connect rather than compete — but AH-048's measured numbers do not carry over and are not
quoted as this task's baseline.

**Declared direction: CONTINUATION.** Long a BUY sweep, short a SELL sweep. Entry at the mid at
sweep completion, taker, paying the full round trip.

**First sort: parent notional**, into quintiles within the event set.

**Second sort — the conditioner: depth response on the consumed side.** For a BUY sweep the
consumed side is the ask; for a SELL sweep, the bid. The quantity is the fractional change in
that side's depth over the order-book interval **ending at or before sweep completion**:

```
consumed_depth_response = (depth_next - depth_prev) / depth_prev
```

Negative means liquidity was withdrawing from the side the aggressor is about to consume.

**This is the state entering the sweep, not the book's response to it.** A snapshot taken
after completion would sit up to 10 seconds inside the 60-second outcome window and leak it.
The weaker but causal quantity is chosen deliberately.

**Mechanism claim.** `LAW.EXEC.FLOW_DEPTH_AGREEMENT_PREDICTS_ADVERSE` established at t = 20.1
over 779,540 observations that aggressive flow meeting a thinning book is followed by an
adverse move for anyone entering against it. The mirror of "adverse for the passive side" is
"continuation for the aggressive side". This task tests whether that relation, already measured
across all flow at +0.715 bps, scales with event size.

**Horizons.** 60s primary — AH-048's strongest by t. 300s and 900s are fixed neighbours that
may not be substituted.

**Costs.** 16 bps round trip, 32 bps double-cost stress, both taker. The superseded 11 bps is
reported only for comparison against the historical record.

**Splits.** Chronological, train = first 55 percent of events by time. Everything after is
sealed and untouched at Stage 0.

## Why the guard predicate is NOT the primary conditioner

The obvious choice was `guardState` from AH-047, and it is wrong here on mechanical grounds
rather than empirical ones. The guard's flow term is the net aggressive notional over the
snapshot interval. During a large sweep that term is dominated by the sweep itself, so the
predicate would be nearly constant across the event set and carry almost no variation to sort
on. It is retained as a reported neighbour, not as the primary.

## Stage 0 gate

On the **train segment only**, produce the 5 × 5 grid of mean continuation in bps, and:

1. the cell count and mean in every cell, with no cell below 30 events reported as a result;
2. **monotonicity of the conditioner within each notional bucket** — a genuine relation orders
   the buckets, a spread carried by two extreme cells does not;
3. the top cell's mean against the 16 bps floor, and its t;
4. the effect size detectable at t = 3 in that cell.

**Kill condition.** The family closes at Stage 0 unless the extreme cell — largest notional,
strongest withdrawal — is both **net positive after 16 bps** and **resolvable at t = 3**, and
the conditioner is monotone within the top notional bucket. A cell that clears the floor on a
point estimate it cannot resolve is not a pass; that defect was found and fixed in AH-050 and
must not recur here.

## Safety boundary

Read-only. No network, no live/paper, services, collectors, configs, coordinator, approval,
KILL, secrets, orders, accounts or positions. Nothing written to the server. No raw market data
committed.

The burst gap, the decile cut, the quintile counts, the conditioner, the direction, the entry
reference, the horizons and the cost floor are frozen above. Searching over any of them is a
parameter search and requires a new task with a new identity.

## Acceptance

If Stage 0 passes, Stage 1 requires: the declared cell evaluated on the sealed segment;
positive net mean and median after 16 bps; non-negative median at 32 bps; a two-sided matched
null at p < 0.05 against a control drawn at the identical selection rate; survival of
remove-best-symbol and remove-best-day; no symbol above 25 percent of contribution; both
neighbour horizons non-negative; monotonicity reproduced out of sample; and a measured exact
ledger overlap against AH-046 and AH-048.

If Stage 0 fails, the result is `STAGE_0_INFEASIBLE` or `UNDERPOWERED` and the conditioning
route closes with the measured gap stated explicitly.

## Deliverables

1. `scripts/analysis/ah051_sweep_depth_double_sort.mjs`
2. `scripts/test_ah051_sweep_depth_double_sort.mjs`
3. `reference/AH051_SWEEP_DEPTH_DOUBLE_SORT_PROTOCOL_2026-08-04.md`
4. `data/ah051_sweep_depth_double_sort_2026-08-04.{csv,json}`
5. `tasks/results/TASK-AH-051-SWEEP-DEPTH-DOUBLE-SORT-V0-RESULT.md`

Run syntax, deterministic tests, static no-trading scan, the replay the gate permits, and
`git diff --check`. Commit only the allowlisted deliverables. Push requires separate approval.
