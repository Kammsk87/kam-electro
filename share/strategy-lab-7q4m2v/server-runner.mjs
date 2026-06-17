#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const runnerDir = dirname(fileURLToPath(import.meta.url));
const botScript = join(runnerDir, "server-autobot.mjs");
const healthScript = join(runnerDir, "server-health.mjs");

const strategyMap = {
  all: { strategy: "all", userLogin: "server-vps", label: "all strategies" },
  trend: { strategy: "trend", userLogin: "server-trend", label: "trend EMA" },
  pullback: { strategy: "pullback", userLogin: "server-pullback", label: "pullback" },
  scalping: { strategy: "scalping", userLogin: "server-scalping", label: "scalping" },
  "rsi-reversal": { strategy: "rsi-reversal", userLogin: "server-rsi", label: "RSI reversal" },
  breakout: { strategy: "breakout", userLogin: "server-breakout", label: "breakout" },
  "vwap-reversion": { strategy: "vwap-reversion", userLogin: "server-vwap", label: "VWAP reversion" }
};

const defaultStrategies = "trend,pullback,scalping,rsi-reversal,breakout,vwap-reversion";
const intervalSec = getPositiveNumber("BOTALIN_RUNNER_INTERVAL_SEC", 180);
const staggerSec = getPositiveNumber("BOTALIN_RUNNER_STAGGER_SEC", 20);
const healthEveryCycles = getPositiveNumber("BOTALIN_RUNNER_HEALTH_EVERY", 5);
const runOnce = process.argv.includes("--once");
const dryRun = process.argv.includes("--dry-run");
const profile = getArgValue("--profile") || process.env.BOTALIN_SERVER_PROFILE || "training";
const requestedStrategies = (getArgValue("--strategies") || process.env.BOTALIN_RUNNER_STRATEGIES || defaultStrategies)
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const strategies = requestedStrategies
  .map((id) => strategyMap[id])
  .filter(Boolean);

if (!strategies.length) {
  console.error(`[runner] no valid strategies in "${requestedStrategies.join(",")}"`);
  process.exit(1);
}

let shuttingDown = false;
process.on("SIGTERM", () => {
  shuttingDown = true;
  console.log("[runner] SIGTERM received, stopping after current child process");
});
process.on("SIGINT", () => {
  shuttingDown = true;
  console.log("[runner] SIGINT received, stopping after current child process");
});

let cycle = 0;
console.log(`[runner] started: profile=${profile}, dryRun=${dryRun}, interval=${intervalSec}s, stagger=${staggerSec}s, strategies=${strategies.map((s) => s.strategy).join("/")}`);

do {
  cycle += 1;
  const startedAt = Date.now();
  console.log(`[runner] cycle ${cycle} started ${new Date(startedAt).toISOString()}`);

  for (const item of strategies) {
    if (shuttingDown) break;
    await runBot(item);
    if (!shuttingDown && staggerSec > 0) await sleep(staggerSec * 1000);
  }

  if (!shuttingDown && healthEveryCycles > 0 && cycle % healthEveryCycles === 0) {
    await runHealth();
  }

  const elapsedMs = Date.now() - startedAt;
  const waitMs = Math.max(0, intervalSec * 1000 - elapsedMs);
  console.log(`[runner] cycle ${cycle} done in ${Math.round(elapsedMs / 1000)}s${runOnce ? "" : `, next in ${Math.round(waitMs / 1000)}s`}`);

  if (!runOnce && !shuttingDown && waitMs > 0) await sleep(waitMs);
} while (!runOnce && !shuttingDown);

console.log("[runner] stopped");

async function runBot(item) {
  const env = {
    ...process.env,
    BOTALIN_SERVER_PROFILE: profile,
    BOTALIN_STRATEGY: item.strategy,
    BOTALIN_USER_LOGIN: item.userLogin
  };
  console.log(`[runner] run ${item.label}: user=${item.userLogin}, strategy=${item.strategy}`);
  const code = await runNode(botScript, dryRun ? ["--dry-run"] : ["--once"], env);
  if (code !== 0) {
    console.error(`[runner] ${item.label} exited with code ${code}`);
  }
}

async function runHealth() {
  console.log("[runner] run health check");
  const code = await runNode(healthScript, ["--json"], process.env);
  if (code !== 0) {
    console.error(`[runner] health exited with code ${code}`);
  }
}

function runNode(script, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: runnerDir,
      env,
      stdio: "inherit"
    });
    child.on("error", (error) => {
      console.error(`[runner] failed to spawn ${script}: ${error.message}`);
      resolve(1);
    });
    child.on("exit", (code) => resolve(Number(code) || 0));
  });
}

function getPositiveNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}
