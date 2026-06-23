#!/usr/bin/env node

const supabaseUrl = (process.env.SUPABASE_URL || "https://db.kamtok.ru:8443").replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoid2ViX2Fub24ifQ.zBalbJrifZlJxT09-x8-i3rdNDTyo3jgOm4t2uQw1Ek";
const tableName = "crypto_strategy_trades";
const activeStatuses = new Set(["pending", "open", "partial"]);

async function main() {
  const rows = await fetchRows();
  const trades = rows.map((row) => normalizeTrade(row)).filter(Boolean);
  const closed = trades.filter((trade) => !activeStatuses.has(trade.status) && trade.status !== "cancelled" && trade.status !== "test");
  const report = {
    checkedAt: new Date().toISOString(),
    total: trades.length,
    active: trades.filter((trade) => activeStatuses.has(trade.status)).length,
    cancelled: trades.filter((trade) => trade.status === "cancelled").length,
    closed: summarize(closed),
    byUser: topGroups(closed, (trade) => trade.userLogin, 12),
    byAsset: topGroups(closed, (trade) => trade.asset, 15),
    byTimeframe: topGroups(closed, (trade) => trade.timeframe, 10),
    bySide: topGroups(closed, (trade) => trade.side, 5),
    byStrategy: topGroups(closed, (trade) => getStrategyKey(trade), 15),
    weakPatterns: topGroups(closed, (trade) => `${trade.asset}|${trade.timeframe}|${trade.side}|${getStrategyKey(trade)}`, 20)
      .filter((item) => item.trades >= 3 && (item.winRate < 50 || item.pnl < 0)),
    strongPatterns: topGroups(closed, (trade) => `${trade.asset}|${trade.timeframe}|${trade.side}|${getStrategyKey(trade)}`, 20)
      .filter((item) => item.trades >= 3 && item.winRate >= 60 && item.pnl > 0)
  };

  printReport(report);
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
}

async function fetchRows() {
  const table = encodeURIComponent(tableName);
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id,user_login,asset,timeframe,side,status,pnl,opened_at,closed_at,updated_at,trade&order=updated_at.desc&limit=1200`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text().catch(() => response.statusText)}`);
  return response.json();
}

function normalizeTrade(row) {
  const trade = row.trade && typeof row.trade === "object" ? row.trade : {};
  return {
    id: row.id || trade.id,
    userLogin: row.user_login || trade.userLogin || trade.authUser || trade.strategySnapshot?.execution?.userLogin || "legacy",
    asset: row.asset || trade.asset || "unknown",
    timeframe: row.timeframe || trade.timeframe || "unknown",
    side: row.side || trade.side || "unknown",
    status: row.status || trade.status || "unknown",
    pnl: Number(row.pnl ?? trade.pnl) || 0,
    pnlPct: Number(trade.pnlPct) || 0,
    strategyMode: trade.strategyMode || trade.strategySnapshot?.context?.strategyMode || "standard",
    signalTemplate: trade.signalTemplate || trade.strategySnapshot?.execution?.signalTemplate || "",
    botPreset: trade.botPreset || trade.strategySnapshot?.execution?.botPreset || "",
    serverStrategyLabel: trade.serverStrategyLabel || trade.strategySnapshot?.execution?.serverStrategyLabel || ""
  };
}

function getStrategyKey(trade) {
  if (trade.userLogin === "server") return trade.serverStrategyLabel || trade.strategyMode || "server";
  return trade.botPreset || trade.signalTemplate || trade.strategyMode || "manual";
}

function summarize(trades) {
  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl <= 0);
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  const pnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? Math.round((wins.length / trades.length) * 100) : 0,
    pnl: round(pnl),
    avgPnl: trades.length ? round(pnl / trades.length) : 0,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : grossProfit > 0 ? 99 : 0
  };
}

function topGroups(trades, keyFn, limit) {
  const groups = new Map();
  trades.forEach((trade) => {
    const key = keyFn(trade) || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trade);
  });
  return [...groups.entries()]
    .map(([key, items]) => ({ key, ...summarize(items) }))
    .sort((a, b) => b.trades - a.trades || a.pnl - b.pnl)
    .slice(0, limit);
}

function printReport(report) {
  console.log(`Botalin journal analysis: ${report.closed.trades} closed trades, winrate ${report.closed.winRate}%, PnL ${formatSigned(report.closed.pnl)} USDT, PF ${report.closed.profitFactor}`);
  printSection("By user", report.byUser);
  printSection("Weak patterns", report.weakPatterns.slice(0, 10));
  printSection("Strong patterns", report.strongPatterns.slice(0, 10));
}

function printSection(title, rows) {
  console.log(`\n${title}`);
  if (!rows.length) {
    console.log("  no data");
    return;
  }
  rows.forEach((row) => {
    console.log(`  ${row.key}: ${row.trades} trades, ${row.winRate}% win, ${formatSigned(row.pnl)} USDT, PF ${row.profitFactor}`);
  });
}

function round(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function formatSigned(value) {
  return `${value >= 0 ? "+" : ""}${round(value).toFixed(2)}`;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
