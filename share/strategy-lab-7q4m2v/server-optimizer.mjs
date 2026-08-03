#!/usr/bin/env node
// server-optimizer.mjs — автономный оптимизатор learning policy
// Каждый запуск:
//   1. Анализирует rejected сигналы и реальные сделки
//   2. Вносит изменения в policy (block/prefer/unblock)
//   3. Записывает изменение в таблицу optimizer_log (или fallback JSONL)
//   4. Через EVAL_HOURS проверяет — улучшилась ли доходность после изменения
//   5. Если ухудшилась — откатывает изменение
//
// Запуск: node server-optimizer.mjs [--dry-run] [--lookback=4] [--max-changes=6] [--eval-hours=24]

const DB_URL     = "http://localhost:3001";
const OKX_URL    = "https://www.okx.com";
const POLICY_KEY = "botalin_learning_policy_v1";
const LOG_FILE   = "/opt/botalin/optimizer-log.jsonl";

const DRY_RUN    = process.argv.includes("--dry-run");
const LOOKBACK_H = parseFloat(getArg("--lookback",    "4"));
const MAX_CHANGES= parseInt(getArg("--max-changes",   "6"));
const EVAL_HOURS = parseFloat(getArg("--eval-hours",  "24")); // через сколько часов оценивать результат

const PARAM_SEARCH_KEY         = "botalin_signal_params_v1";
const PARAM_SEARCH_INTERVAL_H  = 12; // запускать param-search раз в 12 часов

// Пороги
const PREFER_MIN_SIGNALS  = 3;
const PREFER_WR_MIN       = 0.58;
const BLOCK_MIN_TRADES    = 5;
const BLOCK_WR_MAX        = 0.28;
const BLOCK_PNL_MAX       = -8;
const UNBLOCK_WR_MIN      = 0.60;
const UNBLOCK_MIN_SIGNALS = 5;
// Откат: смотрим на нормализованные метрики (не абсолют)
//   avg_pnl_per_trade ухудшился на > ROLLBACK_AVG_PNL_DELTA USDT/сделку
//   ИЛИ WR просел на > ROLLBACK_WR_DELTA процентных пунктов
//   При минимум ROLLBACK_MIN_TRADES сделок для оценки
const ROLLBACK_AVG_PNL_DELTA = -1.5;  // USDT/сделку — допустимое ухудшение
const ROLLBACK_WR_DELTA      = -0.15; // -15 п.п. WR — допустимое падение
const ROLLBACK_MIN_TRADES    = 5;     // минимум сделок для принятия решения об откате

const TTL_BY_INTERVAL = { "1m":30,"5m":24,"15m":16,"1h":12,"4h":8,"1d":6 };
const OKX_INTERVALS   = { "1m":"1m","5m":"5m","15m":"15m","30m":"30m","1h":"1H","4h":"4H","1d":"1D" };
const INTERVAL_MS     = { "1m":60e3,"5m":300e3,"15m":900e3,"30m":1800e3,"1h":3600e3,"4h":14400e3,"1d":86400e3 };
const STRATEGY_RR     = {
  "pullback":       { stopMult:0.75, minPct:0.35, maxPct:2.5, rr1:1.35, rr2:2.0 },
  "breakout":       { stopMult:0.75, minPct:0.35, maxPct:2.5, rr1:1.6,  rr2:2.2 },
  "rsi-reversal":   { stopMult:0.75, minPct:0.35, maxPct:2.5, rr1:1.2,  rr2:1.8 },
  "vwap-reversion": { stopMult:0.75, minPct:0.35, maxPct:2.5, rr1:1.2,  rr2:1.8 },
  "momentum":       { stopMult:1.1,  minPct:0.5,  maxPct:4.0, rr1:2.2,  rr2:3.8 },
  "trend":          { stopMult:0.75, minPct:0.35, maxPct:2.5, rr1:1.6,  rr2:2.2 },
};
const TRADE_AMOUNT = 200;
const FEE_PCT      = 0.12;

import { readFile, appendFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);

function getArg(name, def) {
  const a = process.argv.find(x => x.startsWith(name+"=") || x === name);
  if (!a) return def;
  return a.includes("=") ? a.split("=").slice(1).join("=") : (process.argv[process.argv.indexOf(a)+1]||def);
}

function log(...args) {
  const ts = new Date().toISOString().slice(0,19).replace("T"," ");
  console.log(`[${ts}]`, ...args);
}

async function fetchWithTimeout(url, ms=10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

// ─── OKX OHLCV ──────────────────────────────────────────────────────────────
const ohlcvCache = new Map();
async function fetchOhlcv(symbol, interval, startMs) {
  const key = `${symbol}|${interval}|${Math.floor(startMs/3600e3)}`;
  if (ohlcvCache.has(key)) return ohlcvCache.get(key);
  const instId = symbol.replace("/","-");
  const bar    = OKX_INTERVALS[interval]||"1H";
  const url    = `${OKX_URL}/api/v5/market/candles?instId=${instId}&bar=${bar}&after=${Date.now()+1}&limit=300`;
  try {
    const r = await fetchWithTimeout(url, 8000);
    if (!r.ok) return [];
    const j = await r.json();
    if (j.code!=="0"||!Array.isArray(j.data)) return [];
    const candles = j.data.slice().reverse()
      .map(([ts,o,h,l,c,v]) => ({ ts:+ts,open:+o,high:+h,low:+l,close:+c,volume:+v }))
      .filter(c => c.ts >= startMs - (INTERVAL_MS[interval]||3600e3));
    ohlcvCache.set(key, candles);
    return candles;
  } catch { return []; }
}

function simulateTrade(candles, entryTs, side, entry, atrPct, strategy, interval) {
  const rr      = STRATEGY_RR[strategy]||STRATEGY_RR["pullback"];
  const stopPct = Math.max(rr.minPct, Math.min(rr.maxPct, atrPct*rr.stopMult));
  const dist    = entry*stopPct/100;
  const stop    = side==="LONG" ? entry-dist : entry+dist;
  const t1      = side==="LONG" ? entry+dist*rr.rr1 : entry-dist*rr.rr1;
  const t2      = side==="LONG" ? entry+dist*rr.rr2 : entry-dist*rr.rr2;
  const ttl     = TTL_BY_INTERVAL[interval]||12;
  const idx     = candles.findIndex(c => c.ts >= entryTs);
  if (idx===-1) return null;
  for (const c of candles.slice(idx, idx+ttl+1)) {
    if (side==="LONG") {
      if (c.low<=stop)  return "stop";
      if (c.high>=t2||c.high>=t1) return "target";
    } else {
      if (c.high>=stop) return "stop";
      if (c.low<=t2||c.low<=t1)   return "target";
    }
  }
  return "expired";
}

// ─── DB ─────────────────────────────────────────────────────────────────────
async function loadPolicy() {
  const r = await fetchWithTimeout(`${DB_URL}/crypto_strategy_settings?key=eq.${POLICY_KEY}&select=value`);
  const d = await r.json();
  return d[0]?.value || { blockedPatterns:[], preferredPatterns:[] };
}

async function savePolicy(policy) {
  if (DRY_RUN) return;
  const r = await fetch(`${DB_URL}/crypto_strategy_settings?key=eq.${POLICY_KEY}`, {
    method:"PATCH",
    headers:{"Content-Type":"application/json","Prefer":"return=minimal"},
    body: JSON.stringify({ value: policy })
  });
  if (!r.ok) throw new Error(`savePolicy: ${r.status}`);
}

async function loadRejected(sinceMs) {
  const r = await fetchWithTimeout(
    `${DB_URL}/rejected_signals?recorded_at=gte.${new Date(sinceMs).toISOString()}&reject_reason=like.limit_or_cooldown*&select=recorded_at,asset,timeframe,side,strategy,features&order=recorded_at.asc&limit=5000`,
    12000
  );
  return r.json();
}

async function loadTrades(sinceMs) {
  const r = await fetchWithTimeout(
    `${DB_URL}/crypto_strategy_trades?user_login=like.server*&status=in.(target,stop)&opened_at=gte.${new Date(sinceMs).toISOString()}&select=asset,side,pnl,status,user_login,opened_at&order=opened_at.asc&limit=5000`,
    12000
  );
  return r.json();
}

// ─── Лог изменений ──────────────────────────────────────────────────────────
async function readLog() {
  try {
    const txt = await readFile(LOG_FILE, "utf8");
    return txt.trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
  } catch { return []; }
}

async function appendLog(entry) {
  if (DRY_RUN) return;
  await appendFile(LOG_FILE, JSON.stringify(entry) + "\n");
}

// Считаем метрики по паттерну за промежуток времени
function patternStats(trades, patternKey, fromMs, toMs) {
  const [asset,,side,strategy] = patternKey.split("|");
  const matching = trades.filter(t => {
    const ts = new Date(t.opened_at).getTime();
    const s  = t.user_login?.replace("server-","");
    return t.asset===asset && t.side===side && s===strategy && ts>=fromMs && ts<=toMs;
  });
  const count  = matching.length;
  const pnl    = matching.reduce((s,t) => s+parseFloat(t.pnl||0), 0);
  const wins   = matching.filter(t=>t.status==="target").length;
  const wr     = count ? wins/count : null;
  const avgPnl = count ? pnl/count : null;
  return { count, pnl, wr, avgPnl };
}

// ─── ОТКАТ устаревших изменений ──────────────────────────────────────────────
async function processRollbacks(policy, allTrades) {
  const entries = await readLog();
  const evalCutoff = Date.now() - EVAL_HOURS * 3600e3;
  const blocked   = new Set(policy.blockedPatterns||[]);
  const preferred = new Set(policy.preferredPatterns||[]);
  let rolledBack = 0;

  for (const entry of entries) {
    // Оцениваем только изменения которые уже "созрели" (прошло EVAL_HOURS)
    if (entry.evaluated || entry.ts > evalCutoff) continue;
    if (entry.rolledBack) continue;

    const afterMs  = entry.ts;
    const windowMs = EVAL_HOURS * 3600e3;

    // Сравниваем нормализованные метрики ДО и ПОСЛЕ изменения
    const before = patternStats(allTrades, entry.pattern, afterMs - windowMs, afterMs);
    const after  = patternStats(allTrades, entry.pattern, afterMs, afterMs + windowMs);

    if (after.count < ROLLBACK_MIN_TRADES) continue; // Мало данных — ещё рано

    // Нормализованные дельты (не зависят от числа сделок)
    const avgPnlDelta = (after.avgPnl ?? 0) - (before.avgPnl ?? 0);
    const wrDelta     = (after.wr    ?? 0) - (before.wr    ?? 0);

    // Откат если avg PNL/сделку упал сильно ИЛИ WR просел сильно
    const needsRollback = avgPnlDelta < ROLLBACK_AVG_PNL_DELTA
                       || wrDelta     < ROLLBACK_WR_DELTA;

    log(`EVAL ${entry.action} ${entry.pattern}: ` +
        `avgPnl ${before.avgPnl?.toFixed(2)??"-"}→${after.avgPnl?.toFixed(2)??"-"} (Δ${avgPnlDelta.toFixed(2)}) ` +
        `WR ${before.wr!=null?(before.wr*100).toFixed(0)+"%":"-"}→${after.wr!=null?(after.wr*100).toFixed(0)+"%":"-"} (Δ${(wrDelta*100).toFixed(0)}п.п.) ` +
        `[${after.count} сд] → ${needsRollback ? "ОТКАТ" : "ОК"}`);

    if (needsRollback && !DRY_RUN) {
      // Откатываем действие
      if (entry.action === "block") {
        blocked.delete(entry.pattern);
        log(`  ↩ ROLLBACK block ${entry.pattern}`);
      } else if (entry.action === "prefer") {
        preferred.delete(entry.pattern);
        log(`  ↩ ROLLBACK prefer ${entry.pattern}`);
      } else if (entry.action === "unblock") {
        blocked.add(entry.pattern);
        preferred.delete(entry.pattern);
        log(`  ↩ ROLLBACK unblock ${entry.pattern}`);
      }
      entry.rolledBack = true;
      rolledBack++;
    }
    entry.evaluated = true;
    entry.evalResult = {
      before:     { count: before.count, avgPnl: before.avgPnl, wr: before.wr },
      after:      { count: after.count,  avgPnl: after.avgPnl,  wr: after.wr  },
      avgPnlDelta, wrDelta, rolledBack: needsRollback
    };
  }

  if (!DRY_RUN && rolledBack > 0) {
    // Перезаписываем лог с обновлёнными флагами
    await writeFile(LOG_FILE, entries.map(e => JSON.stringify(e)).join("\n") + "\n");
  }

  policy.blockedPatterns   = [...blocked].sort();
  policy.preferredPatterns = [...preferred].sort();
  return rolledBack;
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  const sinceMs = Date.now() - LOOKBACK_H * 3600e3;
  log(`═══ Оптимизатор ═══  lookback=${LOOKBACK_H}h  eval=${EVAL_HOURS}h  dry=${DRY_RUN}`);

  const [policy, rejected, trades] = await Promise.all([
    loadPolicy(),
    loadRejected(sinceMs),
    loadTrades(Date.now() - Math.max(LOOKBACK_H, EVAL_HOURS*2) * 3600e3),
  ]);

  // ── Откат неудачных прошлых изменений ──
  const rolledBack = await processRollbacks(policy, trades);
  if (rolledBack > 0) {
    await savePolicy(policy);
    log(`Откатов: ${rolledBack}`);
  }

  const blocked   = new Set(policy.blockedPatterns||[]);
  const preferred = new Set(policy.preferredPatterns||[]);
  log(`Policy: blocked=${blocked.size} preferred=${preferred.size} | rejected=${Array.isArray(rejected)?rejected.length:0} trades=${Array.isArray(trades)?trades.length:0}`);

  const changes = [];

  // Паттерны изменённые за последние 2 часа — не трогаем повторно (кулдаун)
  const recentLog = await readLog();
  const cooldownMs = 2 * 3600e3;
  const recentlyChanged = new Set(
    recentLog.filter(e => e.ts > Date.now() - cooldownMs).map(e => e.pattern)
  );

  // ── Блок 1: Анализ rejected (лимит позиций) ──
  if (Array.isArray(rejected) && rejected.length) {
    const byPattern = {};
    for (const s of rejected) {
      const k = `${s.asset}|${s.timeframe}|${s.side}|${s.strategy}`;
      (byPattern[k]=byPattern[k]||[]).push(s);
    }
    const candidates = Object.entries(byPattern)
      .filter(([,v]) => v.length >= PREFER_MIN_SIGNALS)
      .sort((a,b) => b[1].length - a[1].length)
      .slice(0, 20);

    const aiSet = [...new Set(candidates.map(([k]) => k.split("|").slice(0,2).join("|")))];
    const candleMap = {};
    for (const ai of aiSet) {
      const [a,iv] = ai.split("|");
      await new Promise(r=>setTimeout(r,120));
      candleMap[ai] = await fetchOhlcv(a, iv, sinceMs - (INTERVAL_MS[iv]||3600e3)*2);
    }

    for (const [pk, sigs] of candidates) {
      const [asset,interval,side,strategy] = pk.split("|");
      const candles = candleMap[`${asset}|${interval}`]||[];
      if (!candles.length) continue;

      let wins=0, total=0;
      for (const sig of sigs) {
        const f=sig.features||{};
        if (!f.atrPct) continue;
        const sigTs = new Date(sig.recorded_at).getTime();
        const ec = [...candles].reverse().find(c=>c.ts<=sigTs);
        if (!ec) continue;
        const out = simulateTrade(candles, ec.ts, side, ec.close, f.atrPct, strategy, interval);
        if (!out) continue;
        total++;
        if (out==="target") wins++;
      }
      if (total < PREFER_MIN_SIGNALS) continue;

      const wr = wins/total;
      const isBlocked   = blocked.has(pk);
      const isPreferred = preferred.has(pk);

      if (recentlyChanged.has(pk)) continue; // кулдаун 2ч

      if (wr >= PREFER_WR_MIN && !isPreferred) {
        if (isBlocked && total >= UNBLOCK_MIN_SIGNALS && wr >= UNBLOCK_WR_MIN)
          changes.push({ action:"unblock", pattern:pk, reason:`rejected WR ${(wr*100).toFixed(0)}% (${total} сд)` });
        else if (!isBlocked)
          changes.push({ action:"prefer",  pattern:pk, reason:`rejected WR ${(wr*100).toFixed(0)}% (${total} сд)` });
      }
      if (wr <= BLOCK_WR_MAX && !isBlocked && total >= PREFER_MIN_SIGNALS+1)
        changes.push({ action:"block", pattern:pk, reason:`rejected WR ${(wr*100).toFixed(0)}% (${total} сд)` });
    }
  }

  // ── Блок 2: Анализ реальных сделок ──
  if (Array.isArray(trades) && trades.length) {
    const recentTrades = trades.filter(t => new Date(t.opened_at).getTime() >= sinceMs);
    const byPattern = {};
    for (const t of recentTrades) {
      const strategy = t.user_login?.replace("server-","") || "pullback";
      const k = `${t.asset}|1h|${t.side}|${strategy}`;
      (byPattern[k]=byPattern[k]||[]).push(t);
    }
    for (const [pk, ts] of Object.entries(byPattern)) {
      if (ts.length < BLOCK_MIN_TRADES) continue;
      const wins = ts.filter(t=>t.status==="target").length;
      const wr   = wins/ts.length;
      const pnl  = ts.reduce((s,t)=>s+parseFloat(t.pnl||0),0);
      if (recentlyChanged.has(pk)) continue; // кулдаун 2ч
      if (wr<=BLOCK_WR_MAX && pnl<=BLOCK_PNL_MAX && !blocked.has(pk))
        changes.push({ action:"block",  pattern:pk, reason:`live WR ${(wr*100).toFixed(0)}% PNL ${pnl.toFixed(1)} (${ts.length} сд)` });
      if (wr>=PREFER_WR_MIN && pnl>0 && !preferred.has(pk) && !blocked.has(pk))
        changes.push({ action:"prefer", pattern:pk, reason:`live WR ${(wr*100).toFixed(0)}% PNL +${pnl.toFixed(1)} (${ts.length} сд)` });
    }
  }

  // ── Param search каждые 12 часов (независимо от наличия изменений policy) ──
  await maybeRunParamSearch();

  // ── Применяем ──
  const deduped = dedup(changes).slice(0, MAX_CHANGES);
  if (!deduped.length) { log("Нет новых изменений."); return; }

  log(`Изменений: ${deduped.length}`);
  const now = Date.now();
  for (const ch of deduped) {
    if (ch.action==="block")   { blocked.add(ch.pattern);    preferred.delete(ch.pattern); }
    if (ch.action==="prefer")  { preferred.add(ch.pattern); }
    if (ch.action==="unblock") { blocked.delete(ch.pattern); preferred.add(ch.pattern); }
    const icon = ch.action==="block" ? "✗" : ch.action==="prefer" ? "★" : "↑";
    log(`  ${icon} ${ch.action.toUpperCase().padEnd(7)} ${ch.pattern}  — ${ch.reason}`);
    await appendLog({ ts:now, action:ch.action, pattern:ch.pattern, reason:ch.reason, evaluated:false, rolledBack:false });
  }

  policy.blockedPatterns   = [...blocked].sort();
  policy.preferredPatterns = [...preferred].sort();
  await savePolicy(policy);
  log(`Policy сохранена: blocked=${blocked.size} preferred=${preferred.size}`);
}

function dedup(changes) {
  const seen = new Set();
  const prio = { unblock:0, prefer:1, block:2 };
  return [...changes].sort((a,b)=>(prio[a.action]||9)-(prio[b.action]||9)).filter(ch=>{
    if (seen.has(ch.pattern)) return false;
    seen.add(ch.pattern); return true;
  });
}

// ─── Param search: запускается раз в PARAM_SEARCH_INTERVAL_H ─────────────────
async function maybeRunParamSearch() {
  try {
    const r = await fetchWithTimeout(
      `${DB_URL}/crypto_strategy_settings?key=eq.${PARAM_SEARCH_KEY}&select=value`, 8000
    );
    const data = await r.json();
    const lastRun = data[0]?.value?.updated_at;
    const ageH = lastRun ? (Date.now() - new Date(lastRun).getTime()) / 3600e3 : Infinity;

    if (ageH < PARAM_SEARCH_INTERVAL_H) {
      log(`Param-search: последний ${ageH.toFixed(1)}ч назад — пропуск (интервал ${PARAM_SEARCH_INTERVAL_H}ч)`);
      return;
    }

    log(`Param-search: запуск (последний ${Number.isFinite(ageH) ? ageH.toFixed(1)+"ч назад" : "никогда"})...`);
    if (DRY_RUN) { log("Param-search: dry-run, пропуск."); return; }

    const { stdout, stderr } = await execFileAsync(
      "node", ["server-param-search.mjs", "--days=30"],
      { cwd: process.cwd(), timeout: 90000, encoding: "utf8" }
    );
    // Последние 2 строки stdout как сводка
    const lines = stdout.trim().split("\n").filter(Boolean);
    const summary = lines.slice(-4).join(" | ");
    log(`Param-search завершён: ${summary}`);
  } catch (e) {
    log(`Param-search ошибка: ${e.message?.slice(0, 200)}`);
  }
}

main().catch(e => { log("ОШИБКА:", e.message); process.exit(1); });
