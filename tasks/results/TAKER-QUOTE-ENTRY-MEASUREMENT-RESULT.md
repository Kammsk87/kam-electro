# The guard on the price a taker actually pays — RESULT

**Verdict: `TAKER_GAIN_SURVIVES` — but `PREDICATE_INDISTINGUISHABLE_FROM_SPREAD_RULE`.**
**promising_count: 0. This weakens the gateway rather than advancing it.**

The specification's one genuinely new requirement — fill on the quote, not the print — was
worth building. It changed the picture, though in neither direction anyone predicted.

## Why this had to be measured before anything was built

`execution_gateway.mjs` measures improvement in **trade prints**. A taker does not pay the print:
buying pays the **ask**, selling receives the **bid**. Those move with the spread, which the print
does not see.

The spread in this universe averages **4.9 bps**. The gateway effect is 0.059 bps. **The spread is
eighty times the effect.** A policy that systematically lands the order in a slightly different
spread could erase the whole result — or manufacture it.

## Result

573,595 intents, 9 symbols, the forward span, quote-based fills.

| | mean | t |
|---|---:|---:|
| guard, flow + depth predicate | **0.07682 bps** | 35.6 |
| **spread-only control** | **0.07473 bps** | 20.1 |
| difference | 0.00209 | **0.49** |

**The control captures 97.3 percent of the guard, and the difference is t = 0.49.**

The control never reads flow, never reads depth, never calls `guardState` — a test asserts this
against the source. It waits when the spread widened against the previous snapshot and executes
when it comes back in. That is all.

**On the entry-price application, the flow-and-depth predicate is not distinguishable from a
spread rule.**

## Two priors, both instructive

**The taker prior was falsified, and the reasoning behind it was backwards.** Registered before
the run: 0.02 bps, range 0–0.04, on the argument that vetoed states are liquidity withdrawal,
withdrawal widens the quote, so waiting pays part of the gain back as spread. Measured **0.0768** —
above the print figure, outside the range.

The sign was wrong. The veto state is indeed the wide state, but the guard's ALLOW condition is
substantially a *narrow-spread* condition, so waiting for it lands the order in a **tighter**
quote, not a wider one. Measured: spread 4.905 bps at veto against 4.783 at fill. The taker
collects that narrowing directly; a print-based measure cannot see it at all.

Which is precisely why the taker number came out *higher* — and precisely why it means *less*.

**The control's expectation was also registered in advance**, in the same terms: *"it captures a
minority, under half, because the law's mechanism is flow and depth. A control at or above 0.0768
means the gate is a spread filter wearing a microstructure predicate."* It captured 97.3 percent.

## What this does and does not overturn

**It does not touch `LAW.EXEC.FLOW_DEPTH_AGREEMENT_PREDICTS_ADVERSE`.** That law is about the
60-second forward move after a state — +0.715 bps separation, four splits, remove-best passing. A
different quantity on a different horizon. Nothing here contradicts it.

**It does substantially deflate the gateway.** The gateway's claim was that a wait policy built on
that predicate improves entry. It does. But so does a rule that reads only the spread, by the same
amount, and the spread rule is simpler, cheaper, needs no depth feed, and has no law behind it to
maintain. On this application the predicate is carrying no measurable weight.

**And the earlier random-wait control does not rescue it.** That control answered "is waiting worth
anything by itself?" — no, 0.0002 bps. It never asked "is this predicate worth anything over a
cruder state rule?" Any market-state rule beats a random one. The comparison that mattered was
never run until now.

## A bound the gateway does not enforce

`resolveWait` counts **snapshots, not milliseconds**. Across a tape gap, three snapshots can span
far more than 30 seconds. Measured: **697 waits of 74,342 — 0.94 percent — exceed the nominal
30-second cap.** Small, real, and previously unreported. Now measured and printed on every run.

## Defects in the specification as written

**The forced-execution fallback violates the spec's own Test D.** `futureSnaps[futureSnaps.length - 1]
|| snapshotT0` falls back to the *signal* snapshot when the tape runs out, making baseline and
guarded identical and recording a fabricated zero as though it were an observation. Test D asks for
"защита от вылета на границах массива (без клампинга к чужим ценам)" and the reference
implementation clamps. This is the same defect already fixed once in `resolveWait`, returning in a
form that does not crash — which is worse, because it biases the mean silently instead of stopping.

**`Math.random()` and `Date.now()` in `intentId`** make runs non-reproducible. Every measurement in
this programme has to be re-runnable to the same numbers.

**API names do not match**: the gateway exports functions, not an `ExecutionGateway` class; the fee
module is `scripts/analysis/cost_model.mjs`, not `lib/fee_schedule_module.mjs`; `requireFloor`
returns `bps` inside a citation object and deliberately exposes **no** bare-number accessor, so
`this.feeSchedule.floorBps` is undefined by design.

**And the acceptance criterion is backwards.** It requires the run to come out "жестко совпав с
результатами прогона G3 (+0.0591 bps)". A measurement that must reproduce a previous number is not
a measurement. Under that criterion this run — the correct one, on the price a taker actually pays
— returns 0.0768 and would have been rejected as a bug.

## Where this leaves the execution layer

The honest ordering is now shorter than it was:

1. **The gateway is not the asset it looked like.** Before any further build, the predicate has to
   beat the spread rule or be replaced by it.
2. The WebSocket feed still doubles whatever the execution layer is worth — but that is now a
   question about a 0.075 bps effect available from a two-line spread rule.
3. The intent stream with a named payer remains the binding constraint. It has not moved.

The 12 August replication is unaffected: it tests the law on forward moves, not the gateway on
entry prices.

## Files

- `scripts/analysis/taker_quote_entry_measurement.mjs`
- `scripts/test_taker_quote_entry_measurement.mjs` — 22/22
- `data/taker_quote_entry_measurement_2026-08-06.{csv,json}`
