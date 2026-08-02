import { atr, simulateShort, stats, structure, support } from './analysis/ah038_4h_compression_volume_short_breakout.mjs';
let pass = 0, fail = 0; const ok = (x, n) => { if (x) { pass += 1; console.log(`PASS ${n}`); } else { fail += 1; console.log(`FAIL ${n}`); } };
const bars = Array.from({ length: 40 }, (_, i) => ({ ts: i * 14_400_000, o: 100 - i * .1, h: 102 - i * .1, l: 99 - i * .1, c: 100 - i * .1, v: 100 }));
for (const i of [12, 15, 18]) bars[i].l = 90;
for (let i = 21; i <= 23; i += 1) { bars[i].h = 96; bars[i].l = 94; bars[i].v = 50; }
bars[24] = { ts: 24 * 14_400_000, o: 94, h: 95, l: 88, c: 89, v: 250 };
ok(atr(bars, 24) > 0, 'ATR is causal');
ok(support(bars, 24, atr(bars, 24)) !== null, 'three separated support touches');
ok(structure(bars, 24, 1.5)?.valid === true, 'fixed compression-volume break');
const targetBars = [{ o: 100, h: 102, l: 98, c: 99 }, { o: 100, h: 101, l: 99, c: 100 }, { o: 99, h: 100, l: 90, c: 94 }];
const t = simulateShort(targetBars, 0, 1, 2, 3, 1); ok(t?.reason === 'TARGET' && t.entryIndex === 1, 'next-bar short target');
const both = simulateShort([{ o: 100, h: 102, l: 98, c: 99 }, { o: 100, h: 120, l: 80, c: 90 }], 0, 1, 2, 3, 1); ok(both?.reason === 'AMBIGUOUS_ADVERSE', 'adverse OHLC tie');
const s = stats([{ bps: 30, symbol: 'A', day: 'd', reason: 'TARGET' }, { bps: -20, symbol: 'B', day: 'e', reason: 'STOP' }]); ok(s.n === 2 && s.net_mean_bps === -6 && s.exits.TARGET === 1, 'costed stats');
console.log(`TEST AH038: ${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
