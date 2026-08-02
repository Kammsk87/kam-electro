# Botalin Baseline Strategy Library v0

## Purpose and Boundary

This document defines six fixed, understandable strategy engines for research.
They are baselines, not approved trading systems. A signal is eligible for a
separate causal backtest only if its data, execution assumptions, out-of-sample
period, null control, concentration checks, and market-regime gate are written
before the test. No engine is live or paper eligible from this document.

Common defaults: use completed candles only, enter at the next candle open,
allow one position per symbol per engine, include taker fees and conservative
slippage, and record every skipped signal. A test must use time-ordered
train/validation/holdout splits; no holdout result may select a parameter.

## 1. Trend Pullback

**Mechanism.** In a persistent trend, a temporary pullback can offer a better
entry than chasing the impulse. The expected payer is a participant entering
late in the original trend or exiting a temporary countertrend move.

**Fixed v0 rules.** On 4h candles, long only when EMA(20) is above EMA(50),
both are higher than four candles ago, and RSI(14) is 40--50. Price must trade
inside the EMA(20)-EMA(50) band, then close above the prior candle high. Enter
next open. Short is the exact mirror: EMA(20) below EMA(50), both declining,
RSI 50--60, a touch of the band, then close below the prior candle low.

**Exit and risk.** Initial stop is 1.5 ATR(14) from entry; take profit is 2R;
time stop is 12 candles. Close on an opposite EMA relationship. Size from a
fixed per-trade risk budget, never from leverage availability.

**Allowed / blocked regime.** Allowed only when the EMA separation exceeds
0.25 ATR and directional movement is present. Block when averages are flat or
crossing, around known high-impact events, or when spread/slippage exceeds the
predeclared budget.

**Data and test gate.** Requires OHLCV and executable cost assumptions. Test
separately by symbol and calendar month, then require positive net holdout
median, broad symbol support, a matched random-entry null beat, and survival
after double costs and remove-best-day checks.

## 2. Range Breakout

**Mechanism.** A closed range can release when new information or forced flow
overcomes resting liquidity. The payer is a late participant entering after the
initial directional move.

**Fixed v0 rules.** On 4h candles, define the prior 20 completed candles'
high and low. Signal long when a candle closes 0.25 ATR above that high with
volume at least 1.5 times its 20-candle mean; signal short symmetrically below
the low. Enter at the next open. Do not use a discretionary trendline.

**Exit and risk.** Stop is 1.5 ATR behind entry; target is 3R; time stop is 10
candles. Cancel the signal if next-open gap already exceeds 1 ATR beyond the
breakout close.

**Allowed / blocked regime.** Allowed after a contained range whose 10-candle
realized volatility is below its prior 60-candle median. Block after a 5-candle
one-way move greater than 4 ATR, during a market-wide contrary BTC impulse, or
when volume history is incomplete.

**Data and test gate.** Requires OHLCV. Require net-positive holdout results
across more than one symbol and month, a same-frequency random-direction null
beat, stability to modest range/volume changes, and no dependence on a single
large breakout.

## 3. Volatility-Squeeze Breakout

**Mechanism.** Volatility compression can precede expansion because positions
and liquidity accumulate in a narrow area. Direction is not assumed until the
range actually resolves.

**Fixed v0 rules.** On 1h candles, calculate Bollinger Bands(20, 2) and
ATR(14). A squeeze exists when band width is in the lowest 20 percent of the
previous 120 widths for at least six candles and ATR is below its 60-candle
median. Go long after a close above the squeeze high plus 0.2 ATR; go short
after a close below the squeeze low minus 0.2 ATR. Enter next open; only the
first breakout direction is tradable.

**Exit and risk.** Stop is the opposite squeeze boundary or 1.5 ATR, whichever
is nearer; target is 2.5R; time stop is 18 candles.

**Allowed / blocked regime.** Allowed only with continuous OHLCV and no
pre-breakout gap larger than 1 ATR. Block during event gaps, thin symbols, and
when both directions break within two candles; the latter is a whipsaw, not a
second signal.

**Data and test gate.** Requires 1h OHLCV and reliable volume. Compare against
an equal-frequency breakout null and test adverse fills at the gap/open. It
must survive double costs, neighbouring band-percentile thresholds, and
year/month concentration checks.

## 4. Impulse Mean-Reversion

**Mechanism.** A short, exceptional price displacement can overshoot when
aggressive flow consumes available liquidity faster than new limit liquidity
arrives. The payer is the late impulse trader, not a presumed permanent trend.

**Fixed v0 rules.** On 1h candles, define a downward impulse as a close at
least 2.5 ATR below the close five candles earlier, with volume at least 2x
the 20-candle mean and RSI(14) below 25. Buy only after the next completed
candle closes above the impulse candle midpoint; enter next open. Short is the
mirror: 2.5 ATR rise, 2x volume, RSI above 75, then close below midpoint.

**Exit and risk.** Stop is one ATR beyond the impulse extreme; target is the
five-candle pre-impulse close or 2R, whichever comes first; time stop is six
candles.

**Allowed / blocked regime.** Allowed only when a separate event label does
not indicate exchange failure, hack, delisting, or other fundamental shock.
Block if the impulse is part of a multi-candle move already exceeding 5 ATR,
if BTC moves in the same adverse direction by more than 2 ATR, or if the order
book/execution record is unavailable for a future microstructure version.

**Data and test gate.** Requires OHLCV; event labels improve the exclusion
gate but must be available causally. Require positive net holdout median, a
matched time/symbol random-entry null beat, remove-best-event survival, and
separate BTC/ETH/SOL support before considering any observer draft.

## 5. Cross-Sectional Relative Strength

**Mechanism.** Capital can persistently rotate into assets with stronger recent
relative performance and out of laggards. The strategy forecasts relative,
not absolute, return; its payer is a late portfolio rebalance.

**Fixed v0 rules.** Each day at a fixed UTC close, calculate each eligible
symbol's 7-day return minus the universe median 7-day return. Rank symbols.
Long the top quintile and short the bottom quintile with equal volatility
weights, market-neutral gross exposure, and a maximum 10 percent weight per
symbol. Hold 24 hours, then fully rebalance. Exclude symbols without 30 days
of history or with an extreme single-day return above 25 percent.

**Exit and risk.** Exit at the next rebalance. Portfolio gross exposure is
fixed; a sector, symbol, and BTC-beta cap must be declared before testing.

**Allowed / blocked regime.** Allowed only with a sufficiently broad,
survivorship-aware universe and synchronized prices. Block when fewer than 20
eligible symbols exist, when a single sector dominates either leg, or when
short execution is not demonstrably available.

**Data and test gate.** Requires synchronized multi-symbol OHLCV, a frozen
universe membership history, and cost estimates for both legs. Require
out-of-sample net return after turnover costs, positive subperiod breadth,
beta-neutrality verification, and a shuffled-rank null beat.

## 6. Delta-Neutral Funding Carry

**Mechanism.** Perpetual futures funding transfers payments between crowded
and less crowded directional positioning. A matched spot/perpetual hedge seeks
the transfer while minimizing price direction exposure.

**Fixed v0 rules.** At each funding decision time, enter long spot and short
the matched perpetual only when the annualized projected funding exceeds a
predeclared threshold after estimated borrow, trading, and hedge costs. Size
spot and perpetual by equal notional; recalculate hedge drift daily. Exit when
projected net carry is nonpositive, funding reverses, basis risk breaches its
limit, or the venue-risk rule fires.

**Exit and risk.** There is no profit target. Maintain a margin buffer declared
before testing; exit immediately on an exchange, stablecoin, borrow, or
settlement-risk trigger. Never infer safety merely from delta neutrality.

**Allowed / blocked regime.** Allowed only where causal, synchronized spot,
perpetual, funding, borrow, basis, and execution data exist. Block on missing
borrow data, unstable basis, venue stress, limited short availability, or
unverified account/margin assumptions.

**Data and test gate.** Requires synchronized funding and spot/perpetual price
history, not candles alone. Require net carry after all legs, funding-reversal
stress, basis/borrow stress, and a holdout comparison against no-trade. Current
evidence gaps make this an observation/data-readiness engine, not the first
backtest candidate.

## Research Priority on Existing Data

| Priority | Engine | Why it can be tested first | Boundary |
| --- | --- | --- | --- |
| 1 | Trend Pullback | Uses already available 4h OHLCV and conservative costs. | Fixed v0 rules; no parameter sweep. |
| 2 | Range Breakout | Uses the same OHLCV archive and has unambiguous levels. | Separate family from pullback; test independently. |
| Later | Squeeze / Impulse | Feasible with OHLCV, but must not overlap the first two tests. | Start only after the preceding verdicts. |
| Data-gated | Cross-Sectional / Funding Carry | Need frozen-universe and synchronized multi-leg history. | Build data evidence before alpha claims. |

## Multi-Strategy Rule

An engine is not activated because its standalone backtest is positive. A
future router may permit it only in its stated allowed regime, while blocking
all conflicting engines. Each engine must retain a separate evidence ledger;
the portfolio test is a new experiment, not a way to hide failed components.
