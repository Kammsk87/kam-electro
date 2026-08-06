# Two forward collectors for `GAP.OI_LIQ.FINE_GRAIN` — BUILD RESULT

**Status: `BUILT_AND_SMOKE_TESTED_LOCALLY. NOT INSTALLED ON THE HOST.`**
**Tests 22/22. Installation needs explicit authorization — see §6.**

## What was verified against the live venue before either file was written

**`allLiquidation.{SYMBOL}` exists and streams.** Subscribe ACK success; a real frame captured:

```json
{"topic":"allLiquidation.ADAUSDT","type":"snapshot","ts":1786014947330,
 "data":[{"T":1786014946933,"s":"ADAUSDT","S":"Sell","v":"13248","p":"0.1915"}]}
```

That exact frame is now a test fixture, so the parser is tested against what the venue actually
sends rather than against what a specification imagined.

**Open interest updates continuously, and the 5.6-minute cadence was throwing resolution away.**
Four polls of `/v5/market/tickers` at 12-second spacing returned **four distinct** open-interest
values for every major symbol, and **436 of 801 symbols moved within 36 seconds**. One request
returns every linear symbol, so a 10-second cycle across the whole universe costs exactly **one
HTTP call per cycle** — the same load the existing recorder places, thirty-four times more often.

## Two design rules that shape the archive permanently

**Record raw, interpret never.** The `S` field's meaning — whether `"Sell"` denotes a liquidated
long or the side of the liquidating order — changed between Bybit's old `liquidation` topic and
this one. A recorder that resolves that ambiguity bakes a possible sign inversion into the archive
forever. Every exchange field is stored under its own name; direction is resolved at analysis
time, against price, where it can be checked. **A test asserts that no field named `side`,
`side_liquidated`, `direction` or `isLong` is ever written.**

**Absence must never be ambiguous.** Three record types exist for that reason alone:
`_gap` on every disconnect, carrying the exact missing interval; `_fail` on every failed OI cycle,
because a hole in the file is indistinguishable from a market that did not move; and `_alive`
heartbeats, for the reason in §4.

## A defect found by running, not by reading

The first smoke run connected, subscribed, and wrote **nothing** for 75 seconds — because no
liquidation happened. **The day file did not exist at all.**

An archive like that cannot distinguish *"up, and the market was quiet"* from *"the service was
down"*. It is the same failure the gap record prevents, in the opposite direction, and it would
have silently corrupted every future study by making outages look like calm.

Fixed with a `_alive` heartbeat every 5 minutes plus one stamped immediately on connect. Re-run
confirms the day file now exists from the first second:

```json
{"_alive":true,"ts":1786015247800,"symbols":10,"connected_since":1786015247799,"records_so_far":0}
```

**Ninth harness defect in this programme, and again found by running.**

## A constraint worth knowing before installation

Node 20.20 — the version on both this machine and the host — has **no global `WebSocket`**, and
the `ws` package is not installed there with npm unavailable offline. The recorder therefore
requires `node --experimental-websocket`. It throws a named error rather than crashing obscurely
if launched without it.

## Why this is not installed, and what installing means

The root safety rules forbid deploying production services. Installing a persistent process that
writes to a shared research host is a deployment, whatever its payload, so it stops here and
waits for a word.

What installation would involve, all read-only against public market data with no keys and no
orders:

1. copy both files to `/opt/botalin-edge/scripts/collectors/`;
2. two systemd units, launched with `--experimental-websocket`, writing to
   `logs/liquidations/` and `logs/oi_10s/`;
3. disk: OI is ~13 MB/day for the 37-symbol universe. Storing all 801 symbols would be ~277 MB/day
   at zero extra request cost — the trade is documented in the module rather than left to be
   guessed at later.

## What the collection will and will not deliver

Observed rate: 2 liquidation messages in 50 seconds across 10 symbols, then 0 in 75 seconds.
Sporadic and bursty, which is what a cascade process looks like — but it means **flagged events
will be rarer than the 283 unflagged ones already collected**, not more common.

The bar remains what `CD.OI_COLLAPSE_REVERSION` set for the mirror event: roughly **140 days**,
against the 25 we have. Starting today makes that reachable around **late December 2026**. Nothing
about building the collectors shortens it — collection is the only thing that ever could, which is
exactly why it should start now rather than after the next hypothesis needs it.

## Files

- `scripts/collectors/liquidation_recorder.mjs`
- `scripts/collectors/oi_high_freq_recorder.mjs`
- `scripts/test_collectors.mjs` — 22/22
