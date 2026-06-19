#!/usr/bin/env node
import { createHmac } from "crypto";
import { appendFile, mkdir, readFile, writeFile } from "fs/promises";
import { dirname, resolve } from "path";

const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || "";
const firebaseApiKey = process.env.FIREBASE_API_KEY || "";
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${firebaseProjectId}/databases/(default)/documents`;
const firestoreDocPath = `projects/${firebaseProjectId}/databases/(default)/documents`;
const supabaseUrl = (process.env.SUPABASE_URL || "https://dcpenxsthdhvhhqgvgjq.supabase.co").replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_BYYOhjwhgjZBP27Yw7YkVg_CEhF6ugc";
const supabaseTradesTable = process.env.BOTALIN_TRADES_TABLE || "crypto_strategy_trades";
const supabaseSettingsTable = process.env.BOTALIN_SETTINGS_TABLE || "crypto_strategy_settings";
const remoteBackend = process.env.BOTALIN_REMOTE_BACKEND || "supabase";
const localJournalPath = process.env.BOTALIN_LOCAL_JOURNAL_PATH || resolve(process.cwd(), ".botalin", "server-journal.jsonl");
const firestoreFallbackCachePath = process.env.BOTALIN_FIRESTORE_CACHE_PATH || resolve(process.cwd(), ".botalin", "firestore-fallback-cache.json");
// Each strategy is a separate short-lived process spawned ~20s apart within one runner
// cycle. During a Supabase outage every one of them would otherwise hit the Firestore
// quota independently — sharing one read across the cycle cuts that ~7x.
const firestoreFallbackCacheTtlMs = 150_000;
const learningPolicyKey = "botalin_learning_policy_v1";
const backtestPolicyKey = "botalin_backtest_policy_v1";
const requestedProfile = getArgValue("--profile") || process.env.BOTALIN_SERVER_PROFILE || "balanced";
const requestedStrategy = getArgValue("--strategy") || process.env.BOTALIN_STRATEGY || "all";
const requestedUserLogin = getArgValue("--user-login") || process.env.BOTALIN_USER_LOGIN || "server";

// Bybit private API credentials (real trading)
const bybitApiKey = process.env.BYBIT_API_KEY || "";
const bybitApiSecret = process.env.BYBIT_API_SECRET || "";
// Safety flag: real orders are placed ONLY when explicitly set to "true"
const realTradingEnabled = process.env.BOTALIN_REAL_TRADING === "true";

const serverProfiles = {
  protective: {
    label: "Осторожный",
    minScore: 82,
    maxTradePct: 5,
    maxPortfolioPct: 18,
    maxEntriesPerRun: 1,
    duplicateCooldownMs: 120 * 60 * 1000,
    minVolumeRatio: 0.95,
    minScalpingVolumeRatio: 1.45,
    minExpectedNetPct: 0.35,
    minScalpingExpectedNetPct: 0.2,
    blockedAssetMode: "strict",
    strategyMaxEntriesPerRun: { trend: 1, pullback: 1, scalping: 1 }
  },
  balanced: {
    label: "Баланс",
    minScore: 78,
    maxTradePct: 5,
    maxPortfolioPct: 24,
    maxEntriesPerRun: 2,
    duplicateCooldownMs: 45 * 60 * 1000,
    minVolumeRatio: 0.75,
    minScalpingVolumeRatio: 1.15,
    minExpectedNetPct: 0.25,
    minScalpingExpectedNetPct: 0.14,
    blockedAssetMode: "hard-only",
    strategyMaxEntriesPerRun: { trend: 1, pullback: 1, scalping: 1 }
  },
  active: {
    label: "Активный",
    minScore: 74,
    maxTradePct: 5,
    maxPortfolioPct: 30,
    maxEntriesPerRun: 3,
    duplicateCooldownMs: 25 * 60 * 1000,
    minVolumeRatio: 0.65,
    minScalpingVolumeRatio: 1.05,
    minExpectedNetPct: 0.18,
    minScalpingExpectedNetPct: 0.1,
    blockedAssetMode: "hard-only",
    strategyMaxEntriesPerRun: { trend: 1, pullback: 1, scalping: 2 }
  },
  // Paper-mode accelerated learning: many trades, low thresholds, fast cooldown.
  // Goal: maximum variety (asset × strategy × side × score tier) with tiny position size.
  // NOT higher risk — smaller positions + higher frequency.
  training: {
    label: "Обучение",
    minScore: 55,
    maxTradePct: 1,
    maxPortfolioPct: 70,
    maxEntriesPerRun: 30,
    duplicateCooldownMs: 4 * 60 * 1000,
    minVolumeRatio: 0.35,
    minScalpingVolumeRatio: 0.6,
    minExpectedNetPct: 0.03,
    minScalpingExpectedNetPct: 0.02,
    blockedAssetMode: "soft",
    softBlockPenalty: 12,
    minTradesBeforeBlock: 20,
    dailyStopLimit: 100,
    dailyLossPctLimit: 50,
    // RSI extremes loosened from the default 28/72 — at 28/72 this strategy produced
    // ~1 trade/day (24h log), ~100 days to reach the 100-closed-trades checkpoint.
    rsiReversalLow: 35,
    rsiReversalHigh: 65,
    strategyMaxEntriesPerRun: { trend: 5, pullback: 5, scalping: 6, "rsi-reversal": 5, breakout: 5, "vwap-reversion": 5, momentum: 5 }
  },
  real: {
    label: "Реальная торговля",
    minScore: 68,
    maxTradePct: 2,
    maxPortfolioPct: 20,
    maxEntriesPerRun: 2,
    duplicateCooldownMs: 60 * 60 * 1000,
    minVolumeRatio: 0.6,
    minScalpingVolumeRatio: 0.9,
    minExpectedNetPct: 0.15,
    minScalpingExpectedNetPct: 0.1,
    blockedAssetMode: "hard",
    softBlockPenalty: 20,
    minTradesBeforeBlock: 5,
    dailyStopLimit: 3,
    dailyLossPctLimit: 3,
    feePct: 0.1,
    slippagePct: 0.05,
    // momentum остаётся отключённой в "real", пока не накопит собственную статистику в paper-режиме
    strategyMaxEntriesPerRun: { trend: 1, pullback: 1, scalping: 0, "rsi-reversal": 1, breakout: 1, "vwap-reversion": 0, momentum: 0 }
  }
};

const activeProfileId = serverProfiles[requestedProfile] ? requestedProfile : "balanced";
const activeProfile = serverProfiles[activeProfileId];

// Максимальный риск на сделку независимо от профиля и множителя стратегии.
const maxRiskPct = 5;

// riskMultiplier масштабирует config.maxTradePct (базовый риск профиля) под конкретную
// стратегию, по факту её результатов в бэктесте 2026-06-14 (см. BOOTSTRAP_LEARNING_POLICY).
// Итоговый риск всегда ограничен maxRiskPct — см. applyRiskCap().
// Скальпинг сознательно НЕ увеличиваем: короткий TTL и высокая частота сделок
// делают рост позиции на сделку более рискованным при той же логике входа.
const serverStrategies = {
  trend: {
    id: "trend",
    label: "Тренд EMA34/89",
    enabled: true,
    kind: "trend",
    strategyMode: "standard",
    signalTemplate: "intraday",
    timeframes: ["15m", "1h"],
    minScoreOffset: 0,
    maxEntriesPerRun: 1,
    riskMultiplier: 2
  },
  pullback: {
    id: "pullback",
    label: "Откат к тренду",
    enabled: true,
    kind: "pullback",
    strategyMode: "pullback",
    signalTemplate: "swing",
    timeframes: ["15m", "1h"],
    minScoreOffset: 2,
    maxEntriesPerRun: 1,
    // Лучшие результаты бэктеста (WR 55-79%, pnl +0.09..+0.50%) — максимальный риск.
    riskMultiplier: 5
  },
  scalping: {
    id: "scalping",
    label: "Скальпинг",
    enabled: true,
    kind: "scalping",
    strategyMode: "scalping",
    signalTemplate: "scalper",
    timeframes: ["5m", "15m"],
    minScoreOffset: 3,
    maxEntriesPerRun: 1,
    riskMultiplier: 1
  },
  rsiReversal: {
    id: "rsi-reversal",
    label: "RSI Разворот",
    enabled: true,
    kind: "rsi-reversal",
    strategyMode: "reversal",
    signalTemplate: "reversal",
    timeframes: ["15m", "1h"],
    minScoreOffset: 5,
    maxEntriesPerRun: 1,
    riskMultiplier: 2
  },
  breakout: {
    id: "breakout",
    label: "Пробой уровня",
    enabled: true,
    kind: "breakout",
    strategyMode: "breakout",
    signalTemplate: "breakout",
    timeframes: ["15m", "1h"],
    minScoreOffset: 3,
    maxEntriesPerRun: 1,
    // WR=0% на части активов в бэктесте — риск не увеличиваем.
    riskMultiplier: 1
  },
  vwapReversion: {
    id: "vwap-reversion",
    label: "VWAP Возврат",
    enabled: true,
    kind: "vwap-reversion",
    strategyMode: "reversion",
    signalTemplate: "scalper",
    timeframes: ["5m", "15m"],
    minScoreOffset: 4,
    maxEntriesPerRun: 1,
    // Хорошая точность бэктеста (WR 69-86%, pnl +0.04..+0.12%).
    riskMultiplier: 4
  },
  momentum: {
    id: "momentum",
    label: "Импульс (риск)",
    enabled: true,
    kind: "momentum",
    strategyMode: "momentum",
    signalTemplate: "intraday",
    timeframes: ["15m", "1h"],
    // Строже порог входа — берём только сильные, уже разогнавшиеся движения,
    // расширенные стоп/цель делают редкий неверный вход дороже.
    minScoreOffset: 6,
    maxEntriesPerRun: 1,
    riskMultiplier: 5
  }
};

function applyRiskCap(basePct, multiplier) {
  return Math.min(basePct * (multiplier || 1), maxRiskPct);
}

const enabledStrategies = Object.values(serverStrategies).filter(
  (strategy) => strategy.enabled && (requestedStrategy === "all" || strategy.id === requestedStrategy)
);
// All strategies that exist in the system, regardless of which one this process instance
// is scanning — needed for cross-strategy checks (e.g. "every strategy has ≥100 closed
// trades"), since each strategy normally runs as its own single-strategy process.
const allServerStrategies = Object.values(serverStrategies).filter((strategy) => strategy.enabled);

// Backtest 2026-06-14: 300 candles × 20 assets × 6 strategies
const BOOTSTRAP_LEARNING_POLICY = {
  preferredPatterns: [
    // pullback 1h — лучшие результаты (WR 55–79%, pnl +0.09..+0.50%)
    "SOL/USDT|1h|LONG|pullback",  "SOL/USDT|1h|SHORT|pullback",
    "AAVE/USDT|1h|LONG|pullback", "AAVE/USDT|1h|SHORT|pullback",
    "ARB/USDT|1h|LONG|pullback",  "ARB/USDT|1h|SHORT|pullback",
    "LTC/USDT|1h|LONG|pullback",  "LTC/USDT|1h|SHORT|pullback",
    "BCH/USDT|1h|LONG|pullback",  "BCH/USDT|1h|SHORT|pullback",
    "AVAX/USDT|1h|LONG|pullback", "AVAX/USDT|1h|SHORT|pullback",
    "TON/USDT|1h|LONG|pullback",  "TON/USDT|1h|SHORT|pullback",
    "ETH/USDT|1h|LONG|pullback",  "ETH/USDT|1h|SHORT|pullback",
    // vwap-reversion 15m — хорошая точность (WR 69–86%, pnl +0.04..+0.12%)
    "BTC/USDT|15m|LONG|vwap-reversion",  "BTC/USDT|15m|SHORT|vwap-reversion",
    "ADA/USDT|15m|LONG|vwap-reversion",  "ADA/USDT|15m|SHORT|vwap-reversion",
    "ADA/USDT|5m|LONG|vwap-reversion",   "ADA/USDT|5m|SHORT|vwap-reversion",
    "ETH/USDT|15m|LONG|vwap-reversion",  "ETH/USDT|15m|SHORT|vwap-reversion",
    "DOT/USDT|15m|LONG|vwap-reversion",  "DOT/USDT|15m|SHORT|vwap-reversion",
  ],
  blockedPatterns: [
    // breakout 1h — WR=0% на всех тестовых активах
    "DOT/USDT|1h|LONG|breakout",  "DOT/USDT|1h|SHORT|breakout",
    "ADA/USDT|1h|LONG|breakout",  "ADA/USDT|1h|SHORT|breakout",
    "APT/USDT|1h|LONG|breakout",  "APT/USDT|1h|SHORT|breakout",
    "SUI/USDT|1h|LONG|breakout",  "SUI/USDT|1h|SHORT|breakout",
    "TON/USDT|1h|LONG|breakout",  "TON/USDT|1h|SHORT|breakout",
    "TRX/USDT|1h|LONG|breakout",  "TRX/USDT|1h|SHORT|breakout",
    "DOGE/USDT|1h|LONG|breakout", "DOGE/USDT|1h|SHORT|breakout",
    "ARB/USDT|1h|LONG|breakout",  "ARB/USDT|1h|SHORT|breakout",
    "ARB/USDT|15m|LONG|breakout", "ARB/USDT|15m|SHORT|breakout",
    // trend + pullback 1h на слабых активах (WR 17–19%)
    "SUI/USDT|1h|LONG|trend",     "SUI/USDT|1h|SHORT|trend",
    "SUI/USDT|1h|LONG|pullback",  "SUI/USDT|1h|SHORT|pullback",
    "LINK/USDT|1h|LONG|trend",    "LINK/USDT|1h|SHORT|trend",
    "LINK/USDT|1h|LONG|pullback", "LINK/USDT|1h|SHORT|pullback",
  ]
};

const config = {
  enabled: true,
  dryRun: process.argv.includes("--dry-run"),
  once: process.argv.includes("--once") || process.argv.includes("--dry-run"),
  userLogin: requestedUserLogin,
  profileId: activeProfileId,
  profileLabel: activeProfile.label,
  depositUsdt: 10000,
  maxTradePct: activeProfile.maxTradePct,
  maxPortfolioPct: activeProfile.maxPortfolioPct,
  minScore: activeProfile.minScore,
  minNotionalUsdt: 10,
  maxEntriesPerRun: activeProfile.maxEntriesPerRun,
  duplicateCooldownMs: activeProfile.duplicateCooldownMs,
  pendingTtlMs: 30 * 60 * 1000,
  scalpingTtlMs: 6 * 60 * 1000,
  feePct: 0.1,
  slippagePct: 0.03,
  minVolumeRatio: activeProfile.minVolumeRatio,
  minScalpingVolumeRatio: activeProfile.minScalpingVolumeRatio,
  minExpectedNetPct: activeProfile.minExpectedNetPct,
  minScalpingExpectedNetPct: activeProfile.minScalpingExpectedNetPct,
  blockedAssetMode: activeProfile.blockedAssetMode,
  rsiReversalLow: activeProfile.rsiReversalLow ?? 28,
  rsiReversalHigh: activeProfile.rsiReversalHigh ?? 72,
  maxActivePerAsset: 2,
  // XAUT/XAG не торгуются, но используются как риск-сентимент индикаторы (см. getGoldSentiment)
  sentimentAssets: ["XAUT/USDT", "XAG/USDT"],
  assets: [
    "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "TON/USDT",
    "ADA/USDT", "DOGE/USDT", "TRX/USDT", "AVAX/USDT", "LINK/USDT", "DOT/USDT",
    "MATIC/USDT", "LTC/USDT", "BCH/USDT", "UNI/USDT", "AAVE/USDT", "APT/USDT",
    "SUI/USDT", "ARB/USDT", "OP/USDT", "NEAR/USDT", "ATOM/USDT", "INJ/USDT",
    "FIL/USDT", "ETC/USDT", "SEI/USDT", "TIA/USDT", "TWT/USDT",
    "JUP/USDT", "WIF/USDT", "BONK/USDT", "JTO/USDT", "PEPE/USDT",
    "LDO/USDT", "CRV/USDT", "RUNE/USDT", "ICP/USDT", "HBAR/USDT",
    "VET/USDT", "ALGO/USDT", "STX/USDT", "ORDI/USDT", "IMX/USDT",
    "SAND/USDT", "MKR/USDT", "GRT/USDT", "SNX/USDT", "PYTH/USDT",
    "WLD/USDT", "ZEC/USDT", "BLUR/USDT"
  ],
  timeframes: ["5m", "15m", "1h"],
  scalpingTimeframes: ["5m", "15m"]
};

const bybitIntervals = {
  "1m": "1",
  "3m": "3",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "4h": "240",
  "1d": "D"
};

const timeframeMs = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000
};

const activeStatuses = new Set(["pending", "open", "partial"]);

async function main() {
  if (!config.enabled) {
    log("server-autobot disabled");
    return;
  }

  // Real trading: log balance and dry-run status at every run
  if (config.profileId === "real" && bybitApiKey) {
    try {
      const balance = await getBybitBalance();
      log(`[REAL] balance: ${balance.usdt.toFixed(2)} USDT (available: ${balance.available.toFixed(2)}) | realTradingEnabled=${realTradingEnabled}`);
      if (!realTradingEnabled) log("[REAL] DRY-RUN mode — orders will NOT be placed. Set BOTALIN_REAL_TRADING=true to enable.");
    } catch (err) {
      log(`[REAL] balance check failed: ${err.message}`);
    }
  }

  const [rows, remotePolicy, backtestPolicy, rejectedPolicy] = await Promise.all([
    fetchRemoteRows(),
    fetchSharedLearningPolicy().catch((error) => { log(`shared learning fallback: ${error.message}`); return null; }),
    fetchBacktestPolicy().catch(() => null),
    fetchRejectedSignalsPolicy().catch(() => null)
  ]);
  const trades = rows.map((row) => normalizeTrade(row.trade)).filter(Boolean);
  // Авто-снижение порога: когда каждая стратегия накопила 100+ закрытых сделок — достаточно данных
  const closedByStrategy = {};
  for (const t of trades) {
    if (!isActiveTrade(t) && t.status !== "cancelled") {
      const sid = getTradeStrategyId(t);
      closedByStrategy[sid] = (closedByStrategy[sid] || 0) + 1;
    }
  }
  const minClosedAcrossStrategies = allServerStrategies.length
    ? Math.min(...allServerStrategies.map((s) => closedByStrategy[s.id] || 0))
    : 0;
  if (minClosedAcrossStrategies >= 100 && config.minScore > 50) {
    log(`auto minScore: ${config.minScore} → 50 (all strategies ≥100 closed trades)`);
    config.minScore = 50;
  }
  const journalPolicy = createLearningPolicyFromTrades(trades);
  // Порядок приоритета: живые сделки > remote policy > backtest policy > rejected_signals > hardcoded bootstrap
  const basePolicy = mergeLearningPolicies(backtestPolicy || BOOTSTRAP_LEARNING_POLICY, rejectedPolicy, remotePolicy);
  const learningPolicy = mergeLearningPolicies(basePolicy, journalPolicy);
  const changedTrades = await updateActiveTrades(trades);
  const candidates = await scanCandidates(trades, learningPolicy);
  const entryCandidates = selectEntryCandidates(candidates, trades);
  const best = entryCandidates[0] || candidates[0] || null;
  const newTrades = [];

  for (const candidate of entryCandidates) {
    const trade = await buildServerTrade(candidate, [...trades, ...newTrades]);
    if (trade) newTrades.push(trade);
  }

  const toUpsert = [...changedTrades, ...newTrades];
  const nextPolicy = mergeLearningPolicies(learningPolicy, createLearningPolicyFromTrades([...trades, ...newTrades]));
  if (config.dryRun) {
    log(JSON.stringify({
      mode: "dry-run",
      activeUpdated: changedTrades.length,
      profile: `${config.profileLabel} (${config.profileId})`,
      limits: {
        minScore: config.minScore,
        maxTradePct: config.maxTradePct,
        maxPortfolioPct: config.maxPortfolioPct,
        maxEntriesPerRun: config.maxEntriesPerRun,
        minVolumeRatio: config.minVolumeRatio,
        minExpectedNetPct: config.minExpectedNetPct
      },
      sharedPolicy: summarizeLearningPolicy(learningPolicy),
      nextPolicy: summarizeLearningPolicy(nextPolicy),
      strategies: summarizeStrategyStats([...trades, ...newTrades]),
      candidates: candidates.slice(0, 5).map(formatCandidateForLog),
      plannedTrades: newTrades
    }, null, 2));
    return;
  }

  if (toUpsert.length) {
    await upsertTrades(toUpsert).catch((err) => log(`upsert skipped: ${err.message}`));
  } else {
    await flushLocalJournalDocs().catch((err) => log(`local journal flush skipped: ${err.message}`));
  }
  await saveSharedLearningPolicy(nextPolicy).catch((error) => log(`shared learning save skipped: ${error.message}`));
  const enteredSet = new Set(entryCandidates.map((c) => `${c.symbol}|${c.interval}|${c.side}|${c.strategyId}`));
  const rejected = candidates.filter((c) => !enteredSet.has(`${c.symbol}|${c.interval}|${c.side}|${c.strategyId}`));
  await saveRejectedSignals(rejected, entryCandidates.length).catch((err) => log(`rejected signals skipped: ${err.message}`));
  log(`server-autobot done: profile ${config.profileId}, strategies ${enabledStrategies.map((strategy) => strategy.id).join("/")}, updated ${changedTrades.length}, new ${newTrades.length}, rejected ${rejected.length}, best ${best ? `${best.symbol} ${best.interval} ${best.side} ${best.score}` : "none"}`);
}

async function fetchRemoteRows() {
  if (remoteBackend === "supabase") {
    try {
      const select = "id,user_login,asset,timeframe,side,status,pnl,opened_at,closed_at,updated_at,trade";
      const activePath = `/${encodeURIComponent(supabaseTradesTable)}?select=${select}&status=in.(pending,open,partial)&order=updated_at.desc&limit=300`;
      const recentPath = `/${encodeURIComponent(supabaseTradesTable)}?select=${select}&order=updated_at.desc&limit=600`;
      const results = await Promise.allSettled([
        supabaseFetch(activePath, { timeoutMs: 10_000 }),
        supabaseFetch(recentPath, { timeoutMs: 12_000 })
      ]);
      const hasAnySuccess = results.some((item) => item.status === "fulfilled");
      if (!hasAnySuccess) throw results.find((item) => item.status === "rejected")?.reason || new Error("Supabase journal unavailable");
      const activeRows = results[0].status === "fulfilled" ? results[0].value : [];
      const recentRows = results[1].status === "fulfilled" ? results[1].value : [];
      const localRows = await readLocalJournalDocs();
      const byId = new Map();
      [...(Array.isArray(activeRows) ? activeRows : []), ...(Array.isArray(recentRows) ? recentRows : []), ...localRows].forEach((row) => {
        if (row?.id) byId.set(row.id, row);
      });
      if (localRows.length) log(`local journal merged: ${localRows.length} queued rows`);
      return [...byId.values()].map((row) => ({
        ...row,
        trade: normalizeTradeRow(row)
      }));
    } catch (err) {
      log(`Supabase journal unavailable: ${err.message} — trying Firebase fallback`);
    }
  }
  const cachedRows = await readFirestoreFallbackCache();
  if (cachedRows) {
    log(`Firestore fallback cache hit: ${cachedRows.length} rows (saved a Firestore read)`);
    return cachedRows.map((row) => ({ ...row, trade: normalizeTradeRow(row) }));
  }
  let allRows = [];
  try {
    allRows = await firestoreQuery("trades", [], "updated_at", 600);
    await writeFirestoreFallbackCache(allRows);
  } catch (err) {
    const localRows = await readLocalJournalDocs();
    if (localRows.length) {
      log(`Firebase journal unavailable: ${err.message} — using local journal fallback ${localRows.length} rows`);
      return localRows.map((row) => ({
        ...row,
        trade: normalizeTradeRow(row)
      }));
    }
    log(`Firebase journal unavailable: ${err.message} — continuing with empty journal`);
    return [];
  }
  // Separate active and server-specific rows so downstream dedup and policy work correctly
  const activeStatuses = new Set(["pending", "open", "partial"]);
  const byId = new Map();
  allRows.forEach((row) => {
    const isActive = activeStatuses.has(row.status);
    const isOwn = row.user_login === config.userLogin;
    byId.set(row.id, {
      ...row,
      trade: normalizeTradeRow(row)
    });
  });
  return [...byId.values()];
}

function findNestedNumeric(obj, field, maxDepth = 6) {
  if (!obj || typeof obj !== "object" || maxDepth <= 0) return undefined;
  const v = Number(obj[field]);
  if (Number.isFinite(v) && v !== 0) return obj[field];
  return findNestedNumeric(obj.trade, field, maxDepth - 1);
}

function normalizeTradeRow(row) {
  const stored = row.trade && typeof row.trade === "object" ? row.trade : {};
  // Recover numeric fields that may have been pushed deep by past corruption cycles
  const entry = findNestedNumeric(stored, "entry") ?? findNestedNumeric(row, "entry");
  const amount = findNestedNumeric(stored, "amount") ?? findNestedNumeric(row, "amount");
  const stop = findNestedNumeric(stored, "stop") ?? findNestedNumeric(row, "stop");
  const target = findNestedNumeric(stored, "target") ?? findNestedNumeric(row, "target");
  const target1 = findNestedNumeric(stored, "target1") ?? findNestedNumeric(row, "target1");
  const deeper = stored.trade && typeof stored.trade === "object" ? stored.trade : {};
  return {
    ...deeper,
    ...stored,
    ...(entry !== undefined && { entry }),
    ...(amount !== undefined && { amount }),
    ...(stop !== undefined && { stop }),
    ...(target !== undefined && { target }),
    ...(target1 !== undefined && { target1 }),
    id: row.id,
    userLogin: row.user_login || stored.userLogin || deeper.userLogin || "legacy",
    asset: row.asset,
    timeframe: row.timeframe,
    side: row.side,
    status: row.status,
    pnl: Number(row.pnl) || 0,
    openedAt: Date.parse(row.opened_at) || 0,
    closedAt: Date.parse(row.closed_at) || 0,
    updatedAt: Date.parse(row.updated_at) || 0,
    autopilot: row.user_login === config.userLogin
  };
}

async function upsertTrades(trades) {
  const docs = trades.map(compactTradeForStorage).map((trade) => ({
    id: trade.id,
    client_id: "server-autobot",
    session_id: trade.sessionId || null,
    user_login: trade.userLogin || config.userLogin,
    asset: trade.asset,
    timeframe: trade.timeframe,
    side: trade.side,
    status: trade.status,
    opened_at: toIsoOrNull(trade.openedAt),
    closed_at: toIsoOrNull(trade.closedAt),
    updated_at: toIsoOrNull(getTradeUpdatedAt(trade)),
    pnl: Number(trade.pnl) || 0,
    trade
  }));
  if (!docs.length) return;
  if (remoteBackend === "supabase") {
    const queuedDocs = await readLocalJournalDocs();
    const docsToPost = dedupeJournalDocs([...queuedDocs, ...docs]);
    try {
      await postSupabaseTradeDocs(docsToPost);
      if (queuedDocs.length) {
        await writeLocalJournalDocs([]);
        log(`local journal flushed: ${queuedDocs.length} queued rows`);
      }
    } catch (error) {
      await appendLocalJournalDocs(docs);
      throw error;
    }
    return;
  }
  const writes = docs.map((doc) => ({
    update: { name: `${firestoreDocPath}/trades/${doc.id}`, fields: toFirestoreFields(doc) }
  }));
  await firestoreBatch(writes);
}

async function postSupabaseTradeDocs(docs) {
  if (!docs.length) return;
  await supabaseFetch(`/${encodeURIComponent(supabaseTradesTable)}?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(docs)
  });
}

async function flushLocalJournalDocs() {
  if (remoteBackend !== "supabase") return;
  const docs = await readLocalJournalDocs();
  if (!docs.length) return;
  await postSupabaseTradeDocs(docs);
  await writeLocalJournalDocs([]);
  log(`local journal flushed: ${docs.length} queued rows`);
}

async function readLocalJournalDocs() {
  try {
    const text = await readFile(localJournalPath, "utf8");
    const docs = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((row) => row?.id && row.trade && typeof row.trade === "object");
    return dedupeJournalDocs(docs);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function appendLocalJournalDocs(docs) {
  const rows = dedupeJournalDocs(docs).filter((row) => row?.id);
  if (!rows.length) return;
  await mkdir(dirname(localJournalPath), { recursive: true });
  await appendFile(localJournalPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  log(`local journal queued: ${rows.length} rows at ${localJournalPath}`);
}

async function writeLocalJournalDocs(docs) {
  await mkdir(dirname(localJournalPath), { recursive: true });
  const rows = dedupeJournalDocs(docs).filter((row) => row?.id);
  const body = rows.length ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "";
  await writeFile(localJournalPath, body, "utf8");
}

async function readFirestoreFallbackCache() {
  try {
    const text = await readFile(firestoreFallbackCachePath, "utf8");
    const { fetchedAt, rows } = JSON.parse(text);
    if (!Array.isArray(rows) || Date.now() - Number(fetchedAt) > firestoreFallbackCacheTtlMs) return null;
    return rows;
  } catch {
    return null;
  }
}

async function writeFirestoreFallbackCache(rows) {
  try {
    await mkdir(dirname(firestoreFallbackCachePath), { recursive: true });
    await writeFile(firestoreFallbackCachePath, JSON.stringify({ fetchedAt: Date.now(), rows }), "utf8");
  } catch {}
}

function dedupeJournalDocs(docs) {
  const byId = new Map();
  docs.forEach((doc) => {
    if (!doc?.id) return;
    const existing = byId.get(doc.id);
    if (!existing || getJournalDocTime(doc) >= getJournalDocTime(existing)) {
      byId.set(doc.id, doc);
    }
  });
  return [...byId.values()];
}

function getJournalDocTime(doc) {
  return Date.parse(doc.updated_at || doc.closed_at || doc.opened_at || "") || Number(doc.trade?.updatedAt || doc.trade?.closedAt || doc.trade?.openedAt) || 0;
}

async function saveRejectedSignals(rejected, enteredCount) {
  if (!rejected.length) return;
  if (remoteBackend === "supabase") {
    return;
  }
  const now = Date.now();
  const writes = rejected.slice(0, 40).map((c) => {
    const minScore = getStrategyMinScore(serverStrategies[c.strategyId] || serverStrategies.trend);
    const rejectReason = c.score < minScore ? `score_low:${c.score}<${minScore}` : `limit_or_cooldown:entered_${enteredCount}`;
    const id = `rej-${now}-${c.symbol.replace("/", "")}-${c.interval}-${c.side}-${c.strategyId}`;
    const doc = {
      id,
      user_login: config.userLogin,
      profile: config.profileId,
      asset: c.symbol,
      timeframe: c.interval,
      side: c.side,
      strategy: c.strategyId,
      score: c.score,
      reject_reason: rejectReason,
      reason_detail: c.reason || "",
      recorded_at: new Date(now).toISOString()
    };
    return { update: { name: `${firestoreDocPath}/rejected_signals/${id}`, fields: toFirestoreFields(doc) } };
  });
  await firestoreBatch(writes);
}

async function fetchSharedLearningPolicy() {
  if (remoteBackend === "supabase") {
    const rows = await supabaseFetch(`/${encodeURIComponent(supabaseSettingsTable)}?select=value&key=eq.${encodeURIComponent(learningPolicyKey)}&limit=1`);
    return normalizeLearningPolicy(Array.isArray(rows) ? rows[0]?.value : null);
  }
  const doc = await firestoreGet("settings", learningPolicyKey);
  return normalizeLearningPolicy(doc?.value ?? null);
}

async function saveSharedLearningPolicy(policy) {
  if (remoteBackend === "supabase") {
    await supabaseFetch(`/${encodeURIComponent(supabaseSettingsTable)}?on_conflict=key`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{
        key: learningPolicyKey,
        value: normalizeLearningPolicy(policy),
        updated_at: new Date().toISOString()
      }])
    });
    return;
  }
  await firestoreSet("settings", learningPolicyKey, {
    key: learningPolicyKey,
    value: normalizeLearningPolicy(policy),
    updated_at: new Date().toISOString()
  });
}

async function fetchBacktestPolicy() {
  if (remoteBackend === "supabase") {
    const rows = await supabaseFetch(`/${encodeURIComponent(supabaseSettingsTable)}?select=value&key=eq.${encodeURIComponent(backtestPolicyKey)}&limit=1`);
    const value = Array.isArray(rows) ? rows[0]?.value : null;
    return value ? normalizeLearningPolicy(value) : null;
  }
  const doc = await firestoreGet("settings", backtestPolicyKey);
  return doc?.value ? normalizeLearningPolicy(doc.value) : null;
}

async function fetchRejectedSignalsPolicy() {
  if (remoteBackend === "supabase") return null;
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  let rows;
  try {
    rows = await firestoreQuery("rejected_signals", [
      { fieldFilter: { field: { fieldPath: "recorded_at" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: sevenDaysAgo } } }
    ], "recorded_at", 2000);
  } catch {
    return null;
  }
  if (!rows?.length) return null;

  // Count how many times each pattern was rejected due to limit (scored well, just no slot)
  // vs low score (signal was actually weak)
  const limitCounts = {};
  const scoreLowCounts = {};
  for (const row of rows) {
    const key = `${row.asset}|${row.timeframe}|${row.side}|${row.strategy}`;
    if (!key.includes("undefined")) {
      if (String(row.reject_reason || "").startsWith("limit_or_cooldown")) {
        limitCounts[key] = (limitCounts[key] || 0) + 1;
      } else if (String(row.reject_reason || "").startsWith("score_low")) {
        scoreLowCounts[key] = (scoreLowCounts[key] || 0) + 1;
      }
    }
  }
  // Prefer patterns that passed scoring ≥2 times but weren't entered (queue was full)
  // Soft-block patterns that consistently score low (≥3 times) but were never preferred
  const preferredPatterns = Object.entries(limitCounts)
    .filter(([, c]) => c >= 2)
    .map(([k]) => k);
  const blockedPatterns = Object.entries(scoreLowCounts)
    .filter(([k, c]) => c >= 3 && !limitCounts[k])
    .map(([k]) => k);
  if (!preferredPatterns.length && !blockedPatterns.length) return null;
  return normalizeLearningPolicy({
    preferredPatterns,
    blockedPatterns,
    notes: [`rejected_signals:${rows.length},pref:${preferredPatterns.length},block:${blockedPatterns.length}`]
  });
}

async function saveBacktestPolicy(policy) {
  if (remoteBackend === "supabase") {
    await supabaseFetch(`/${encodeURIComponent(supabaseSettingsTable)}?on_conflict=key`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{
        key: backtestPolicyKey,
        value: normalizeLearningPolicy(policy),
        updated_at: new Date().toISOString()
      }])
    });
    return;
  }
  await firestoreSet("settings", backtestPolicyKey, {
    key: backtestPolicyKey,
    value: normalizeLearningPolicy(policy),
    updated_at: new Date().toISOString()
  });
}

function backtestResultsToPolicy(results) {
  const preferred = [];
  const blocked = [];
  for (const r of results) {
    const sides = ["LONG", "SHORT"];
    const key = (side) => `${r.symbol}|${r.interval}|${side}|${r.strategy}`;
    if (r.avgPnlPct > 0.04 && r.winRate >= 55 && r.signals >= 5) {
      sides.forEach((side) => preferred.push(key(side)));
    } else if (r.winRate < 30 && r.signals >= 5) {
      sides.forEach((side) => blocked.push(key(side)));
    }
  }
  return normalizeLearningPolicy({
    preferredPatterns: [...new Set(preferred)],
    blockedPatterns: [...new Set(blocked)],
    lastReviewDate: new Date().toISOString().split("T")[0],
    reviewedAt: Date.now(),
    notes: [`backtest:${new Date().toISOString().slice(0, 10)},pairs:${results.length},pref:${preferred.length / 2},block:${blocked.length / 2}`]
  });
}

function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return { nullValue: null };
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === "object") return { mapValue: { fields: toFirestoreFields(v) } };
  return { nullValue: null };
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v);
  }
  return fields;
}

function fromFirestoreValue(v) {
  if (!v || "nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  if ("mapValue" in v) return fromFirestoreDoc(v.mapValue);
  return null;
}

function fromFirestoreDoc(doc) {
  const result = {};
  for (const [k, v] of Object.entries(doc.fields || {})) result[k] = fromFirestoreValue(v);
  return result;
}

async function retry429(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    const result = await fn();
    if (result.status !== 429 || i === attempts - 1) return result;
    await wait(400 * (i + 1) + Math.random() * 300);
  }
}

async function supabaseFetch(path, options = {}) {
  const { timeoutMs = 12_000, ...fetchOptions } = options;
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json",
    ...(fetchOptions.headers || {})
  };
  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1${path}`, { ...fetchOptions, headers }, timeoutMs);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Supabase ${response.status} ${text || response.statusText}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function firestoreGet(collection, docId) {
  const url = `${firestoreBase}/${collection}/${encodeURIComponent(docId)}?key=${firebaseApiKey}`;
  const response = await retry429(() => fetchWithTimeout(url, {}, 15_000));
  if (response.status === 404) return null;
  if (!response.ok) { const t = await response.text().catch(() => ""); throw new Error(`Firestore get ${collection}/${docId}: ${response.status} ${t}`); }
  return fromFirestoreDoc(await response.json());
}

async function firestoreSet(collection, docId, data) {
  const url = `${firestoreBase}/${collection}/${encodeURIComponent(docId)}?key=${firebaseApiKey}`;
  const response = await retry429(() => fetchWithTimeout(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFirestoreFields(data) })
  }, 15_000));
  if (!response.ok) { const t = await response.text().catch(() => ""); throw new Error(`Firestore set ${collection}/${docId}: ${response.status} ${t}`); }
}

async function firestoreQuery(collection, filters = [], orderByField = null, limitN = 1000) {
  const structuredQuery = { from: [{ collectionId: collection }], limit: limitN };
  if (filters.length === 1) structuredQuery.where = filters[0];
  else if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: "AND", filters } };
  if (orderByField) structuredQuery.orderBy = [{ field: { fieldPath: orderByField }, direction: "DESCENDING" }];
  const response = await retry429(() => fetchWithTimeout(`${firestoreBase}:runQuery?key=${firebaseApiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery })
  }, 15_000));
  if (!response.ok) { const t = await response.text().catch(() => ""); throw new Error(`Firestore query ${collection}: ${response.status} ${t}`); }
  const results = await response.json();
  return results.filter((r) => r.document).map((r) => fromFirestoreDoc(r.document));
}

async function firestoreBatch(writes) {
  if (!writes.length) return;
  await mapLimit(writes, 3, async (w) => {
    if (!w.update) return;
    await wait(100);
    const url = `https://firestore.googleapis.com/v1/${w.update.name}?key=${firebaseApiKey}`;
    const response = await fetchWithTimeout(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: w.update.fields })
    }, 20_000);
    if (!response.ok) { const t = await response.text().catch(() => ""); throw new Error(`Firestore write: ${response.status} ${t}`); }
  });
}

async function updateActiveTrades(trades) {
  const active = trades.filter(isActiveTrade);
  const results = await mapLimit(active, 2, async (trade) => {
    await wait(200);
    const changed = await replayTradeFromCandles(trade).catch((error) => {
      log(`skip update ${trade.id}: ${error.message}`);
      return false;
    });
    return changed ? trade : null;
  });
  return results.filter(Boolean);
}

async function replayTradeFromCandles(trade) {
  const interval = trade.timeframe || "15m";
  const candles = await fetchCandles(trade.asset, interval, 300);
  let changed = false;

  for (const candle of candles) {
    if (!isActiveTrade(trade) || candle.closeTime <= (Number(trade.lastCheckedAt) || 0)) continue;
    if (applyTradeCandle(trade, candle)) changed = true;
    trade.lastCheckedAt = candle.closeTime;
    trade.updatedAt = Date.now();
  }

  // Live price check: catch TP/SL hits inside the current incomplete candle
  if (isActiveTrade(trade)) {
    const livePrice = await fetchLivePrice(trade.asset).catch(() => null);
    if (livePrice && Number.isFinite(livePrice)) {
      const now = Date.now();
      const hitStop = trade.side === "LONG" ? livePrice <= trade.stop : livePrice >= trade.stop;
      const hitT1 = trade.status === "open" && (trade.side === "LONG" ? livePrice >= trade.target1 : livePrice <= trade.target1);
      const hitT2 = trade.side === "LONG" ? livePrice >= trade.target : livePrice <= trade.target;
      if (hitStop) {
        closeTrade(trade, "stop", trade.stop, now);
        changed = true;
      } else {
        if (hitT1) { takePartialProfit(trade, now); changed = true; }
        if (["open", "partial"].includes(trade.status) && hitT2) { closeTrade(trade, "target", trade.target, now); changed = true; }
      }
      if (!changed) {
        const pnl = calculatePnl(trade, livePrice);
        trade.pnl = pnl;
        trade.pnlPct = trade.amount > 0 ? (pnl / trade.amount) * 100 : 0;
        appendPoint(trade, livePrice, pnl, trade.pnlPct, now);
        changed = true;
      }
    }
  }

  return changed;
}

function applyTradeCandle(trade, candle) {
  if (trade.status === "pending") {
    const triggered = trade.triggerDirection === "above" ? candle.high >= trade.entry : candle.low <= trade.entry;
    if (triggered) {
      trade.status = "open";
      trade.filledAt = candle.closeTime;
      trade.result = "server: позиция открыта";
      appendPoint(trade, trade.entry, 0, 0, candle.closeTime);
    } else {
      const ttl = trade.strategyMode === "scalping" ? config.scalpingTtlMs : config.pendingTtlMs;
      if (candle.closeTime - Number(trade.openedAt) >= ttl) {
        closePendingTrade(trade, candle.close, candle.closeTime, `server: pending отменен за ${Math.round(ttl / 60000)} мин`);
        return true;
      }
      appendPoint(trade, candle.close, 0, 0, candle.closeTime);
      return true;
    }
  }

  if (!["open", "partial"].includes(trade.status)) return false;

  const hitStop = trade.side === "LONG" ? candle.low <= trade.stop : candle.high >= trade.stop;
  const hitTarget1 = trade.side === "LONG" ? candle.high >= trade.target1 : candle.low <= trade.target1;
  const hitTarget2 = trade.side === "LONG" ? candle.high >= trade.target : candle.low <= trade.target;

  if (hitStop) {
    closeTrade(trade, "stop", trade.stop, candle.closeTime);
    return true;
  }
  if (trade.status === "open" && hitTarget1) {
    takePartialProfit(trade, candle.closeTime);
  }
  if (["open", "partial"].includes(trade.status) && hitTarget2) {
    closeTrade(trade, "target", trade.target, candle.closeTime);
    return true;
  }

  const pnl = calculatePnl(trade, candle.close);
  trade.pnl = pnl;
  trade.pnlPct = trade.amount > 0 ? (pnl / trade.amount) * 100 : 0;
  appendPoint(trade, candle.close, trade.pnl, trade.pnlPct, candle.closeTime);
  return true;
}

async function scanCandidates(trades, learningPolicy) {
  const activeKeys = new Set(trades.filter(isActiveTrade).map((trade) => getTradeStrategyExposureKey(trade)));
  const activeAssetCounts = countActiveAssets(trades);
  const dailyRisk = getDailyRisk(trades);
  if (dailyRisk.blocked) return [];

  const [btcTrend, goldSentiment, fearGreed, newsMap] = await Promise.all([
    getBtcTrend(),
    getGoldSentiment(),
    fetchFearGreedIntel().catch(() => null),
    fetchNewsSentimentMap().catch(() => new Map())
  ]);
  const strategiesByInterval = groupStrategiesByInterval(enabledStrategies);
  const scanTasks = [];
  for (const symbol of config.assets) {
    if ((activeAssetCounts.get(symbol) || 0) >= config.maxActivePerAsset) continue;
    for (const [interval, strategies] of strategiesByInterval.entries()) {
      scanTasks.push({ symbol, interval, strategies });
    }
  }

  const groups = await mapLimit(scanTasks, 5, async ({ symbol, interval, strategies }) => {
    await wait(80);
    const needsStandardHistory = strategies.some((strategy) => strategy.kind !== "scalping");
    const [candles, mtf, funding, openInterest] = await Promise.all([
      fetchCandles(symbol, interval, needsStandardHistory ? 220 : 160).catch(() => []),
      fetchMultiTimeframeConfirmation(symbol, interval).catch(() => null),
      fetchFundingIntel(symbol).catch(() => null),
      fetchOpenInterestIntel(symbol).catch(() => null)
    ]);
    if (candles.length < (needsStandardHistory ? 90 : 60)) return [];
    const news = newsMap.get(symbol.split("/")[0]) || null;
    return strategies
      .filter((strategy) => candles.length >= (strategy.kind === "scalping" ? 60 : 90))
      .map((strategy) => evaluateCandidate(symbol, interval, candles, strategy, trades, learningPolicy, btcTrend, goldSentiment, { mtf, funding, openInterest, fearGreed, news }))
      .filter((candidate) => candidate && !activeKeys.has(getCandidateStrategyExposureKey(candidate)));
  });

  const results = groups.flat();
  return results
    .filter((candidate) => !hasRecentDuplicate(trades, candidate))
    .sort((a, b) => b.score - a.score)
    .slice(0, 24);
}

function groupStrategiesByInterval(strategies) {
  const byInterval = new Map();
  strategies.forEach((strategy) => {
    strategy.timeframes.forEach((interval) => {
      if (!byInterval.has(interval)) byInterval.set(interval, []);
      byInterval.get(interval).push(strategy);
    });
  });
  return byInterval;
}

async function mapLimit(items, limit, iteratee) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await iteratee(items[current], current);
    }
  });
  await Promise.all(workers);
  return results;
}

function selectEntryCandidates(candidates, trades) {
  const selected = [];
  const strategyCounts = new Map();
  const activeAssetCounts = countActiveAssets(trades);
  const profileStrategyLimits = activeProfile.strategyMaxEntriesPerRun || {};

  for (const candidate of candidates) {
    const strategy = serverStrategies[candidate.strategyId] || serverStrategies.trend;
    const minScore = getStrategyMinScore(strategy);
    if (candidate.score < minScore) continue;
    const strategyMax = profileStrategyLimits[strategy.id] ?? strategy.maxEntriesPerRun;
    if ((strategyCounts.get(strategy.id) || 0) >= strategyMax) continue;
    if ((activeAssetCounts.get(candidate.symbol) || 0) >= config.maxActivePerAsset) continue;

    selected.push(candidate);
    strategyCounts.set(strategy.id, (strategyCounts.get(strategy.id) || 0) + 1);
    activeAssetCounts.set(candidate.symbol, (activeAssetCounts.get(candidate.symbol) || 0) + 1);
    if (selected.length >= config.maxEntriesPerRun) break;
  }

  return selected;
}

// Режим рынка: 8 корзин (тренд/флэт × вверх/вниз × выс./низк. волатильность)
// Используется для Этапа 1 режимного роутера — пока только тегирование сделок,
// без влияния на отбор сигналов.
function classifyMarketRegime(adx, slopePct, atrPct) {
  const trending = Number.isFinite(adx) && adx >= 22;
  const up = slopePct >= 0;
  const highVol = atrPct >= 1.0;
  return `${trending ? "trending" : "ranging"}-${up ? "up" : "down"}-${highVol ? "highvol" : "lowvol"}`;
}

function evaluateCandidate(symbol, interval, candles, strategy, trades, learningPolicy, btcTrend = "NEUTRAL", goldSentiment = "NEUTRAL", externalFilters = {}) {
  const scalping = strategy.kind === "scalping";
  const closes = candles.map((candle) => candle.close);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const ema34 = calculateEma(closes, 34);
  const ema89 = calculateEma(closes, 89);
  const rsi14 = calculateRsi(closes, 14);
  const atr14 = calculateAtr(candles, 14);
  const adx14 = calculateAdx(candles, 14);
  const { macdLine, signalLine } = calculateMacd(closes);
  const supertrendDir = calculateSupertrend(candles, 10, 3);
  const i = closes.length - 1;
  const emaFast = ema34[i];
  const emaSlow = ema89[i];
  const rsi = rsi14[i];
  const atr = atr14[i];
  const adx = adx14[i];
  const macd = macdLine[i];
  const macdSig = signalLine[i];
  const stDir = supertrendDir[i];
  if (![emaFast, emaSlow, rsi, atr].every(Number.isFinite)) return null;

  const trend = emaFast > emaSlow ? "LONG" : emaFast < emaSlow ? "SHORT" : "NEUTRAL";
  const slopePct = emaFast > 0 ? ((emaFast - ema34[Math.max(0, i - 5)]) / emaFast) * 100 : 0;
  const atrPct = atr / last.close * 100;
  const avgVolume = average(candles.slice(-30, -1).map((candle) => candle.volume));
  const volumeRatio = avgVolume > 0 ? last.volume / avgVolume : 1;
  const impulsePct = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const crash = detectCrash(candles);
  if (crash.severe || atrPct > 4.5 || atrPct < 0.18) return null;

  // Determine trade direction — EMA-based for standard strategies; signal-based for reversal/breakout
  let side;
  let breakoutLevel = null;
  if (strategy.kind === "rsi-reversal") {
    if (rsi < config.rsiReversalLow) side = "LONG";
    else if (rsi > config.rsiReversalHigh) side = "SHORT";
    else return null;
  } else if (strategy.kind === "breakout") {
    const breakoutSignal = getBreakoutSide(candles);
    if (!breakoutSignal) return null;
    side = breakoutSignal.side;
    breakoutLevel = breakoutSignal.level;
  } else if (strategy.kind === "vwap-reversion") {
    side = getVwapReversionSide(candles, atr);
    if (!side) return null;
  } else {
    if (trend === "NEUTRAL") return null;
    side = trend;
  }

  if (crash.riskOff && side === "LONG") return null;
  if (volumeRatio < (scalping ? config.minScalpingVolumeRatio : config.minVolumeRatio)) return null;

  const mtf = externalFilters.mtf || getProxyMultiTimeframeConfirmation(candles, interval);
  const mtfDecision = evaluateMultiTimeframeFilter(mtf, side, scalping);
  if (mtfDecision.block) return null;

  const funding = externalFilters.funding || null;
  const fundingDecision = evaluateFundingFilter(funding, side);
  if (fundingDecision.block) return null;

  const fearGreed = externalFilters.fearGreed || null;
  const fearGreedDecision = evaluateFearGreedFilter(fearGreed, side);
  if (fearGreedDecision.block) return null;

  const news = externalFilters.news || null;
  const newsDecision = evaluateNewsFilter(news, side);

  const history = getPatternStats(trades, symbol, interval, side, strategy.id);
  const patternKey = getLearningPatternKey(symbol, interval, side, strategy.id);
  const isSoftMode = config.blockedAssetMode === "soft";
  if (!isSoftMode) {
    if (isAssetBlockedByPolicy(symbol, learningPolicy) || learningPolicy?.blockedPatterns?.includes(patternKey)) return null;
    if (learningPolicy?.blockedAssetSides?.includes(`${symbol}|${side}`)) return null;
  }
  const blockPenalty = isSoftMode ? getSoftBlockPenalty(symbol, interval, side, strategy, learningPolicy) : 0;
  let score = 45 - blockPenalty;
  score += side === "LONG" ? Math.max(-10, Math.min(14, slopePct * 8)) : Math.max(-10, Math.min(14, -slopePct * 8));
  if (side === "LONG" && rsi >= 48 && rsi <= 66) score += 15;
  if (side === "SHORT" && rsi >= 34 && rsi <= 52) score += 15;
  if (volumeRatio >= 1.15) score += 12;
  if (volumeRatio >= 1.6) score += 5;
  if (atrPct >= 0.25 && atrPct <= 1.8) score += 10;
  if (Math.abs(impulsePct) > 3.2) score -= 12;
  if (interval === "5m" || interval === "15m") score += 3;
  score += mtfDecision.scoreDelta;
  score += fundingDecision.scoreDelta;
  score += fearGreedDecision.scoreDelta;
  score += newsDecision.scoreDelta;
  const crossoverAge = getEmaCrossoverAge(ema34, ema89);
  if (crossoverAge <= 5) score += 10;
  else if (crossoverAge <= 15) score += 3;
  else if (crossoverAge > 25) score -= 5;
  const recentVols = candles.slice(-4, -1).map((c) => c.volume);
  if (recentVols.length >= 3 && recentVols[2] > recentVols[0] * 1.12) score += 5;
  if (learningPolicy?.sideBias === -1 && side === "LONG") score -= 12;
  else if (learningPolicy?.sideBias === 1 && side === "SHORT") score -= 12;
  if (symbol !== "BTC/USDT" && btcTrend !== "NEUTRAL") {
    if (btcTrend === "SHORT" && side === "LONG") score -= 10;
    else if (btcTrend === "SHORT" && side === "SHORT") score += 6;
    else if (btcTrend === "LONG" && side === "LONG") score += 5;
    else if (btcTrend === "LONG" && side === "SHORT") score -= 5;
  }
  // Золото/серебро: RISK_OFF = деньги уходят в защитные активы = осторожность с LONG
  if (goldSentiment === "RISK_OFF") {
    if (side === "LONG") score -= 8;
    else score += 4;
  } else if (goldSentiment === "RISK_ON") {
    if (side === "LONG") score += 4;
    else score -= 5;
  }
  // ADX: market regime filter — weak trend = penalize trend signals, strong = boost
  if (Number.isFinite(adx)) {
    if (adx < 15) {
      if (!scalping) score -= 10;
    } else if (adx < 20) {
      if (strategy.kind === "trend") score -= 5;
    } else if (adx >= 28 && adx <= 45) {
      if (strategy.kind === "trend") score += 8;
    } else if (adx > 48) {
      score -= 6; // extreme volatility, risky entry
    }
  }
  // MACD confluence: independent momentum confirmation
  if (Number.isFinite(macd) && Number.isFinite(macdSig)) {
    const macdBullish = macd > macdSig;
    if (side === "LONG" && macdBullish) score += 8;
    else if (side === "SHORT" && !macdBullish) score += 8;
    else score -= 7; // MACD contradicts direction
  }
  // Supertrend direction confirmation
  if (Number.isFinite(stDir)) {
    const stBullish = stDir === 1;
    if (side === "LONG" && stBullish) score += 6;
    else if (side === "SHORT" && !stBullish) score += 6;
    else score -= 8; // Supertrend contradicts direction
  }
  // RSI divergence: price vs RSI disagree over last 8 candles → weakening momentum
  const divLookback = 8;
  const rsiPrev = rsi14[Math.max(0, i - divLookback)];
  const pricePrev = closes[Math.max(0, i - divLookback)];
  if (Number.isFinite(rsiPrev) && Number.isFinite(pricePrev)) {
    const priceUp = closes[i] > pricePrev;
    const rsiUp = rsi > rsiPrev;
    if (priceUp && !rsiUp && rsi > 52 && side === "LONG") score -= 10; // bearish divergence
    if (!priceUp && rsiUp && rsi < 48 && side === "SHORT") score -= 10; // bullish divergence
    if (priceUp && rsiUp && side === "LONG") score += 4; // momentum confirmed
    if (!priceUp && !rsiUp && side === "SHORT") score += 4; // momentum confirmed
  }
  if (strategy.kind === "pullback") {
    const pullback = evaluatePullback(closes, candles, side, rsi, atrPct, volumeRatio);
    if (!pullback.ok) return null;
    score += pullback.scoreBoost;
  }
  if (scalping) {
    const scalp = evaluateScalp(closes, candles, side, rsi, atrPct, volumeRatio);
    if (!scalp.ok) return null;
    score = Math.max(score, scalp.score);
  }
  if (strategy.kind === "rsi-reversal") {
    const reversal = evaluateRsiReversal(candles, rsi, side, atrPct, volumeRatio);
    if (!reversal.ok) return null;
    score += reversal.scoreBoost;
  }
  if (strategy.kind === "breakout") {
    const bo = evaluateBreakoutSignal(candles, side, volumeRatio, adx, atrPct, externalFilters.openInterest);
    if (!bo.ok) return null;
    score += bo.scoreBoost;
  }
  if (strategy.kind === "vwap-reversion") {
    const vr = evaluateVwapReversion(candles, atr, side, rsi, volumeRatio);
    if (!vr.ok) return null;
    score += vr.scoreBoost;
  }
  if (strategy.kind === "momentum") {
    const mom = evaluateMomentumSignal(side, volumeRatio, adx, atrPct, rsi, impulsePct);
    if (!mom.ok) return null;
    score += mom.scoreBoost;
  }
  if (history.trades >= 3) score += history.winRate >= 60 && history.avgPnlPct > 0 ? 10 : -25;

  const wideStop = strategy.kind === "momentum";
  const atrStop = calculateAtrStopModel(last.close, atrPct, scalping, wideStop);
  const riskDistance = atrStop.distance;
  const isReversal = strategy.kind === "rsi-reversal" || strategy.kind === "vwap-reversion";
  // rr1/rr2 у scalping были 0.55/0.9 (цель меньше риска даже без учёта costs) — при реальном
  // live winrate ~47% это математически гарантированный минус (нужен WR>=58% на таком RR).
  // Подняты до 1.3/1.9: безубыточный WR для blended RR=1.6 — около 38%, что даёт запас
  // прибыльности при текущем winrate без необходимости угадывать чаще.
  const rr1 = scalping ? 1.3 : strategy.kind === "pullback" ? 1.35 : strategy.kind === "momentum" ? 2.2 : isReversal ? 1.2 : 1.6;
  const rr2 = scalping ? 1.9 : strategy.kind === "pullback" ? 2 : strategy.kind === "momentum" ? 3.8 : isReversal ? 1.8 : 2.2;
  const entry = strategy.kind === "breakout"
    ? getBreakoutEntryPrice(breakoutLevel, side)
    : getStrategyEntryPrice(last.close, side, strategy.kind);
  const scenario = side === "LONG"
    ? {
        side,
        entry,
        stop: entry - riskDistance,
        target1: entry + riskDistance * rr1,
        target2: entry + riskDistance * rr2,
        stopModel: atrStop
      }
    : {
        side,
        entry,
        stop: entry + riskDistance,
        target1: entry - riskDistance * rr1,
        target2: entry - riskDistance * rr2,
        stopModel: atrStop
      };
  const expected = estimateScenarioExpectedNet(scenario, scalping);
  if (expected.weightedNetPct < (scalping ? config.minScalpingExpectedNetPct : config.minExpectedNetPct)) return null;
  if (expected.target2NetPct <= 0) return null;
  if (learningPolicy?.preferredPatterns?.includes(patternKey)) score += 14;

  return {
    symbol,
    interval,
    side,
    score: Math.round(Math.max(0, Math.min(100, score))),
    scalping,
    strategyId: strategy.id,
    strategyLabel: strategy.label,
    strategyKind: strategy.kind,
    strategyMode: strategy.strategyMode,
    signalTemplate: strategy.signalTemplate,
    riskMultiplier: strategy.riskMultiplier || 1,
    price: last.close,
    rsi,
    atrPct,
    volumeRatio,
    slopePct,
    regime: classifyMarketRegime(adx, slopePct, atrPct),
    mtf,
    funding,
    fearGreed,
    news,
    openInterest: externalFilters.openInterest || null,
    history,
    crash,
    scenario,
    expected,
    patternKey,
    reason: `${strategy.label}: EMA ${side}, RSI ${rsi.toFixed(1)}, MACD ${Number.isFinite(macd) && Number.isFinite(macdSig) ? (macd > macdSig ? "↑" : "↓") : "?"}, ADX ${Number.isFinite(adx) ? adx.toFixed(0) : "?"}, ST ${stDir === 1 ? "↑" : "↓"}, vol x${volumeRatio.toFixed(2)}, ATR ${atrPct.toFixed(2)}%, стоп ${atrStop.stopPct.toFixed(2)}%, F&G ${fearGreed ? `${fearGreed.value}` : "n/a"}, MTF ${mtf?.summary || "proxy"}, funding ${funding ? `${funding.fundingRatePct.toFixed(4)}%` : "n/a"}, OI ${externalFilters.openInterest ? `${externalFilters.openInterest.changePct.toFixed(2)}%` : "n/a"}, новости ${news ? `${news.bias} ${news.score.toFixed(0)}` : "n/a"}, цель ${expected.weightedNetPct.toFixed(2)}%, BTC ${btcTrend}`
  };
}

function evaluatePullback(closes, candles, side, rsi, atrPct, volumeRatio) {
  const i = closes.length - 1;
  const last = candles[i];
  const ema21 = calculateEma(closes, 21);
  const ema34 = calculateEma(closes, 34);
  const distanceToEmaPct = ema34[i] > 0 ? Math.abs((last.close - ema34[i]) / ema34[i]) * 100 : 999;
  const isNearTrend = distanceToEmaPct <= Math.max(0.35, atrPct * 1.1);
  const longOk = side === "LONG" && closes[i] >= ema34[i] && closes[i] <= ema21[i] * 1.012 && rsi >= 42 && rsi <= 58;
  const shortOk = side === "SHORT" && closes[i] <= ema34[i] && closes[i] >= ema21[i] * 0.988 && rsi >= 42 && rsi <= 58;
  if (!isNearTrend || !(longOk || shortOk) || volumeRatio < config.minVolumeRatio) return { ok: false, scoreBoost: 0 };
  let scoreBoost = 8;
  if (distanceToEmaPct <= atrPct * 0.7) scoreBoost += 5;
  if (volumeRatio >= 1.05) scoreBoost += 4;
  return { ok: true, scoreBoost };
}

function getStrategyEntryPrice(price, side, kind) {
  if (kind === "pullback") return side === "LONG" ? price * 0.9985 : price * 1.0015;
  if (kind === "rsi-reversal" || kind === "vwap-reversion") return side === "LONG" ? price * 0.9992 : price * 1.0008;
  return side === "LONG" ? price * 1.0003 : price * 0.9997;
}

// Вход не по цене пробоя (это погоня за уже состоявшимся движением — основная причина
// WR=7% на breakout в live), а по retest пробитого уровня: ждём возврата цены к highN/lowN
// и входим чуть дальше уровня в сторону сигнала, подтверждая, что уровень удержался.
function getBreakoutEntryPrice(level, side) {
  return side === "LONG" ? level * 1.0008 : level * 0.9992;
}

function evaluateScalp(closes, candles, side, rsi, atrPct, volumeRatio) {
  const ema9 = calculateEma(closes, 9);
  const ema21 = calculateEma(closes, 21);
  const i = closes.length - 1;
  const longOk = side === "LONG" && closes[i] > ema9[i] && ema9[i] > ema21[i] && rsi >= 48 && rsi <= 68;
  const shortOk = side === "SHORT" && closes[i] < ema9[i] && ema9[i] < ema21[i] && rsi >= 32 && rsi <= 52;
  if (volumeRatio < config.minScalpingVolumeRatio) return { ok: false, score: 0 };
  let score = 52;
  if (longOk || shortOk) score += 22;
  if (volumeRatio >= 1.35) score += 12;
  if (atrPct >= 0.18 && atrPct <= 1.4) score += 10;
  const lastRangePct = candles[i].close > 0 ? ((candles[i].high - candles[i].low) / candles[i].close) * 100 : 0;
  if (lastRangePct <= 1.8) score += 4;
  return { ok: (longOk || shortOk) && score >= 72, score: Math.round(score) };
}

function calculateVwap(candles, lookback = 50) {
  const slice = candles.slice(-lookback);
  let sumPV = 0, sumV = 0;
  for (const c of slice) {
    const typical = (c.high + c.low + c.close) / 3;
    sumPV += typical * c.volume;
    sumV += c.volume;
  }
  return sumV > 0 ? sumPV / sumV : null;
}

function getBreakoutSide(candles, lookback = 20) {
  if (candles.length < lookback + 2) return null;
  const slice = candles.slice(-lookback - 1, -1);
  const highN = Math.max(...slice.map((c) => c.high));
  const lowN = Math.min(...slice.map((c) => c.low));
  const last = candles[candles.length - 1];
  if (last.close > highN * 1.002) return { side: "LONG", level: highN };
  if (last.close < lowN * 0.998) return { side: "SHORT", level: lowN };
  return null;
}

function getVwapReversionSide(candles, atr) {
  const vwap = calculateVwap(candles, 50);
  if (!vwap || !Number.isFinite(atr) || atr <= 0) return null;
  const last = candles[candles.length - 1];
  const distAtr = (last.close - vwap) / atr;
  if (distAtr < -1.4) return "LONG";
  if (distAtr > 1.4) return "SHORT";
  return null;
}

function evaluateRsiReversal(candles, rsi, side, atrPct, volumeRatio) {
  const i = candles.length - 1;
  const last = candles[i];
  const prev = candles[i - 1];
  if (!prev) return { ok: false, scoreBoost: 0 };
  const range = last.high - last.low;
  const lowerWick = Math.min(last.open, last.close) - last.low;
  const upperWick = last.high - Math.max(last.open, last.close);
  const hasReversalCandle = side === "LONG"
    ? (range > 0 && lowerWick >= range * 0.3) || last.close > prev.close
    : (range > 0 && upperWick >= range * 0.3) || last.close < prev.close;
  if (!hasReversalCandle) return { ok: false, scoreBoost: 0 };
  let scoreBoost = 15;
  if (side === "LONG" && rsi < 22) scoreBoost += 10;
  if (side === "SHORT" && rsi > 78) scoreBoost += 10;
  if (volumeRatio >= 1.2) scoreBoost += 8;
  return { ok: true, scoreBoost };
}

function evaluateBreakoutSignal(candles, side, volumeRatio, adx, atrPct, openInterest = null) {
  if (volumeRatio < 1.3) return { ok: false, scoreBoost: 0 };
  if (!openInterest || !Number.isFinite(openInterest.changePct)) return { ok: false, scoreBoost: 0 };
  if (openInterest.changePct < 0.35) return { ok: false, scoreBoost: 0 };
  let scoreBoost = 10;
  if (volumeRatio >= 1.6) scoreBoost += 8;
  if (volumeRatio >= 2.0) scoreBoost += 5;
  if (Number.isFinite(adx) && adx >= 22) scoreBoost += 8;
  if (atrPct >= 0.3) scoreBoost += 4;
  if (openInterest.changePct >= 1) scoreBoost += 8;
  if (openInterest.changePct >= 2.5) scoreBoost += 6;
  return { ok: true, scoreBoost };
}

// Риск-стратегия: ловит уже разогнавшееся движение (высокий ADX + объёмный всплеск +
// RSI в зоне импульса, не на развороте), а не раннюю стадию тренда, как trend.
// Расплата за более редкие и строгие входы — широкий стоп/цель (см. rr1/rr2 и wideStop в
// evaluateCandidate) и x2 риск на сделку (strategy.riskMultiplier).
function evaluateMomentumSignal(side, volumeRatio, adx, atrPct, rsi, impulsePct) {
  if (volumeRatio < 1.5) return { ok: false, scoreBoost: 0 };
  if (!Number.isFinite(adx) || adx < 25) return { ok: false, scoreBoost: 0 };
  if (atrPct < 0.4) return { ok: false, scoreBoost: 0 };
  const rsiOk = side === "LONG" ? rsi >= 52 && rsi <= 80 : rsi <= 48 && rsi >= 20;
  if (!rsiOk) return { ok: false, scoreBoost: 0 };
  const impulseOk = side === "LONG" ? impulsePct >= 0.5 : impulsePct <= -0.5;
  if (!impulseOk) return { ok: false, scoreBoost: 0 };
  let scoreBoost = 12;
  if (volumeRatio >= 2) scoreBoost += 8;
  if (adx >= 35) scoreBoost += 10;
  if (atrPct >= 1) scoreBoost += 6;
  if (Math.abs(impulsePct) >= 1.2) scoreBoost += 8;
  return { ok: true, scoreBoost };
}

function evaluateVwapReversion(candles, atr, side, rsi, volumeRatio) {
  const vwap = calculateVwap(candles, 50);
  if (!vwap || !Number.isFinite(atr) || atr <= 0) return { ok: false, scoreBoost: 0 };
  const last = candles[candles.length - 1];
  const distAtrAbs = Math.abs((last.close - vwap) / atr);
  let scoreBoost = 8;
  if (distAtrAbs >= 2.0) scoreBoost += 8;
  if (distAtrAbs >= 2.8) scoreBoost += 5;
  if (side === "LONG" && rsi < 38) scoreBoost += 6;
  if (side === "SHORT" && rsi > 62) scoreBoost += 6;
  if (volumeRatio >= 1.1) scoreBoost += 4;
  return { ok: true, scoreBoost };
}

function getHigherTfTrend(candles, interval) {
  const step = interval === "5m" ? 4 : interval === "15m" ? 4 : interval === "1h" ? 4 : 0;
  if (!step || candles.length < step * 30) return "NEUTRAL";
  const sampled = candles.filter((_, i) => i % step === 0);
  if (sampled.length < 25) return "NEUTRAL";
  const closes = sampled.map((c) => c.close);
  const ema21 = calculateEma(closes, 21);
  const ema55 = calculateEma(closes, 55);
  const i = closes.length - 1;
  if (!Number.isFinite(ema21[i]) || !Number.isFinite(ema55[i])) return "NEUTRAL";
  if (ema21[i] > ema55[i] * 1.002) return "LONG";
  if (ema21[i] < ema55[i] * 0.998) return "SHORT";
  return "NEUTRAL";
}

function getMtfFramesForInterval(interval) {
  if (interval === "5m") return ["15m", "1h"];
  if (interval === "15m") return ["1h", "4h"];
  if (interval === "1h") return ["4h"];
  return [];
}

async function fetchMultiTimeframeConfirmation(symbol, interval) {
  const frames = getMtfFramesForInterval(interval);
  if (!frames.length) return { direction: "NEUTRAL", frames: [], summary: "MTF n/a" };
  const results = await Promise.all(frames.map(async (frame) => {
    const candles = await fetchCandlesBybit(symbol, frame, 140);
    return analyzeTrendFromCandles(candles, frame);
  }));
  const longCount = results.filter((item) => item.direction === "LONG").length;
  const shortCount = results.filter((item) => item.direction === "SHORT").length;
  const direction = longCount === results.length ? "LONG" : shortCount === results.length ? "SHORT" : "MIXED";
  return {
    direction,
    frames: results,
    summary: results.map((item) => `${item.frame}:${item.direction}`).join("/")
  };
}

function getProxyMultiTimeframeConfirmation(candles, interval) {
  const direction = getHigherTfTrend(candles, interval);
  return { direction, frames: [{ frame: "proxy", direction }], summary: `proxy:${direction}` };
}

function analyzeTrendFromCandles(candles, frame = "") {
  const closes = candles.map((candle) => candle.close);
  const ema34 = calculateEma(closes, 34);
  const ema89 = calculateEma(closes, 89);
  const i = closes.length - 1;
  if (i < 89 || !Number.isFinite(ema34[i]) || !Number.isFinite(ema89[i])) {
    return { frame, direction: "NEUTRAL", strength: 0 };
  }
  const slope = ema34[i] - ema34[Math.max(0, i - 8)];
  const strength = closes[i] > 0 ? Math.abs(slope / closes[i]) * 100 : 0;
  const direction = ema34[i] > ema89[i] && slope >= 0
    ? "LONG"
    : ema34[i] < ema89[i] && slope <= 0
      ? "SHORT"
      : "NEUTRAL";
  return { frame, direction, strength };
}

function evaluateMultiTimeframeFilter(mtf, side, scalping = false) {
  if (!mtf?.frames?.length) return { block: false, scoreDelta: 0, reason: "MTF нет данных" };
  const opposite = side === "LONG" ? "SHORT" : "LONG";
  const hardOpposite = mtf.frames.some((item) => item.direction === opposite && item.frame === "4h");
  const oppositeCount = mtf.frames.filter((item) => item.direction === opposite).length;
  const alignedCount = mtf.frames.filter((item) => item.direction === side).length;
  if (!scalping && (hardOpposite || oppositeCount >= 2)) {
    return { block: true, scoreDelta: -100, reason: `MTF против сделки: ${mtf.summary}` };
  }
  if (scalping && oppositeCount >= 2) {
    return { block: true, scoreDelta: -100, reason: `MTF против скальпа: ${mtf.summary}` };
  }
  if (alignedCount === mtf.frames.length) return { block: false, scoreDelta: 14, reason: `MTF подтверждает: ${mtf.summary}` };
  if (alignedCount > 0 && oppositeCount === 0) return { block: false, scoreDelta: 6, reason: `MTF частично подтверждает: ${mtf.summary}` };
  if (oppositeCount > 0) return { block: false, scoreDelta: scalping ? -8 : -14, reason: `MTF частично против: ${mtf.summary}` };
  return { block: false, scoreDelta: 0, reason: `MTF нейтральный: ${mtf.summary}` };
}

async function fetchFundingIntel(symbol) {
  // Bybit's funding API is geo-blocked for our VPS (CloudFront 403) — use OKX instead.
  const instId = `${toOkxSymbol(symbol)}-SWAP`;
  const response = await fetchWithTimeout(`https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`, {}, 6_000);
  if (!response.ok) throw new Error(`funding ${response.status}`);
  const data = await response.json();
  if (data.code !== "0") throw new Error(data.msg || "funding failed");
  const fundingRatePct = Number(data.data?.[0]?.fundingRate) * 100;
  return {
    fundingRatePct: Number.isFinite(fundingRatePct) ? fundingRatePct : 0,
    updatedAt: Number(data.data?.[0]?.fundingTime) || Date.now()
  };
}

async function fetchOpenInterestIntel(symbol) {
  // Bybit's open-interest API is geo-blocked for our VPS (CloudFront 403), so we use
  // OKX's rubik OI history instead — 5m buckets, compared 1h apart (12 buckets) since
  // real OI moves are typically 0.01-0.2% over 15min but spread -0.7%..+1.4% over 1h.
  const ccy = symbol.split("/")[0];
  const response = await fetchWithTimeout(`https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=${ccy}&period=5m`, {}, 6_000);
  if (!response.ok) throw new Error(`open interest ${response.status}`);
  const data = await response.json();
  if (data.code !== "0") throw new Error(data.msg || "open interest failed");
  const list = data.data || [];
  if (list.length < 13) throw new Error("open interest history too short");
  const current = Number(list[0]?.[1]) || 0;
  const previous = Number(list[12]?.[1]) || current;
  const changePct = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  return {
    openInterest: current,
    previousOpenInterest: previous,
    changePct,
    updatedAt: Number(list[0]?.[0]) || Date.now()
  };
}

async function fetchFearGreedIntel() {
  const response = await fetchWithTimeout("https://api.alternative.me/fng/?limit=1", {}, 6_000);
  if (!response.ok) throw new Error(`fear greed ${response.status}`);
  const data = await response.json();
  const item = data.data?.[0] || {};
  return {
    value: Number(item.value) || 50,
    label: String(item.value_classification || "Neutral"),
    updatedAt: Number(item.timestamp) ? Number(item.timestamp) * 1000 : Date.now()
  };
}

// Серверный новостной фон. В отличие от браузерной версии (которая требует
// CORS-proxy для CMC/CFTC), здесь Node делает прямой fetch без CORS-ограничений —
// RSS публичных крипто-изданий читаются без ключей и без прокси.
const newsRssFeeds = [
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://cointelegraph.com/rss"
];

const newsBullishWords = [
  "bull", "bullish", "listing", "approval", "approve", "etf inflow", "partnership",
  "upgrade", "mainnet", "record inflow", "accumulation", "rally", "surge",
  "all-time high", "soars", "breakout", "adoption"
];
const newsBearishWords = [
  "bear", "bearish", "delist", "delisting", "hack", "exploit", "lawsuit", "fine",
  "ban", "outflow", "liquidation", "default", "probe", "investigation", "crash",
  "plunge", "sell-off", "selloff", "scam", "exploit"
];
const newsRegulatoryWords = ["cftc", "sec ", "regulator", "regulatory", "commission", "enforcement", "indict", "subpoena"];

async function fetchNewsSentimentMap() {
  const items = [];
  await Promise.all(newsRssFeeds.map(async (url) => {
    try {
      const response = await fetchWithTimeout(url, {}, 8_000);
      if (!response.ok) return;
      const xml = await response.text();
      items.push(...parseRssItems(xml));
    } catch {
      // один упавший фид не должен ронять весь цикл
    }
  }));
  return buildNewsSentimentMap(items);
}

function parseRssItems(xml) {
  const blocks = String(xml || "").split(/<item[\s>]/i).slice(1);
  return blocks.map((block) => {
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    const descMatch = block.match(/<description>([\s\S]*?)<\/description>/i);
    return {
      title: stripRssText(titleMatch?.[1] || ""),
      description: stripRssText(descMatch?.[1] || "")
    };
  }).filter((item) => item.title);
}

function stripRssText(raw) {
  return String(raw || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreNewsText(text) {
  const lower = text.toLowerCase();
  let score = 0;
  newsBullishWords.forEach((word) => { if (lower.includes(word)) score += 14; });
  newsBearishWords.forEach((word) => { if (lower.includes(word)) score -= 16; });
  const isRegulatory = newsRegulatoryWords.some((word) => lower.includes(word));
  if (isRegulatory && score < 0) score -= 8;
  return { score: Math.max(-100, Math.min(100, score)), isRegulatory };
}

function buildNewsSentimentMap(items) {
  const baseSymbols = [...new Set(config.assets.map((symbol) => symbol.split("/")[0]))];
  const map = new Map();
  for (const symbol of baseSymbols) {
    // Регистрозависимое сравнение: тикеры в крипто-заголовках почти всегда в верхнем
    // регистре (BTC, LINK), что отличает их от обычных слов английского текста (link, near, uni).
    const pattern = new RegExp(`\\b${symbol}\\b`);
    const relevant = items.filter((item) => pattern.test(item.title) || pattern.test(item.description));
    if (!relevant.length) continue;
    const scored = relevant.map((item) => scoreNewsText(`${item.title} ${item.description}`));
    const avgScore = scored.reduce((sum, s) => sum + s.score, 0) / scored.length;
    const regulatoryRisk = scored.some((s) => s.isRegulatory && s.score <= -18);
    const bias = avgScore >= 14 ? "BULLISH" : avgScore <= -14 ? "BEARISH" : "NEUTRAL";
    map.set(symbol, { score: avgScore, bias, regulatoryRisk, count: relevant.length });
  }
  return map;
}

function evaluateNewsFilter(news, side) {
  if (!news || !Number.isFinite(news.score)) return { block: false, scoreDelta: 0, reason: "новости нет данных" };
  if (news.regulatoryRisk) {
    return { block: false, scoreDelta: -14, reason: `новости: регуляторный риск (${news.score.toFixed(0)})` };
  }
  if (news.bias === "BEARISH" && side === "LONG") {
    return { block: false, scoreDelta: -10, reason: `новости BEARISH против LONG (${news.score.toFixed(0)})` };
  }
  if (news.bias === "BULLISH" && side === "SHORT") {
    return { block: false, scoreDelta: -10, reason: `новости BULLISH против SHORT (${news.score.toFixed(0)})` };
  }
  if (news.bias === "BULLISH" && side === "LONG") {
    return { block: false, scoreDelta: 6, reason: `новости BULLISH поддерживают LONG (${news.score.toFixed(0)})` };
  }
  if (news.bias === "BEARISH" && side === "SHORT") {
    return { block: false, scoreDelta: 6, reason: `новости BEARISH поддерживают SHORT (${news.score.toFixed(0)})` };
  }
  return { block: false, scoreDelta: 0, reason: `новости нейтральны (${news.score.toFixed(0)})` };
}

function evaluateFundingFilter(funding, side) {
  if (!funding || !Number.isFinite(funding.fundingRatePct)) return { block: false, scoreDelta: 0, reason: "funding нет данных" };
  const value = funding.fundingRatePct;
  if (value >= 0.04 && side === "LONG") {
    return { block: true, scoreDelta: -100, reason: `funding ${value.toFixed(4)}%: лонги перегреты` };
  }
  if (value <= -0.04 && side === "SHORT") {
    return { block: true, scoreDelta: -100, reason: `funding ${value.toFixed(4)}%: шорты перегреты` };
  }
  if (value >= 0.02 && side === "LONG") return { block: false, scoreDelta: -12, reason: `funding ${value.toFixed(4)}% против LONG` };
  if (value >= 0.02 && side === "SHORT") return { block: false, scoreDelta: 5, reason: `funding ${value.toFixed(4)}% поддерживает осторожный SHORT` };
  if (value <= -0.02 && side === "SHORT") return { block: false, scoreDelta: -12, reason: `funding ${value.toFixed(4)}% против SHORT` };
  if (value <= -0.02 && side === "LONG") return { block: false, scoreDelta: 5, reason: `funding ${value.toFixed(4)}% поддерживает осторожный LONG` };
  return { block: false, scoreDelta: 0, reason: `funding нейтральный ${value.toFixed(4)}%` };
}

function evaluateFearGreedFilter(fearGreed, side) {
  if (!fearGreed || !Number.isFinite(fearGreed.value)) return { block: false, scoreDelta: 0, reason: "Fear & Greed нет данных" };
  const value = fearGreed.value;
  if (value > 80 && side === "LONG") {
    return { block: true, scoreDelta: -100, reason: `Fear & Greed ${value}: экстремальная жадность, LONG запрещен` };
  }
  if (value < 20 && side === "LONG") {
    return { block: false, scoreDelta: -12, reason: `Fear & Greed ${value}: extreme fear, покупка только осторожно` };
  }
  if (value < 20 && side === "SHORT") {
    return { block: false, scoreDelta: -10, reason: `Fear & Greed ${value}: поздний SHORT рискован` };
  }
  if (value > 80 && side === "SHORT") {
    return { block: false, scoreDelta: 5, reason: `Fear & Greed ${value}: SHORT получает макро-поддержку` };
  }
  return { block: false, scoreDelta: 2, reason: `Fear & Greed ${value}: без экстремума` };
}

function calculateAtrStopModel(price, atrPct, scalping = false, wide = false) {
  // wide=true (momentum): шире стоп, чтобы не выбивало шумом на разогнавшемся движении —
  // расширенные RR1/RR2 у momentum это компенсируют.
  const minPct = scalping ? 0.15 : wide ? 0.5 : 0.35;
  const maxPct = scalping ? 0.5 : wide ? 4 : 2.5;
  const multiplier = scalping ? 0.58 : wide ? 1.1 : 0.75;
  const atrBasedPct = Number.isFinite(atrPct) ? atrPct * multiplier : minPct;
  const stopPct = Math.max(minPct, Math.min(maxPct, atrBasedPct));
  return {
    type: "ATR_DYNAMIC",
    atrPct: Number.isFinite(atrPct) ? atrPct : 0,
    multiplier,
    minPct,
    maxPct,
    stopPct,
    distance: price * (stopPct / 100)
  };
}

async function getBtcTrend() {
  try {
    const candles = await fetchCandles("BTC/USDT", "1h", 200);
    if (candles.length < 90) return "NEUTRAL";
    const closes = candles.map((c) => c.close);
    const ema34 = calculateEma(closes, 34);
    const ema89 = calculateEma(closes, 89);
    const i = closes.length - 1;
    if (!Number.isFinite(ema34[i]) || !Number.isFinite(ema89[i])) return "NEUTRAL";
    if (ema34[i] > ema89[i] * 1.003) return "LONG";
    if (ema34[i] < ema89[i] * 0.997) return "SHORT";
    return "NEUTRAL";
  } catch {
    return "NEUTRAL";
  }
}

// Золото/серебро растёт → рынок уходит в защитные активы → RISK_OFF (пенализировать LONG)
async function getGoldSentiment() {
  try {
    const candles = await fetchCandlesBybit("XAUT/USDT", "1h", 60).catch(() => null)
      || await fetchCandlesBybit("XAG/USDT", "1h", 60).catch(() => null);
    if (!candles || candles.length < 30) return "NEUTRAL";
    const closes = candles.map((c) => c.close);
    const i = closes.length - 1;
    const ema14 = calculateEma(closes, 14);
    const ema34 = calculateEma(closes, 34);
    if (!Number.isFinite(ema14[i]) || !Number.isFinite(ema34[i])) return "NEUTRAL";
    // Короткий EMA выше длинного = золото растёт = защитный режим
    if (ema14[i] > ema34[i] * 1.002) return "RISK_OFF";
    if (ema14[i] < ema34[i] * 0.998) return "RISK_ON";
    return "NEUTRAL";
  } catch {
    return "NEUTRAL";
  }
}

function getEmaCrossoverAge(ema34, ema89) {
  const n = Math.min(ema34.length, ema89.length);
  if (n < 3) return 99;
  const currentTrend = ema34[n - 1] > ema89[n - 1] ? 1 : -1;
  for (let i = n - 2; i >= Math.max(0, n - 30); i--) {
    if (!Number.isFinite(ema34[i]) || !Number.isFinite(ema89[i])) continue;
    if ((ema34[i] > ema89[i] ? 1 : -1) !== currentTrend) return n - 1 - i;
  }
  return 30;
}

function estimateScenarioExpectedNet(scenario, scalping) {
  const entry = Number(scenario.entry);
  const target1 = Number(scenario.target1);
  const target2 = Number(scenario.target2);
  const direction = scenario.side === "LONG" ? 1 : -1;
  const roundTripCostPct = 2 * (config.feePct + config.slippagePct);
  const target1GrossPct = entry > 0 ? ((target1 - entry) / entry) * 100 * direction : 0;
  const target2GrossPct = entry > 0 ? ((target2 - entry) / entry) * 100 * direction : 0;
  const target1NetPct = target1GrossPct - roundTripCostPct;
  const target2NetPct = target2GrossPct - roundTripCostPct;
  const weightedNetPct = target1NetPct * 0.5 + target2NetPct * 0.5;
  return {
    scalping: Boolean(scalping),
    roundTripCostPct,
    target1GrossPct,
    target2GrossPct,
    target1NetPct,
    target2NetPct,
    weightedNetPct
  };
}

async function buildServerTrade(candidate, trades) {
  const wallet = getWalletState(trades);
  const maxBySingle = config.depositUsdt * (applyRiskCap(config.maxTradePct, candidate.riskMultiplier) / 100);
  const maxByPortfolio = Math.max(0, config.depositUsdt * (config.maxPortfolioPct / 100) - wallet.reserved);
  const amount = Math.min(maxBySingle, maxByPortfolio, wallet.free);
  if (amount < config.minNotionalUsdt) return null;

  // Reject stale signals: price moved too far since the signal candle closed
  const livePrice = await fetchLivePrice(candidate.symbol).catch(() => null);
  if (livePrice && Number.isFinite(livePrice)) {
    const drift = Math.abs(livePrice - candidate.price) / candidate.price;
    if (drift > 0.008) {
      log(`skip entry ${candidate.symbol} ${candidate.side}: price drifted ${(drift * 100).toFixed(2)}% from signal`);
      return null;
    }
  }

  const now = Date.now();
  const scenario = candidate.scenario;
  const quantity = amount / scenario.entry;
  const id = `server-${now}-${candidate.symbol.replace("/", "")}-${candidate.interval}-${Math.round(Math.random() * 10000)}`;
  const trade = {
    id,
    index: trades.length + 1,
    userLogin: config.userLogin,
    authUser: config.userLogin,
    sessionId: "server-autobot",
    asset: candidate.symbol,
    timeframe: candidate.interval,
    mode: candidate.strategyKind === "pullback" ? "pullback" : candidate.scalping ? "scalping" : "trend",
    modeSource: "server-auto",
    side: candidate.side,
    amount,
    deposit: config.depositUsdt,
    reservedAmount: amount,
    releasedAmount: 0,
    releasedPnl: 0,
    budgetReserved: true,
    walletSettled: false,
    riskBudget: amount,
    riskLimitPct: applyRiskCap(config.maxTradePct, candidate.riskMultiplier),
    autopilot: true,
    autopilotProfile: config.profileId,
    serverStrategyId: candidate.strategyId,
    serverStrategyLabel: candidate.strategyLabel,
    strategyMode: candidate.strategyMode,
    signalTemplate: candidate.signalTemplate,
    botPreset: `server-${candidate.strategyId}`,
    autopilotReason: `server-autobot ${config.profileLabel}/${candidate.strategyLabel}: ${candidate.reason}, score ${candidate.score}/100`,
    entry: scenario.entry,
    quantity,
    initialQuantity: quantity,
    remainingQuantity: quantity,
    target1Quantity: quantity * 0.5,
    realizedPnl: 0,
    stop: scenario.stop,
    target: scenario.target2,
    target1: scenario.target1,
    target1HitAt: null,
    target1ExitPrice: null,
    placedPrice: scenario.entry,
    triggerDirection: getTriggerDirection(candidate),
    executionType: candidate.scalping ? "marketable" : "conditional",
    immediateFill: candidate.scalping,
    openedAt: now,
    filledAt: candidate.scalping ? now : null,
    closedAt: null,
    status: candidate.scalping ? "open" : "pending",
    result: candidate.scalping ? "server: позиция открыта моментально" : "server: ордер ожидает вход",
    decision: candidate.reason,
    score: candidate.score,
    regimeAtEntry: candidate.regime || null,
    strategySnapshot: buildStrategySnapshot(candidate, amount),
    lastCheckedAt: now,
    exitPrice: null,
    pnl: 0,
    pnlPct: 0,
    history: [{ time: now, price: scenario.entry, pnl: 0, pnlPct: 0 }]
  };
  return trade;
}

function buildStrategySnapshot(candidate, amount) {
  return {
    version: "server-1",
    capturedAt: Date.now(),
    strategyText: `Server-autobot ${config.profileLabel}/${candidate.strategyLabel} выбрал ${candidate.side} ${candidate.symbol} ${candidate.interval}: ${candidate.reason}.`,
    userIdea: "Автономная демо-торговля без открытого браузера",
    context: {
      asset: candidate.symbol,
      timeframe: candidate.interval,
      mode: candidate.strategyKind === "pullback" ? "pullback" : candidate.scalping ? "scalping" : "trend",
      modeSource: "server-auto",
      strategyMode: candidate.strategyMode,
      serverStrategyId: candidate.strategyId,
      serverStrategyLabel: candidate.strategyLabel,
      risk: applyRiskCap(config.maxTradePct, candidate.riskMultiplier),
      news: candidate.news ? `${candidate.news.bias} ${candidate.news.score.toFixed(0)} (${candidate.news.count} нов.)` : "нет данных",
      conservative: true,
      includeLongs: true,
      includeShorts: true,
      deposit: config.depositUsdt,
      live: {
        active: true,
        symbol: candidate.symbol,
        updatedAt: Date.now()
      },
      rsi: [{ period: 14, use: true }],
      ema: [{ period: 34, use: true }, { period: 89, use: true }]
    },
    intelligence: {
      marketStructure: {
        atrPct: candidate.atrPct,
        volumeRatio: candidate.volumeRatio,
        slopePct: candidate.slopePct,
        expectedNetPct: candidate.expected?.weightedNetPct || 0,
        stopModel: candidate.scenario?.stopModel || null
      },
      marketCrash: candidate.crash,
      multiTimeframe: candidate.mtf || null,
      sentiment: candidate.fearGreed || null,
      news: candidate.news || null,
      derivatives: {
        ...(candidate.funding ? {
          fundingRatePct: candidate.funding.fundingRatePct,
          fundingUpdatedAt: candidate.funding.updatedAt
        } : {}),
        ...(candidate.openInterest ? {
          openInterest: candidate.openInterest.openInterest,
          oiChangePct: candidate.openInterest.changePct,
          oiUpdatedAt: candidate.openInterest.updatedAt
        } : {})
      },
      learning: candidate.history,
      notes: [candidate.reason]
    },
    selectedScenario: {
      side: candidate.side,
      entry: candidate.scenario.entry,
      stop: candidate.scenario.stop,
      target1: candidate.scenario.target1,
      target2: candidate.scenario.target2,
      stopModel: candidate.scenario.stopModel || null
    },
    signalQuality: {
      best: {
        side: candidate.side,
        score: candidate.score,
        decision: candidate.reason
      }
    },
    execution: {
      autopilot: true,
      reason: candidate.reason,
      userLogin: config.userLogin,
      signalTemplate: candidate.signalTemplate,
      botPreset: `server-${candidate.strategyId}`,
      profileChoice: `server-${candidate.strategyId}`,
      profileId: config.profileId,
      profileLabel: `Серверный автобот: ${config.profileLabel}`,
      serverStrategyId: candidate.strategyId,
      serverStrategyLabel: candidate.strategyLabel,
      minScore: config.minScore,
      strategyMinScore: getStrategyMinScore(serverStrategies[candidate.strategyId] || serverStrategies.trend),
      feePct: config.feePct,
      slippagePct: config.slippagePct,
      amount
    },
      qualityPatternKey: candidate.patternKey || getLearningPatternKey(candidate.symbol, candidate.interval, candidate.side, candidate.strategyId),
    rules: [
      "EMA34/89 должна подтверждать направление",
      "RSI должен быть в рабочей зоне выбранной стороны",
      "ATR и объем должны быть в умеренном диапазоне",
      "ATR-стоп: расстояние до стопа подстраивается под текущую волатильность",
      `Серверная стратегия: ${candidate.strategyLabel}`,
      "Fear & Greed: при экстремальной жадности LONG запрещен, при экстремальном страхе покупка только осторожно",
      "Multi-timeframe: вход не должен конфликтовать со старшим 1h/4h трендом",
      "Funding Rate: перегретая толпа long/short блокирует вход против риска ликвидаций",
      ...(candidate.strategyId === "breakout" ? ["Open Interest: breakout допускается только при росте OI, иначе пробой считается слабым"] : []),
      "Чистая ожидаемая прибыль после комиссии и проскальзывания должна быть положительной",
      "LONG блокируется при risk-off/crash режиме",
      "Размер позиции ограничен бюджетом сервера"
    ],
    outcome: null
  };
}

async function fetchLivePrice(symbol) {
  // Try OKX first (accessible from GitHub Actions), unless known unlisted there.
  if (!okxUnavailableSymbols.has(symbol)) {
    try {
      const params = new URLSearchParams({ instId: toOkxSymbol(symbol) });
      const response = await fetchWithTimeout(`https://www.okx.com/api/v5/market/ticker?${params.toString()}`, {}, 4_000);
      if (!response.ok) throw new Error(`OKX ticker ${response.status}`);
      const data = await response.json();
      const price = Number(data.data?.[0]?.last);
      if (!price || !Number.isFinite(price)) throw new Error("no price");
      return price;
    } catch {
      // Fall through to Bybit
    }
  }
  const params = new URLSearchParams({ category: "spot", symbol: toBybitSymbol(symbol) });
  const response = await fetchWithTimeout(`https://api.bybit.com/v5/market/tickers?${params.toString()}`, {}, 4_000);
  if (!response.ok) throw new Error(`ticker ${response.status}`);
  const data = await response.json();
  if (data.retCode !== 0) throw new Error(data.retMsg || "ticker failed");
  const price = Number(data.result?.list?.[0]?.lastPrice);
  if (!price || !Number.isFinite(price)) throw new Error("no price");
  return price;
}

const okxIntervals = { "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1H", "4h": "4H", "1d": "1D" };

function toOkxSymbol(symbol) {
  return symbol.replace("/", "-");
}

function toBinanceSymbol(symbol) {
  return symbol.replace("/", "");
}

// ── Bybit Private API ────────────────────────────────────────────────────────

function bybitSign(str) {
  return createHmac("sha256", bybitApiSecret).update(str).digest("hex");
}

async function bybitPrivateGet(endpoint, params = {}) {
  const ts = Date.now().toString();
  const recvWindow = "5000";
  const queryString = new URLSearchParams(params).toString();
  const sign = bybitSign(ts + bybitApiKey + recvWindow + queryString);
  const url = `https://api.bybit.com${endpoint}${queryString ? "?" + queryString : ""}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      "X-BAPI-API-KEY": bybitApiKey,
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-SIGN": sign,
      "X-BAPI-RECV-WINDOW": recvWindow,
    },
  }, 10_000);
  if (!response.ok) throw new Error(`Bybit private GET ${response.status}`);
  const data = await response.json();
  if (data.retCode !== 0) throw new Error(`Bybit API: ${data.retMsg} (${data.retCode})`);
  return data;
}

async function bybitPrivatePost(endpoint, body = {}) {
  const ts = Date.now().toString();
  const recvWindow = "5000";
  const bodyStr = JSON.stringify(body);
  const sign = bybitSign(ts + bybitApiKey + recvWindow + bodyStr);
  const response = await fetchWithTimeout(`https://api.bybit.com${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-BAPI-API-KEY": bybitApiKey,
      "X-BAPI-TIMESTAMP": ts,
      "X-BAPI-SIGN": sign,
      "X-BAPI-RECV-WINDOW": recvWindow,
    },
    body: bodyStr,
  }, 10_000);
  if (!response.ok) throw new Error(`Bybit private POST ${response.status}`);
  const data = await response.json();
  if (data.retCode !== 0) throw new Error(`Bybit API: ${data.retMsg} (${data.retCode})`);
  return data;
}

async function getBybitBalance() {
  const data = await bybitPrivateGet("/v5/account/wallet-balance", { accountType: "UNIFIED" });
  const coins = data.result.list[0]?.coin || [];
  const usdt = coins.find((c) => c.coin === "USDT");
  return {
    usdt: Number(usdt?.walletBalance || 0),
    equity: Number(usdt?.equity || 0),
    available: Number(usdt?.availableToWithdraw || usdt?.walletBalance || 0),
  };
}

// Places a real spot order on Bybit. Returns orderId or null if dry-run.
async function placeRealOrder(symbol, side, usdtAmount, entryPrice, stopPrice, targetPrice) {
  const bybitSymbol = toBybitSymbol(symbol);
  const buySide = side === "LONG" ? "Buy" : "Sell";
  const qty = Number((usdtAmount / entryPrice).toFixed(6));

  if (!realTradingEnabled) {
    log(`[DRY-RUN] Would place ${buySide} ${bybitSymbol} qty=${qty} @ ${entryPrice} stop=${stopPrice} tp=${targetPrice}`);
    return null;
  }

  if (!bybitApiKey || !bybitApiSecret) {
    log("[REAL] Bybit API credentials not set — skipping order");
    return null;
  }

  const data = await bybitPrivatePost("/v5/order/create", {
    category: "spot",
    symbol: bybitSymbol,
    side: buySide,
    orderType: "Limit",
    qty: String(qty),
    price: String(entryPrice),
    timeInForce: "GTC",
    stopLoss: String(stopPrice),
    takeProfit: String(targetPrice),
  });

  log(`[REAL] Order placed: ${buySide} ${bybitSymbol} qty=${qty} @ ${entryPrice} → orderId=${data.result.orderId}`);
  return data.result.orderId;
}

async function cancelRealOrder(symbol, orderId) {
  if (!realTradingEnabled || !orderId) return;
  await bybitPrivatePost("/v5/order/cancel", { category: "spot", symbol: toBybitSymbol(symbol), orderId });
  log(`[REAL] Order cancelled: ${toBybitSymbol(symbol)} orderId=${orderId}`);
}

// ─────────────────────────────────────────────────────────────────────────────

async function fetchCandlesOkx(symbol, interval, limit = 220, start = null) {
  const bar = okxIntervals[interval] || "15m";
  const params = new URLSearchParams({ instId: toOkxSymbol(symbol), bar, limit: String(Math.min(limit, 300)) });
  if (start) params.set("after", String(start));
  const response = await fetchWithTimeout(`https://www.okx.com/api/v5/market/candles?${params.toString()}`, {}, 7_000);
  if (!response.ok) throw new Error(`OKX ${response.status}`);
  const data = await response.json();
  if (data.code !== "0" || !Array.isArray(data.data)) throw new Error(data.msg || "OKX kline failed");
  return data.data.slice().reverse().map((item) => ({
    openTime: Number(item[0]),
    open: Number(item[1]),
    high: Number(item[2]),
    low: Number(item[3]),
    close: Number(item[4]),
    volume: Number(item[5]),
    closeTime: Number(item[0]) + intervalToMs(interval) - 1
  }));
}

async function fetchCandlesBybit(symbol, interval, limit = 220, start = null, end = null) {
  const params = new URLSearchParams({
    category: "spot",
    symbol: toBybitSymbol(symbol),
    interval: bybitIntervals[interval] || "15",
    limit: String(Math.min(limit, 1000))
  });
  if (start) params.set("start", String(start));
  if (end) params.set("end", String(end));
  const response = await fetchWithTimeout(`https://api.bybit.com/v5/market/kline?${params.toString()}`, {}, 7_000);
  if (!response.ok) throw new Error(`Bybit ${response.status}`);
  const data = await response.json();
  if (data.retCode !== 0 || !Array.isArray(data.result?.list)) throw new Error(data.retMsg || "Bybit kline failed");
  return data.result.list.slice().reverse().map((item) => ({
    openTime: Number(item[0]),
    open: Number(item[1]),
    high: Number(item[2]),
    low: Number(item[3]),
    close: Number(item[4]),
    volume: Number(item[5]),
    closeTime: Number(item[0]) + intervalToMs(interval) - 1
  }));
}

// Watchlist symbols not listed on OKX spot (error 51001 "instrument doesn't exist").
// Each strategy run is a short-lived `--once` process, so an in-memory cache built
// at runtime would reset every cycle — this list must be static instead.
const okxUnavailableSymbols = new Set(["TON/USDT", "MATIC/USDT", "TWT/USDT", "RUNE/USDT", "VET/USDT", "MKR/USDT", "XAG/USDT"]);

async function fetchCandles(symbol, interval, limit = 220, start = null) {
  if (okxUnavailableSymbols.has(symbol)) {
    return await fetchCandlesBybit(symbol, interval, limit, start);
  }
  try {
    return await fetchCandlesOkx(symbol, interval, limit, start);
  } catch (err) {
    log(`OKX candles failed (${err.message}), trying Bybit`);
    return await fetchCandlesBybit(symbol, interval, limit, start);
  }
}

// Fetch deep history via backwards pagination (Bybit end param, OKX after param).
// targetCandles: desired total candle count (e.g. 4320 for 6 months on 1h)
async function fetchCandlesDeep(symbol, interval, targetCandles) {
  const allCandles = [];
  let endTime = null;

  while (allCandles.length < targetCandles) {
    const needed = Math.min(1000, targetCandles - allCandles.length);
    let batch = null;

    // Bybit: end param = exclusive upper bound, up to 1000 per request
    try {
      batch = await fetchCandlesBybit(symbol, interval, needed, null, endTime ? endTime - 1 : null).catch(() => null);
    } catch {}

    // Fallback to OKX: after param = return candles older than this ts, max 300 per request
    if (!batch || batch.length === 0) {
      try {
        batch = await fetchCandlesOkx(symbol, interval, Math.min(needed, 300), endTime || null).catch(() => null);
      } catch {}
    }

    if (!batch || batch.length === 0) break;
    allCandles.unshift(...batch);
    endTime = batch[0].openTime; // oldest candle in this batch → next page goes before it
    await wait(200);
    if (batch.length < Math.min(needed, 50)) break; // no more history available
  }

  // Deduplicate and sort ascending
  const seen = new Set();
  return allCandles
    .filter((c) => { if (seen.has(c.openTime)) return false; seen.add(c.openTime); return true; })
    .sort((a, b) => a.openTime - b.openTime);
}

function closePendingTrade(trade, price, time, reason) {
  trade.status = "cancelled";
  trade.cancelledAt = time;
  trade.closedAt = time;
  trade.cancelReason = reason;
  trade.result = reason;
  trade.exitPrice = price;
  trade.remainingQuantity = 0;
  trade.pnl = 0;
  trade.pnlPct = 0;
  updateOutcome(trade, "cancelled");
  appendPoint(trade, price, 0, 0, time);
}

function takePartialProfit(trade, time) {
  const quantity = Math.min(Number(trade.remainingQuantity) || 0, Number(trade.target1Quantity) || 0);
  if (quantity <= 0) return;
  const pnl = calculatePnlForQuantity(trade, trade.target1, quantity);
  trade.status = "partial";
  trade.target1HitAt = time;
  trade.target1ExitPrice = trade.target1;
  trade.realizedPnl = (Number(trade.realizedPnl) || 0) + pnl;
  trade.remainingQuantity = Math.max(0, (Number(trade.remainingQuantity) || 0) - quantity);
  trade.pnl = trade.realizedPnl;
  trade.pnlPct = trade.amount > 0 ? (trade.pnl / trade.amount) * 100 : 0;
  trade.result = "server: T1 50% зафиксировано";
  updateOutcome(trade, "partial");
  appendPoint(trade, trade.target1, trade.pnl, trade.pnlPct, time);
}

function closeTrade(trade, status, exitPrice, time) {
  const exitPnl = (Number(trade.realizedPnl) || 0) + calculatePnlForQuantity(trade, exitPrice, Number(trade.remainingQuantity) || 0);
  trade.status = status;
  trade.closedAt = time;
  trade.exitPrice = exitPrice;
  trade.realizedPnl = exitPnl;
  trade.remainingQuantity = 0;
  trade.pnl = exitPnl;
  trade.pnlPct = trade.amount > 0 ? (exitPnl / trade.amount) * 100 : 0;
  trade.result = status === "target" ? "server: T1 50% + T2 остаток" : "server: стоп сработал";
  updateOutcome(trade, status);
  appendPoint(trade, exitPrice, trade.pnl, trade.pnlPct, time);
}

function updateOutcome(trade, eventType) {
  trade.updatedAt = Date.now();
  if (!trade.strategySnapshot) return;
  trade.strategySnapshot.outcome = {
    eventType,
    status: trade.status,
    result: trade.result,
    side: trade.side,
    openedAt: trade.openedAt,
    filledAt: trade.filledAt,
    closedAt: trade.closedAt,
    cancelledAt: trade.cancelledAt,
    cancelReason: trade.cancelReason,
    target1HitAt: trade.target1HitAt,
    entry: trade.entry,
    stop: trade.stop,
    target1: trade.target1,
    target2: trade.target,
    exitPrice: trade.exitPrice,
    amount: trade.amount,
    remainingQuantity: trade.remainingQuantity,
    realizedPnl: trade.realizedPnl,
    pnl: trade.pnl,
    pnlPct: trade.pnlPct,
    updatedAt: Date.now()
  };
}

function calculatePnl(trade, price) {
  return (Number(trade.realizedPnl) || 0) + calculatePnlForQuantity(trade, price, Number(trade.remainingQuantity) || 0);
}

function calculatePnlForQuantity(trade, price, quantity) {
  const direction = trade.side === "LONG" ? 1 : -1;
  const gross = (price - trade.entry) * quantity * direction;
  const entryNotional = Number(trade.entry) * quantity;
  const exitNotional = Number(price) * quantity;
  const costs = (entryNotional + exitNotional) * ((config.feePct + config.slippagePct) / 100);
  return gross - costs;
}

function getWalletState(trades) {
  const active = trades.filter(isActiveTrade);
  const reserved = active.reduce((sum, trade) => sum + (Number(trade.reservedAmount) || Number(trade.amount) || 0), 0);
  const closedPnl = trades
    .filter((trade) => !isActiveTrade(trade) && trade.status !== "cancelled")
    .reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0);
  const equity = config.depositUsdt + closedPnl;
  return { equity, reserved, free: Math.max(0, equity - reserved) };
}

function getStrategyMinScore(strategy) {
  return config.minScore + (Number(strategy?.minScoreOffset) || 0);
}

function getTriggerDirection(candidate) {
  if (candidate.strategyKind === "pullback" || candidate.strategyKind === "breakout") {
    return candidate.side === "LONG" ? "below" : "above";
  }
  return candidate.side === "LONG" ? "above" : "below";
}

function countActiveAssets(trades) {
  const counts = new Map();
  trades.filter(isActiveTrade).forEach((trade) => {
    counts.set(trade.asset, (counts.get(trade.asset) || 0) + 1);
  });
  return counts;
}

function getTradeStrategyId(trade) {
  return trade.serverStrategyId || trade.strategySnapshot?.execution?.serverStrategyId || trade.strategyMode || "legacy";
}

function getTradeStrategyExposureKey(trade) {
  return `${trade.asset}|${trade.timeframe}|${trade.side}|${getTradeStrategyId(trade)}`;
}

function getCandidateStrategyExposureKey(candidate) {
  return `${candidate.symbol}|${candidate.interval}|${candidate.side}|${candidate.strategyId}`;
}

function getDailyRisk(trades) {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const since = dayStart.getTime();
  // Only count losses from the current bot's own user — cross-user stops must not block this instance
  const ownTrades = trades.filter((t) => t.autopilot === true || t.userLogin === config.userLogin);
  const today = ownTrades.filter((trade) => !isActiveTrade(trade) && (Number(trade.closedAt) || Number(trade.openedAt) || 0) >= since);
  const pnl = today.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0);
  const lossPct = pnl < 0 ? Math.abs(pnl) / Math.max(1, config.depositUsdt) * 100 : 0;
  const stops = today.filter((trade) => trade.status === "stop" || Number(trade.pnl) < 0).length;
  const stopLimit = config.dailyStopLimit || 3;
  const lossPctLimit = config.dailyLossPctLimit || 3;
  return { pnl, lossPct, stops, blocked: lossPct >= lossPctLimit || stops >= stopLimit };
}

function getPatternStats(trades, symbol, interval, side, strategyId = "legacy") {
  const closed = trades.filter((trade) => {
    if (isActiveTrade(trade) || trade.status === "cancelled") return false;
    return trade.asset === symbol && trade.timeframe === interval && trade.side === side && getTradeStrategyId(trade) === strategyId;
  });
  const wins = closed.filter((trade) => Number(trade.pnl) > 0).length;
  const avgPnlPct = closed.length ? average(closed.map((trade) => Number(trade.pnlPct) || 0)) : 0;
  return {
    trades: closed.length,
    winRate: closed.length ? (wins / closed.length) * 100 : 0,
    avgPnlPct
  };
}

function isAssetBlockedByPolicy(symbol, learningPolicy) {
  if (config.blockedAssetMode === "soft" || config.blockedAssetMode === "none") return false;
  if (!learningPolicy?.blockedAssets?.includes(symbol)) return false;
  return config.blockedAssetMode === "strict" || learningPolicy.hardBlockedAssets?.includes(symbol);
}

function getSoftBlockPenalty(symbol, interval, side, strategy, learningPolicy) {
  if (config.blockedAssetMode !== "soft") return 0;
  const patternKey = getLearningPatternKey(symbol, interval, side, strategy.id);
  let penalty = 0;
  if (learningPolicy?.blockedAssets?.includes(symbol)) penalty += config.softBlockPenalty || 12;
  if (learningPolicy?.blockedAssetSides?.includes(`${symbol}|${side}`)) penalty += config.softBlockPenalty || 12;
  if (learningPolicy?.blockedPatterns?.includes(patternKey)) penalty += Math.floor((config.softBlockPenalty || 12) * 0.7);
  return penalty;
}

function createLearningPolicyFromTrades(trades) {
  const closed = trades.filter((trade) => !isActiveTrade(trade) && trade.status !== "cancelled");
  const assetStats = buildGroupStatsWeighted(closed, (trade) => trade.asset);
  const assetSideStats = buildGroupStatsWeighted(closed, (trade) => `${trade.asset}|${trade.side}`);
  const patternStats = buildGroupStatsWeighted(closed, (trade) => getLearningPatternKey(trade.asset, trade.timeframe, trade.side, getTradeStrategyId(trade)));
  const strategyStats = buildGroupStats(closed.filter((trade) => trade.autopilot || trade.userLogin === config.userLogin), getTradeStrategyId);
  const minBlock = config.minTradesBeforeBlock || 5;
  const blockedAssets = Object.values(assetStats)
    .filter((item) => item.trades >= minBlock && item.winRate < 35 && item.avgPnl <= -2)
    .map((item) => item.key);
  const hardBlockedAssets = Object.values(assetStats)
    .filter((item) => item.trades >= Math.max(minBlock, 20) && item.winRate < 25 && item.avgPnl <= -3)
    .map((item) => item.key);
  const blockedAssetSides = Object.values(assetSideStats)
    .filter((item) => item.trades >= minBlock && item.winRate < 30 && item.avgPnl <= -2)
    .map((item) => item.key);
  const blockedPatterns = Object.values(patternStats)
    .filter((item) => item.trades >= Math.max(minBlock, 5) && item.winRate < 40 && item.avgPnl <= 0)
    .map((item) => item.key);
  const preferredPatterns = Object.values(patternStats)
    .filter((item) => item.trades >= 4 && item.winRate >= 60 && item.avgPnl > 0)
    .sort((a, b) => b.avgPnl - a.avgPnl)
    .slice(0, 20)
    .map((item) => item.key);
  const sideStats = buildGroupStatsWeighted(closed, (trade) => trade.side);
  const longS = sideStats["LONG"];
  const shortS = sideStats["SHORT"];
  let sideBias = 0;
  if (longS && shortS && longS.trades >= 15 && shortS.trades >= 15) {
    if (longS.winRate < shortS.winRate - 20 && longS.avgPnl < 0) sideBias = -1;
    else if (shortS.winRate < longS.winRate - 20 && shortS.avgPnl < 0) sideBias = 1;
  }
  return normalizeLearningPolicy({
    lastReviewDate: getDateKey(),
    reviewedAt: Date.now(),
    blockedAssets,
    hardBlockedAssets,
    blockedAssetSides,
    blockedPatterns,
    preferredPatterns,
    sideBias,
    notes: [
      `Server-самоанализ: ${closed.length} закрытых сделок.`,
      `Блок монет (soft: ${blockedAssets.length}, hard: ${hardBlockedAssets.length}).`,
      `Блок asset+side: ${blockedAssetSides.length}. Уклон: ${sideBias === -1 ? "SHORT (LONG слаб)" : sideBias === 1 ? "LONG (SHORT слаб)" : "нейтральный"}.`,
      `Блок связок: ${blockedPatterns.length}.`,
      `Приоритет связок: ${preferredPatterns.length}.`,
      formatBestStrategyNote(strategyStats)
    ]
  });
}

function buildGroupStatsWeighted(trades, keyFn) {
  const now = Date.now();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  return trades.reduce((acc, trade) => {
    const key = keyFn(trade);
    if (!key) return acc;
    acc[key] ||= { key, trades: 0, weightedTotal: 0, wins: 0, pnl: 0, avgPnl: 0, winRate: 0 };
    const item = acc[key];
    const age = now - (Number(trade.closedAt) || Number(trade.openedAt) || 0);
    const weight = age > sevenDays ? 0.5 : 1.0;
    item.trades += 1;
    item.weightedTotal += weight;
    item.pnl += (Number(trade.pnl) || 0) * weight;
    if ((Number(trade.pnl) || 0) > 0) item.wins += weight;
    item.avgPnl = item.weightedTotal > 0 ? item.pnl / item.weightedTotal : 0;
    item.winRate = item.weightedTotal > 0 ? (item.wins / item.weightedTotal) * 100 : 0;
    return acc;
  }, {});
}

function buildGroupStats(trades, keyFn) {
  return trades.reduce((acc, trade) => {
    const key = keyFn(trade);
    if (!key) return acc;
    acc[key] ||= { key, trades: 0, wins: 0, losses: 0, pnl: 0, avgPnl: 0, winRate: 0 };
    const item = acc[key];
    item.trades += 1;
    item.pnl += Number(trade.pnl) || 0;
    if ((Number(trade.pnl) || 0) > 0) item.wins += 1;
    else item.losses += 1;
    item.avgPnl = item.pnl / item.trades;
    item.winRate = (item.wins / item.trades) * 100;
    return acc;
  }, {});
}

function normalizeLearningPolicy(policy) {
  return {
    lastReviewDate: String(policy?.lastReviewDate || ""),
    reviewedAt: Number(policy?.reviewedAt) || 0,
    blockedAssets: Array.isArray(policy?.blockedAssets) ? policy.blockedAssets.map(String) : [],
    hardBlockedAssets: Array.isArray(policy?.hardBlockedAssets) ? policy.hardBlockedAssets.map(String) : [],
    blockedAssetSides: Array.isArray(policy?.blockedAssetSides) ? policy.blockedAssetSides.map(String) : [],
    blockedPatterns: Array.isArray(policy?.blockedPatterns) ? policy.blockedPatterns.map(String) : [],
    preferredPatterns: Array.isArray(policy?.preferredPatterns) ? policy.preferredPatterns.map(String) : [],
    sideBias: Number(policy?.sideBias) || 0,
    notes: Array.isArray(policy?.notes) ? policy.notes.map(String) : []
  };
}

function mergeLearningPolicies(...policies) {
  const normalized = policies.filter(Boolean).map(normalizeLearningPolicy);
  if (!normalized.length) return normalizeLearningPolicy(null);
  const mostBiased = normalized.reduce((prev, cur) => Math.abs(cur.sideBias) > Math.abs(prev.sideBias) ? cur : prev, normalized[0]);
  return normalizeLearningPolicy({
    lastReviewDate: normalized.sort((a, b) => (b.reviewedAt || 0) - (a.reviewedAt || 0))[0]?.lastReviewDate || "",
    reviewedAt: Math.max(...normalized.map((policy) => Number(policy.reviewedAt) || 0)),
    blockedAssets: uniqueFlat(normalized.map((policy) => policy.blockedAssets)),
    hardBlockedAssets: uniqueFlat(normalized.map((policy) => policy.hardBlockedAssets)),
    blockedAssetSides: uniqueFlat(normalized.map((policy) => policy.blockedAssetSides)),
    blockedPatterns: uniqueFlat(normalized.map((policy) => policy.blockedPatterns)),
    preferredPatterns: uniqueFlat(normalized.map((policy) => policy.preferredPatterns)),
    sideBias: mostBiased.sideBias,
    notes: uniqueFlat(normalized.map((policy) => policy.notes)).slice(-12)
  });
}

function uniqueFlat(groups) {
  return [...new Set(groups.flat().filter(Boolean).map(String).filter((item) => item !== "connectivity test"))];
}

function summarizeLearningPolicy(policy) {
  return {
    reviewedAt: policy?.reviewedAt || 0,
    blockedAssets: policy?.blockedAssets?.length || 0,
    hardBlockedAssets: policy?.hardBlockedAssets?.length || 0,
    blockedAssetSides: policy?.blockedAssetSides || [],
    blockedPatterns: policy?.blockedPatterns?.length || 0,
    preferredPatterns: policy?.preferredPatterns?.length || 0,
    sideBias: policy?.sideBias || 0
  };
}

function summarizeStrategyStats(trades) {
  const closed = trades.filter((trade) => !isActiveTrade(trade) && trade.status !== "cancelled" && (trade.autopilot || trade.userLogin === config.userLogin));
  const stats = buildGroupStats(closed, getTradeStrategyId);
  return enabledStrategies.map((strategy) => {
    const item = stats[strategy.id] || { trades: 0, wins: 0, pnl: 0, avgPnl: 0, winRate: 0 };
    return {
      id: strategy.id,
      label: strategy.label,
      minScore: getStrategyMinScore(strategy),
      closedTrades: item.trades,
      winRate: Math.round(item.winRate || 0),
      avgPnl: Number(item.avgPnl || 0).toFixed(2),
      pnl: Number(item.pnl || 0).toFixed(2)
    };
  });
}

function formatBestStrategyNote(strategyStats) {
  const ranked = Object.values(strategyStats)
    .filter((item) => item.trades >= 5)
    .sort((a, b) => (b.winRate - a.winRate) || (b.avgPnl - a.avgPnl));
  if (!ranked.length) return "Стратегии сервера еще тестируются параллельно: нужно минимум 5 закрытых сделок на стратегию.";
  const best = ranked[0];
  const label = serverStrategies[best.key]?.label || best.key;
  return `Лучшая серверная стратегия сейчас: ${label}, ${best.trades} сделок, winrate ${best.winRate.toFixed(0)}%, avg ${best.avgPnl.toFixed(2)} USDT.`;
}

function getLearningPatternKey(symbol, interval, side, strategyId = "legacy") {
  return `${symbol || "unknown"}|${interval || "unknown"}|${side || "unknown"}|${strategyId || "legacy"}`;
}

function getDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((item) => item.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function detectCrash(candles) {
  const last = candles[candles.length - 1];
  const c12 = candles[Math.max(0, candles.length - 12)] || candles[0];
  const c48 = candles[Math.max(0, candles.length - 48)] || candles[0];
  const drop12 = c12.close > 0 ? ((last.close - c12.close) / c12.close) * 100 : 0;
  const drop48 = c48.close > 0 ? ((last.close - c48.close) / c48.close) * 100 : 0;
  return {
    drop12,
    drop48,
    riskOff: drop12 <= -3 || drop48 <= -7,
    severe: drop12 <= -6 || drop48 <= -12,
    summary: `12св ${drop12.toFixed(2)}%, 48св ${drop48.toFixed(2)}%`
  };
}

function hasRecentDuplicate(trades, candidate) {
  const now = Date.now();
  return trades.some((trade) => {
    if (!trade.autopilot || trade.asset !== candidate.symbol || trade.timeframe !== candidate.interval || trade.side !== candidate.side) return false;
    if (getTradeStrategyId(trade) !== candidate.strategyId) return false;
    const openedAt = Number(trade.openedAt) || 0;
    return openedAt > 0 && now - openedAt < config.duplicateCooldownMs;
  });
}

function normalizeTrade(trade) {
  if (!trade || typeof trade !== "object" || !trade.id) return null;
  return {
    history: [],
    remainingQuantity: Number.isFinite(Number(trade.remainingQuantity)) ? Number(trade.remainingQuantity) : Number(trade.quantity) || 0,
    ...trade,
    history: trimTradeHistory(trade.history)
  };
}

function appendPoint(trade, price, pnl, pnlPct, time = Date.now()) {
  trade.history ||= [];
  const last = trade.history[trade.history.length - 1];
  if (last && Math.abs(Number(last.price) - price) <= price * 0.000001 && Math.abs(Number(last.time) - time) < 1000) return;
  trade.history.push({ time, price, pnl, pnlPct });
  trade.history = trimTradeHistory(trade.history);
}

function trimTradeHistory(history, limit = 120) {
  if (!Array.isArray(history)) return [];
  const compact = history
    .map((point) => ({
      time: Number(point.time) || Date.now(),
      price: Number(point.price) || 0,
      pnl: Number(point.pnl) || 0,
      pnlPct: Number(point.pnlPct) || 0
    }))
    .filter((point) => point.price > 0);
  return compact.length > limit ? compact.slice(-limit) : compact;
}

function compactTradeForStorage(trade) {
  return {
    ...trade,
    history: trimTradeHistory(trade.history)
  };
}

function calculateEma(values, period) {
  const result = Array(values.length).fill(NaN);
  if (!values.length) return result;
  const multiplier = 2 / (period + 1);
  let ema = values[0];
  result[0] = ema;
  for (let i = 1; i < values.length; i += 1) {
    ema = values[i] * multiplier + ema * (1 - multiplier);
    result[i] = ema;
  }
  return result;
}

function calculateRsi(values, period) {
  const result = Array(values.length).fill(NaN);
  if (values.length <= period) return result;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function calculateAtr(candles, period) {
  const result = Array(candles.length).fill(NaN);
  for (let i = 1; i < candles.length; i += 1) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    if (i === 1) result[i] = tr;
    else result[i] = (result[i - 1] * (period - 1) + tr) / period;
  }
  return result;
}

function calculateMacd(values, fast = 12, slow = 26, signal = 9) {
  const emaFast = calculateEma(values, fast);
  const emaSlow = calculateEma(values, slow);
  const n = values.length;
  const macdLine = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(emaFast[i]) && Number.isFinite(emaSlow[i])) macdLine[i] = emaFast[i] - emaSlow[i];
  }
  const signalLine = new Array(n).fill(NaN);
  const macdFinite = macdLine.filter(Number.isFinite);
  if (macdFinite.length >= signal) {
    const sigEma = calculateEma(macdFinite, signal);
    let j = 0;
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(macdLine[i])) signalLine[i] = sigEma[j++];
    }
  }
  return { macdLine, signalLine };
}

function calculateAdx(candles, period = 14) {
  const n = candles.length;
  const result = new Array(n).fill(NaN);
  if (n < period * 2 + 1) return result;
  const plusDM = new Array(n).fill(0);
  const minusDM = new Array(n).fill(0);
  const tr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    tr[i] = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - candles[i - 1].close), Math.abs(candles[i].low - candles[i - 1].close));
  }
  let sTR = tr.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let sPDM = plusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let sMDM = minusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  const dx = new Array(n).fill(NaN);
  for (let i = period; i < n; i++) {
    if (i > period) {
      sTR = sTR - sTR / period + tr[i];
      sPDM = sPDM - sPDM / period + plusDM[i];
      sMDM = sMDM - sMDM / period + minusDM[i];
    }
    if (sTR === 0) continue;
    const pdi = (sPDM / sTR) * 100;
    const mdi = (sMDM / sTR) * 100;
    const sum = pdi + mdi;
    dx[i] = sum > 0 ? (Math.abs(pdi - mdi) / sum) * 100 : 0;
  }
  let adxVal = 0;
  let cnt = 0;
  for (let i = period; i < 2 * period && i < n; i++) {
    if (Number.isFinite(dx[i])) { adxVal += dx[i]; cnt++; }
  }
  if (cnt === 0) return result;
  adxVal /= cnt;
  if (2 * period - 1 < n) result[2 * period - 1] = adxVal;
  for (let i = 2 * period; i < n; i++) {
    if (Number.isFinite(dx[i])) {
      adxVal = (adxVal * (period - 1) + dx[i]) / period;
      result[i] = adxVal;
    }
  }
  return result;
}

function calculateSupertrend(candles, period = 10, multiplier = 3) {
  const n = candles.length;
  const atr = calculateAtr(candles, period);
  const dir = new Array(n).fill(1);
  const upper = new Array(n).fill(NaN);
  const lower = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    if (!Number.isFinite(atr[i])) { dir[i] = dir[i - 1]; continue; }
    const hl2 = (candles[i].high + candles[i].low) / 2;
    const bu = hl2 + multiplier * atr[i];
    const bl = hl2 - multiplier * atr[i];
    upper[i] = (!Number.isFinite(upper[i - 1]) || bu < upper[i - 1] || candles[i - 1].close > upper[i - 1]) ? bu : upper[i - 1];
    lower[i] = (!Number.isFinite(lower[i - 1]) || bl > lower[i - 1] || candles[i - 1].close < lower[i - 1]) ? bl : lower[i - 1];
    if (dir[i - 1] === -1 && candles[i].close > upper[i]) dir[i] = 1;
    else if (dir[i - 1] === 1 && candles[i].close < lower[i]) dir[i] = -1;
    else dir[i] = dir[i - 1];
  }
  return dir;
}

function average(values) {
  const finite = values.filter((value) => Number.isFinite(Number(value)));
  return finite.length ? finite.reduce((sum, value) => sum + Number(value), 0) / finite.length : 0;
}

function isActiveTrade(trade) {
  return activeStatuses.has(trade.status);
}

function getTradeUpdatedAt(trade) {
  const historyTime = Array.isArray(trade.history) && trade.history.length ? Number(trade.history[trade.history.length - 1].time) || 0 : 0;
  return Math.max(
    Number(trade.updatedAt) || 0,
    Number(trade.closedAt) || 0,
    Number(trade.target1HitAt) || 0,
    Number(trade.filledAt) || 0,
    Number(trade.lastCheckedAt) || 0,
    historyTime,
    Number(trade.openedAt) || 0
  );
}

function toBybitSymbol(symbol) {
  return String(symbol || "").replace("/", "").toUpperCase();
}

function intervalToMs(interval) {
  return timeframeMs[interval] || timeframeMs["15m"];
}

function toIsoOrNull(timestamp) {
  const value = Number(timestamp);
  return Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null;
}

function formatCandidateForLog(candidate) {
  return {
    strategy: candidate.strategyId,
    strategyLabel: candidate.strategyLabel,
    minScore: getStrategyMinScore(serverStrategies[candidate.strategyId] || serverStrategies.trend),
    symbol: candidate.symbol,
    interval: candidate.interval,
    side: candidate.side,
    score: candidate.score,
    scalping: candidate.scalping,
    expectedNetPct: candidate.expected?.weightedNetPct,
    reason: candidate.reason
  };
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BYBIT_HEADERS = {
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Referer": "https://www.bybit.com/",
  "Origin": "https://www.bybit.com"
};

async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const isBybit = url.includes("bybit.com");
  const headers = isBybit ? { ...BYBIT_HEADERS, ...(options.headers || {}) } : (options.headers || {});
  try {
    return await fetch(url, { ...options, headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function formatRemoteError(status, text) {
  const message = String(text || "");
  if (status === 522 || message.includes("Error code 522") || message.includes("Connection timed out")) {
    return `${status} Supabase/Cloudflare timeout`;
  }
  if (message.length > 220) return `${status} ${message.slice(0, 217)}...`;
  return `${status} ${message || "Remote request failed"}`;
}

async function runBacktest() {
  log("=== BACKTEST MODE (6 months) ===");
  const results = [];
  // Live trading only ever enters the single highest-scoring candidate per cycle
  // (selectEntryCandidates), while this backtest counts every bar that merely clears
  // minScore. Bucketing by score lets us check whether picking the best-of-best (as
  // live does) is what produces edge, rather than minScore alone.
  const signalsByStrategy = {};
  const backtestAssets = config.assets;
  const minScore = config.minScore;
  const feeRoundTrip = (config.feePct + config.slippagePct) * 2;

  // Target candle count per interval for ~6 months of history
  // 5m: scalp patterns don't gain from 6-month history → keep 1000 (~3.5 days)
  const depthByInterval = { "5m": 1000, "15m": 5760, "1h": 4320, "4h": 1100, "1d": 200 };

  // Collect unique (symbol, interval) pairs across all strategies
  const uniquePairs = new Set();
  for (const strategy of enabledStrategies) {
    for (const symbol of backtestAssets) {
      for (const interval of strategy.timeframes) {
        uniquePairs.add(`${symbol}|${interval}`);
      }
    }
  }

  // Pre-fetch all candles once per pair (shared across strategies)
  log(`backtest: fetching ${uniquePairs.size} symbol/interval pairs`);
  const candleCache = new Map();
  for (const key of uniquePairs) {
    const [symbol, interval] = key.split("|");
    const target = depthByInterval[interval] || 1000;
    try {
      const candles = target <= 1000
        ? (await fetchCandlesBybit(symbol, interval, target).catch(() => null)
           || await fetchCandlesOkx(symbol, interval, Math.min(target, 300)).catch(() => null))
        : await fetchCandlesDeep(symbol, interval, target);
      if (candles && candles.length >= 150) candleCache.set(key, candles);
    } catch {}
    await wait(150);
  }
  log(`backtest: loaded ${candleCache.size}/${uniquePairs.size} pairs`);

  // Run all strategies against cached candles (no extra API calls)
  for (const strategy of enabledStrategies) {
    for (const symbol of backtestAssets) {
      for (const interval of strategy.timeframes) {
        const candles = candleCache.get(`${symbol}|${interval}`);
        if (!candles || candles.length < 150) continue;

        const signals = [];
        const warmup = 100;

        for (let i = warmup; i < candles.length - 20; i++) {
          const window = candles.slice(0, i + 1);
          let candidate;
          try {
            candidate = evaluateCandidate(symbol, interval, window, strategy, [], {});
          } catch {
            continue;
          }
          if (!candidate || candidate.score < minScore) continue;

          // Simulate trade forward up to 20 candles
          const { entry, stop, target1, target2, side } = candidate.scenario;
          let outcome = "timeout";
          let exitPrice = candles[Math.min(i + 19, candles.length - 1)].close;

          for (let j = i + 1; j < Math.min(i + 21, candles.length); j++) {
            const c = candles[j];
            if (side === "LONG") {
              if (c.low <= stop)    { outcome = "stop";    exitPrice = stop;    break; }
              if (c.high >= target2) { outcome = "target2"; exitPrice = target2; break; }
              if (c.high >= target1) { outcome = "target1"; exitPrice = target1; break; }
            } else {
              if (c.high >= stop)   { outcome = "stop";    exitPrice = stop;    break; }
              if (c.low <= target2)  { outcome = "target2"; exitPrice = target2; break; }
              if (c.low <= target1)  { outcome = "target1"; exitPrice = target1; break; }
            }
          }

          const direction = side === "LONG" ? 1 : -1;
          const pnlPct = entry > 0 ? ((exitPrice - entry) / entry) * direction * 100 - feeRoundTrip : 0;
          signals.push({ outcome, pnlPct, score: candidate.score });
          (signalsByStrategy[strategy.id] ||= []).push({ score: candidate.score, pnlPct });
        }

        if (signals.length >= 3) {
          const wins = signals.filter((s) => s.pnlPct > 0);
          const totalPnl = signals.reduce((a, s) => a + s.pnlPct, 0);
          results.push({
            strategy: strategy.id,
            symbol,
            interval,
            signals: signals.length,
            winRate: Math.round(wins.length / signals.length * 100),
            avgPnlPct: Number((totalPnl / signals.length).toFixed(3)),
            totalPnlPct: Number(totalPnl.toFixed(2))
          });
        }
      }
    }
  }

  results.sort((a, b) => b.avgPnlPct - a.avgPnlPct);

  // Group by strategy
  const byStrategy = {};
  for (const r of results) {
    if (!byStrategy[r.strategy]) byStrategy[r.strategy] = [];
    byStrategy[r.strategy].push(r);
  }

  for (const [stratId, rows] of Object.entries(byStrategy)) {
    const totalSignals = rows.reduce((a, r) => a + r.signals, 0);
    const avgWr = rows.reduce((a, r) => a + r.winRate, 0) / rows.length;
    const avgPnl = rows.reduce((a, r) => a + r.avgPnlPct, 0) / rows.length;
    log(`[${stratId}] ${rows.length} pairs, ${totalSignals} signals, WR ${avgWr.toFixed(0)}%, avgPnl ${avgPnl.toFixed(3)}%/trade`);
    rows.slice(0, 5).forEach((r) => log(`  ${r.symbol} ${r.interval}: ${r.signals}× WR${r.winRate}% avg${r.avgPnlPct}%`));
  }

  // Does picking only the highest-scoring signals (as live's selectEntryCandidates
  // does) actually produce better edge than the minScore floor alone?
  const scoreBands = [
    { label: "<60", test: (s) => s < 60 },
    { label: "60-69", test: (s) => s >= 60 && s < 70 },
    { label: "70-79", test: (s) => s >= 70 && s < 80 },
    { label: "80-89", test: (s) => s >= 80 && s < 90 },
    { label: "90+", test: (s) => s >= 90 }
  ];
  for (const [stratId, signals] of Object.entries(signalsByStrategy)) {
    log(`[${stratId}] score bands:`);
    for (const band of scoreBands) {
      const inBand = signals.filter((s) => band.test(s.score));
      if (!inBand.length) continue;
      const wins = inBand.filter((s) => s.pnlPct > 0);
      const avgPnl = inBand.reduce((a, s) => a + s.pnlPct, 0) / inBand.length;
      log(`  score ${band.label}: ${inBand.length}× WR${Math.round(wins.length / inBand.length * 100)}% avg${avgPnl.toFixed(3)}%`);
    }
  }

  log(JSON.stringify({ backtestResults: results, summary: Object.fromEntries(Object.entries(byStrategy).map(([k, rows]) => [k, {
    pairs: rows.length,
    signals: rows.reduce((a, r) => a + r.signals, 0),
    avgWinRate: Math.round(rows.reduce((a, r) => a + r.winRate, 0) / rows.length),
    avgPnlPct: Number((rows.reduce((a, r) => a + r.avgPnlPct, 0) / rows.length).toFixed(3))
  }])) }, null, 2));

  // Сохраняем выводы в Supabase — боты подберут при следующем запуске
  const policy = backtestResultsToPolicy(results);
  log(`backtest policy: ${policy.preferredPatterns.length} preferred, ${policy.blockedPatterns.length} blocked`);
  try {
    await saveBacktestPolicy(policy);
    log("backtest policy saved to Supabase ✓");
  } catch (err) {
    log(`backtest policy save failed: ${err.message}`);
  }
}

const runMode = process.argv.includes("--backtest") ? "backtest" : "live";

if (runMode === "backtest") {
  runBacktest().catch((error) => { console.error(error); process.exitCode = 1; });
} else {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
