#!/usr/bin/env node
// Descriptive anatomy of post-snapshot movement. It reports associations, not causal proof or a trading rule.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/opt/botalin-edge', RUN = 'amel-1785215500081', MIN = 60_000;
const load = p => fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const sign = x => x > 0 ? 1 : x < 0 ? -1 : 0;
const pct = (n, d) => d ? +(100 * n / d).toFixed(1) : null;
export function imbalance(ob) { const b = ob.bids10.reduce((s, [p, q]) => s + p * q, 0), a = ob.asks10.reduce((s, [p, q]) => s + p * q, 0); return (b - a) / (b + a); }
export function split(rows) { const s = [...rows].sort((a, b) => a.ts - b.ts), n = s.length; return { train: s.slice(0, ~~(n * .55)), validation: s.slice(~~(n * .55), ~~(n * .75)), holdout: s.slice(~~(n * .75), ~~(n * .90)), forward: s.slice(~~(n * .90)) }; }
if (process.argv.includes('--smoke')) { if (!(imbalance({ bids10: [[100, 2]], asks10: [[101, 1]] }) > 0) || Object.keys(split([{ ts: 1 }, { ts: 2 }])).length !== 4) process.exit(1); console.log('SMOKE: 2 passed, 0 failed'); process.exit(0); }

function summary(rows, predicate, predictedSide = null) {
  const xs = rows.filter(predicate), strong = xs.filter(x => Math.abs(x.future15_pct) >= .3), correct = predictedSide ? xs.filter(x => sign(x.future15_pct) === predictedSide(x)) : [];
  return { n: xs.length, strong_move_rate_pct: pct(strong.length, xs.length), mean_abs_move_pct: xs.length ? +(xs.reduce((s, x) => s + Math.abs(x.future15_pct), 0) / xs.length).toFixed(4) : null, direction_accuracy_pct: predictedSide ? pct(correct.length, xs.length) : null };
}
function main() {
  const log = path.join(ROOT, 'logs/active_market_event_logger'), back = path.join(ROOT, 'data/amel_orderbook_backfill', RUN);
  const events = Object.fromEntries(load(path.join(log, `events_${RUN}.jsonl`)).map(x => [x.event_id, x]));
  const books = load(path.join(log, `orderbook_${RUN}.jsonl`)).filter(x => x.fetch_ok && events[x.event_id]);
  const sources = {}; for (const symbol of [...new Set(books.map(x => x.symbol))]) { const bars = JSON.parse(fs.readFileSync(path.join(back, `${symbol}_1m.json`), 'utf8')); sources[symbol] = { bars, at: new Map(bars.map((b, i) => [b[0], i])) }; }
  const rows = [];
  for (const ob of books) { const e = events[ob.event_id], s = sources[ob.symbol], ts = Math.floor(ob.snapshot_ts / MIN) * MIN + MIN, i = s.at.get(ts); if (i == null || i + 15 >= s.bars.length || ob.snapshot_ts - e.detected_ts > 5_000) continue; const entry = s.bars[i][1], exit = s.bars[i + 15][1]; rows.push({ ts, symbol: ob.symbol, future15_pct: (exit - entry) / entry * 100, im: imbalance(ob), spread_bps: ob.spread_bps, depth: ob.depth_usd_10bps, event_side: e.event_direction.startsWith('LONG') ? 1 : -1, btc: e.btc_context, eth: e.eth_context, recent_volatility: e.recent_volatility, volume_ratio: e.recent_volume_ratio, family: e.event_family.replace(/_[0-9]+[MH]$/, '') }); }
  const definitions = {
    baseline: [() => true, null],
    high_event_volume: [r => r.volume_ratio >= 2, null],
    high_event_volatility: [r => r.recent_volatility >= .008, null],
    strong_book_imbalance: [r => Math.abs(r.im) >= .22, r => sign(r.im)],
    tight_deep_book: [r => r.spread_bps <= 1.37 && r.depth >= 333664, r => sign(r.im)],
    wide_or_thin_book: [r => r.spread_bps > 3.59 || r.depth < 68492, r => sign(r.im)],
    event_direction: [r => ['MOMENTUM_IMPULSE', 'VOLUME_BURST', 'VOL_EXPANSION'].includes(r.family), r => r.event_side],
    btc_eth_agree_with_event: [r => r.btc === r.event_side && r.eth === r.event_side, r => r.event_side],
  };
  const parts = split(rows), out = { run_id: RUN, generated_at_utc: new Date().toISOString(), interpretation: 'Associations to post-snapshot 15m return. Strong means absolute return at least 0.3 percent. Direction accuracy is descriptive and excludes flat returns.', usable_rows: rows.length, definitions: {}, verdict: 'EXPLANATION_MAP_NOT_A_STRATEGY' };
  for (const [name, [predicate, side]] of Object.entries(definitions)) out.definitions[name] = Object.fromEntries(Object.entries(parts).map(([part, xs]) => [part, summary(xs, predicate, side)]));
  fs.writeFileSync(path.join(ROOT, 'data', `ah045_movement_anatomy_${RUN}.json`), JSON.stringify(out, null, 2)); console.log(JSON.stringify(out, null, 2));
}
main();
