# Botalin cost model audit — 2026-08-04

Research only. No network, no server, no execution. Every figure below is taken from a
committed file in this repository or computed from a committed artifact; each is cited.

## Why this audit was run

Six hypothesis families were closed in the current programme, and every one of them closed
for the same reason: a measurable effect smaller than the round-trip cost floor. The closest
approach was TASK-AH-048, whose sweep-continuation mirror reached 8.94 bps against an 11 bps
floor — 81 percent of the way there.

That pattern makes the floor itself the binding parameter of the entire research programme.
It had never been audited. The constant `11` appears independently hardcoded in six engines
with no derivation and no source:

| file | constant |
|---|---|
| `scripts/analysis/ah019_liquidation_toxic_flow_fade_1m.mjs:64` | `cost_bps_roundtrip: 11` |
| `scripts/analysis/ah041_triad_structural_strategies.mjs:35` | `cost_bps_gross_roundtrip: 11` |
| `scripts/analysis/ah046_parent_order_flow_imbalance.mjs:29` | `cost_bps_roundtrip: 11` |
| `scripts/analysis/ah048_large_sweep_forced_flow_fade.mjs:36` | `cost_bps_roundtrip: 11` |
| `scripts/analysis/simple_pairs_relative_value_v0.mjs:34` | `cost_bps_both_legs: 22` |
| `scripts/analysis/market_neutral_funding_carry_v0.mjs:38` | `cost_bps_both_legs: 22` |

There is no single source of truth for it anywhere in the repository, and no file states what
it is composed of.

## What the constant actually is

`11` is a **fee-only** figure: two taker legs at the standard perpetual taker rate. It contains
no spread and no slippage. The repository's own reconciliation says so directly.

> conservative taker model 0.250 RT была жестче реального Bybit VIP0 около 0.160 RT
> — `BOTALIN_RESEARCH_SUMMARY_FOR_EXTERNAL_AI_2026-07-18.md:276`

0.160 percent round trip is **16 bps**, not 11. The 5 bps difference is exactly the execution
component our constant omits, and the repository has measured that component on real fills:

> Форензика 29 валидных RT: maker slip -1.1bps (improvement), taker +4.46bps, spread 1.1bps,
> adverse<2bps, сверка до цента
> — `docs/BOTALIN_HANDOFF_2026-07-13_REV6.md:17`

Taker slippage 4.46 bps plus spread 1.1 bps is 5.56 bps, which reconciles 11 to roughly 16.6
against the documented 16. The agreement is close enough to treat the decomposition as
established, with the caveat below.

The same forensics line records the operating rule that was actually adopted for live trading:

> правило: taker только при expected edge >0.13%/RT

**13 bps.** The project's own live-derived threshold for taking a taker trade is already
higher than the 11 bps floor all research has been measured against.

### Three independent figures, none of them 11

| figure | value | source |
|---|---|---|
| research constant, fees only | 11 bps | six engines, no derivation |
| live operating rule for taker entry | 13 bps | fill forensics, n=29 round trips |
| documented realistic VIP0 all-in | 16 bps | fee-tier reality check, 2026-07-18 |
| previous conservative model | 25 bps | same, superseded |

### Caveat on double counting

Whether the measured 1.1 bps spread is already contained inside the 4.46 bps taker slippage
depends on the reference price the forensics used, which is not recorded. If slippage was
measured against mid, the half-spread is inside it and the components should not be added.
This is why the audit does not publish a new point estimate of its own and instead adopts the
16 bps figure that the repository already reconciled against a real fee schedule.

## Re-evaluation of every closed result

Gross figures are read from the committed artifacts, not restated from memory.

| result | gross | legs | vs 11 | vs 13 | vs 16 |
|---|---:|---:|---:|---:|---:|
| AH-046 parent order flow imbalance, OOS n=56,073 | +0.07 | 1 | −10.93 | −12.93 | −15.93 |
| AH-048 sweep continuation 900s, train n=3,050 | +8.94 | 1 | −2.06 | −4.06 | −7.06 |
| AH-048 sweep continuation 300s | +6.80 | 1 | −4.20 | −6.20 | −9.20 |
| AH-048 sweep continuation 60s | +7.56 | 1 | −3.44 | −5.44 | −8.44 |
| AH-010 carry, hedgeable subset, 168h | +14.90 | 2 | −7.10 | −11.10 | −17.10 |
| AH-019 maker fill at 60s, before fees | −1.07 | 1 | −12.07 | −14.07 | −17.07 |

The closest approach, AH-048 at 900s, falls from 81 percent of the floor to 69 percent under
the live rule and 56 percent under the realistic all-in cost.

**No closed result reopens. Every one of them closes harder.** The correction is therefore
directionally safe for the existing record and no re-run is required to preserve any verdict.

## The maker escape route is independently closed twice

The obvious response to a taker floor is to stop paying it. That route was already tested and
it does not open.

**First closure, from the fee schedule.** The repository states plainly:

> spread меньше maker fee на большинстве ликвидных символов
> — `BOTALIN_RESEARCH_SUMMARY_FOR_EXTERNAL_AI_2026-07-18.md:141`
>
> passive maker не имеет положительного ожидания при наших fee/latency/data
> — same file, line 139

Median spread is measured at 1.12 bps (`BOTALIN_PROJECT_AI_HANDOFF_2026-07-22.md:318`). A
passive order that captures less than it pays in fees is a losing structure before any market
risk is taken.

**Second closure, from our own measurement.** The maker-fill probe recorded as
`LAW.EXEC.BID_FILL_ADVERSE_SELECTION` measured −1.07 bps across 4,965 placements at a 28.7
percent fill rate, **before fees**, at t = −9.07. The half-spread captured was +0.72 bps and
the forward move against the filled side was roughly threefold that. Adding a maker fee makes
it more negative.

These two are genuinely independent: one is an arithmetic comparison of spread against a
posted fee, the other is an outcome measurement conditional on fill. They agree.

## What this audit changes

1. **The floor is hard, not soft.** It cannot be moved by better execution at our tier. The
   hypothesis that motivated this audit — that a lower true cost would reopen AH-048 — is
   refuted, and refuted in the wrong direction.

2. **The research floor is understated by roughly 5 bps.** Any future task must use 16 bps for
   a single-leg taker round trip and 32 bps for two legs, with 11/22 retained only as an
   optimistic bound for comparison against the historical record.

3. **The existing record stands.** Because the correction only deepens every closure, no
   completed result requires re-running. The six engines keep their frozen constants so their
   published numbers remain reproducible; the corrected floor applies going forward.

4. **Short-horizon research at this fee tier is not viable as a category.** A 16 bps all-in
   round trip against measured 5-minute dispersion means a candidate needs an effect an order
   of magnitude larger than anything the programme has found. This is a statement about our
   cost position, not about the market.

## What remains open, and what would change the answer

Only three things can move a floor that execution cannot:

- **A structurally different cost position** — a higher VIP tier, a maker rebate, or a venue
  with a different schedule. The repository already named this as the precondition for
  revisiting basis work: *"не возвращать без нового структурного преимущества: maker rebate /
  VIP / новая площадка / новый тип капитала"* (`docs/BOTALIN_GAPS_AND_CAPITAL_PLAN_2026-07-12.md:327`).
  This is a business decision, not a research finding.

- **A longer holding horizon**, where a fixed round trip amortises against a larger move. This
  is the direction `LAW.COST.HORIZON_VS_ROUNDTRIP` already points to, and it remains the only
  route the current cost position permits.

- **A much rarer and larger event.** Not a better filter on common events — a genuinely
  different event class whose moves are measured in tens of basis points.

What this audit could **not** determine from committed data is the exact maker fee rate at our
current tier. It is not recorded anywhere in the repository. This is logged as a data
constraint. It does not change the conclusion, because both maker closures above hold at any
non-negative maker fee, but it does mean an execution simulator cannot be calibrated without
it.

## Reproduction

The re-evaluation table is arithmetic over committed artifacts:

```
data/ah046_parent_order_flow_imbalance_2026-08-03.json   combined_oos.gross_mean_bps
data/ah048_large_sweep_forced_flow_fade_2026-08-03.json  horizons[*].mirror_continuation_mean_bps
```

All other figures are quoted with file and line above.
