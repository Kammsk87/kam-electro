import { aggregate4h, ema, generateTrades, matchedNull, median, rsi, reversalLong, reversalShort, simulateTrade, stats } from './analysis/ah037_4h_ema_rsi_pullback_reversal.mjs';

let pass = 0, fail = 0;
function ok(value, label) { if (value) { pass += 1; console.log(`PASS ${label}`); } else { fail += 1; console.log(`FAIL ${label}`); } }

const hours = Array.from({ length: 8 }, (_, i) => [i * 3_600_000, 100 + i, 102 + i, 99 + i, 101 + i, 10]);
const four = aggregate4h(hours);
ok(four.length === 2 && four[0].o === 100 && four[0].c === 104 && four[0].h === 105 && four[0].l === 99, 'complete 4h aggregation');
ok(ema([1, 2, 3, 4], 2)[1] === 1.5 && rsi([1, 2, 3, 4, 5], 2)[2] === 100, 'indicator warmup');

const bars = Array.from({ length: 65 }, (_, i) => ({ ts: i * 14_400_000, o: 100 + i, h: 102 + i, l: 99 + i, c: 101 + i, v: 10 }));
bars[55] = { ts: 55 * 14_400_000, o: 150, h: 152, l: 140, c: 151, v: 10 };
bars[56] = { ts: 56 * 14_400_000, o: 151, h: 154, l: 149, c: 153, v: 10 };
ok(reversalLong([{ o: 100, h: 103, l: 90, c: 102 }, { o: 99, h: 101, l: 95, c: 98 }], 0) === false, 'reversal requires prior candle index');
ok(reversalShort([{ o: 100, h: 103, l: 90, c: 92 }, { o: 99, h: 101, l: 95, c: 98 }], 0) === false, 'short reversal requires prior candle index');
const simBars = [{ o: 100, h: 102, l: 98, c: 100 }, { o: 100, h: 103, l: 99, c: 102 }, { o: 102, h: 105, l: 101, c: 104 }];
const target = simulateTrade(simBars, 0, 'LONG', 2, 1);
ok(target && target.reason === 'TARGET' && target.entryIndex === 1, 'next-bar entry and target');
const ambiguous = simulateTrade([{ o: 100, h: 102, l: 98, c: 100 }, { o: 100, h: 110, l: 90, c: 105 }], 0, 'LONG', 2, 1);
ok(ambiguous && ambiguous.reason === 'AMBIGUOUS_ADVERSE', 'adverse same-bar resolution');
const st = stats([{ bps: 30, symbol: 'A', day: 'd', reason: 'TARGET' }, { bps: -20, symbol: 'B', day: 'd', reason: 'STOP' }]);
ok(st.n === 2 && st.net_mean_bps === -6 && st.exits.TARGET === 1, 'costed statistics');
const nullResult = matchedNull([{ bps: 10, symbol: 'A', side: 'LONG', entryIndex: 3, exitIndex: 4 }], { A: Array.from({ length: 70 }, (_, i) => ({ o: 100 + i, c: 101 + i })) }, 10);
ok(nullResult.samples === 10 && Number.isFinite(nullResult.p_value), 'deterministic matched null');
ok(median([1, 5, 3]) === 3, 'median');
console.log(`TEST AH037: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
