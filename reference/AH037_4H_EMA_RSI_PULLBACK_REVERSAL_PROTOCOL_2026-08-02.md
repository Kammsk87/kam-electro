# AH037 4H EMA/RSI Pullback Reversal Protocol

Fixed research rule only. Source: the versioned AH-005A 109-symbol 1h archive,
aggregated into complete UTC 4h bars. The primary formulation uses EMA20/EMA50
slopes, an EMA-zone touch, RSI(14) 40--50 for long or 50--60 for short, and a
mechanical engulfing/pin-bar reversal. It enters next 4h open, stops 0.5% past
the decision extreme, targets 2R, and times out after six bars.

The chronological split is 55/20/15/10. It has no parameter search. The two
neighbours (1.5R/6 bars and 2R/4 bars) are robustness checks only. Every result
uses 11 bps round-trip cost and repeats the median check at 22 bps. Matched
nulls keep symbol, side, and holding length but randomize entry times.

This is `DISCOVERY_NOT_PROOF`. A result cannot create paper/live state. Missing
prior-family event ledgers are reported as overlap evidence unavailable and
block any candidate-promotion interpretation.
