#!/usr/bin/env node
// server-shadow.mjs — анализ пропущенных торговых возможностей из rejected_signals
// Запуск: node server-shadow.mjs [--days=7] [--reasons=limit_or_cooldown:entered_2,pattern-negative-ev] [--min-trades=3]

const DB_URL = "http://localhost:3001";
const OKX_URL = "https://www.okx.com";

const DAYS       = parseInt(getArg("--days",  "7"));
const MIN_TRADES = parseInt(getArg("--min-trades", "3"));
const REASONS_ARG = getArg("--reasons", "limit_or_cooldown:entered_2,pattern-negative-ev");
const REASONS    = REASONS_ARG.split(",").map(s => s.trim());

// Свечей для ожидания outcome по таймфрейму
const TTL_BY_INTERVAL = { "1m": 30, "5m": 24, "15m": 16, "1h": 12, "4h": 8, "1d": 6 };
const OKX_INTERVALS   = { "1m": "1m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1H", "2h": "2H", "4h": "4H", "1d": "1D" };
const INTERVAL_MS     = { "1m": 60e3, "5m": 5*60e3, "15m": 15*60e3, "30m": 30*60e3, "1h": 3600e3, "4h": 4*3600e3, "1d": 86400e3 };

// RR по стратегиям (из calculateAtrStopModel + rr1/rr2 в server-autobot.mjs)
const STRATEGY_RR = {
  "pullback":        { stopMult: 0.75, minPct: 0.35, maxPct: 2.5, rr1: 1.35, rr2: 2.0  },
  "breakout":        { stopMult: 0.75, minPct: 0.35, maxPct: 2.5, rr1: 1.6,  rr2: 2.2  },
  "rsi-reversal":    { stopMult: 0.75, minPct: 0.35, maxPct: 2.5, rr1: 1.2,  rr2: 1.8  },
  "vwap-reversion":  { stopMult: 0.75, minPct: 0.35, maxPct: 2.5, rr1: 1.2,  rr2: 1.8  },
  "momentum":        { stopMult: 1.1,  minPct: 0.5,  maxPct: 4.0, rr1: 2.2,  rr2: 3.8  },
  "trend":           { stopMult: 0.75, minPct: 0.35, maxPct: 2.5, rr1: 1.6,  rr2: 2.2  },
};
const TRADE_AMOUNT = 200; // USDT
const FEE_PCT      = 0.12; // %

function getArg(name, def) {
  const a = process.argv.find(x => x.startsWith(name + "=") || x === name);
  if (!a) return def;
  return a.includes("=") ? a.split("=").slice(1).join("=") : (process.argv[process.argv.indexOf(a) + 1] || def);
}

function log(...args) { console.error("[shadow]", ...args); }

async function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return r;
  } finally { clearTimeout(t); }
}

// ─── OKX OHLCV ──────────────────────────────────────────────────────────────
const ohlcvCache = new Map();

function toOkxSymbol(symbol) { return symbol.replace("/", "-"); }

async function fetchOhlcv(symbol, interval, startMs, endMs) {
  const cacheKey = `${symbol}|${interval}|${Math.floor(startMs/3600e3)}`;
  if (ohlcvCache.has(cacheKey)) return ohlcvCache.get(cacheKey);

  const bar    = OKX_INTERVALS[interval] || "1H";
  const instId = toOkxSymbol(symbol);
  // OKX: after = timestamp мс, возвращает свечи ДО этого момента (не включая)
  // Чтобы получить свечи с startMs по endMs, используем after=endMs+1
  const url = `${OKX_URL}/api/v5/market/candles?instId=${instId}&bar=${bar}&after=${endMs + 1}&limit=300`;

  try {
    const r = await fetchWithTimeout(url);
    if (!r.ok) { log(`OKX ${r.status} for ${symbol}`); return []; }
    const j = await r.json();
    if (j.code !== "0" || !Array.isArray(j.data)) { log(`OKX err ${symbol}: ${j.msg}`); return []; }
    const candles = j.data.slice().reverse().map(([ts, o, h, l, c, v]) => ({
      ts: Number(ts), open: +o, high: +h, low: +l, close: +c, volume: +v
    })).filter(c => c.ts >= startMs - INTERVAL_MS[interval]);
    ohlcvCache.set(cacheKey, candles);
    return candles;
  } catch (e) {
    log(`fetch error ${symbol}: ${e.message}`);
    return [];
  }
}

// ─── Симуляция одной сделки ──────────────────────────────────────────────────
function simulateTrade(candles, entryTs, side, entry, stopDist, rr, interval) {
  const stop    = side === "LONG" ? entry - stopDist : entry + stopDist;
  const target1 = side === "LONG" ? entry + stopDist * rr.rr1 : entry - stopDist * rr.rr1;
  const target2 = side === "LONG" ? entry + stopDist * rr.rr2 : entry - stopDist * rr.rr2;
  const ttl     = TTL_BY_INTERVAL[interval] || 12;

  const startIdx = candles.findIndex(c => c.ts >= entryTs);
  if (startIdx === -1) return null;

  const window = candles.slice(startIdx, startIdx + ttl + 1);
  for (const c of window) {
    if (side === "LONG") {
      if (c.low  <= stop)    return { outcome: "stop",    exit: stop,    pnl: calcPnl(entry, stop,    side) };
      if (c.high >= target2) return { outcome: "target2", exit: target2, pnl: calcPnl(entry, target2, side) };
      if (c.high >= target1) return { outcome: "target1", exit: target1, pnl: calcPnl(entry, target1, side) };
    } else {
      if (c.high >= stop)    return { outcome: "stop",    exit: stop,    pnl: calcPnl(entry, stop,    side) };
      if (c.low  <= target2) return { outcome: "target2", exit: target2, pnl: calcPnl(entry, target2, side) };
      if (c.low  <= target1) return { outcome: "target1", exit: target1, pnl: calcPnl(entry, target1, side) };
    }
  }
  const lastClose = window.at(-1)?.close ?? entry;
  return { outcome: "expired", exit: lastClose, pnl: calcPnl(entry, lastClose, side) };
}

function calcPnl(entry, exit, side) {
  const pct = (exit - entry) / entry * (side === "LONG" ? 1 : -1) * 100;
  return (pct - FEE_PCT * 2) / 100 * TRADE_AMOUNT;
}

// ─── main ───────────────────────────────────────────────────────────────────
async function main() {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

  // PostgREST or() фильтр
  const orFilter = REASONS.map(r => `reject_reason.eq.${encodeURIComponent(r)}`).join(",");
  const url = `${DB_URL}/rejected_signals?recorded_at=gte.${since}&or=(${orFilter})&select=id,recorded_at,asset,timeframe,side,strategy,score,reject_reason,features&order=recorded_at.asc&limit=10000`;

  log(`Загружаю rejected_signals (${REASONS.join(", ")}) за ${DAYS} дней...`);
  const r = await fetchWithTimeout(url, 15000);
  const signals = await r.json();

  if (!Array.isArray(signals)) { console.error("Ошибка запроса:", signals); process.exit(1); }
  log(`Загружено ${signals.length} сигналов`);

  // Группируем по asset+interval для единой загрузки OHLCV
  const groups = new Map();
  for (const s of signals) {
    const key = `${s.asset}|${s.timeframe}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  log(`Уникальных asset×timeframe: ${groups.size}. Загружаю OHLCV с OKX...`);

  const candlesByKey = new Map();
  let loaded = 0;
  for (const [key, sigs] of groups) {
    const [asset, interval] = key.split("|");
    const earliest = Math.min(...sigs.map(s => new Date(s.recorded_at).getTime()));
    const startMs  = earliest - 3 * (INTERVAL_MS[interval] || 3600e3);
    const endMs    = Date.now();
    await new Promise(res => setTimeout(res, 150));
    const candles  = await fetchOhlcv(asset, interval, startMs, endMs);
    candlesByKey.set(key, candles);
    loaded++;
    if (loaded % 10 === 0) log(`  загружено ${loaded}/${groups.size}...`);
  }

  // Симулируем каждый сигнал
  const results = [];
  for (const sig of signals) {
    const key     = `${sig.asset}|${sig.timeframe}`;
    const candles = candlesByKey.get(key) || [];
    if (!candles.length) continue;
    const f = sig.features || {};
    const atrPct = f.atrPct;
    if (!atrPct || !Number.isFinite(atrPct)) continue;

    const rr    = STRATEGY_RR[sig.strategy] || STRATEGY_RR["pullback"];
    const sigTs = new Date(sig.recorded_at).getTime();

    // Свеча непосредственно перед/в момент сигнала
    const entryCandle = candles.findLast ? candles.findLast(c => c.ts <= sigTs) : [...candles].reverse().find(c => c.ts <= sigTs);
    if (!entryCandle) continue;

    const entry    = entryCandle.close;
    const stopPct  = Math.max(rr.minPct, Math.min(rr.maxPct, atrPct * rr.stopMult));
    const stopDist = entry * stopPct / 100;

    const sim = simulateTrade(candles, entryCandle.ts, sig.side, entry, stopDist, rr, sig.timeframe);
    if (!sim) continue;

    results.push({
      recorded_at:   sig.recorded_at,
      asset:         sig.asset,
      timeframe:     sig.timeframe,
      side:          sig.side,
      strategy:      sig.strategy,
      score:         sig.score,
      reject_reason: sig.reject_reason,
      atrPct,
      entry,
      stopPct:       +stopPct.toFixed(3),
      outcome:       sim.outcome,
      pnl:           +sim.pnl.toFixed(2),
    });
  }

  log(`Симулировано ${results.length} из ${signals.length} сигналов`);

  // ─── Отчёт ────────────────────────────────────────────────────────────────
  const W = 70;
  const line = "─".repeat(W);
  console.log("\n" + "═".repeat(W));
  console.log("  Shadow Analysis — пропущенные торговые возможности");
  console.log(`  Период: ${DAYS} дней  |  Причины: ${REASONS.join(", ")}`);
  console.log("═".repeat(W));

  for (const reason of REASONS) {
    const group = results.filter(r => r.reject_reason.startsWith(reason.split(":")[0]));
    if (!group.length) { console.log(`\n  [${reason}] — нет данных`); continue; }
    console.log(`\n${line}`);
    const reasonLabel = reason === "limit_or_cooldown:entered_2"
      ? "ЛИМИТ ПАРАЛЛЕЛЬНЫХ (прошли все фильтры, но уже 2 позиции)"
      : reason === "pattern-negative-ev"
      ? "PATTERN NEGATIVE EV (заблокированы learning policy)"
      : reason;
    console.log(`  ${reasonLabel}`);
    console.log(`  ${group.length} сигналов`);
    console.log(line);
    printGroup(group, MIN_TRADES);
  }

  // Сводный итог
  const wins   = results.filter(r => r.outcome === "target1" || r.outcome === "target2");
  const totalPnl = results.reduce((s, r) => s + r.pnl, 0);
  console.log("\n" + "═".repeat(W));
  if (results.length > 0) {
    console.log(`  ИТОГО пропущено: ${results.length} сделок`);
    console.log(`  WR:  ${(wins.length / results.length * 100).toFixed(1)}%`);
    console.log(`  PNL (если бы открыли): ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} USDT`);
  } else {
    console.log("  Нет симулированных сделок (нет данных OHLCV)");
  }
  console.log("═".repeat(W) + "\n");
}

function printGroup(results, minTrades) {
  const byStrategy = groupBy(results, r => r.strategy);
  for (const [strat, items] of Object.entries(byStrategy).sort((a,b) => b[1].length - a[1].length)) {
    const wins   = items.filter(r => r.outcome !== "stop" && r.outcome !== "expired");
    const pnl    = items.reduce((s, r) => s + r.pnl, 0);
    const wr     = wins.length / items.length * 100;
    const losses = items.filter(r => r.outcome === "stop");
    const avgW   = wins.length   ? wins.reduce((s,r)=>s+r.pnl,0)/wins.length     : 0;
    const avgL   = losses.length ? losses.reduce((s,r)=>s+r.pnl,0)/losses.length : 0;

    console.log(`\n  [${strat}]  ${items.length} сд  WR ${wr.toFixed(1)}%  PNL ${pnl>=0?"+":""}${pnl.toFixed(2)} USDT  avg+${avgW.toFixed(2)}/avg${avgL.toFixed(2)}`);

    // По паттерну asset+side
    const byPattern = groupBy(items, r => `${r.asset} ${r.side}`);
    const rows = Object.entries(byPattern)
      .filter(([, v]) => v.length >= minTrades)
      .sort((a, b) => b[1].reduce((s,r)=>s+r.pnl,0) - a[1].reduce((s,r)=>s+r.pnl,0));

    if (!rows.length) { console.log("    (нет паттернов с ≥" + minTrades + " сделками)"); continue; }

    for (const [label, items2] of rows) {
      const w2  = items2.filter(r => r.outcome !== "stop" && r.outcome !== "expired");
      const p2  = items2.reduce((s,r) => s+r.pnl, 0);
      const wr2 = w2.length / items2.length * 100;
      const marker = p2 > 5 ? "✓" : p2 < -5 ? "✗" : "~";
      const byOutcome = groupBy(items2, r => r.outcome);
      const outcomeStr = Object.entries(byOutcome).map(([k,v])=>`${k}:${v.length}`).join(" ");
      console.log(`    ${marker} ${label.padEnd(22)} ${String(items2.length).padStart(3)} сд  WR ${wr2.toFixed(0).padStart(3)}%  ${(p2>=0?"+":"") + p2.toFixed(2)} USDT  [${outcomeStr}]`);
    }
  }
}

function groupBy(arr, fn) {
  const m = {};
  for (const item of arr) { const k = fn(item); (m[k] = m[k] || []).push(item); }
  return m;
}

main().catch(e => { console.error(e); process.exit(1); });
