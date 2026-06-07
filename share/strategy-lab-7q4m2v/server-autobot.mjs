#!/usr/bin/env node

const supabaseUrl = "https://dcpenxsthdhvhhqgvgjq.supabase.co";
const supabaseKey = "sb_publishable_BYYOhjwhgjZBP27Yw7YkVg_CEhF6ugc";
const tableName = "crypto_strategy_trades";

const config = {
  enabled: true,
  dryRun: process.argv.includes("--dry-run"),
  once: process.argv.includes("--once") || process.argv.includes("--dry-run"),
  userLogin: "server",
  depositUsdt: 10000,
  maxTradePct: 5,
  maxPortfolioPct: 30,
  minScore: 78,
  minNotionalUsdt: 10,
  maxEntriesPerRun: 1,
  duplicateCooldownMs: 90 * 60 * 1000,
  pendingTtlMs: 30 * 60 * 1000,
  scalpingTtlMs: 6 * 60 * 1000,
  feePct: 0.1,
  slippagePct: 0.03,
  assets: [
    "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT", "TON/USDT",
    "ADA/USDT", "DOGE/USDT", "TRX/USDT", "AVAX/USDT", "LINK/USDT", "DOT/USDT",
    "MATIC/USDT", "LTC/USDT", "BCH/USDT", "UNI/USDT", "AAVE/USDT", "APT/USDT",
    "SUI/USDT", "ARB/USDT", "OP/USDT", "NEAR/USDT", "ATOM/USDT", "INJ/USDT",
    "FIL/USDT", "ETC/USDT", "SEI/USDT", "TIA/USDT", "TWT/USDT"
  ],
  timeframes: ["5m", "15m", "1h", "4h"],
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

  const rows = await fetchRemoteRows();
  const trades = rows.map((row) => normalizeTrade(row.trade)).filter(Boolean);
  const changedTrades = await updateActiveTrades(trades);
  const candidates = await scanCandidates(trades);
  const best = candidates[0] || null;
  const newTrades = [];

  if (best && best.score >= config.minScore) {
    const trade = buildServerTrade(best, trades);
    if (trade) newTrades.push(trade);
  }

  const toUpsert = [...changedTrades, ...newTrades];
  if (config.dryRun) {
    log(JSON.stringify({
      mode: "dry-run",
      activeUpdated: changedTrades.length,
      candidates: candidates.slice(0, 5).map(formatCandidateForLog),
      plannedTrade: newTrades[0] || null
    }, null, 2));
    return;
  }

  if (toUpsert.length) await upsertTrades(toUpsert);
  log(`server-autobot done: updated ${changedTrades.length}, new ${newTrades.length}, best ${best ? `${best.symbol} ${best.interval} ${best.side} ${best.score}` : "none"}`);
}

async function fetchRemoteRows() {
  const path = `/${encodeURIComponent(tableName)}?select=*&order=updated_at.desc&limit=5000`;
  return remoteFetch(path);
}

async function upsertTrades(trades) {
  const rows = trades.map((trade) => ({
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

async function remoteFetch(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status} ${text || response.statusText}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function updateActiveTrades(trades) {
  const changed = [];
  for (const trade of trades.filter(isActiveTrade)) {
    const next = await replayTradeFromCandles(trade).catch((error) => {
      log(`skip update ${trade.id}: ${error.message}`);
      return false;
    });
    if (next) changed.push(trade);
  }
  return changed;
}

async function replayTradeFromCandles(trade) {
  const since = Math.max(Number(trade.lastCheckedAt) || Number(trade.openedAt) || Date.now(), Date.now() - 60 * 24 * 60 * 60 * 1000);
  const interval = trade.timeframe || "15m";
  const intervalLength = intervalToMs(interval);
  const candles = await fetchCandles(trade.asset, interval, 500, Math.max(0, since - intervalLength));
  let changed = false;

  for (const candle of candles) {
    if (!isActiveTrade(trade) || candle.closeTime <= (Number(trade.lastCheckedAt) || 0)) continue;
    if (applyTradeCandle(trade, candle)) changed = true;
    trade.lastCheckedAt = candle.closeTime;
    trade.updatedAt = Date.now();
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

async function scanCandidates(trades) {
  const results = [];
  const activeKeys = new Set(trades.filter(isActiveTrade).map((trade) => `${trade.asset}|${trade.timeframe}|${trade.side}`));
  const activeAssets = new Set(trades.filter(isActiveTrade).map((trade) => trade.asset));
  const dailyRisk = getDailyRisk(trades);
  if (dailyRisk.blocked) return [];

  for (const symbol of config.assets) {
    if (activeAssets.has(symbol)) continue;
    for (const interval of config.timeframes) {
      const candles = await fetchCandles(symbol, interval, 220).catch(() => []);
      if (candles.length < 90) continue;
      const candidate = evaluateCandidate(symbol, interval, candles, false, trades);
      if (candidate && !activeKeys.has(`${symbol}|${interval}|${candidate.side}`)) results.push(candidate);
    }
    for (const interval of config.scalpingTimeframes) {
      const candles = await fetchCandles(symbol, interval, 160).catch(() => []);
      if (candles.length < 60) continue;
      const candidate = evaluateCandidate(symbol, interval, candles, true, trades);
      if (candidate && !activeKeys.has(`${symbol}|${interval}|${candidate.side}`)) results.push(candidate);
    }
  }

  return results
    .filter((candidate) => !hasRecentDuplicate(trades, candidate))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

function evaluateCandidate(symbol, interval, candles, scalping, trades) {
  const closes = candles.map((candle) => candle.close);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const ema34 = calculateEma(closes, 34);
  const ema89 = calculateEma(closes, 89);
  const rsi14 = calculateRsi(closes, 14);
  const atr14 = calculateAtr(candles, 14);
  const i = closes.length - 1;
  const emaFast = ema34[i];
  const emaSlow = ema89[i];
  const rsi = rsi14[i];
  const atr = atr14[i];
  if (![emaFast, emaSlow, rsi, atr].every(Number.isFinite)) return null;

  const trend = emaFast > emaSlow ? "LONG" : emaFast < emaSlow ? "SHORT" : "NEUTRAL";
  const slopePct = emaFast > 0 ? ((emaFast - ema34[Math.max(0, i - 5)]) / emaFast) * 100 : 0;
  const atrPct = atr / last.close * 100;
  const avgVolume = average(candles.slice(-30, -1).map((candle) => candle.volume));
  const volumeRatio = avgVolume > 0 ? last.volume / avgVolume : 1;
  const impulsePct = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
  const history = getPatternStats(trades, symbol, interval, trend);
  const crash = detectCrash(candles);

  if (crash.severe || trend === "NEUTRAL" || atrPct > 4.5 || atrPct < 0.18) return null;
  if (crash.riskOff && trend === "LONG") return null;

  const side = trend;
  let score = 45;
  score += side === "LONG" ? Math.max(-10, Math.min(14, slopePct * 8)) : Math.max(-10, Math.min(14, -slopePct * 8));
  if (side === "LONG" && rsi >= 48 && rsi <= 66) score += 15;
  if (side === "SHORT" && rsi >= 34 && rsi <= 52) score += 15;
  if (volumeRatio >= 1.15) score += 12;
  if (volumeRatio >= 1.6) score += 5;
  if (atrPct >= 0.25 && atrPct <= 1.8) score += 10;
  if (Math.abs(impulsePct) > 3.2) score -= 12;
  if (interval === "5m" || interval === "15m") score += 3;
  if (scalping) {
    const scalp = evaluateScalp(closes, candles, side, rsi, atrPct, volumeRatio);
    if (!scalp.ok) return null;
    score = Math.max(score, scalp.score);
  }
  if (history.trades >= 3) score += history.winRate >= 60 && history.avgPnlPct > 0 ? 10 : -18;

  const riskDistance = last.close * Math.max(scalping ? 0.0015 : 0.0035, Math.min(scalping ? 0.005 : 0.025, atrPct / 100 * (scalping ? 0.58 : 0.75)));
  const rr1 = scalping ? 0.55 : 1.6;
  const rr2 = scalping ? 0.9 : 2.2;
  const entry = side === "LONG" ? last.close * 1.0003 : last.close * 0.9997;
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

  return {
    symbol,
    interval,
    side,
    score: Math.round(Math.max(0, Math.min(100, score))),
    scalping,
    price: last.close,
    rsi,
    atrPct,
    volumeRatio,
    slopePct,
    history,
    crash,
    scenario,
    reason: `${scalping ? "SCALP " : ""}EMA34/89 ${side}, RSI ${rsi.toFixed(1)}, volume x${volumeRatio.toFixed(2)}, ATR ${atrPct.toFixed(2)}%`
  };
}

function evaluateScalp(closes, candles, side, rsi, atrPct, volumeRatio) {
  const ema9 = calculateEma(closes, 9);
  const ema21 = calculateEma(closes, 21);
  const i = closes.length - 1;
  const longOk = side === "LONG" && closes[i] > ema9[i] && ema9[i] > ema21[i] && rsi >= 48 && rsi <= 68;
  const shortOk = side === "SHORT" && closes[i] < ema9[i] && ema9[i] < ema21[i] && rsi >= 32 && rsi <= 52;
  let score = 52;
  if (longOk || shortOk) score += 22;
  if (volumeRatio >= 1.35) score += 12;
  if (atrPct >= 0.18 && atrPct <= 1.4) score += 10;
  const lastRangePct = candles[i].close > 0 ? ((candles[i].high - candles[i].low) / candles[i].close) * 100 : 0;
  if (lastRangePct <= 1.8) score += 4;
  return { ok: (longOk || shortOk) && score >= 72, score: Math.round(score) };
}

function buildServerTrade(candidate, trades) {
  const wallet = getWalletState(trades);
  const maxBySingle = config.depositUsdt * (config.maxTradePct / 100);
  const maxByPortfolio = Math.max(0, config.depositUsdt * (config.maxPortfolioPct / 100) - wallet.reserved);
  const amount = Math.min(maxBySingle, maxByPortfolio, wallet.free);
  if (amount < config.minNotionalUsdt) return null;

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
    mode: candidate.scalping ? "scalping" : "trend",
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
    autopilotProfile: "server",
    strategyMode: candidate.scalping ? "scalping" : "standard",
    signalTemplate: candidate.scalping ? "scalper" : "intraday",
    botPreset: "server",
    autopilotReason: `server-autobot: ${candidate.reason}, score ${candidate.score}/100`,
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
    triggerDirection: candidate.side === "LONG" ? "above" : "below",
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
    strategyText: `Server-autobot выбрал ${candidate.side} ${candidate.symbol} ${candidate.interval}: ${candidate.reason}.`,
    userIdea: "Автономная демо-торговля без открытого браузера",
    context: {
      asset: candidate.symbol,
      timeframe: candidate.interval,
      mode: candidate.scalping ? "scalping" : "trend",
      modeSource: "server-auto",
      strategyMode: candidate.scalping ? "scalping" : "standard",
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
        slopePct: candidate.slopePct
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
      signalTemplate: candidate.scalping ? "scalper" : "intraday",
      botPreset: "server",
      profileChoice: "server",
      profileId: "server",
      profileLabel: "Серверный автобот",
      minScore: config.minScore,
      feePct: config.feePct,
      slippagePct: config.slippagePct,
      amount
    },
    qualityPatternKey: [candidate.symbol, candidate.interval, candidate.side, candidate.scalping ? "scalping" : "trend", "rsi14", "ema34-89"].join("|"),
    rules: [
      "EMA34/89 должна подтверждать направление",
      "RSI должен быть в рабочей зоне выбранной стороны",
      "ATR и объем должны быть в умеренном диапазоне",
      "LONG блокируется при risk-off/crash режиме",
      "Размер позиции ограничен бюджетом сервера"
    ],
    outcome: null
  };
}

async function fetchCandles(symbol, interval, limit = 220, start = null) {
  const params = new URLSearchParams({
    category: "spot",
    symbol: toBybitSymbol(symbol),
    interval: bybitIntervals[interval] || "15",
    limit: String(limit)
  });
  if (start) params.set("start", String(start));
  const response = await fetch(`https://api.bybit.com/v5/market/kline?${params.toString()}`);
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

function getPatternStats(trades, symbol, interval, side) {
  const closed = trades.filter((trade) => {
    if (isActiveTrade(trade) || trade.status === "cancelled") return false;
    return trade.asset === symbol && trade.timeframe === interval && trade.side === side;
  });
  const wins = closed.filter((trade) => Number(trade.pnl) > 0).length;
  const avgPnlPct = closed.length ? average(closed.map((trade) => Number(trade.pnlPct) || 0)) : 0;
  return {
    trades: closed.length,
    winRate: closed.length ? (wins / closed.length) * 100 : 0,
    avgPnlPct
  };
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
    const openedAt = Number(trade.openedAt) || 0;
    return openedAt > 0 && now - openedAt < config.duplicateCooldownMs;
  });
}

function normalizeTrade(trade) {
  if (!trade || typeof trade !== "object" || !trade.id) return null;
  return {
    history: [],
    remainingQuantity: Number.isFinite(Number(trade.remainingQuantity)) ? Number(trade.remainingQuantity) : Number(trade.quantity) || 0,
    ...trade
  };
}

function appendPoint(trade, price, pnl, pnlPct, time = Date.now()) {
  trade.history ||= [];
  const last = trade.history[trade.history.length - 1];
  if (last && Math.abs(Number(last.price) - price) <= price * 0.000001 && Math.abs(Number(last.time) - time) < 1000) return;
  trade.history.push({ time, price, pnl, pnlPct });
  if (trade.history.length > 180) trade.history = trade.history.slice(-180);
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
    symbol: candidate.symbol,
    interval: candidate.interval,
    side: candidate.side,
    score: candidate.score,
    scalping: candidate.scalping,
    reason: candidate.reason
  };
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
