# `HYP.FUNDING_PRE_CLEARING_IMPULSE` — RESULT

**Verdict: `UNRESOLVED`, and specifically underpowered for its own registered prior.**
**promising_count: 0. Not a null result — a measurement that cannot see what it was asked to find.**

## Result

Settlements at 00:00 / 08:00 / 16:00 UTC against the identical 55-second window before every
non-settlement hour, both signed by the prevailing funding rate, clustered on the boundary
timestamp because ten symbols moving together at one instant is one observation and not ten.

| | clusters | symbol-events | mean | t |
|---|---:|---:|---:|---:|
| settlement | 69 | 186 | −0.2158 | −0.37 |
| control | 476 | 1,104 | −0.1073 | −0.48 |
| **difference** | | | **−0.1085 bps** | **−0.17** |

Neither window is distinguishable from zero, and they are not distinguishable from each other.

The point estimate is **negative** — the same sign as the wide study's −3.38 bps. It is nowhere
near significance and should not be read as evidence of an inverted effect, but it is worth
saying that it does not lean toward the thesis either.

## Why `UNRESOLVED` is the honest word, and `NO_IMPULSE` would not be

The standard error on the difference is **0.626 bps**. Resolving at t = 3 therefore requires an
effect of at least **1.88 bps**.

The registered prior was **+0.50 to +2.50 bps**. So this measurement can detect the *top* of its
own prior range and is blind to the *bottom* of it. A null here excludes only the largest version
of the hypothesis.

**What it would take, on the same 5-symbol, 3-settlements-a-day rate:**

| to resolve | needed se | clusters | archive span |
|---|---:|---:|---:|
| 2.50 bps (top of prior) | 0.833 | 39 | already have it |
| 1.88 bps | 0.626 | 69 | already have it |
| 1.00 bps | 0.333 | ~245 | **~80 days** |
| 0.50 bps (bottom of prior) | 0.167 | ~975 | **~310 days** |

Only 22 days of overlapping tick-and-funding archive exist. The bottom of the registered prior is
roughly **fourteen times** the data away.

## The proposed |FR| ≥ 0.03% filter produces an empty test set

Declared underpowered in advance; it turned out worse than that. **Zero settlement events survive
it** — the control keeps 3, the test keeps none.

The funding archive was measured before the run: **|FR| ≥ 0.03 % covers 2.3 percent of
observations**, because the median |FR| here is 0.0087 percent. Over 69 settlement clusters, 2.3
percent is under two expected events, and none landed with usable prices on both window edges.

Had that filter gated the primary as originally specified, the study would have returned nothing
at all and it would have been easy to mistake for a technical failure rather than for a threshold
set an order of magnitude above the sample.

## Coverage, and what limits it

**Five symbols**, not ten. The funding archive covers 30 symbols and the tick archive covers ten;
the intersection is AAVE, ADA, ARB, AVAX and BNB. AMAT, B3, BILL, BSB and AERGO have ticks but no
funding history in `oi_forward`.

Rejections: 838 windows with no price within 5 seconds of the open, 605 with none at the close.
That tolerance is deliberate and inherited from the G3 defect — without it a print from hours
away gets matched and manufactures a confident number out of nothing. Loosening it to rescue n
would be trading the study's integrity for its power.

Per-symbol settlement means scatter widely and inconsistently: ARB +1.60, AAVE +0.94, BNB −1.19,
ADA −1.53, AVAX −2.53. Two positive, three negative, no coherent picture — which is what noise at
this sample size looks like.

## The registration itself had a contradiction, and splitting it was the fix

As submitted, the prior was +0.50 to +2.50 bps and the success criterion was clearing the
**16 bps** floor. Those cannot both hold: the study was pre-registered to fail.

The engine therefore carries two verdicts rather than one. **Physics** — is the settlement window
different from control, at t = 3. **Economics** — is that difference worth 16 bps. By the
registered prior the economics answer was `BELOW_FLOOR` before a line of code ran, and a test
asserts exactly that. Keeping them apart is what stops a genuine physical finding from being
misread as a strategy, and it is why an eventual +1.5 bps here would be a real result about market
microstructure and still not a trade.

## Disposition

Not closed. `UNRESOLVED` with a stated power bar is a different record from `CLOSED_MEASURED`, and
recording it as a null would overclaim by a factor of four.

**Reopen when the overlapping tick-and-funding archive reaches ~80 days**, which resolves 1.0 bps
at t = 3. The `oi_10s` recorder deployed today writes funding on the same 10-second grid as the
book, so from this point the two archives grow together across the full 37-symbol universe rather
than intersecting on five — which will reach the bar faster than the 80-day figure above implies,
since that number assumes today's five-symbol rate.

A reopen must also keep the |FR| conditioner as a **declared secondary**, never as a gate.

## Files

- `scripts/analysis/funding_pre_clearing_impulse.mjs`
- `scripts/test_funding_pre_clearing_impulse.mjs` — 24/24
- `data/funding_pre_clearing_impulse_2026-08-06.{csv,json}`
