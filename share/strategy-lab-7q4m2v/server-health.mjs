#!/usr/bin/env node

const supabaseUrl = process.env.SUPABASE_URL || "https://dcpenxsthdhvhhqgvgjq.supabase.co";
const supabaseKey = process.env.SUPABASE_KEY || "sb_publishable_BYYOhjwhgjZBP27Yw7YkVg_CEhF6ugc";
const tableName = "crypto_strategy_trades";
const settingsTableName = "crypto_strategy_settings";
const githubRunsUrl = "https://api.github.com/repos/Kammsk87/kam-electro/actions/workflows/botalin-server-autobot.yml/runs?per_page=5";

const now = Date.now();
const report = {
  checkedAt: new Date(now).toISOString(),
  ok: false,
  checks: {}
};

async function main() {
  const [supabase, marketData, github] = await Promise.all([
    checkSupabase(),
    checkMarketData(),
    checkGithubActions()
  ]);

  report.checks = { supabase, marketData, github };
  report.ok = supabase.ok && marketData.ok;
  printReport(report);
  if (!report.ok) process.exitCode = 1;
}

async function checkSupabase() {
  const started = Date.now();
  const result = {
    ok: false,
    slow: false,
    ms: 0,
    status: 0,
    serverTrades: 0,
    activeTrades: 0,
    lastServerTradeAt: null,
    lastServerTradeAgeMinutes: null,
    stale: false,
    error: ""
  };

  try {
    // user_login=eq.server смотрел на старый generic-логин, под которым с появления
    // отдельных логинов на стратегию (server-pullback, server-vwap, ...) никто реально
    // не торгует — отсюда ложное "lastServerTrade=37+ часов назад" при полностью живой
    // торговле. server-* без "=server" ловит все реальные боевые логины разом.
    const [serverRows, activeRows, settingsRows] = await Promise.all([
      supabaseFetch(`/${encodeURIComponent(tableName)}?select=id,asset,timeframe,side,status,updated_at&user_login=like.server-*&order=updated_at.desc&limit=20`),
      supabaseFetch(`/${encodeURIComponent(tableName)}?select=id,asset,timeframe,side,status,updated_at&status=in.(pending,open,partial)&order=updated_at.desc&limit=20`),
      supabaseFetch(`/${encodeURIComponent(settingsTableName)}?select=key,updated_at&limit=1`)
    ]);

    result.serverTrades = Array.isArray(serverRows.body) ? serverRows.body.length : 0;
    result.activeTrades = Array.isArray(activeRows.body) ? activeRows.body.length : 0;
    result.status = Math.max(serverRows.status, activeRows.status, settingsRows.status);
    const last = Array.isArray(serverRows.body) ? serverRows.body[0] : null;
    result.lastServerTradeAt = last?.updated_at || null;
    if (result.lastServerTradeAt) {
      result.lastServerTradeAgeMinutes = Math.round((now - Date.parse(result.lastServerTradeAt)) / 60000);
    }
    // Раньше staleness вообще не влиял на ok — запрос мог успешно вернуть HTTP 200 с
    // древней строкой, и health всё равно бы сказал "OK". Раннер крутит каждую стратегию
    // раз в несколько минут, так что 20+ минут без единого обновления — реальный признак,
    // что раннер встал, а не просто шум таймингов одного цикла.
    result.stale = result.lastServerTradeAgeMinutes !== null && result.lastServerTradeAgeMinutes > 20;
    result.ok = [serverRows, activeRows, settingsRows].every((item) => item.ok) && !result.stale;
  } catch (error) {
    result.error = normalizeError(error);
  } finally {
    result.ms = Date.now() - started;
    result.slow = result.ok && result.ms > 3000;
  }

  return result;
}

async function checkMarketData() {
  // Был прямой запрос к api.bybit.com — гео-блокируется CloudFront с этого VPS (тот же
  // повод, по которому funding/OI/bid-ask в самом боте давно ходят через OKX, не Bybit).
  // Этот health-check годами бил тревогу не по делу, проверяя источник, который бот
  // и не использует. Переключаем на OKX, чтобы проверка отражала реальную зависимость.
  const started = Date.now();
  const result = {
    ok: false,
    ms: 0,
    status: 0,
    rows: 0,
    retCode: null,
    error: ""
  };

  try {
    const response = await fetchWithTimeout("https://www.okx.com/api/v5/market/candles?instId=BTC-USDT-SWAP&bar=15m&limit=5", {}, 8000);
    result.status = response.status;
    const body = await response.json();
    result.retCode = body.code;
    result.rows = Array.isArray(body.data) ? body.data.length : 0;
    result.ok = response.ok && body.code === "0" && result.rows > 0;
  } catch (error) {
    result.error = normalizeError(error);
  } finally {
    result.ms = Date.now() - started;
  }

  return result;
}

async function checkGithubActions() {
  const started = Date.now();
  const result = {
    ok: false,
    ms: 0,
    status: 0,
    lastRunAt: null,
    lastConclusion: "",
    lastRunAgeMinutes: null,
    warning: "",
    error: ""
  };

  try {
    const response = await fetchWithTimeout(githubRunsUrl, {
      headers: { "User-Agent": "botalin-health-check" }
    }, 8000);
    result.status = response.status;
    const body = await response.json();
    const last = body.workflow_runs?.[0] || null;
    result.lastRunAt = last?.created_at || null;
    result.lastConclusion = last?.conclusion || last?.status || "";
    if (result.lastRunAt) {
      result.lastRunAgeMinutes = Math.round((now - Date.parse(result.lastRunAt)) / 60000);
    }
    result.ok = response.ok && Boolean(last) && ["success", "in_progress", "queued"].includes(result.lastConclusion) && (result.lastRunAgeMinutes === null || result.lastRunAgeMinutes <= 20);
    if (!result.ok) result.warning = "GitHub Actions не выглядит как стабильный частый раннер; для постоянной работы нужен VPS timer.";
  } catch (error) {
    result.error = normalizeError(error);
  } finally {
    result.ms = Date.now() - started;
  }

  return result;
}

async function supabaseFetch(path) {
  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1${path}`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json"
    }
  }, 9000);
  const text = await response.text();
  if (!response.ok) throw new Error(formatRemoteError(response.status, text || response.statusText));
  return {
    ok: true,
    status: response.status,
    body: text ? JSON.parse(text) : null
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function printReport(value) {
  const supabase = value.checks.supabase;
  const marketData = value.checks.marketData;
  const github = value.checks.github;
  const lines = [
    `Botalin server health: ${value.ok ? "OK" : "PROBLEM"}`,
    `Supabase: ${supabase.ok ? supabase.slow ? "SLOW" : "OK" : "FAIL"} (${supabase.ms} ms) serverTrades=${supabase.serverTrades}, active=${supabase.activeTrades}${supabase.lastServerTradeAgeMinutes !== null ? `, lastServerTrade=${supabase.lastServerTradeAgeMinutes} min ago` : ""}${supabase.stale ? " [STALE]" : ""}${supabase.error ? `, error=${supabase.error}` : ""}`,
    `OKX market data: ${marketData.ok ? "OK" : "FAIL"} (${marketData.ms} ms) rows=${marketData.rows}${marketData.error ? `, error=${marketData.error}` : ""}`,
    `GitHub Actions: ${github.ok ? "OK" : "WARN"} (${github.ms} ms) last=${github.lastConclusion || "none"}${github.lastRunAgeMinutes !== null ? `, ${github.lastRunAgeMinutes} min ago` : ""}${github.warning ? `, ${github.warning}` : ""}${github.error ? `, error=${github.error}` : ""}`
  ];
  console.log(lines.join("\n"));
  if (process.argv.includes("--json")) console.log(JSON.stringify(value, null, 2));
}

function normalizeError(error) {
  if (error?.name === "AbortError") return "request timeout";
  return String(error?.message || error || "unknown error");
}

function formatRemoteError(status, text) {
  const message = String(text || "");
  if (status === 522 || message.includes("Error code 522") || message.includes("Connection timed out")) {
    return `${status} Supabase/Cloudflare timeout`;
  }
  if (message.length > 220) return `${status} ${message.slice(0, 217)}...`;
  return `${status} ${message || "Remote request failed"}`;
}

main().catch((error) => {
  console.error(normalizeError(error));
  process.exitCode = 1;
});
