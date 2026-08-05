# B7 — open-interest collapse on a rising price, reconnaissance

Read-only stream over `EDGE.DATA.HL_CASCADE`. Nothing written to the server. No live, paper,
service, collector, config, coordinator, approval, KILL, secret, order, account or position
path. Train-derived thresholds only.

This was the single remaining directional target on the open-directions register.

## Step 1 — degeneracy check, run before any return was measured

The funding cutoff of the same day collapsed because its series is quantised: 60 percent of
observations tied into one bucket. Step 1 asked the same question of the three quantities B7
needs, first.

| quantity | distinct | exact ties | quintile sizes | ratio | |
|---|---:|---:|---|---:|---|
| ΔOI over 15 min | 96.4 % | 3.6 % | 210180 / 210183 / 210173 / 210184 / 210150 | **1.00** | balanced |
| mark − oracle gap | 71.5 % | 28.5 % | 210244 / 210119 / 205876 / 217235 / 207396 | **1.06** | balanced |
| ΔPrice over 15 min | 86.6 % | 13.4 % | 210180 / 210168 / 210190 / 210183 / 210149 | **1.00** | balanced |

Worst imbalance **1.06**, against **16.08** for funding velocity. Open interest is a float and
behaves like one. n = 1,050,870 per quantity.

Worth noting for later work: the mark−oracle gap has a standard deviation of **13.06 bps** with
p05/p95 at −9.5/+10.6 — real dispersion, unlike the perp-spot basis, which sits at 1.4–1.7 bps
on majors. The two are different objects.

Step 1 passed, so step 2 ran.

## Step 2 — the event study

Declared before measurement:

| | |
|---|---|
| event | ΔPrice₁₅ > +2σ **and** ΔOI₁₅ < −2σ, both within asset |
| σ | computed on the train segment only, first 55 % by time, applied throughout |
| direction | **SHORT** — a rise funded by short capitulation has no position behind it |
| primary horizon | 5 min; 1 and 15 are fixed neighbours |
| overlap | events ≥15 min apart per asset, so windows cannot inflate n or t |
| floor | 16 bps, single leg |
| neighbours | the mirror event traded LONG; the subset with a top-quintile \|gap\| |

### Primary: price up, OI collapse, traded SHORT

283 events across 29 assets.

| horizon | n | mean | median | t | net @ 16 |
|---|---:|---:|---:|---:|---:|
| 1 m | 283 | −0.41 | +0.15 | −0.17 | −16.41 |
| **5 m** | 283 | **−5.80** | −0.93 | **−1.93** | −21.80 |
| 15 m | 283 | −2.40 | +1.36 | −0.55 | −18.40 |

Severity quintiles at the primary horizon, q4 the largest OI collapse: −10.81, −14.94, +0.03,
−7.83, **+4.55**. Not monotone, and the largest collapses give the *least* reversion.

**The declared direction is refuted.** A negative number means the short lost — price
*continued* upward after an OI collapse on a rising price rather than reverting. The direction
was declared before measurement precisely so this counts as a refutation rather than a
rediscovery, and it is the same shape as TASK-AH-048: declared fade, measured continuation.

### Neighbours

| set | events | best horizon | mean | t | net @ 16 |
|---|---:|---|---:|---:|---:|
| mirror: price down, OI collapse, LONG | 548 | 15 m | **+9.82** | +2.03 | −6.18 |
| primary with top-quintile \|gap\| | 124 | 5 m | −8.69 | −2.32 | −24.69 |

Neither severity profile is monotone. Conditioning on an extreme basis gap made the primary
*worse*, not better.

## Verdict

**The declared hypothesis is excluded, not merely unproven.** The primary's standard error at
the 5-minute horizon is 3.00 bps, so a +16 bps reversion sits **7.3 standard errors** from what
was measured. That is a measured closure of the stated claim.

Nothing anywhere in the run reaches the floor. The largest figure produced by any set at any
horizon is +9.82 bps.

### The one thread that is not excluded

The mirror at 15 minutes — price *down* with OI collapsing, traded long — gives +9.82 bps at
t = 2.03, standard error 4.84. The 16 bps floor is only **1.28 standard errors** away, so this
one figure is genuinely unresolved.

It should not be chased, and the reason is recorded rather than aesthetic. It is a
non-primary horizon of a non-primary event set, selected after the fact because it looked best.
`CD.SELECTION_ON_INSAMPLE_RANK` measured what that selection is worth: across three independent
transitions the in-sample winner landed at the 25th percentile of the next period and went
negative every time. Its severity profile here is also unordered.

Resolving it honestly would need the standard error down to about 2.06 bps, which is roughly
**5–6× the present sample** — on the order of 140 days rather than 25. The archive reaching its
designed 30 days on about 10 August adds 20 percent and changes nothing.

## Consequence

This was the last directional target on the register. Under the criterion set before the run —
*if the reversion is below 16 bps or noise, the directional-alpha research loop is declared
complete* — that condition is met.

The register's remaining track is infrastructure: guard → G3, and the L2 feed decision that the
staleness curve makes concrete.
