#!/usr/bin/env node
// Fixed top-10 orderbook shape triad. Research only; no parameter search or trading.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/opt/botalin-edge', RUN = 'amel-1785215500081', MIN = 60_000, COST = .11;
const avg = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const med = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const r4 = x => x == null ? null : +x.toFixed(4);
const load = p => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const sign = x => x > 0 ? 1 : x < 0 ? -1 : 0;

export function shape(ob) {
  const n = (levels, from, to) => levels.slice(from, to).reduce((sum, [p, q]) => sum + p * q, 0);
  const bidNear = n(ob.bids10, 0, 3), askNear = n(ob.asks10, 0, 3), bidFar = n(ob.bids10, 3, 10), askFar = n(ob.asks10, 3, 10);
  const bidAll = bidNear + bidFar, askAll = askNear + askFar;
  const bidQty = ob.bids10[0][1], askQty = ob.asks10[0][1], mid = (ob.bid1 + ob.ask1) / 2;
  const micro = (ob.ask1 * bidQty + ob.bid1 * askQty) / (bidQty + askQty);
  return { mid, near_imbalance: (bidNear - askNear) / (bidNear + askNear), far_imbalance: (bidFar - askFar) / (bidFar + askFar), micro_bps: (micro - mid) / mid * 1e4, bid_wall: (ob.bids10[0][0] * bidQty) / bidAll, ask_wall: (ob.asks10[0][0] * askQty) / askAll };
}
export function split(rows) { const n = rows.length, s = [...rows].sort((a, b) => a.ts - b.ts); return { train: s.slice(0, ~~(n * .55)), validation: s.slice(~~(n * .55), ~~(n * .75)), holdout: s.slice(~~(n * .75), ~~(n * .90)), forward: s.slice(~~(n * .90)) }; }
if (process.argv.includes('--smoke')) { const x = shape({ bid1: 99, ask1: 101, bids10: [[99, 4], [98, 1], [97, 1], [96, 1]], asks10: [[101, 1], [102, 1], [103, 1], [104, 1]] }); if (!(x.near_imbalance > 0 && x.micro_bps > 0 && x.bid_wall > x.ask_wall)) process.exit(1); console.log('SMOKE: 1 passed, 0 failed'); process.exit(0); }

function impact(ob, side) { const book = side > 0 ? ob.asks10 : ob.bids10, ref = side > 0 ? ob.ask1 : ob.bid1; let rem = 200, qty = 0, spent = 0; for (const [p, q] of book) { const dollars = Math.min(rem, p * q); qty += dollars / p; spent += dollars; rem -= dollars; if (rem <= 1e-9) break; } if (rem > 1e-9 || !qty) return null; const vwap = spent / qty; return side > 0 ? Math.max(0, (vwap - ref) / ref * 1e4) : Math.max(0, (ref - vwap) / ref * 1e4); }
function stats(rows) { const net = rows.map(x => x.net); return { n: rows.length, symbols: new Set(rows.map(x => x.symbol)).size, net_mean_pct: r4(avg(net)), net_median_pct: r4(med(net)), winrate_pct: r4(rows.length ? 100 * net.filter(x => x > 0).length / rows.length : null) }; }

function main() {
  const dir = path.join(ROOT, 'logs/active_market_event_logger'), back = path.join(ROOT, 'data/amel_orderbook_backfill', RUN);
  const events = Object.fromEntries(load(path.join(dir, `events_${RUN}.jsonl`)).map(x => [x.event_id, x]));
  const books = load(path.join(dir, `orderbook_${RUN}.jsonl`)).filter(x => x.fetch_ok && x.exec_200 === 1 && events[x.event_id]);
  const sources = {}; for (const symbol of [...new Set(books.map(x => x.symbol))]) { const bars = JSON.parse(fs.readFileSync(path.join(back, `${symbol}_1m.json`), 'utf8')); sources[symbol] = { bars, at: new Map(bars.map((b, i) => [b[0], i])) }; }
  const all = [];
  for (const ob of books) { const event = events[ob.event_id], source = sources[ob.symbol], entryTs = Math.floor(ob.snapshot_ts / MIN) * MIN + MIN, i = source.at.get(entryTs); if (i == null || i + 15 >= source.bars.length || ob.snapshot_ts - event.detected_ts > 5_000) continue; const f = shape(ob), entry = source.bars[i][1], exit = source.bars[i + 15][1]; all.push({ ts: entryTs, symbol: ob.symbol, family: event.event_family.replace(/_[0-9]+[MH]$/, ''), eventSide: event.event_direction.startsWith('LONG') ? 1 : -1, displacement_pct: (f.mid - event.trigger_price) / event.trigger_price * 100, ob, f, entry, exit }); }
  const candidates = {
    'OB-SHAPE-001-microprice-continuation': row => { const side = sign(row.f.micro_bps); return Math.abs(row.f.micro_bps) >= .15 && side === sign(row.f.near_imbalance) && ['MOMENTUM_IMPULSE', 'VOLUME_BURST'].includes(row.family) ? side : 0; },
    'OB-SHAPE-002-opposing-wall-absorption': row => { const oppositeWall = row.eventSide > 0 ? row.f.ask_wall : row.f.bid_wall; return Math.abs(row.displacement_pct) >= .20 && sign(row.displacement_pct) === row.eventSide && oppositeWall >= .45 ? -row.eventSide : 0; },
    'OB-SHAPE-003-convex-book-continuation': row => { const side = sign(row.f.near_imbalance); return Math.abs(row.f.near_imbalance) >= .25 && side === sign(row.f.far_imbalance) && ['MOMENTUM_IMPULSE', 'VOL_EXPANSION'].includes(row.family) ? side : 0; },
  };
  const report = { run_id: RUN, generated_at_utc: new Date().toISOString(), data_contract: 'top-10 shape only; snapshot within 5s after event detection; entry next 1m open; exit 15m later; 11 bps round trip plus top-10 200 USD impact', discovery_not_proof: true, strategies: {} };
  for (const [name, rule] of Object.entries(candidates)) { const rows = []; const busy = {}; for (const row of all.sort((a, b) => a.ts - b.ts)) { const side = rule(row); if (!side || (busy[row.symbol] || 0) > row.ts) continue; const imp = impact(row.ob, side); if (imp == null) continue; const gross = side * (row.exit - row.entry) / row.entry * 100; rows.push({ ...row, net: gross - COST - 2 * imp / 100 }); busy[row.symbol] = row.ts + 15 * MIN; } const p = split(rows); report.strategies[name] = { verdict: 'DESCRIPTIVE_ONLY_NOT_A_PAPER_DECISION', splits: Object.fromEntries(Object.entries(p).map(([k, xs]) => [k, stats(xs)])) }; }
  fs.writeFileSync(path.join(ROOT, 'data', `ah044_orderbook_shape_triad_${RUN}.json`), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
}
main();
