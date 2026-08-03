#!/usr/bin/env node
/**
 * server-backtest.mjs — Botalin backtesting engine
 *
 * Usage:
 *   node server-backtest.mjs
 *   node server-backtest.mjs --strategy pullback,breakout --interval 1h --days 365 --amount 200
 *   node server-backtest.mjs --symbols BTC/USDT,ETH/USDT,SOL/USDT
 *   node server-backtest.mjs --output results.json
 */

const DEFAULT_SYMBOLS = [
  "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT",
  "DOGE/USDT", "ADA/USDT", "AVAX/USDT", "LINK/USDT", "DOT/USDT",
  "TIA/USDT", "OP/USDT", "ARB/USDT", "LDO/USDT", "NEAR/USDT"
];

const BYBIT_INTERVAL = { "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "D" };

const args        = parseArgs();
const strategies  = parseList(args.strategy || "pullback,breakout").filter(s => ["pullback","breakout"].includes(s));
const interval    = args.interval  || "1h";
const days        = Number(args.days)   || 365;
const amountUsdt  = Number(args.amount) || 200;
const depositUsdt = Number(args.deposit)|| 10000;
const symbols     = parseList(args.symbols || DEFAULT_SYMBOLS.join(",")).map(s => s.toUpperCase());
const outputFile  = args.output || null;

// ─── BYBIT DATA FETCH ─────────────────────────────────────────────────────────

async function fetchWithTimeout(url, timeoutMs = 12_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("fetch timeout")), timeoutMs);
    fetch(url).then(r => r.json()).then(j => { clearTimeout(timer); resolve(j); }).catch(e => { clearTimeout(timer); reject(e); });
  });
}

async function fetchCandles(symbol, interval, days) {
  const bybitSym = symbol.replace("/", "");
  const ivKey    = BYBIT_INTERVAL[interval] || "60";
  const startMs  = Date.now() - days * 24 * 60 * 60 * 1000;
  let   cursor   = Date.now();
  const map      = new Map();

  while (cursor > startMs) {
    const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${bybitSym}&interval=${ivKey}&end=${cursor}&limit=200`;
    let json;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        json = await fetchWithTimeout(url, 12_000);
        break;
      } catch {
        await wait(800 * (attempt + 1));
      }
    }
    const list = json?.result?.list;
    if (!Array.isArray(list) || !list.length) break;
    let oldest = cursor;
    let reachedStart = false;
    for (const row of list) {
      const t = Number(row[0]);
      if (t < startMs) { reachedStart = true; break; }
      map.set(t, { time: t, open: +row[1], high: +row[2], low: +row[3], close: +row[4], volume: +row[5] });
      oldest = Math.min(oldest, t);
    }
    if (reachedStart || oldest >= cursor) break;
    cursor = oldest - 1;
    await wait(150);
  }

  return [...map.values()].sort((a, b) => a.time - b.time);
}

// ─── INDICATORS ───────────────────────────────────────────────────────────────

function ema(values, period) {
  const k = 2 / (period + 1);
  let e = null;
  return values.map(v => (e = e === null ? v : v * k + e * (1 - k)));
}

function rsi(closes, period = 14) {
  const out = Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let ag = 0, al = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) ag += d; else al -= d;
  }
  ag /= period; al /= period;
  out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + Math.max(0,  d)) / period;
    al = (al * (period - 1) + Math.max(0, -d)) / period;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

function atr(candles, period = 14) {
  const tr  = candles.map((c, i) => i === 0 ? c.high - c.low :
    Math.max(c.high - c.low, Math.abs(c.high - candles[i-1].close), Math.abs(c.low - candles[i-1].close)));
  const out = Array(candles.length).fill(null);
  let   val = tr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out[period - 1] = val;
  for (let i = period; i < candles.length; i++) {
    val = (val * (period - 1) + tr[i]) / period;
    out[i] = val;
  }
  return out;
}

function macd(closes, fast = 12, slow = 26, signal = 9) {
  const ef  = ema(closes, fast);
  const es  = ema(closes, slow);
  const ml  = ef.map((v, i) => v - es[i]);
  const sl  = ema(ml, signal);
  return ml.map((m, i) => ({ macd: m, signal: sl[i], hist: m - sl[i] }));
}

function supertrend(candles, atrVals, factor = 3.0) {
  const out = Array(candles.length).fill(null);
  let dir = 1, prevUp = null, prevDn = null;
  for (let i = 0; i < candles.length; i++) {
    const a = atrVals[i];
    if (a === null) continue;
    const mid = (candles[i].high + candles[i].low) / 2;
    let up = mid + factor * a;
    let dn = mid - factor * a;
    if (prevUp !== null) {
      up = (up < prevUp || candles[i-1].close > prevUp) ? up : prevUp;
      dn = (dn > prevDn || candles[i-1].close < prevDn) ? dn : prevDn;
    }
    if      (dir ===  1 && candles[i].close < dn) dir = -1;
    else if (dir === -1 && candles[i].close > up) dir =  1;
    out[i] = dir;
    prevUp = up; prevDn = dn;
  }
  return out;
}

function volRatio(volumes, period = 20) {
  return volumes.map((v, i) => {
    if (i < period) return 1;
    const avg = volumes.slice(i - period, i).reduce((s, x) => s + x, 0) / period;
    return avg > 0 ? v / avg : 1;
  });
}

// ─── STRATEGY SIGNALS ─────────────────────────────────────────────────────────

function pullbackSignal(candles, i, ind) {
  if (i < 210) return null;
  const { ema20, ema50, rsiV, atrV, macdV, stV } = row(ind, i);
  if (!ema20 || !ema50 || rsiV === null || !atrV || !macdV) return null;

  const c = candles[i];

  // LONG: тренд EMA20>EMA50, откат к EMA20 (±2%), RSI показывает перепроданность
  if (ema20 > ema50 &&
      c.close >= ema20 * 0.984 && c.close <= ema20 * 1.018 &&
      rsiV >= 28 && rsiV <= 52 &&
      (macdV.hist > 0 || stV === 1)) {
    const stop   = Math.min(c.low, c.close - atrV * 1.5);
    const riskPt = c.close - stop;
    if (riskPt <= 0) return null;
    const target = c.close + riskPt * 2.2;
    return { side: "LONG", entry: c.close, stop, target };
  }

  // SHORT: тренд EMA20<EMA50, откат к EMA20 (±2%), RSI показывает перекупленность
  if (ema20 < ema50 &&
      c.close >= ema20 * 0.982 && c.close <= ema20 * 1.016 &&
      rsiV >= 48 && rsiV <= 72 &&
      (macdV.hist < 0 || stV === -1)) {
    const stop   = Math.max(c.high, c.close + atrV * 1.5);
    const riskPt = stop - c.close;
    if (riskPt <= 0) return null;
    const target = c.close - riskPt * 2.2;
    return { side: "SHORT", entry: c.close, stop, target };
  }
  return null;
}

function breakoutSignal(candles, i, ind) {
  if (i < 210) return null;
  const { atrV, volR, ema50 } = row(ind, i);
  if (!atrV || volR < 2.0) return null;   // строже: 2× объём вместо 1.5×

  const c  = candles[i];
  const lb = 25;                           // шире: 25 баров вместо 20
  const window = candles.slice(i - lb, i);
  const hh = Math.max(...window.map(x => x.high));
  const ll = Math.min(...window.map(x => x.low));

  // LONG: пробой 25-барного максимума с 2× объёмом
  if (c.close > hh && c.open <= hh) {
    const stop   = c.close - atrV * 1.5;
    const riskPt = c.close - stop;
    if (riskPt <= 0) return null;
    const target = c.close + riskPt * 2.5;
    return { side: "LONG", entry: c.close, stop, target };
  }
  // SHORT: пробой 25-барного минимума с 2× объёмом
  if (c.close < ll && c.open >= ll) {
    const stop   = c.close + atrV * 1.5;
    const riskPt = stop - c.close;
    if (riskPt <= 0) return null;
    const target = c.close - riskPt * 2.5;
    return { side: "SHORT", entry: c.close, stop, target };
  }
  return null;
}

function row(ind, i) {
  return {
    ema20: ind.ema20[i], ema50: ind.ema50[i], ema200: ind.ema200[i],
    rsiV:  ind.rsiV[i],  atrV:  ind.atrV[i],
    macdV: ind.macdV[i], stV:   ind.stV[i],
    volR:  ind.volR[i]
  };
}

// ─── POSITION SIMULATOR ───────────────────────────────────────────────────────

function simulate(candles, indicators, signalFn, amountUsdt) {
  const trades   = [];
  const open     = [];         // max 2 concurrent positions
  const MAX_BARS = 96;         // TTL: закрыть если висит > 96 баров

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    // Обновляем и закрываем позиции
    for (const pos of [...open]) {
      if (pos.status !== "open") continue;
      const barsOpen = i - pos.entryBar;
      const hitStop  = pos.side === "LONG" ? c.low  <= pos.stop   : c.high >= pos.stop;
      const hitTgt   = pos.side === "LONG" ? c.high >= pos.target : c.low  <= pos.target;
      // Оба сработали в одном баре — приоритет стопу (консервативно)
      if (hitStop || hitTgt || barsOpen >= MAX_BARS) {
        pos.exitPrice = hitStop ? pos.stop : hitTgt ? pos.target : c.close;
        pos.status    = hitStop ? "stop"   : hitTgt ? "target"   : "ttl";
        pos.exitBar   = i;
        pos.exitTime  = c.time;
        const diff    = pos.side === "LONG"
          ? (pos.exitPrice - pos.entry) / pos.entry
          : (pos.entry - pos.exitPrice) / pos.entry;
        pos.pnl    = amountUsdt * diff;
        pos.pnlPct = diff * 100;
        trades.push(pos);
        open.splice(open.indexOf(pos), 1);
      }
    }

    // Новый сигнал — не более 2 позиций одновременно
    if (open.length < 2) {
      const sig = signalFn(candles, i, indicators);
      if (sig && !open.some(p => p.side === sig.side)) {
        open.push({ ...sig, entryBar: i, entryTime: c.time, status: "open" });
      }
    }
  }
  return trades;
}

// ─── METRICS ─────────────────────────────────────────────────────────────────

function metrics(trades, depositUsdt, days) {
  if (!trades.length) return null;
  const wins  = trades.filter(t => t.pnl > 0);
  const loss  = trades.filter(t => t.pnl <= 0);
  const total = trades.reduce((s, t) => s + t.pnl, 0);
  const gw    = wins.reduce((s, t) => s + t.pnl, 0);
  const gl    = Math.abs(loss.reduce((s, t) => s + t.pnl, 0));
  const aw    = wins.length ? gw / wins.length : 0;
  const al    = loss.length ? gl / loss.length : 0;
  const pf    = gl > 0 ? gw / gl : gw > 0 ? 999 : 0;
  const wr    = wins.length / trades.length * 100;
  const bew   = aw + al > 0 ? al / (aw + al) * 100 : 0;

  // Equity curve + max drawdown
  let eq = depositUsdt, peak = eq, mdd = 0;
  const dailyPnl = new Map();
  for (const t of trades) {
    eq   += t.pnl;
    peak  = Math.max(peak, eq);
    mdd   = Math.max(mdd, (peak - eq) / peak * 100);
    const day = Math.floor(t.entryTime / 86_400_000);
    dailyPnl.set(day, (dailyPnl.get(day) || 0) + t.pnl);
  }

  // Sharpe (annualized, risk-free = 0)
  const dr  = [...dailyPnl.values()].map(p => p / depositUsdt);
  const mu  = dr.reduce((s, v) => s + v, 0) / Math.max(dr.length, 1);
  const std = Math.sqrt(dr.reduce((s, v) => s + (v - mu) ** 2, 0) / Math.max(dr.length, 1));
  const sharpe = std > 0 ? (mu / std) * Math.sqrt(252) : 0;

  return {
    count: trades.length,
    wins: wins.length,
    losses: loss.length,
    wr, bew, total, pct: total / depositUsdt * 100,
    avgWin: aw, avgLoss: al, pf, mdd, sharpe,
    best:  Math.max(...trades.map(t => t.pnl)),
    worst: Math.min(...trades.map(t => t.pnl)),
    perMonth: trades.length / (days / 30.5)
  };
}

// ─── PRINT ────────────────────────────────────────────────────────────────────

function printMetrics(m) {
  if (!m) { console.log("  Нет сделок."); return; }
  const s = m.total >= 0 ? "+" : "";
  console.log(`  Сделок: ${m.count}  (${m.perMonth.toFixed(1)}/мес)  |  Побед: ${m.wins}  Поражений: ${m.losses}`);
  console.log(`  Win Rate: ${m.wr.toFixed(1)}%  (безубыток ≥ ${m.bew.toFixed(1)}%)`);
  console.log(`  PNL: ${s}${m.total.toFixed(2)} USDT  (${s}${m.pct.toFixed(1)}% от депозита)`);
  console.log(`  Avg win: +${m.avgWin.toFixed(2)}  |  Avg loss: -${m.avgLoss.toFixed(2)}  |  Profit factor: ${m.pf.toFixed(2)}`);
  console.log(`  Max drawdown: -${m.mdd.toFixed(2)}%  |  Sharpe: ${m.sharpe.toFixed(2)}`);
  console.log(`  Лучшая: +${m.best.toFixed(2)}  |  Худшая: ${m.worst.toFixed(2)}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"═".repeat(62)}`);
  console.log(`  Botalin Backtest  |  ${interval}  |  ${days} дней  |  ${amountUsdt} USDT/сделка`);
  console.log(`  Депозит: ${depositUsdt} USDT  |  Стратегии: ${strategies.join(", ")}`);
  console.log(`${"═".repeat(62)}\n`);

  const allTrades = Object.fromEntries(strategies.map(s => [s, []]));
  const bySym     = Object.fromEntries(strategies.map(s => [s, {}]));

  for (const sym of symbols) {
    process.stdout.write(`  ↓ ${sym.padEnd(12)}`);
    let candles;
    try {
      candles = await fetchCandles(sym, interval, days);
    } catch (e) {
      console.log(`ошибка: ${e.message}`);
      continue;
    }
    if (candles.length < 220) { console.log(`мало данных (${candles.length} баров)`); continue; }
    console.log(`${candles.length} баров`);

    const closes = candles.map(c => c.close);
    const atrV   = atr(candles, 14);
    const ind = {
      ema20: ema(closes, 20),
      ema50: ema(closes, 50),
      ema200:ema(closes, 200),
      rsiV:  rsi(closes, 14),
      atrV,
      macdV: macd(closes),
      stV:   supertrend(candles, atrV),
      volR:  volRatio(candles.map(c => c.volume), 20)
    };

    for (const strat of strategies) {
      const fn = strat === "pullback" ? pullbackSignal : breakoutSignal;
      const tr = simulate(candles, ind, fn, amountUsdt);
      tr.forEach(t => { t.symbol = sym; t.strategy = strat; });
      allTrades[strat].push(...tr);
      if (tr.length) bySym[strat][sym] = metrics(tr, depositUsdt, days);
    }
  }

  // ─── PER-STRATEGY REPORT ───────────────────────────────────────────────────
  const output = {};
  for (const strat of strategies) {
    const label = strat === "pullback" ? "ОТКАТ  (Pullback)" : "ПРОБОЙ (Breakout)";
    console.log(`\n${"─".repeat(62)}`);
    console.log(`  ${label}`);
    console.log(`${"─".repeat(62)}`);

    const tr = allTrades[strat];
    const m  = metrics(tr, depositUsdt, days);
    printMetrics(m);

    if (Object.keys(bySym[strat]).length) {
      console.log("\n  Топ по символам:");
      Object.entries(bySym[strat])
        .sort((a, b) => b[1].total - a[1].total)
        .forEach(([sym, sm]) => {
          const s  = sm.total >= 0 ? "+" : "";
          const pf = sm.pf < 999 ? sm.pf.toFixed(2) : "∞";
          console.log(`    ${sym.padEnd(12)}  ${String(sm.count).padStart(3)} сделок  WR ${sm.wr.toFixed(0).padStart(2)}%  PNL ${(s+sm.total.toFixed(1)).padStart(9)} USDT  PF ${pf}`);
        });
    }
    output[strat] = { summary: m, bySymbol: bySym[strat], trades: tr };
  }

  console.log(`\n${"═".repeat(62)}\n`);

  if (outputFile) {
    const { writeFile } = await import("fs/promises");
    const slim = Object.fromEntries(
      Object.entries(output).map(([s, v]) => [s, { summary: v.summary, bySymbol: v.bySymbol }])
    );
    await writeFile(outputFile, JSON.stringify(slim, null, 2));
    console.log(`  Результаты сохранены: ${outputFile}\n`);
  }
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseArgs() {
  const a = {};
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i];
    if (k.startsWith("--")) {
      const key = k.slice(2);
      const val = process.argv[i + 1];
      a[key] = val && !val.startsWith("--") ? (i++, val) : true;
    }
  }
  return a;
}

function parseList(s) {
  return String(s).split(",").map(x => x.trim()).filter(Boolean);
}

main().catch(err => { console.error(err); process.exit(1); });
