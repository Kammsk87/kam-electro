import http from "node:http";
import https from "node:https";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";
const DB_PATH = path.join(__dirname, "data", "db.json");
const SEED_PATH = path.join(__dirname, "data", "seed-clients.js");
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const BOT_POLL_INTERVAL_MS = Number(process.env.BOT_POLL_INTERVAL_MS || 30000);
const TELEGRAM_UPDATES_INTERVAL_MS = Number(process.env.TELEGRAM_UPDATES_INTERVAL_MS || 2500);
const CRM_USER = process.env.CRM_USER || "manager";
const CRM_PASSWORD = process.env.CRM_PASSWORD || "";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

let writeQueue = Promise.resolve();
let telegramUpdateOffset = 0;
let isProcessingUpdates = false;

await ensureDb();
if (process.env.CASHFLOW_CRM_TEST !== "1") {
  startBotWorker();
}

const server = http.createServer(async (req, res) => {
  try {
    if (!isAuthorized(req)) {
      res.writeHead(401, {
        "Content-Type": "text/plain; charset=utf-8",
        "WWW-Authenticate": 'Basic realm="Cashflow CRM"',
      });
      res.end("Authorization required");
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/state" && req.method === "GET") {
      return json(res, await readDb());
    }

    if (url.pathname === "/api/state" && req.method === "PUT") {
      const nextState = await readJsonBody(req);
      const saved = await saveDb(normalizeState(nextState));
      return json(res, saved);
    }

    if (url.pathname === "/api/reset" && req.method === "POST") {
      const fresh = await buildInitialState();
      const saved = await saveDb(fresh);
      return json(res, saved);
    }

    if (url.pathname === "/api/bot/run-once" && req.method === "POST") {
      const result = await processBotTasks();
      return json(res, result);
    }

    if (url.pathname === "/api/bot/status" && req.method === "GET") {
      return json(res, {
        enabled: Boolean(TELEGRAM_BOT_TOKEN),
        updateOffset: telegramUpdateOffset,
        sendIntervalMs: BOT_POLL_INTERVAL_MS,
        updatesIntervalMs: TELEGRAM_UPDATES_INTERVAL_MS,
      });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    return json(res, { error: error.message || "Server error" }, 500);
  }
});

if (process.env.CASHFLOW_CRM_TEST !== "1") {
  server.listen(PORT, HOST, () => {
    console.log(`Cashflow CRM server: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
    console.log(CRM_PASSWORD ? `CRM auth: enabled for user "${CRM_USER}"` : "CRM auth: disabled");
    console.log(TELEGRAM_BOT_TOKEN ? "Telegram worker: enabled" : "Telegram worker: waiting for TELEGRAM_BOT_TOKEN");
  });
}

function isAuthorized(req) {
  if (!CRM_PASSWORD) return true;
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return false;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) return false;
  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  return user === CRM_USER && password === CRM_PASSWORD;
}

async function serveStatic(urlPath, res) {
  const safePath = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  const filePath = path.normalize(path.join(__dirname, safePath));
  if (!filePath.startsWith(__dirname)) {
    return json(res, { error: "Forbidden" }, 403);
  }

  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    json(res, { error: "Not found" }, 404);
  }
}

async function ensureDb() {
  try {
    await fs.access(DB_PATH);
  } catch {
    await saveDb(await buildInitialState());
  }
}

async function buildInitialState() {
  const seedText = await fs.readFile(SEED_PATH, "utf8");
  const jsonText = seedText
    .replace(/^window\.CASHFLOW_SEED_CLIENTS\s*=\s*/, "")
    .replace(/;\s*$/, "");
  const clients = JSON.parse(jsonText).map((client) => ({
    telegramChatId: "",
    ...client,
  }));

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    clients,
    games: buildDefaultGames(),
    bookings: [],
    tasks: [],
  };
}

function buildDefaultGames() {
  const games = [];
  const date = new Date();
  date.setHours(0, 0, 0, 0);

  while (games.length < 12) {
    const day = date.getDay();
    const isWednesday = day === 3;
    const isSunday = day === 0;
    if (isWednesday || isSunday) {
      const tableCount = isWednesday ? 3 : 5;
      games.push({
        id: `GAME-${String(games.length + 1).padStart(4, "0")}`,
        date: formatDateInputValue(date),
        time: isWednesday ? "18:00" : "16:00",
        format: "Кэшфлоу",
        place: "Указать место",
        minPerTable: 5,
        maxPerTable: 7,
        tables: buildDefaultTables(tableCount),
        capacity: tableCount * 7,
        status: "Запланирована",
        comment: isWednesday ? "Еженедельная игра по средам" : "Еженедельная игра по воскресеньям",
      });
    }
    date.setDate(date.getDate() + 1);
  }

  return games;
}

function buildDefaultTables(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `TABLE-${String(index + 1).padStart(2, "0")}`,
    name: `Стол ${index + 1}`,
    min: 5,
    max: 7,
  }));
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function readDb() {
  return JSON.parse(await fs.readFile(DB_PATH, "utf8"));
}

async function saveDb(state) {
  const nextState = normalizeState(state);
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    await fs.writeFile(DB_PATH, JSON.stringify(nextState, null, 2), "utf8");
  });
  await writeQueue;
  return nextState;
}

function normalizeState(state) {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    clients: Array.isArray(state.clients) ? state.clients.map((client) => ({ telegramChatId: "", ...client })) : [],
    games: Array.isArray(state.games) ? state.games : [],
    bookings: Array.isArray(state.bookings) ? state.bookings : [],
    tasks: Array.isArray(state.tasks) ? state.tasks : [],
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 50_000_000) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

function startBotWorker() {
  if (!TELEGRAM_BOT_TOKEN) return;
  setInterval(() => {
    processBotTasks().catch((error) => console.error("Telegram worker error:", error));
  }, BOT_POLL_INTERVAL_MS);
  setInterval(() => {
    pollTelegramUpdates().catch((error) => console.error("Telegram updates error:", error));
  }, TELEGRAM_UPDATES_INTERVAL_MS);
  processBotTasks().catch((error) => console.error("Telegram worker error:", error));
  pollTelegramUpdates().catch((error) => console.error("Telegram updates error:", error));
}

async function pollTelegramUpdates() {
  if (!TELEGRAM_BOT_TOKEN || isProcessingUpdates) return { processed: 0 };
  isProcessingUpdates = true;
  try {
    const response = await telegramApi("getUpdates", {
      offset: telegramUpdateOffset || undefined,
      timeout: 0,
      allowed_updates: ["message"],
    });
    const updates = Array.isArray(response.result) ? response.result : [];
    for (const update of updates) {
      telegramUpdateOffset = Math.max(telegramUpdateOffset, Number(update.update_id) + 1);
      await handleTelegramUpdate(update);
    }
    return { processed: updates.length, updateOffset: telegramUpdateOffset };
  } finally {
    isProcessingUpdates = false;
  }
}

async function handleTelegramUpdate(update) {
  const message = update.message;
  if (!message?.chat?.id || !message.text) return;

  const chatId = String(message.chat.id);
  const text = String(message.text || "").trim();
  const username = message.from?.username ? `@${message.from.username}` : "";

  if (text.startsWith("/start")) {
    const payload = text.split(/\s+/)[1] || "";
    const state = await readDb();
    const client = findOrCreateTelegramClient(state, { chatId, username, payload, message });
    const wasNewChat = !client.telegramChatId;
    client.telegramChatId = chatId;
    if (username && !client.telegram) client.telegram = username;
    client.lastContactAt = new Date().toISOString();
    client.status = client.status === "Новый из базы" ? "Интересовался" : client.status;
    upsertTask(state, {
      clientId: client.id,
      channel: "Telegram",
      type: "Первичный ответ",
      template: "Прислать ближайшие даты игр",
      gameId: "",
    });
    await saveDb(state);
    if (process.env.CASHFLOW_CRM_TEST !== "1") {
      await sendTelegramMessage(chatId, buildStartReply(client, state, wasNewChat));
    }
    return;
  }

  if (text.startsWith("/games")) {
    const state = await readDb();
    const client = findOrCreateTelegramClient(state, { chatId, username, payload: "", message });
    client.telegramChatId = chatId;
    await saveDb(state);
    if (process.env.CASHFLOW_CRM_TEST !== "1") {
      await sendTelegramMessage(chatId, buildGamesReply(state));
    }
    return;
  }

  if (text.startsWith("/help")) {
    if (process.env.CASHFLOW_CRM_TEST !== "1") {
      await sendTelegramMessage(chatId, "Команды: /start - привязать Telegram к CRM, /games - показать ближайшие игры.");
    }
  }
}

function findOrCreateTelegramClient(state, { chatId, username, payload, message }) {
  const normalizedPayload = normalizeTelegramPayload(payload);
  const candidates = [
    (client) => client.telegramChatId && String(client.telegramChatId) === chatId,
    (client) => normalizedPayload && String(client.id).toLowerCase() === normalizedPayload.toLowerCase(),
    (client) => username && String(client.telegram || "").toLowerCase() === username.toLowerCase(),
  ];
  const existing = candidates.reduce((found, predicate) => found || state.clients.find(predicate), null);
  if (existing) return existing;

  const fullName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ").trim();
  const client = {
    telegramChatId: chatId,
    id: `CL-${String(state.clients.length + 1).padStart(5, "0")}`,
    udsId: "",
    registeredAt: new Date().toLocaleString("ru-RU"),
    name: fullName || username || `Telegram ${chatId}`,
    phone: "",
    email: "",
    telegram: username,
    instagram: "",
    source: "Telegram",
    status: "Интересовался",
    interest: "Обратился в Telegram-бот",
    nextGameId: "",
    lastContactAt: new Date().toISOString(),
    lastGameAt: "",
    visits: 0,
    lastPurchaseAt: "",
    udsPoints: 0,
    udsPaid: 0,
    udsStatus: "",
    referrer: "",
    birthday: "",
    tags: "",
    comment: "Создан автоматически через Telegram /start",
  };
  state.clients.unshift(client);
  return client;
}

function normalizeTelegramPayload(payload) {
  return String(payload || "")
    .replace(/^client_/i, "")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

function upsertTask(state, task) {
  const existing = state.tasks.find((item) => (
    item.clientId === task.clientId &&
    item.type === task.type &&
    item.status === "К отправке"
  ));
  if (existing) return existing;

  const nextTask = {
    id: `T-${String(state.tasks.length + 1).padStart(5, "0")}`,
    clientId: task.clientId,
    channel: task.channel,
    type: task.type,
    when: new Date().toISOString(),
    status: "К отправке",
    template: task.template,
    gameId: task.gameId || "",
    lastAttemptAt: "",
    comment: "",
  };
  state.tasks.push(nextTask);
  return nextTask;
}

function buildStartReply(client, state, wasNewChat) {
  const firstName = String(client.name || "друг").split(" ")[0];
  const intro = wasNewChat
    ? `${firstName}, Telegram привязан к CRM.`
    : `${firstName}, ты уже есть в CRM, Telegram обновлен.`;
  return `${intro}\n\n${buildGamesReply(state)}`;
}

function buildGamesReply(state) {
  const games = state.games
    .filter((game) => game.status !== "Отменена")
    .slice(0, 5)
    .map((game) => `- ${formatTelegramGame(game)} · ${game.place}`)
    .join("\n");
  return games
    ? `Ближайшие игры:\n${games}\n\nНапиши администратору или ответь сюда, чтобы выбрать дату.`
    : "Пока нет запланированных игр. Я напишу, когда появятся новые даты.";
}

function formatTelegramGame(game) {
  const date = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long" })
    .format(new Date(`${game.date}T00:00:00`));
  return `${date}, ${game.time}`;
}

async function processBotTasks() {
  const state = await readDb();
  const now = new Date();
  const readyTasks = state.tasks.filter((task) => (
    task.status === "К отправке" &&
    task.channel === "Telegram" &&
    (!task.when || new Date(task.when) <= now)
  ));

  const result = { checked: readyTasks.length, sent: 0, skipped: 0, failed: 0 };

  for (const task of readyTasks) {
    const client = state.clients.find((item) => item.id === task.clientId);
    if (!client?.telegramChatId) {
      task.status = "Нет chat_id";
      task.comment = "Клиент должен сначала написать Telegram-боту, чтобы появился chat_id.";
      result.skipped += 1;
      continue;
    }

    try {
      const text = renderTelegramMessage(task, client, state);
      await sendTelegramMessage(client.telegramChatId, text);
      task.status = "Готово";
      task.lastAttemptAt = new Date().toISOString();
      result.sent += 1;
    } catch (error) {
      task.status = "Ошибка";
      task.lastAttemptAt = new Date().toISOString();
      task.comment = error.message || "Telegram send failed";
      result.failed += 1;
    }
  }

  await saveDb(state);
  return result;
}

function renderTelegramMessage(task, client, state) {
  const game = state.games.find((item) => item.id === task.gameId);
  const firstName = String(client.name || "друг").split(" ")[0];
  if (task.type === "Напоминание 24ч" && game) {
    return `${firstName}, напоминаю: завтра игра "Кэшфлоу" в ${game.time}. Место: ${game.place}. Подтверди, пожалуйста, что будешь.`;
  }
  if (task.type === "Напоминание 3ч" && game) {
    return `${firstName}, сегодня игра "Кэшфлоу" в ${game.time}. Ждем тебя: ${game.place}.`;
  }
  if (task.type === "Не пришел") {
    return `${firstName}, не получилось прийти? Могу записать тебя на ближайшую следующую игру.`;
  }
  if (task.type === "Повторный визит") {
    return `${firstName}, на этой неделе снова играем в "Кэшфлоу". Хочешь забронировать место?`;
  }
  if (task.type === "Приглашение на игру" && game) {
    return `${firstName}, приглашаю тебя на ближайшую игру "Кэшфлоу": ${formatTelegramGame(game)}.\nМесто: ${game.place}.\n\nХочешь забронировать место?`;
  }
  return `${firstName}, ближайшая игра "Кэшфлоу" уже в расписании. Хочешь забронировать место?`;
}

function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }

  return telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

function telegramApi(method, payloadObject) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }

  const payload = JSON.stringify(payloadObject);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.telegram.org",
      path: `/bot${TELEGRAM_BOT_TOKEN}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`Telegram API ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export const __test = {
  handleTelegramUpdate,
  readDb,
  saveDb,
  buildInitialState,
};
