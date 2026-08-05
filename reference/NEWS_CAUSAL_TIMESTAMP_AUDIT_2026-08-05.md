# News lane — causal timestamp audit, 2026-08-05

Read-only inspection. Nothing written to the server. No live, paper, service, collector,
config, coordinator, approval, KILL, secret, order, account or position path.

This was the pre-declared decision checkpoint recorded against `GAP.NEWS.TAGGER_V2`. The check
set in advance was: **does every event carry our own `first_seen_at`, captured when our
infrastructure received it?** If not, fail immediately rather than measure the latency of our
own parser.

## The check passed

`/mnt/data-vol/news-lab/events.jsonl`, written live by `news_recorder.mjs`, whose header states
`first_seen_at ОБЯЗ.` and whose write path sets it to the ingest instant:

| | |
|---|---|
| events | 227 |
| `first_seen_at` populated | **100 %** |
| forward (not initial scrape) | 187 |
| initial scrape (bulk seed, not causal) | 40 |
| span | 2026-07-14 .. 2026-08-05, still writing |

Records also carry `detect_delay_ms`, `published_parse_confidence`, `source_tier`, `severity`
and `revision` — the schema is better than the gap record implied.

The separate **historical archive** is unusable and honestly self-labelled: 1,251 rows with
`first_seen_at=null` on every one, plus `not_forward=true` and `not_tradeable_timing=true`. Its
manifest says so in the schema line. Nobody tried to pass it off as causal.

## The lane is blocked anyway, three times over

### 1. Detection delay is not a lag, it is a chasm

`detect_delay_ms` is recorded per event, so this needed no reconstruction.

| percentile | minutes |
|---|---:|
| p05 | **−464.5** |
| p25 | 5.9 |
| **p50** | **12.2** |
| p75 | 401.0 |
| p95 | 1,169.4 |
| max | 10,126 |

Seen within one minute: **10.7 %**. Within five: **21.9 %**.

The window of primary asymmetry the hypothesis targets is closed before we arrive, in roughly
four cases out of five.

The negative p05 confirms on live data the *future-dated `published_at`* already recorded as a
known gap: for part of the sample the publication timestamp is later than our own observation,
which is impossible unless the source timestamp is wrong. `first_seen_at` is unaffected — it is
ours — but any study anchored on `published_at` would be anchored on a broken clock.

### 2. Joinability to our market data is one event in ninety-four

| | |
|---|---:|
| mechanism events carrying symbols (listing / delisting / margin_change) | 94 |
| distinct symbols extracted from them | 104 |
| of those present in the 40-symbol tick archive | **1** (`AERGOUSDT`) |
| **events joinable to our market data** | **1 of 94** |

The cause is structural rather than a coverage accident: **75 of the 94 are new listings**, and
a newly listed symbol has no price history before its own announcement. We record 40 symbols;
announcements concern the venue's whole universe.

### 3. The symbol extractor is broken

The most frequent extracted "symbol" is **`UTC`**, five occurrences. Also present: `00AM`,
`APPSTOCK`, `CBK`, `FLIP`, `FUEL`, `OL`, `PAAL`, `STREAM`. These are fragments of title text
such as *"at 10:00AM UTC"*.

The `symbols` field is therefore untrustworthy even where it is non-empty.

## Why the three do not add up to one fixable problem

They are not independent, and fixing any one does not release the others.

- Remove the delay and there is still nothing to join.
- Fix the extractor and joinable events move from one to roughly two.
- Widen the recorded universe and a new listing still has no history by construction.

The reachable subset is delistings and margin changes **on symbols we already record** — 31
events over 22 days before the joinability filter, approximately zero after it.

## Disposition

`CD.NEWS_LANE`, `DATA_BLOCKED`, subject `GAP.NEWS.TAGGER_V2`.

The reopen criterion has three clauses and the third decides: a fixed extractor with zero junk
tokens; more than 30 percent of mechanism events joinable to the local archive; and **direct
evidence that the residual price move remaining after our actual measured detection delay — at
the p50 of the ingest lag, not an assumed one — still exceeds the audited 16 bps round trip.**

A faster feed does not qualify on its own. The reopen must show the money that survives the
delay we actually have.

## Method note

The check we set in advance was the wrong check, and that is worth recording rather than
smoothing over. `first_seen_at` was treated as the blocker and it was present and correct. The
lane dies on quantities nobody had named: delay distribution, universe overlap, extraction
quality.

The pattern from the past four tasks holds again — the decisive finding came from checking
whether the data can support the question, not from modelling the answer.
