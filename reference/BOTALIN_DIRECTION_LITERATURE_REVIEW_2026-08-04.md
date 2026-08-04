# Direction forecasting — literature review against our own record

2026-08-04. Sources were read at abstract-and-method level, and the Liu-Tsyvinski-Wu working
paper in full text. Where a claim rests only on a search summary rather than on the paper
itself, it is marked. This document exists to extract **method**, not to collect citations:
the question asked was what tools and combinations the literature offers that we do not
already have.

---

## Part 1 — What the literature closes, and why our 0-of-35 was not bad luck

### Candlestick patterns

Marshall, Young & Rose (Journal of Banking & Finance, 2006) tested candlestick strategies on
DJIA components 1992-2002 against a bootstrap that **generates random open, high, low and
close prices** preserving the return distribution. No value. Replicated for Japan (Marshall,
Young & Cahan, 2008) and by Horton (2009).

Emerging markets — Taiwan, China, Thailand — report profitability. The disagreement is real
but there is a detail inside it that settles the question for us:

> significant positive returns appear in US markets under the **Caginalp-Laurent exit
> strategies** but not under the Marshall-Young-Rose exit strategies

The result is carried by the exit rule, not by the entry pattern. A pattern whose profitability
flips with the exit convention is not the thing supplying the information.

### Chart patterns

Lo, Mamaysky & Wang (Journal of Finance, 2000) built automated pattern recognition via
nonparametric kernel regression over US stocks 1962-1996 — head-and-shoulders, double bottoms
and the rest. Their finding is that several indicators **provide incremental information**.

That phrase has to be read literally. They compared the conditional return distribution to the
unconditional one and found a difference. It is a distributional claim, not a profit claim, and
no costs appear in it. Our cost audit of 2026-08-04 is exactly the step that converts a claim
of this shape into a decision.

### The one that maps directly onto us

Bajgrowicz & Scaillet (Journal of Financial Economics, 2012) tested **7,846 trading rules** on
the DJIA from 1897 to 2011 with a False Discovery Rate control. Two findings:

1. **Persistence fails.** An investor could never have selected ex ante the rules that would
   perform best next. The winners are not the winners in advance.
2. **Even in-sample profits are completely offset by low transaction costs.**

This is our programme, on a different asset class, over a century. Their "low transaction
costs" on daily equities are our 16 bps on minutes. We rediscovered it independently.

**Conclusion for us: the price-pattern category is closed, and the literature explains the
mechanism rather than merely agreeing with the outcome.** No further hypothesis of this shape
should be written.

---

## Part 2 — Where the literature calibrates our own results

### Order flow imbalance is contemporaneous, not predictive

Cont, Kukanov & Stoikov (Journal of Financial Econometrics, 2014) established the canonical
result: over short intervals, price **changes** are driven by order flow imbalance, with a
linear relation whose slope is inversely proportional to depth, robust across stocks and time
scales.

The operative word is *changes*. OFI explains the repricing that is happening, not the one
about to happen.

Our TASK-AH-046 measured +0.073 bps out of sample at t = 0.50 over 56,073 observations and
concluded that "a record of repricing is not a forecast of it." That conclusion was written
before this review and it matches the literature exactly. **AH-046 is not a failed
implementation of a known effect — it is a correct measurement of a known non-effect.**

### Machine learning on the book reproduces the same trap at higher resolution

DeepLOB and successors report F1 of 83 percent on the FI-2010 benchmark and 68-70 percent
accuracy out of sample on a year of London Stock Exchange data including unseen stocks. The
literature's own caveat is the load-bearing part:

> serious concerns ... partly due to ignored transaction costs and assumed mid-price execution

and, on threshold choice:

> defining trend thresholds based on average spread significantly impacts model performance,
> underscoring the critical gap between machine learning metrics and practical trading
> applicability

Seventy percent directional accuracy measured at mid with no costs is what our own AH-046
would look like if we stopped before subtracting the floor. This category offers us no route
that our cost position does not already close. *(Search-summary level; full texts not read.)*

---

## Part 3 — Methodological tools worth adopting

This is the part of the review with actual carry. Six techniques appear in these papers that
our harnesses do not currently use.

### 3.1 Specification-fraction reporting

*Source: the liquidation-cascade study (arXiv 2607.27070).*

Rather than freezing one window choice, they sweep **39 configurations per variable per event**
— detrending window 2-16 h, rolling window 0.5-4 h, pre-window 1-3 days — and report the
**fraction of configurations that are significant**, not the best one.

The numbers are legible because of it: 85 percent of configurations for one event, 3 percent
for another. Three percent is the noise floor, stated as such.

We freeze a single specification, which protects against search but leaves "is this an artifact
of my window choice" unanswered. The two are complementary: **freeze the primary, then report
the fraction of the neighbourhood that agrees.** AH-050 already does a weak version of this
with its three neighbour horizons — and the answer there (−11, +191, +106, +95 bps) was
informative precisely because the neighbourhood disagreed.

### 3.2 Matched placebo windows with explicit exclusion criteria

*Source: same.*

Their null is 300 ordinary-market windows drawn **from the same data files**, excluded if a
documented crash occurred inside, if a drawdown above 4 percent followed within 24 hours, or if
they overlapped a studied event.

Our random-rate control (AH-047) matches on *rate*. Theirs matches on *source and regime* and
explicitly excludes contamination by the event class being tested. Both are worth having; ours
does not currently exclude contamination.

### 3.3 Bootstrap over generated OHLC

*Source: Marshall, Young & Rose.*

The null for a pattern rule is not a shuffle of returns — it is **generated open, high, low and
close prices** consistent with the return process. Any rule reading candle geometry can then be
tested against a world where the geometry carries nothing by construction.

We have no such generator. If any future work touches bar geometry, this is the null it needs.

### 3.4 The persistence test

*Source: Bajgrowicz & Scaillet.*

Distinct from out-of-sample testing and stronger than it: **could the winning rule have been
selected in advance?** Rank rules in period 1, hold the top ones in period 2, and measure
whether the ranking carried.

We run remove-best-symbol and remove-best-day. We have **never** run a persistence test. And we
have the ideal corpus for it: 35 rejected hypotheses with recorded verdicts. Asking whether our
own ranking at any point in time predicted the next period's ranking is a direct test of
whether this programme's selection process has any skill at all.

### 3.5 Double sorting as a conditioning instrument

*Source: Liu, Tsyvinski & Wu.*

Their most useful finding came from a double sort, not a single one. Sorting first on size,
then on momentum within each size group, revealed that momentum in crypto works **in the large
coins** — 4.2 percent weekly above the median size against 0.6 percent and insignificant below
it, the opposite of the equity market.

A single sort would have shown an average and hidden the structure.

This is directly the instrument for our largest open question. See Part 4.

### 3.6 Monotonicity across buckets as a robustness criterion

*Source: same.*

They report all five quintile means and note they are "almost monotonic with the quintiles." A
genuine cross-sectional effect **orders** the buckets; a spread carried by the two extremes
with noise between them does not.

Adopted in AH-050, and it earned its place immediately: the point estimate was positive at
+105.9 bps while the quintiles ran 70.4, 122.4, 103.1, 48.9, 176.4 — with the fourth bucket the
worst of five. The spread said "maybe", the profile said "no".

---

## Part 4 — Combinations with our existing work

### 4.1 We hold the data the cascade study says is unobtainable

The cascade authors state their central limitation plainly:

> Intraday liquidation microstructure ... is unavailable at this resolution without a
> commercial data source ... we necessarily observe the **consequences** of forced liquidation
> (open interest, aggressor flow) rather than liquidations themselves.

Their proxies are 5-minute Binance aggregates: open interest, top-trader long/short ratio,
global long/short ratio, taker buy/sell volume ratio.

We hold **81,268 individual liquidation events with millisecond timestamps, side, quantity,
price and notional** in `LEGACY.LIQUIDATIONS_DB`. That is the direct observation they had to
work around.

This does not make their conclusions wrong. It means a study of the same question on our data
would be measuring the thing rather than its shadow — and their honest negative result about
per-event prediction was obtained on proxies, which is the weaker case.

### 4.2 Their honest limitation demotes the liquidation path, and should

Read as written:

> aggressive order flow going persistently one-sided is a **population-level precursor** — real,
> but too weak for per-event warning (two of six events overlap the null individually)

and

> Single-event critical-slowing-down claims in crypto derivatives are therefore fragile by
> construction ... Out-of-sample testing is not a robustness appendix in this literature; it is
> the load-bearing step.

An effect that is significant across a population but overlaps the null on individual events is
not tradeable per event. Our liquidation path should therefore be framed as **conditioning**,
not as event prediction: liquidation state as a discriminator on other events, not as a trigger.

### 4.3 The concrete combination: double sort on AH-048

Our single strongest directional measurement is the AH-048 sweep continuation: +7.56 bps at
t = 15.3 on 60 seconds, over 3,050 events, with sealed data untouched. It needs a factor of
roughly 2.1 to clear 16 bps, and 32 percent of events at 900 s already exceed 11 bps. The
paying tail exists; the question is whether it is identifiable in advance.

Section 3.5 is the instrument. Sort sweeps into notional buckets, then within each bucket sort
on a second dimension, and require **monotonicity in both** rather than a single conditional
mean. Second dimensions we have already built and measured:

| dimension | instrument | status |
|---|---|---|
| flow/depth agreement | `guardState`, AH-047 | measured, t = 20.1, three checks PASS |
| book response | `classifyLevel`, AH-019 | absorption / pull / consumption, tested |
| liquidation coincidence | `LEGACY.LIQUIDATIONS_DB` | 81,268 events, verified |
| one-sidedness of aggressive flow | cascade study's own precursor | new, from 4.2 |

The last row is the contribution of this review: the cascade study identifies *persistent
one-sidedness of taker flow* — measured as a **decline** in the rolling variance of the taker
buy/sell ratio — as a real population-level precursor. We can compute that from our own tick
archive, which carries the aggressor side.

Note the physical continuity across three of our own results: the guard says aggressive flow
against a thinning book predicts an adverse next move (+0.715 bps over all flow); AH-048 says a
large aggressive order is followed by continuation (+7.56 bps at the 99th percentile); the
cascade study says persistently one-sided aggressive flow precedes forced liquidation. These
are plausibly one phenomenon measured at three scales. A double sort is how that gets tested
rather than asserted.

---

## Part 5 — What this review does not offer

No new short-horizon directional hypothesis. The literature does not contain one that survives
a 16 bps floor, and it explains why rather than merely failing to provide one.

What it offers instead is one confirmed premise — measured in AH-050, cost falls from 179
percent of the available move to 2.4 percent when the horizon moves from minutes to a week —
plus six methods and one conditioning programme.

---

## Sources

| | |
|---|---|
| Marshall, Young & Rose, *Candlestick technical trading strategies: Can they create value for investors?* | J. Banking & Finance, 2006 |
| Lo, Mamaysky & Wang, *Foundations of Technical Analysis* | J. Finance 55(4), 2000 |
| Bajgrowicz & Scaillet, *Technical trading revisited: false discoveries, persistence tests, and transaction costs* | J. Financial Economics 106(3), 2012 |
| Cont, Kukanov & Stoikov, *The Price Impact of Order Book Events* | J. Financial Econometrics, 2014; arXiv 1011.6402 |
| Liu, Tsyvinski & Wu, *Common Risk Factors in Cryptocurrency* | J. Finance 77(2), 2022; NBER WP 25882 — **read in full** |
| *Where does the criticality live? Early-warning signals ... seven crypto-perpetual liquidation cascades* | arXiv 2607.27070 |
| *Deep Limit Order Book Forecasting: a microstructural guide* | arXiv 2403.09267 — *search summary only* |
| *TLOB: Transformer with Dual Attention for Price Trend Prediction* | arXiv 2502.15757 — *search summary only* |
