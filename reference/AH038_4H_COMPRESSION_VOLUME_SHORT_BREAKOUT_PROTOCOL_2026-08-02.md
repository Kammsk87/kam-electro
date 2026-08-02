# AH038 4H Compression/Volume Short Breakout Protocol

This offline test uses complete UTC 4h bars derived from the frozen AH-005A
1h archive. It requires three separated support touches, lower highs, range
and volume compression, then a 0.25% downside break on 1.5x SMA20 volume. BTC
only blocks a short after a prior five-day fall of 10% or more.

Both fixed entries are evaluated independently: next-open confirmation and a
retest within three bars. The stop is the larger of the local high and 1.5 ATR;
target is 3R; timeout is six bars; ambiguous OHLC bars resolve adversely.
Volume multipliers 1.25x and 1.75x are robustness neighbours, never a search.
No scale-in is simulated because 4h OHLC cannot reconstruct separate fills.

`DISCOVERY_NOT_PROOF`: no result permits paper/live action. Missing historical
event ledgers make exact overlap with prior level-geometry families unavailable
and block promotion regardless of a numerical result.
