#!/usr/bin/env node

const supabaseUrl = "https://dcpenxsthdhvhhqgvgjq.supabase.co";
const supabaseKey = "sb_publishable_BYYOhjwhgjZBP27Yw7YkVg_CEhF6ugc";
const tableName = "crypto_strategy_trades";
const settingsTableName = "crypto_strategy_settings";
const learningPolicyKey = "botalin_learning_policy_v1";
const backtestPolicyKey = "botalin_backtest_policy_v1";
const requestedProfile = getArgValue("--profile") || process.env.BOTALIN_SERVER_PROFILE || "balanced";
const requestedStrategy = getArgValue("--strategy") || process.env.BOTALIN_STRATEGY || "all";
const requestedUserLogin = getArgValue("--user-login") || process.env.BOTALIN_USER_LOGIN || "server";

const serverProfiles = {
  protective: {
    label: "Осторожный",
    minScore: 82,
    maxTradePct: 3,
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
    maxTradePct: 3,
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
    maxTradePct: 2,
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
  // All money is virtual — goal is diverse (asset × strategy × side) coverage fast.
  training: {
    label: "Обучение",
    minScore: 60,
    maxTradePct: 2,
    maxPortfolioPct: 70,
    maxEntriesPerRun: 15,
    duplicateCooldownMs: 8 * 60 * 1000,
    minVolumeRatio: 0.4,
    minScalpingVolumeRatio: 0.7,
    minExpectedNetPct: 0.06,
    minScalpingExpectedNetPct: 0.04,
    blockedAssetMode: "hard-only",
    strategyMaxEntriesPerRun: { trend: 3, pullback: 2, scalping: 3, "rsi-reversal": 2, breakout: 3, "vwap-reversion": 2 }
  }
};

const activeProfileId = serverProfiles[requestedProfile] ? requestedProfile : "balanced";
const activeProfile = serverProfiles[activeProfileId];

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
    maxEntriesPerRun: 1
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
    maxEntriesPerRun: 1
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
    maxEntriesPerRun: 1
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
    maxEntriesPerRun: 1
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
    maxEntriesPerRun: 1
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
    maxEntriesPerRun: 1
  }
};

const enabledStrategies = Object.values(serverStrategies).filter(
  (strategy) => strategy.enabled && (requestedStrategy === "all" || strategy.id === requestedStrategy)
);

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
  maxActivePerAsset: 2,
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

  const [rows, remotePolicy, backtestPolicy] = await Promise.all([
    fetchRemoteRows(),
    fetchSharedLearningPolicy().catch((error) => { log(`shared learning fallback: ${error.message}`); return null; }),
    fetchBacktestPolicy().catch(() => null)
  ]);
  const trades = rows.map((row) => normalizeTrade(row.trade)).filter(Boolean);
  const journalPolicy = createLearningPolicyFromTrades(trades);
  // Порядок приоритета: живые сделки > remote policy > backtest policy > hardcoded bootstrap
  const basePolicy = mergeLearningPolicies(backtestPolicy || BOOTSTRAP_LEARNING_POLICY, remotePolicy);
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

  if (toUpsert.length) await upsertTrades(toUpsert);
  await saveSharedLearningPolicy(nextPolicy).catch((error) => log(`shared learning save skipped: ${error.message}`));
  log(`server-autobot done: profile ${config.profileId}, strategies ${enabledStrategies.map((strategy) => strategy.id).join("/")}, updated ${changedTrades.length}, new ${newTrades.length}, best ${best ? `${best.symbol} ${best.interval} ${best.side} ${best.score}` : "none"}`);
}

async function fetchRemoteRows() {
  const table = encodeURIComponent(tableName);
  const [lightResult, activeResult, serverFullResult] = await Promise.allSettled([
    remoteFetch(`/${table}?select=id,user_login,asset,timeframe,side,status,pnl,opened_at,closed_at,updated_at&order=updated_at.desc&limit=1200`),
    remoteFetch(`/${table}?select=*&status=in.(pending,open,partial)&order=updated_at.desc&limit=300`),
    remoteFetch(`/${table}?select=*&user_login=eq.${encodeURIComponent(config.userLogin)}&order=updated_at.desc&limit=300`)
  ]);
  const lightRows = lightResult.status === "fulfilled" ? lightResult.value : [];
  const activeRows = activeResult.status === "fulfilled" ? activeResult.value : [];
  const serverFullRows = serverFullResult.status === "fulfilled" ? serverFullResult.value : [];
  if (!lightRows.length && !activeRows.length && !serverFullRows.length) {
    throw new Error(`Supabase journal unavailable: ${lightResult.reason?.message || activeResult.reason?.message || serverFullResult.reason?.message || "no rows"}`);
  }
  if (lightResult.status === "rejected") log(`light journal fallback: ${lightResult.reason?.message}`);
  if (activeResult.status === "rejected") log(`active journal fallback: ${activeResult.reason?.message}`);
  if (serverFullResult.status === "rejected") log(`server strategy journal fallback: ${serverFullResult.reason?.message}`);
  const byId = new Map();
  (Array.isArray(lightRows) ? lightRows : []).forEach((row) => {
    byId.set(row.id, { ...row, trade: normalizeTradeRow(row) });
  });
  (Array.isArray(activeRows) ? activeRows : []).forEach((row) => {
    byId.set(row.id, row);
  });
  (Array.isArray(serverFullRows) ? serverFullRows : []).forEach((row) => {
    byId.set(row.id, row);
  });
  return [...byId.values()];
}

function normalizeTradeRow(row) {
  return {
    ...(row.trade && typeof row.trade === "object" ? row.trade : {}),
    id: row.id,
    userLogin: row.user_login || "legacy",
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
  const rows = trades.map(compactTradeForStorage).map((trade) => ({
    id: trade.id,
    client_id: "server-autobot",
    session_id: trade.sessionId,
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
  if (!rows.length) return;
  await remoteFetch(`/${encodeURIComponent(tableName)}?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows)
  });
}

async function fetchSharedLearningPolicy() {
  const rows = await remoteFetch(`/${encodeURIComponent(settingsTableName)}?select=value&key=eq.${encodeURIComponent(learningPolicyKey)}&limit=1`);
  const policy = Array.isArray(rows) ? rows[0]?.value : null;
  return normalizeLearningPolicy(policy);
}

async function saveSharedLearningPolicy(policy) {
  await remoteFetch(`/${encodeURIComponent(settingsTableName)}?on_conflict=key`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      key: learningPolicyKey,
      value: normalizeLearningPolicy(policy),
      updated_at: new Date().toISOString()
    }])
  });
}

async function fetchBacktestPolicy() {
  const rows = await remoteFetch(`/${encodeURIComponent(settingsTableName)}?select=value&key=eq.${encodeURIComponent(backtestPolicyKey)}&limit=1`);
  const policy = Array.isArray(rows) ? rows[0]?.value : null;
  return policy ? normalizeLearningPolicy(policy) : null;
}

async function saveBacktestPolicy(policy) {
  await remoteFetch(`/${encodeURIComponent(settingsTableName)}?on_conflict=key`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{
      key: backtestPolicyKey,
      value: normalizeLearningPolicy(policy),
      updated_at: new Date().toISOString()
    }])
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

async function remoteFetch(path, options = {}, attempt = 1) {
  try {
    const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1${path}`, {
      ...options,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }, 10_000);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(formatRemoteError(response.status, text || response.statusText));
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch (error) {
    if (attempt >= 3) throw error;
    await wait(800 * attempt);
    return remoteFetch(path, options, attempt + 1);
  }
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

  const btcTrend = await getBtcTrend();
  const strategiesByInterval = groupStrategiesByInterval(enabledStrategies);
  const scanTasks = [];
  for (const symbol of config.assets) {
    if ((activeAssetCounts.get(symbol) || 0) >= config.maxActivePerAsset) continue;
    for (const [interval, strategies] of strategiesByInterval.entries()) {
      scanTasks.push({ symbol, interval, strategies });
    }
  }

  const groups = await mapLimit(scanTasks, 12, async ({ symbol, interval, strategies }) => {
    const needsStandardHistory = strategies.some((strategy) => strategy.kind !== "scalping");
    const candles = await fetchCandles(symbol, interval, needsStandardHistory ? 220 : 160).catch(() => []);
    if (candles.length < (needsStandardHistory ? 90 : 60)) return [];
    return strategies
      .filter((strategy) => candles.length >= (strategy.kind === "scalping" ? 60 : 90))
      .map((strategy) => evaluateCandidate(symbol, interval, candles, strategy, trades, learningPolicy, btcTrend))
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

function evaluateCandidate(symbol, interval, candles, strategy, trades, learningPolicy, btcTrend = "NEUTRAL") {
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
  if (strategy.kind === "rsi-reversal") {
    if (rsi < 28) side = "LONG";
    else if (rsi > 72) side = "SHORT";
    else return null;
  } else if (strategy.kind === "breakout") {
    side = getBreakoutSide(candles);
    if (!side) return null;
  } else if (strategy.kind === "vwap-reversion") {
    side = getVwapReversionSide(candles, atr);
    if (!side) return null;
  } else {
    if (trend === "NEUTRAL") return null;
    side = trend;
  }

  if (crash.riskOff && side === "LONG") return null;
  if (volumeRatio < (scalping ? config.minScalpingVolumeRatio : config.minVolumeRatio)) return null;

  const history = getPatternStats(trades, symbol, interval, side, strategy.id);
  const patternKey = getLearningPatternKey(symbol, interval, side, strategy.id);
  if (isAssetBlockedByPolicy(symbol, learningPolicy) || learningPolicy?.blockedPatterns?.includes(patternKey)) return null;
  if (learningPolicy?.blockedAssetSides?.includes(`${symbol}|${side}`)) return null;
  let score = 45;
  score += side === "LONG" ? Math.max(-10, Math.min(14, slopePct * 8)) : Math.max(-10, Math.min(14, -slopePct * 8));
  if (side === "LONG" && rsi >= 48 && rsi <= 66) score += 15;
  if (side === "SHORT" && rsi >= 34 && rsi <= 52) score += 15;
  if (volumeRatio >= 1.15) score += 12;
  if (volumeRatio >= 1.6) score += 5;
  if (atrPct >= 0.25 && atrPct <= 1.8) score += 10;
  if (Math.abs(impulsePct) > 3.2) score -= 12;
  if (interval === "5m" || interval === "15m") score += 3;
  const higherTfTrend = getHigherTfTrend(candles, interval);
  if (higherTfTrend !== "NEUTRAL" && higherTfTrend !== side) score -= 15;
  else if (higherTfTrend === side) score += 8;
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
    const bo = evaluateBreakoutSignal(candles, side, volumeRatio, adx, atrPct);
    if (!bo.ok) return null;
    score += bo.scoreBoost;
  }
  if (strategy.kind === "vwap-reversion") {
    const vr = evaluateVwapReversion(candles, atr, side, rsi, volumeRatio);
    if (!vr.ok) return null;
    score += vr.scoreBoost;
  }
  if (history.trades >= 3) score += history.winRate >= 60 && history.avgPnlPct > 0 ? 10 : -25;

  const riskDistance = last.close * Math.max(scalping ? 0.0015 : 0.0035, Math.min(scalping ? 0.005 : 0.025, atrPct / 100 * (scalping ? 0.58 : 0.75)));
  const isReversal = strategy.kind === "rsi-reversal" || strategy.kind === "vwap-reversion";
  const rr1 = scalping ? 0.55 : strategy.kind === "pullback" ? 1.35 : isReversal ? 1.2 : 1.6;
  const rr2 = scalping ? 0.9 : strategy.kind === "pullback" ? 2 : isReversal ? 1.8 : 2.2;
  const entry = getStrategyEntryPrice(last.close, side, strategy.kind);
  const scenario = side === "LONG"
    ? {
        side,
        entry,
        stop: entry - riskDistance,
        target1: entry + riskDistance * rr1,
        target2: entry + riskDistance * rr2
      }
    : {
        side,
        entry,
        stop: entry + riskDistance,
        target1: entry - riskDistance * rr1,
        target2: entry - riskDistance * rr2
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
    price: last.close,
    rsi,
    atrPct,
    volumeRatio,
    slopePct,
    history,
    crash,
    scenario,
    expected,
    patternKey,
    reason: `${strategy.label}: EMA ${side}, RSI ${rsi.toFixed(1)}, MACD ${Number.isFinite(macd) && Number.isFinite(macdSig) ? (macd > macdSig ? "↑" : "↓") : "?"}, ADX ${Number.isFinite(adx) ? adx.toFixed(0) : "?"}, ST ${stDir === 1 ? "↑" : "↓"}, vol x${volumeRatio.toFixed(2)}, ATR ${atrPct.toFixed(2)}%, цель ${expected.weightedNetPct.toFixed(2)}%, BTC ${btcTrend}`
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
  if (last.close > highN * 1.002) return "LONG";
  if (last.close < lowN * 0.998) return "SHORT";
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

function evaluateBreakoutSignal(candles, side, volumeRatio, adx, atrPct) {
  if (volumeRatio < 1.3) return { ok: false, scoreBoost: 0 };
  let scoreBoost = 10;
  if (volumeRatio >= 1.6) scoreBoost += 8;
  if (volumeRatio >= 2.0) scoreBoost += 5;
  if (Number.isFinite(adx) && adx >= 22) scoreBoost += 8;
  if (atrPct >= 0.3) scoreBoost += 4;
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
  const maxBySingle = config.depositUsdt * (config.maxTradePct / 100);
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
    riskLimitPct: config.maxTradePct,
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
      risk: config.maxTradePct,
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
        expectedNetPct: candidate.expected?.weightedNetPct || 0
      },
      marketCrash: candidate.crash,
      learning: candidate.history,
      notes: [candidate.reason]
    },
    selectedScenario: {
      side: candidate.side,
      entry: candidate.scenario.entry,
      stop: candidate.scenario.stop,
      target1: candidate.scenario.target1,
      target2: candidate.scenario.target2
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
      `Серверная стратегия: ${candidate.strategyLabel}`,
      "Чистая ожидаемая прибыль после комиссии и проскальзывания должна быть положительной",
      "LONG блокируется при risk-off/crash режиме",
      "Размер позиции ограничен бюджетом сервера"
    ],
    outcome: null
  };
}

async function fetchLivePrice(symbol) {
  // Try OKX first (accessible from GitHub Actions)
  try {
    const params = new URLSearchParams({ instId: toOkxSymbol(symbol) });
    const response = await fetchWithTimeout(`https://www.okx.com/api/v5/market/ticker?${params.toString()}`, {}, 4_000);
    if (!response.ok) throw new Error(`OKX ticker ${response.status}`);
    const data = await response.json();
    const price = Number(data.data?.[0]?.last);
    if (!price || !Number.isFinite(price)) throw new Error("no price");
    return price;
  } catch {
    // Fallback to Bybit
    const params = new URLSearchParams({ category: "spot", symbol: toBybitSymbol(symbol) });
    const response = await fetchWithTimeout(`https://api.bybit.com/v5/market/tickers?${params.toString()}`, {}, 4_000);
    if (!response.ok) throw new Error(`ticker ${response.status}`);
    const data = await response.json();
    if (data.retCode !== 0) throw new Error(data.retMsg || "ticker failed");
    const price = Number(data.result?.list?.[0]?.lastPrice);
    if (!price || !Number.isFinite(price)) throw new Error("no price");
    return price;
  }
}

const okxIntervals = { "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m", "1h": "1H", "4h": "4H", "1d": "1D" };

function toOkxSymbol(symbol) {
  return symbol.replace("/", "-");
}

function toBinanceSymbol(symbol) {
  return symbol.replace("/", "");
}

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

async function fetchCandlesBybit(symbol, interval, limit = 220, start = null) {
  const params = new URLSearchParams({
    category: "spot",
    symbol: toBybitSymbol(symbol),
    interval: bybitIntervals[interval] || "15",
    limit: String(limit)
  });
  if (start) params.set("start", String(start));
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

async function fetchCandles(symbol, interval, limit = 220, start = null) {
  try {
    return await fetchCandlesOkx(symbol, interval, limit, start);
  } catch (err) {
    log(`OKX candles failed (${err.message}), trying Bybit`);
    return await fetchCandlesBybit(symbol, interval, limit, start);
  }
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
  if (candidate.strategyKind === "pullback") return candidate.side === "LONG" ? "below" : "above";
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
  const today = trades.filter((trade) => !isActiveTrade(trade) && (Number(trade.closedAt) || Number(trade.openedAt) || 0) >= since);
  const pnl = today.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0);
  const lossPct = pnl < 0 ? Math.abs(pnl) / Math.max(1, config.depositUsdt) * 100 : 0;
  const stops = today.filter((trade) => trade.status === "stop" || Number(trade.pnl) < 0).length;
  return { pnl, lossPct, stops, blocked: lossPct >= 3 || stops >= 3 };
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
  if (!learningPolicy?.blockedAssets?.includes(symbol)) return false;
  return config.blockedAssetMode === "strict" || learningPolicy.hardBlockedAssets?.includes(symbol);
}

function createLearningPolicyFromTrades(trades) {
  const closed = trades.filter((trade) => !isActiveTrade(trade) && trade.status !== "cancelled");
  const assetStats = buildGroupStatsWeighted(closed, (trade) => trade.asset);
  const assetSideStats = buildGroupStatsWeighted(closed, (trade) => `${trade.asset}|${trade.side}`);
  const patternStats = buildGroupStatsWeighted(closed, (trade) => getLearningPatternKey(trade.asset, trade.timeframe, trade.side, getTradeStrategyId(trade)));
  const strategyStats = buildGroupStats(closed.filter((trade) => trade.autopilot || trade.userLogin === config.userLogin), getTradeStrategyId);
  const blockedAssets = Object.values(assetStats)
    .filter((item) => item.trades >= 5 && item.winRate < 35 && item.avgPnl <= -2)
    .map((item) => item.key);
  const hardBlockedAssets = Object.values(assetStats)
    .filter((item) => item.trades >= 8 && item.winRate < 25 && item.avgPnl <= -3)
    .map((item) => item.key);
  const blockedAssetSides = Object.values(assetSideStats)
    .filter((item) => item.trades >= 6 && item.winRate < 30 && item.avgPnl <= -2)
    .map((item) => item.key);
  const blockedPatterns = Object.values(patternStats)
    .filter((item) => item.trades >= 5 && item.winRate < 40 && item.avgPnl <= 0)
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
  log("=== BACKTEST MODE ===");
  const results = [];
  const backtestAssets = config.assets.slice(0, 20);
  const minScore = config.minScore;
  const feeRoundTrip = (config.feePct + config.slippagePct) * 2;

  for (const strategy of enabledStrategies) {
    for (const symbol of backtestAssets) {
      for (const interval of strategy.timeframes) {
        let candles;
        try {
          candles = await fetchCandles(symbol, interval, 300);
          await new Promise((r) => setTimeout(r, 80));
        } catch {
          continue;
        }
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
    if (String(error?.message || "").startsWith("Supabase journal unavailable")) {
      log(`${error.message}. Cycle skipped without opening trades.`);
      process.exitCode = 0;
      return;
    }
    console.error(error);
    process.exitCode = 1;
  });
}
