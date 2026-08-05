# Execution gateway — paired entry measurement under VETO = WAIT — RESULT

**Verdict: `GATE_IMPROVES_ENTRY`.**
**Label: `PAIRED_ENTRY_MEASUREMENT_NOT_A_PASSPORT`. promising_count: 0.**

Read §5 before treating this as replication. It is not.

## What was measured, and why it is not the G3 run again

| | G3 harness | this gateway |
|---|---|---|
| policy | VETO means **skip** | VETO means **wait** |
| the trade | does not happen | happens, later |
| metric | difference of means over two differently-sized sets | **paired** difference on one intent |

Under a wait policy both runs take the same intent, so the two entry prices are paired and the
difference is defined per trade rather than per set. It is also the realistic policy: a strategy
told to enter rarely cancels the signal, it postpones it.

## Result

**2,298,448 paired intents**, 10 symbols, 26 days, exhaustive stream — both directions at every
snapshot.

| | cap 1 (~10 s) | **cap 3 (~30 s)** | cap 6 (~60 s) |
|---|---:|---:|---:|
| mean improvement per intent | 0.0492 | **0.0588 bps** | 0.0591 |
| t | 33.1 | **36.4** | 36.5 |
| detectable at t = 3 | 0.0045 | 0.0048 | 0.0049 |
| on the intents that waited | 0.3208 | **0.3826** | 0.3844 |
| wait rate | 15.36 % | 15.35 % | 15.35 % |
| forced at the cap | 2.25 % | **0.04 %** | 0.0003 % |
| **random-wait control** | 0.0009 | **0.0015** | −0.0003 |

**The control is indistinguishable from zero; the gate is not.** Waiting on its own returns
0.0015 bps, inside one standard error of zero; waiting *when the predicate says to* returns
0.0588 at t = 36.4. That is the measurement that matters — without the control, short-horizon
mean reversion would have been credited to the gate.

> **Correction, 2026-08-05.** This section first read "the gate beats its control by a factor of
> 39." That ratio is not a sound statistic. Its denominator is a quantity consistent with zero,
> so the ratio is unstable in both magnitude and sign — recomputing the same in-sample run on the
> nine symbols that survive into the forward span puts the control at −0.0021 and the "ratio" at
> −28. The defensible claim is the one now stated: the control cannot be distinguished from zero
> and the effect can. Nothing else in this document changes.

All ten symbols are positive, from 0.0125 (AMAT) to 0.1282 (BILL).

## Three things worth reading closely

**The frozen cap was the right one and the neighbours prove it.** Going from 10 s to 30 s adds
0.0096 bps; going from 30 s to 60 s adds 0.0003. The effect is captured inside 30 seconds and
saturates. At the frozen cap only **0.04 percent** of intents are forced through — the state
almost always clears on its own.

**The gain is concentrated, not uniform.** Only 4.76 percent of all intents improve, which is
about 31 percent of the 15.35 percent that wait. The rest of the waiters come out flat or
slightly worse. The mean of +0.38 bps on waiters is carried by a minority of them.

**AMAT reverses sign against the skip policy.** Under G3's skip policy its separation was
−0.1167 bps at t = −0.41, the only negative in the set. Under the wait policy it is +0.0125.
Different policy, different answer — which is a reason to hold the earlier refusal of a
liquidity threshold rather than revisit it.

## The pre-registered prior was too low by half

Recorded in the frozen block before the run: **0.03 bps per intent**, derived as the veto rate
times a rough fraction of the 60-second separation.

Measured: **0.0588**, which is **17.8 standard errors above** it.

The derivation assumed the adverse move accrues roughly linearly, so an 11-second wait would
capture a small share of a 60-second effect. It does not: the move is **front-loaded**, which is
the same thing the staleness curve said when it showed 54 percent of the separation gone by five
seconds. Waiting 11 seconds captures far more than 11/60 of it.

That is an internal consistency check passing, not a surprise — but the prior should have been
derived from the decay curve rather than from a linear assumption, and it was not.

## What this is worth

**0.0588 bps per intent**, against a 16 bps round trip: **0.37 percent of one round trip.**

The G3 skip policy delivered 0.045 bps. The two are not the same quantity — one is a
60-second outcome difference over unequal sets, the other an entry-price difference on paired
trades — so they should not be subtracted. What can be said is that they are the same order, and
the wait policy carries a structural advantage the skip policy does not: **no trade is
foregone.** A skipped trade loses whatever the signal was worth; a delayed one keeps it.

The cost floor of 16 bps is reported for the absolute audit line and **cancels exactly in the
paired difference** — same intent, same notional, same fee in both runs. No choice between 16.00
and 19.19 could have moved this number.

## What this does not establish

**It is not replication.** The run uses the same 26-day archive that produced
`LAW.EXEC.FLOW_DEPTH_AGREEMENT_PREDICTS_ADVERSE`. It establishes that a wait policy built on that
predicate improves entry prices on the data the predicate was found in.

> **Followed up 2026-08-05.** A genuinely non-overlapping span, 2026-08-02..05, has since been
> run with this code unchanged and reproduces the result: +0.0591 bps at t = 21.8 against
> +0.0593 on the composition-matched in-sample span, a difference of t = −0.05. See
> `EXECUTION-GATEWAY-FORWARD-REPLICATION-RESULT.md`. The span is 3.5 days and the law's
> pre-registered bar is 10, so the law's status is unchanged.

**It is not a strategy.** The intent stream is synthetic and exhaustive by design, so that the
gate's value cannot be entangled with any signal's quality. Connecting a real signal layer is a
separate step and requires a signal that has earned a place — which, per the register, none
currently has.

**And 0.06 bps remains 0.06 bps.** The register's arithmetic stands: a gate cannot rescue a
signal that does not clear its own floor. This measurement makes the gate's contribution
slightly larger and much better established, not structurally different.

## A defect the run found

`resolveWait` could return an index past the end of the archive when the wait ran into the tail,
and the first run crashed on it. The fix rejects those intents by reason rather than clamping to
the last snapshot: clamping would have executed at whatever price sat there, however far away,
and the tail of every symbol would have entered the sample with a fabricated entry.

Eighth harness defect across the programme, and again found by running rather than by reading.

## Files

- `scripts/analysis/execution_gateway.mjs`
- `scripts/test_execution_gateway.mjs` — 23/23
- `data/execution_gateway_paired_entry_2026-08-05.{csv,json}`
