# Three tracks — TRIAGE AND BUILD

**Track C built and running against the live archive. Track A blocked on a threshold defect.
Track B closed in its wide form, open and measurable in its narrow one.**

## Track C — collector health audit — BUILT, `HEALTHY`

`scripts/analysis/check_collector_health.mjs`, 16/16, run against the deployed recorders 36
minutes after they started:

| liquidations | | open interest | |
|---|---|---|---|
| heartbeats | 8, **0 missed** | cycles | 223, **0 failures** |
| worst beat gap | 300,019 ms | median interval | **10,002 ms** |
| gaps | 0 | request p95 | 994 ms |
| liquidations | 23 | absent symbols | `AERGOUSDT` |
| feed latency med / p95 | **325 / 488 ms** | status | `HEALTHY` |

**The specification's own audit function would have reported `HEALTHY` on a completely broken
archive.** It reads `r._type === '_alive'` and `r.gap_ms`; the recorder writes `_alive: true` and
`missing_ms`. Neither field exists, so every record falls through, `aliveCount` and `gapsCount`
stay at zero, and `gapsCount === 0` returns `HEALTHY`. A monitor that cannot fail is worse than no
monitor, because it manufactures confidence.

The built version asserts **shape first**: every record must match a known kind, and anything
unrecognised is counted as `UNKNOWN_RECORD_SHAPE` and fails the audit. A test feeds it the
specification's exact `_type`/`gap_ms` records and asserts `DEGRADED`. Schema drift in the
recorder therefore surfaces as a failure rather than as a quietly emptier report.

Two further checks the specification did not ask for and this archive needs:

- **A quiet market is not a fault.** Zero liquidations with heartbeats intact returns `HEALTHY`
  deliberately. Only a *missing beat* is a fault. Getting this wrong in either direction was the
  whole point of the heartbeat.
- **The interpretive-field ban is enforced at the archive, not only at the writer.** If `side`,
  `direction` or `isLong` ever reaches disk the audit fails, without trusting the recorder's own
  tests to have held.

## Track A — `SimpleSpreadGateway` — the fixed threshold breaks it

The measurement is real: the spread control captured **97.3 percent** of the guard at t = 0.49
difference. But the rule that did it was **relative** — wait if the spread widened against the
previous snapshot, clear when it comes back to or below where it started. The specification
replaces it with a **fixed 3.5 bps threshold**, and that is a different rule on a quantity whose
scale varies fourteenfold across this universe.

Measured, on the same forward span:

| symbol | median spread | % of time in VETO at 3.5 bps |
|---|---:|---:|
| AAVEUSDT | 1.09 | 0.0 % |
| AVAXUSDT | 1.51 | 0.0 % |
| BNBUSDT | 1.70 | 0.0 % |
| ARBUSDT | 1.23 | 0.5 % |
| BSBUSDT | 1.48 | 16.3 % |
| B3USDT | 6.67 | 75.5 % |
| AMATUSDT | 14.13 | **99.1 %** |
| ADAUSDT | 5.23 | **100.0 %** |
| BILLUSDT | 4.31 | **100.0 %** |

**Three symbols sit in permanent VETO and a fourth for three-quarters of the time.** Under
`WAIT_UP_TO_30S_THEN_FORCE` those trade at forced execution on essentially every intent — the gate
contributes nothing but thirty seconds of delay, which is strictly worse than no gate. On the four
tightest symbols it never fires at all. There is no symbol where a 3.5 bps threshold does the job
the measurement credited.

The relative rule is **scale-free**, which is exactly why it held across a 1.09-to-14.13 range.
This is the same defect as the ≥1.0 tick/sec liquidity gate refused earlier: a fixed
cross-sectional cut on a quantity that is not cross-sectionally comparable.

Also, `(ask − bid) / ask` differs from the measured `(ask − bid) / mid`. Small, but the published
0.0747 was produced with the mid.

**The fix is to keep the rule that was measured.** Ship the relative comparison; if a threshold is
wanted, it has to be per-symbol and expressed as a quantile of that symbol's own recent spread,
and then it is a new rule needing its own measurement.

## Track B — funding pre-clearing — closed wide, open narrow

`CD.FUNDING_VELOCITY`, `CLOSED_MEASURED`, TASK-AH-052, decided **2026-08-05**, on 35,029
60-second snapshots over 232 assets:

> Movement in the 30 minutes either side of the 8-hour funding settlement is **60.75 bps against
> 64.14 in matched control windows — a difference of −3.38 bps at t = −1.23**, so settlement
> windows move if anything **LESS**, against a rebalancing thesis that predicts more. An
> independent recomputation on BTC alone in a different language gave +0.84 bps, equally
> indistinguishable from zero.

The proposed mechanism — longs closing before settlement, shorts entering to collect — *is* that
rebalancing thesis, and at ±30 minutes it was measured to move less than control.

**But the proposed window is T−60 s to T−5 s, which is 65 times narrower.** A 55-second impulse
would be diluted to invisibility inside a 30-minute average. That is a genuine structural
difference, not a silent retry, and it qualifies under R4 as a new model identity.

It is also **measurable today**, unlike Track B's liquidation cousin: tick prints are
millisecond-stamped, settlements fall at 00:00 / 08:00 / 16:00 UTC, and the funding rate at each
settlement is in the OI archive. Roughly 66 settlements per symbol across the 22-day tick span.

Two things it must carry to be worth running, both learned from the closure it descends from:

1. **A matched control window**, because the wide measurement's entire finding was that
   settlement windows are *not* special once you compare them to something. A pre-settlement
   move of 8 bps means nothing without the same measurement at T−60 s before a non-settlement
   hour.
2. **A pre-registered floor comparison.** The wide study's forward move by velocity quintile
   topped out at 6.07 bps against the 16 bps floor. A 55-second window has less time to
   accumulate, not more, so the honest prior is *below* that.

Not built. It is a measurement, and it deserves its own frozen expectation before an engine
exists, the same way every other one this week did.

## Files

- `scripts/analysis/check_collector_health.mjs`
- `scripts/test_check_collector_health.mjs` — 16/16
