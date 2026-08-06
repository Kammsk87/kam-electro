# `HYP.EXEC.DEPTH_VS_SPREAD_DECAY` — RESULT

**The contradiction is resolved, and not by the predicted crossover.**
**The spread rule's forward separation is EXACTLY zero — structurally, at every horizon.**

## Result

10 symbols, 22 days, ~700,000 observations per horizon.

| τ | A: flow + depth | B: spread only | A − B | t |
|---:|---:|---:|---:|---:|
| 5 s | **0.4350** | **0.0000** | 0.1330 | 15.90 |
| 10 s | **0.5032** | **0.0000** | 0.1536 | 14.18 |
| 30 s | **0.5632** | **0.0000** | 0.1721 | 9.01 |
| 60 s | **0.6310** | **0.0000** | 0.1921 | 7.28 |

A's separation grows monotonically with horizon and reaches 0.631 bps at 60 s, in line with the
law's stated +0.715 on its own definition. **B's is identically zero at every horizon.**

Not approximately zero. On AAVEUSDT at 60 s, B's ALLOW mean is `0` and its VETO mean is `0`, and
both bucket counts are even (101,554 and 60,022) — every state counted exactly twice, once per
direction. A's buckets are uneven (129,532 / 32,044) because A splits by direction.

## Why zero, and why that answers the question

**The spread is direction-agnostic.** It is the same number whether you intend to buy or sell, so
predicate B assigns the same ALLOW/VETO to both directions. The forward move is signed toward the
intent, so the LONG and SHORT contributions of every state cancel **exactly**. B cannot separate a
direction-signed quantity. It is not a weaker competitor at this task — it is structurally
incapable of it.

The AH-047 predicate is direction-specific by construction: aggressive flow *against the intent*,
and depth falling *on the side the intent relies on*. It is the only one of the two that carries
directional information at all.

**That resolves the contradiction cleanly.** The taker measurement found B capturing 97.3 percent
of A on entry price — and entry price is a **direction-agnostic** quantity: a narrowing spread
gets you a better fill whichever side you are taking, simultaneously, with no cancellation. So
that measurement was run on the one job where direction is irrelevant, and it never tested the
predicate's directional content.

**The depth feed is not redundant.** It does no measurable work in the entry-price channel and it
does all of the work in the adverse-selection channel. Two different jobs; the earlier result
covered one of them.

This corrects the framing in the earlier document. "On the entry-price application the predicate
is a spread rule in microstructure clothing" is still true as written, but it invited the wrong
general conclusion, and this measurement is the correction.

## The proposed mechanism is falsified

The pre-registration argued the crossover would come from the spread reverting within 5–10
seconds while the depth imbalance kept pushing. **Measured spread reversion, median per symbol:**

| BSB | BILL | AMAT | AERGO | B3 | ARB | AAVE | AVAX | ADA | BNB |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 30.0 s | 30.3 s | 38.7 s | 40.0 s | 41.0 s | 50.0 s | 50.3 s | 69.0 s | 69.7 s | 91.9 s |

Pooled mean **63.8 seconds**, with p90 pinned at the 130-second measurement cap on every symbol.
The spread is three to ten times stickier than the mechanism assumed. Whatever produces A's
advantage, it is not that the spread reverts quickly.

## Both halves of the prediction failed

Registered: B indistinguishable from A at 5–10 s (t < 1.0), A pulling ahead at 30–60 s (t > 3.0).

Measured: A beats B at **every** horizon, with t = 15.9 already at 5 seconds. The prediction of a
crossover was wrong because it assumed the two predicates were doing the same job with different
decay profiles. They are not doing the same job.

Note the t-statistics **fall** with horizon (15.9 → 7.3) while the magnitude **rises**
(0.133 → 0.192): variance grows faster than the effect. That is the ordinary shape of a forward
return and is worth remembering when reading the law's own 60-second figure.

## A pattern worth naming

The frozen verdict function returned `DEPTH_BEATS_SPREAD_BUT_NOT_ONLY_AT_LONG_HORIZON`. It is
technically correct and it reads as an empirical finding when the result is structural.

That is the second pre-registered rule in two runs to produce a technically-correct-but-misleading
verdict — the first fired on a persistent basis in the cross-venue work. Both times the rule
encoded a threshold without encoding what the threshold was supposed to *mean*. Worth carrying
into future pre-registrations: a decision rule needs a stated failure mode, not only a number.

## What this does not settle, and the fair comparison that would

B was given a direction-agnostic form and lost a directional contest. The honest follow-up is a
**direction-specific spread rule** — veto a long when the *ask* side widened, veto a short when the
*bid* side widened — which would compete on equal footing.

That needs its own pre-registration and is not run here, because running it immediately after
seeing this result is the pattern this programme exists to refuse. Recorded as the next question,
with a stated expectation: a one-sided spread rule should carry *some* directional information,
and the open question is whether it reaches A's 0.435–0.631 or stops well short.

## Files

- `scripts/analysis/depth_vs_spread_decay.mjs`
- `scripts/test_depth_vs_spread_decay.mjs` — 17/17
- `data/depth_vs_spread_decay_2026-08-06.{csv,json}`
