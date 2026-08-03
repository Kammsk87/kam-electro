#!/usr/bin/env node
// server-param-search.mjs — Подбор оптимальных параметров стратегий pullback/breakout
// Использует hypotheticalOutcome, уже сохранённый в rejected_signals.features
//
// Запуск:  node server-param-search.mjs [--days=30] [--min-count=15] [--dry-run] [--verbose]
// Сохраняет результаты в DB ключ: botalin_signal_params_v1

const DB_URL    = "http://localhost:3001";
const DAYS      = parseInt(getArg("--days",      "30"));
const MIN_COUNT = parseInt(getArg("--min-count", "15"));
const DRY_RUN   = process.argv.includes("--dry-run");
const VERBOSE   = process.argv.includes("--verbose");

// ─── Сетки параметров ────────────────────────────────────────────────────────

// Pullback: RSI зона [rsiMin..rsiMax] — текущее: rsiMin=42, rsiMax=58
const PULLBACK_GRID = {
  rsiMin:         [36, 38, 40, 42, 44, 46, 48],
  rsiMax:         [54, 56, 58, 60, 62, 65, 68],
  minVolumeRatio: [0.25, 0.35, 0.5, 0.75, 1.0, 1.2],
  minScore:       [40, 45, 50, 55, 57, 60, 65],
};

// Breakout: текущие: minDistPastLevel=0.3, minOiChangePct=0.35, minVolRatio=1.3
const BREAKOUT_GRID = {
  minDistPastLevel: [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
  minOiChangePct:   [0.0, 0.1, 0.2, 0.35, 0.5, 0.75],
  minVolumeRatio:   [1.0, 1.1, 1.3, 1.5, 1.8, 2.0],
  minScore:         [40, 50, 55, 60, 65, 70],
};

// Текущие параметры (baseline для сравнения)
const CURRENT_PULLBACK  = { rsiMin: 42, rsiMax: 58, minVolumeRatio: 0.35, minScore: 57 };
const CURRENT_BREAKOUT  = { minDistPastLevel: 0.3, minOiChangePct: 0.35, minVolumeRatio: 1.3, minScore: 57 };

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function getArg(name, def) {
  const a = process.argv.find(x => x.startsWith(name + "=") || x === name);
  if (!a) return def;
  return a.includes("=") ? a.split("=").slice(1).join("=") : (process.argv[process.argv.indexOf(a) + 1] || def);
}

function log(...args) { if (VERBOSE) console.error("[param-search]", ...args); }
function info(...args) { console.error("[param-search]", ...args); }

async function fetchWithTimeout(url, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return r;
  } finally { clearTimeout(t); }
}

async function dbGet(path) {
  const r = await fetchWithTimeout(`${DB_URL}${path}`);
  if (!r.ok) throw new Error(`DB GET ${path}: ${r.status}`);
  return r.json();
}

async function dbPatch(table, filter, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${DB_URL}/${table}?${filter}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return res.ok;
  } finally { clearTimeout(t); }
}

// ─── Загрузка данных ─────────────────────────────────────────────────────────

async function loadSignals(strategy, days) {
  const since = new Date(Date.now() - days * 86400e3).toISOString();
  const url = `${DB_URL}/rejected_signals?recorded_at=gte.${since}&strategy=eq.${strategy}`
    + `&features=not.is.null&select=id,recorded_at,asset,timeframe,side,strategy,score,reject_reason,features`
    + `&order=recorded_at.asc&limit=20000`;

  const all = await dbGet(url.replace(DB_URL, ""));
  // Только записи с hypotheticalOutcome
  const withOutcome = all.filter(s => {
    const h = s.features?.hypotheticalOutcome;
    return h && Number.isFinite(h.pnlPct) && h.outcome;
  });
  return withOutcome;
}

// ─── Вычисление метрик для набора сигналов ───────────────────────────────────

function computeStats(signals) {
  if (!signals.length) return null;
  const pnls  = signals.map(s => s.features.hypotheticalOutcome.pnlPct);
  const wins  = signals.filter(s => {
    const o = s.features.hypotheticalOutcome.outcome;
    return o === "target1" || o === "target2";
  });
  const wr      = wins.length / signals.length;
  const avgPnl  = pnls.reduce((a, b) => a + b, 0) / pnls.length;
  const mean    = avgPnl;
  const variance = pnls.reduce((s, v) => s + (v - mean) ** 2, 0) / pnls.length;
  const std     = Math.sqrt(variance);
  const sharpe  = std > 0 ? mean / std : 0;
  // Composite: WR*100 + avgPnl×10. Приоритет WR, avgPnl — тайбрейкер.
  // Знак avgPnl может быть любым (approx-метод не даёт абсолютной точности),
  // поэтому сортируем по WR в первую очередь.
  const composite = wr * 100 + avgPnl * 10;
  return { count: signals.length, wins: wins.length, wr, avgPnl, std, sharpe, composite };
}

// ─── Grid search для pullback ─────────────────────────────────────────────────

function searchPullback(signals) {
  const { rsiMin, rsiMax, minVolumeRatio, minScore } = PULLBACK_GRID;
  const results = [];

  // Предварительный фильтр: только сигналы, где emaTrend совпадает с side
  // (прокси для условия price выше/ниже EMA34)
  const emaTrendOk = signals.filter(s => {
    const f = s.features;
    if (!f.emaTrend || !f.side) return true; // если нет данных, не фильтруем
    return f.emaTrend === f.side; // LONG должен быть выше EMA34, SHORT ниже
  });
  info(`pullback после фильтра emaTrend: ${emaTrendOk.length}/${signals.length}`);

  for (const rMin of rsiMin) {
    for (const rMax of rsiMax) {
      if (rMax <= rMin) continue;
      for (const vol of minVolumeRatio) {
        for (const sc of minScore) {
          const subset = emaTrendOk.filter(s => {
            const f = s.features;
            // RSI диапазон (один для LONG и SHORT — как в текущей реализации)
            if (!Number.isFinite(f.rsi) || f.rsi < rMin || f.rsi > rMax) return false;
            // Объём
            if (Number.isFinite(f.volumeRatio) && f.volumeRatio < vol) return false;
            // Скор
            if (Number.isFinite(f.score) && f.score < sc) return false;
            return true;
          });
          if (subset.length < MIN_COUNT) continue;
          const stats = computeStats(subset);
          if (!stats) continue;
          results.push({
            params: { rsiMin: rMin, rsiMax: rMax, minVolumeRatio: vol, minScore: sc },
            ...stats,
          });
        }
      }
    }
  }

  // Сортируем по composite (WR × avgPnl), затем по sharpe при равенстве
  results.sort((a, b) => b.composite - a.composite || b.sharpe - a.sharpe);
  return results;
}

// ─── Grid search для breakout ─────────────────────────────────────────────────

function searchBreakout(signals) {
  const { minDistPastLevel, minOiChangePct, minVolumeRatio, minScore } = BREAKOUT_GRID;
  const results = [];

  for (const dist of minDistPastLevel) {
    for (const oi of minOiChangePct) {
      for (const vol of minVolumeRatio) {
        for (const sc of minScore) {
          const subset = signals.filter(s => {
            const f = s.features;
            // distancePastLevelPct (может быть null для сигналов без пробоя)
            if (dist > 0 && Number.isFinite(f.distancePastLevelPct) && f.distancePastLevelPct < dist) return false;
            // OI change
            if (oi > 0 && Number.isFinite(f.oiChangePct) && f.oiChangePct < oi) return false;
            // Volume
            if (Number.isFinite(f.volumeRatio) && f.volumeRatio < vol) return false;
            // Score
            if (Number.isFinite(f.score) && f.score < sc) return false;
            return true;
          });
          if (subset.length < MIN_COUNT) continue;
          const stats = computeStats(subset);
          if (!stats) continue;
          results.push({
            params: { minDistPastLevel: dist, minOiChangePct: oi, minVolumeRatio: vol, minScore: sc },
            ...stats,
          });
        }
      }
    }
  }

  results.sort((a, b) => b.composite - a.composite || b.sharpe - a.sharpe);
  return results;
}

// ─── Форматирование вывода ────────────────────────────────────────────────────

function fmtStats(s) {
  return `count=${s.count} WR=${(s.wr*100).toFixed(1)}% avgPnl=${s.avgPnl>=0?"+":""}${s.avgPnl.toFixed(3)}% sharpe=${s.sharpe.toFixed(2)} composite=${s.composite.toFixed(4)}`;
}

function fmtParams(strategy, p) {
  if (strategy === "pullback") {
    return `rsi=[${p.rsiMin}-${p.rsiMax}] vol≥${p.minVolumeRatio} score≥${p.minScore}`;
  }
  return `dist≥${p.minDistPastLevel}% oi≥${p.minOiChangePct}% vol≥${p.minVolumeRatio} score≥${p.minScore}`;
}

// ─── Сохранение в DB ──────────────────────────────────────────────────────────

async function saveToDb(pullbackTop, breakoutTop, baselinePullback, baselineBreakout) {
  // Читаем текущее значение botalin_signal_params_v1
  let existing = null;
  try {
    const rows = await dbGet("/crypto_strategy_settings?key=eq.botalin_signal_params_v1&limit=1");
    if (rows.length) existing = rows[0].value;
  } catch {}

  const payload = {
    ...(existing || {}),
    updated_at: new Date().toISOString(),
    search_days: DAYS,
    pullback: {
      baseline: baselinePullback,
      top: pullbackTop.slice(0, 5).map((r, i) => ({
        rank: i + 1,
        params: r.params,
        stats: {
          count: r.count,
          wr: +r.wr.toFixed(4),
          avgPnlPct: +r.avgPnl.toFixed(4),
          sharpe: +r.sharpe.toFixed(3),
          composite: +r.composite.toFixed(5),
        },
      })),
    },
    breakout: {
      baseline: baselineBreakout,
      top: breakoutTop.slice(0, 5).map((r, i) => ({
        rank: i + 1,
        params: r.params,
        stats: {
          count: r.count,
          wr: +r.wr.toFixed(4),
          avgPnlPct: +r.avgPnl.toFixed(4),
          sharpe: +r.sharpe.toFixed(3),
          composite: +r.composite.toFixed(5),
        },
      })),
    },
  };

  if (DRY_RUN) {
    console.log("[dry-run] Payload:\n" + JSON.stringify(payload, null, 2));
    return true;
  }

  // Upsert через PATCH (если запись есть) или POST (если нет)
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const method = existing ? "PATCH" : "POST";
    const url    = existing
      ? `${DB_URL}/crypto_strategy_settings?key=eq.botalin_signal_params_v1`
      : `${DB_URL}/crypto_strategy_settings`;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "Prefer": "return=minimal" },
      body: JSON.stringify(existing
        ? { value: payload }
        : { key: "botalin_signal_params_v1", value: payload }
      ),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`DB save ${res.status}: ${txt}`);
    }
    return true;
  } finally { clearTimeout(t); }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  info(`Загрузка сигналов за ${DAYS} дней...`);

  const [pullbackSigs, breakoutSigs] = await Promise.all([
    loadSignals("pullback",  DAYS),
    loadSignals("breakout",  DAYS),
  ]);

  info(`pullback: ${pullbackSigs.length} сигналов с hypotheticalOutcome`);
  info(`breakout: ${breakoutSigs.length} сигналов с hypotheticalOutcome`);

  // ─── Pullback search ──────────────────────────────────────────────────────
  info("Grid search pullback...");
  const pullbackResults = searchPullback(pullbackSigs);

  // Baseline stats (текущие параметры)
  const baselinePullbackSubset = pullbackSigs.filter(s => {
    const f = s.features;
    return Number.isFinite(f.rsi) && f.rsi >= CURRENT_PULLBACK.rsiMin && f.rsi <= CURRENT_PULLBACK.rsiMax
      && (!Number.isFinite(f.volumeRatio) || f.volumeRatio >= CURRENT_PULLBACK.minVolumeRatio)
      && (!Number.isFinite(f.score)        || f.score       >= CURRENT_PULLBACK.minScore);
  });
  const baselinePullback = computeStats(baselinePullbackSubset);

  // ─── Breakout search ──────────────────────────────────────────────────────
  info("Grid search breakout...");
  const breakoutResults = searchBreakout(breakoutSigs);

  const baselineBreakoutSubset = breakoutSigs.filter(s => {
    const f = s.features;
    return (!Number.isFinite(f.distancePastLevelPct) || f.distancePastLevelPct >= CURRENT_BREAKOUT.minDistPastLevel)
      && (!Number.isFinite(f.oiChangePct)     || f.oiChangePct     >= CURRENT_BREAKOUT.minOiChangePct)
      && (!Number.isFinite(f.volumeRatio)     || f.volumeRatio     >= CURRENT_BREAKOUT.minVolumeRatio)
      && (!Number.isFinite(f.score)           || f.score           >= CURRENT_BREAKOUT.minScore);
  });
  const baselineBreakout = computeStats(baselineBreakoutSubset);

  // ─── Вывод ────────────────────────────────────────────────────────────────
  const W = 76;
  const line = "─".repeat(W);
  console.log("\n" + "═".repeat(W));
  console.log("  Param Search — подбор параметров стратегий");
  console.log(`  Период: ${DAYS} дней  |  Мин. сигналов: ${MIN_COUNT}`);
  console.log("═".repeat(W));

  // PULLBACK
  console.log(`\n${line}`);
  console.log("  PULLBACK");
  console.log(line);
  if (baselinePullback) {
    console.log(`  Baseline (текущие rsi=[42-58] vol≥0.35 score≥57):`);
    console.log(`    ${fmtStats(baselinePullback)}`);
  } else {
    console.log("  Baseline: нет данных");
  }
  console.log(`\n  ТОП-10 комбинаций (из ${pullbackResults.length} валидных):`);
  for (const r of pullbackResults.slice(0, 10)) {
    const params = fmtParams("pullback", r.params);
    const isBaseline = r.params.rsiMin === CURRENT_PULLBACK.rsiMin
      && r.params.rsiMax === CURRENT_PULLBACK.rsiMax
      && r.params.minVolumeRatio === CURRENT_PULLBACK.minVolumeRatio
      && r.params.minScore === CURRENT_PULLBACK.minScore;
    const marker = isBaseline ? " ← current" : "";
    console.log(`  ${params.padEnd(40)} | ${fmtStats(r)}${marker}`);
  }

  // BREAKOUT
  console.log(`\n${line}`);
  console.log("  BREAKOUT");
  console.log(line);
  if (baselineBreakout) {
    console.log(`  Baseline (текущие dist≥0.3% oi≥0.35% vol≥1.3 score≥57):`);
    console.log(`    ${fmtStats(baselineBreakout)}`);
  } else {
    console.log("  Baseline: нет данных");
  }
  console.log(`\n  ТОП-10 комбинаций (из ${breakoutResults.length} валидных):`);
  for (const r of breakoutResults.slice(0, 10)) {
    const params = fmtParams("breakout", r.params);
    const isBaseline = r.params.minDistPastLevel === CURRENT_BREAKOUT.minDistPastLevel
      && r.params.minOiChangePct === CURRENT_BREAKOUT.minOiChangePct
      && r.params.minVolumeRatio === CURRENT_BREAKOUT.minVolumeRatio
      && r.params.minScore === CURRENT_BREAKOUT.minScore;
    const marker = isBaseline ? " ← current" : "";
    console.log(`  ${params.padEnd(44)} | ${fmtStats(r)}${marker}`);
  }

  // ИТОГ
  console.log("\n" + "═".repeat(W));

  const topPullback = pullbackResults[0];
  const topBreakout = breakoutResults[0];

  if (topPullback) {
    const delta = baselinePullback
      ? `  WR: ${baselinePullback.wr > 0 ? ((topPullback.wr - baselinePullback.wr)*100).toFixed(1) : "n/a"}pp | avgPnl: ${baselinePullback.avgPnl !== 0 ? (topPullback.avgPnl - baselinePullback.avgPnl).toFixed(3) : "n/a"}%`
      : "";
    console.log(`  pullback #1: ${fmtParams("pullback", topPullback.params)}`);
    console.log(`    ${fmtStats(topPullback)}${delta ? "\n  vs baseline:" + delta : ""}`);
  }
  if (topBreakout) {
    const delta = baselineBreakout
      ? `  WR: ${baselineBreakout.wr > 0 ? ((topBreakout.wr - baselineBreakout.wr)*100).toFixed(1) : "n/a"}pp | avgPnl: ${baselineBreakout.avgPnl !== 0 ? (topBreakout.avgPnl - baselineBreakout.avgPnl).toFixed(3) : "n/a"}%`
      : "";
    console.log(`  breakout #1: ${fmtParams("breakout", topBreakout.params)}`);
    console.log(`    ${fmtStats(topBreakout)}${delta ? "\n  vs baseline:" + delta : ""}`);
  }
  console.log("═".repeat(W) + "\n");

  // Сохраняем в DB
  if (!DRY_RUN) {
    await saveToDb(
      pullbackResults,
      breakoutResults,
      baselinePullback ? { params: CURRENT_PULLBACK, stats: baselinePullback } : null,
      baselineBreakout ? { params: CURRENT_BREAKOUT, stats: baselineBreakout } : null,
    );
    info("Результаты сохранены в botalin_signal_params_v1");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
