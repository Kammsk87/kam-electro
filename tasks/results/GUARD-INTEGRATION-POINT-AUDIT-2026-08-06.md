# Where the paper order decision lives, and why the guard cannot be wired into it — AUDIT

**Verdict: `NO_VIABLE_INTEGRATION_POINT_EXISTS`.**
**Not a permissions problem. The ledger has no quantity for the guard to improve.**

## The point, located

`/opt/botalin-edge/scripts/shadow_runner.mjs:184`, running continuously since 2026-07-29 as
`botalin-shadow.service` ("signals-only forward runner, KEYLESS, no execution keys"):

```js
const filled = bar.low <= p.entry && bar.high >= p.entry;
```

That is the entire fill decision. Everything downstream — `autonomous_paper_factory_conveyor.mjs`,
the nine `logs/paper_factory/*/evaluations.jsonl` streams — is explicitly **read-only over that
output**. Its own header says so: *"PAPER-ONLY. HARD: no orders... Strategy candidates are
READ-ONLY VIEWS over the existing (protected) shadow_trades stream — no new emitter, no new
orders."* It carries a `safeWrite` sandbox that refuses any write outside `logs/paper_factory/`,
and lists `logs/shadow_trades.jsonl` as `FORBIDDEN_WRITE`. There is no order decision in the
paper factory to intercept.

## Four reasons the guard cannot go in there

**1. There is no entry slippage to improve — by construction.**

A live record, taken from the tail of the log:

```json
"entry": 0.02561468, "signal_price": 0.02561468, "entry_fill_price": 0.02561468,
"slippage_vs_signal_bps": 0, "slippage_model": "shadow_entry_touch"
```

Entry, signal price and fill price are the same number. Across the whole stream —
**85,648 records, every one at exactly 0** — there is not a single non-zero entry slippage.

The guard improves the entry price. In this ledger the entry price is *defined* as the signal
price. Wiring the guard in would return exactly 0.0000 bps, and it would read as the guard
failing rather than as the ledger having nothing to give.

**2. There is no moment at which to evaluate the predicate.**

`tf: "5m"`, and `ts_open` is the bar boundary — `2026-08-05T21:00:00.000Z`, exactly. The fill
happens somewhere inside a 300-second bar and the model does not know where.

The guard needs an instant. We measured what happens when it does not get one: at 10 seconds of
staleness the effect is down to 19 percent of aligned, and the decay from 0 to 2.5 s is already
40 percent. At 300 seconds there is nothing left to measure. The bar model and the guard operate
three orders of magnitude apart in time.

**3. The entry is maker; the guard is about taker.**

`costFrac` resolves to `perpRoundTripCost({ entry: 'maker', exit: ... })`. A resting maker order
does not cross the spread. The guard's mechanism — stepping into aggressive flow that is still
arriving against a thinning book — is a property of crossing it. Different object.

**4. It is a protected path.**

`shadow_runner.mjs` is a runner. The root safety rules forbid altering runner, strategy, factory,
risk or PnL files unless the current task names those paths. No task does.

Reasons 1–3 stand regardless of reason 4. Lifting the permission would not make the integration
meaningful.

## One number in the code that is not evidence

`autonomous_paper_factory_conveyor.mjs:176` carries the comment *"net edge thin vs live 24-60bps
slippage"*. If real entry slippage were 24–60 bps, a guard worth 0.05 bps would be improving
roughly 0.1 percent of it, and that would be decisive.

It is not backed by anything in these logs — all 85,648 records are zero. The comment appears to
refer to the tokenized-stock smoke executor, a different venue with a different microstructure.
It is worth resolving, because if it is real it dominates every execution number the programme
has produced. It is not worth quoting until it is.

## What would actually be required

An intent stream that has all three of: a **millisecond timestamp**, a **taker** entry, and a
**fill price recorded separately from the signal price**. None of the three exists on the host
today. That is an architecture gap, not a wiring task, and it is larger than the guard.

The honest ordering has not changed since the staleness measurement:

1. a WebSocket feed, worth about +0.025 bps per intent against the current 10-second poll;
2. an intent stream with a named payer — still the binding constraint, because the guard has
   nothing to gate;
3. only then a ledger that can record what a gate does to a real fill.

## Files inspected

Server, read-only: `shadow_runner.mjs`, `autonomous_paper_factory_conveyor.mjs`,
`logs/shadow_trades.jsonl` (62 MB, 85,648 records), `ob_recorder.mjs`, systemd timers.
Nothing was written on the host.
