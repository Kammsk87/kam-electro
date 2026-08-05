# What the live gateway would actually deliver on the current feed — RESULT

**Verdict: `LIVE_FEED_HALVES_THE_EFFECT`.**
**Live estimate: +0.0269 bps per intent, against +0.0537 aligned. Retention 50.1 %.**

The gate does not degrade in live operation. The **feed** does. This measures which, before
anything is built on top of it.

## The assumption the gateway never stated

`execution_gateway.mjs` measures its improvement with the intent arriving **exactly at a book
snapshot**. In the archive that is always true, because the intent stream is generated at the
snapshots. Nothing in live operation grants that.

`ob_recorder.mjs` polls the book every 10,000 ms. An intent arriving at an arbitrary moment sees
a book stale by *u*, uniform on [0, 10 s), mean 5 s — and the guard decision is made on that stale
book while the baseline it is measured against executes at the **current** price.

`LAW.EXEC.STALENESS` already said 54 percent of the guard's separation is gone by five seconds.
If that carries across, the live figure is about half — and a live runner reporting it would look
exactly like a law that had decayed.

## Result

Same archive, same nine symbols, no live service and no new data. ~445,000 intents per offset.

| staleness at decision | mean improvement | t | retention |
|---:|---:|---:|---:|
| 0 ms (aligned control) | 0.05366 | 20.4 | 100 % |
| 2,500 ms | 0.03243 | 13.8 | 60.4 % |
| 5,000 ms | 0.02290 | 11.1 | 42.7 % |
| 7,500 ms | 0.01508 | 9.1 | 28.1 % |
| 9,900 ms | 0.01033 | 9.8 | 19.3 % |

**Live estimate, averaging over the cycle: 0.02688 bps. Retention 50.1 percent.**

**The pre-registered prior was 0.027**, derived by carrying the measured staleness retention at
the 5 s mean offset straight across. Measured 0.0269 — **0.05 standard errors from the prior**.
After the gateway prior missed by 17.8 se, this one is essentially exact, and the assumption
being tested — that separation-decay and entry-improvement-decay run at the same rate — survives
its first test.

The internal check also passes: at 9,900 ms the baseline executes almost exactly when the first
wait candidate fires, and the effect collapses to 19 percent as it must if the harness is wired
correctly.

## What this costs, in one line

A live paper runner built on today's recorder would report **0.027 bps** and someone would
reasonably conclude the law had halved. It has not. The 10-second poll is the binding constraint.

## The sub-second curve, and what it makes worth building

*Post-hoc and descriptive — the frozen grid above carries the verdict; this only informs the
build decision.*

| staleness | retention |
|---:|---:|
| 100 ms | **96.1 %** |
| 250 ms | 92.1 % |
| 500 ms | 87.5 % |
| 1,000 ms | 79.3 % |
| 2,000 ms | 64.8 % |

At a WebSocket's ~100 ms the effect is **essentially intact**. So the live figure moves from
0.0269 to roughly 0.0516 — the feed upgrade is worth about **+0.025 bps per intent**, which is
more than the entire gain the skip policy was measured to deliver.

That inverts the build order. The thing to write is not a runner over a 10-second REST poll; it
is the **WebSocket feed**. A runner over the current feed would spend 24 hours to produce a number
this document already gives, and give it half.

The original instinct to open with a WebSocket collector was right — for the **live layer**. It
was wrong only for the **replication**, where changing the grid would have redefined the frozen
30-second cap into 300 milliseconds. Two different layers, two different correct answers, and the
distinction is what this measurement makes concrete.

## What this does not say

**It does not replace the 12 August replication.** This measures what the live number will be if
the law holds. Whether it holds is a separate question, still answered on the 10-second grid, and
still requiring the pre-registered 10 days.

**It does not measure a real WebSocket.** The 96 percent figure is what the archive says about a
100 ms-stale decision. An actual feed brings reconnects, gaps, sequence resets and a latency
distribution with a tail — none of which are in this simulation and all of which can only lower
it.

**And it does not make the gate a strategy.** 0.05 bps is still 0.05 bps against a 16 bps round
trip. Doubling the live figure doubles a small number.

## Files

- `scripts/analysis/live_feed_staleness_simulation.mjs`
- `scripts/test_live_feed_staleness_simulation.mjs` — 16/16
- `data/live_feed_staleness_simulation_2026-08-06.{csv,json}`
