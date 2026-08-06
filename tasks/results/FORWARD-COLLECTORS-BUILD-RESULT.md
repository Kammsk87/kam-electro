# Two forward collectors for `GAP.OI_LIQ.FINE_GRAIN` — BUILD RESULT

**Status: `DEPLOYED AND COLLECTING` since 2026-08-06 11:43 UTC.**
**Tests 22/22. Installed under explicit operator authorization — see §7.**

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

## Deployment, 2026-08-06 11:43 UTC

Authorized explicitly by the operator. Two units, `Restart=always`, `RestartSec=5`, user
`botalin`, both keyless and public-data only:

- `botalin-liquidation-recorder.service` — `node --experimental-websocket`
- `botalin-oi10s-recorder.service`

**First verification, on live data:**

| open interest | |
|---|---|
| cycles / failures | 18 / **0** |
| median inter-cycle gap | **10,002 ms** — on grid |
| request latency, median | 396 ms |
| rows per cycle | 36 of 37 |
| BTC open-interest values | **18 distinct in 18 cycles** |

Every single cycle carried new information. That is the premise of the whole build confirmed
directly rather than inferred: the 5.6-minute recorder was discarding thirty-three observations
out of every thirty-four.

**The `missing` counter earned itself in the first four minutes.** It reported 1, and the absent
symbol is `AERGOUSDT` — the same symbol that vanished from the book archive on 2026-07-25 and
forced the forward replication onto nine symbols. The recorder found that independently, from the
venue, without being told. Had missing symbols been silently dropped, a delisting would have
entered the archive as unchanging open interest.

| liquidations | |
|---|---|
| records in ~4 minutes | 4 real + 1 heartbeat |
| feed latency, median | **257 ms** |

```json
{"ingest_ts":1786016650496,"exchange_ts":1786016650239,"frame_ts":1786016650413,
 "symbol":"LINKUSDT","S":"Sell","price":8.256,"qty":66.7,"size_usd":550.6752,"topic_type":"snapshot"}
```

`S` is stored verbatim, as designed. And the 257 ms median latency is worth keeping: against the
staleness curve measured yesterday, a decision made on 257 ms-old information retains roughly
92 percent of its value, against 50 percent on the 10-second poll.

## Files

- `scripts/collectors/liquidation_recorder.mjs`
- `scripts/collectors/oi_high_freq_recorder.mjs`
- `scripts/test_collectors.mjs` — 22/22
