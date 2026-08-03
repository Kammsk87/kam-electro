import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "data", "db.json");
const IMPORT_PATH = path.join(__dirname, "data", "site-games-import.json");
const SOURCE = "cashflow196_admin";

const db = JSON.parse(await fs.readFile(DB_PATH, "utf8"));
const importedGames = JSON.parse(await fs.readFile(IMPORT_PATH, "utf8"));
const importedAt = new Date().toISOString();

db.clients ||= [];
db.games ||= [];
db.bookings ||= [];
db.tasks ||= [];

const clientsByName = new Map();
for (const client of db.clients) {
  const key = normalizeName(client.name);
  if (key && !clientsByName.has(key)) clientsByName.set(key, client);
}

let createdClients = 0;
let matchedClients = 0;
let createdGames = 0;
let updatedGames = 0;
let createdBookings = 0;
let nextClientNumber = maxNumericId(db.clients, "CL") + 1;
let nextBookingNumber = maxNumericId(db.bookings, "B") + 1;

for (const [dayKey, gamesForDay] of groupBy(importedGames, dayGroupKey).entries()) {
  const first = gamesForDay[0];
  const gameId = `SITE-DAY-${dayKey}`;
  const externalGameIds = gamesForDay.map((game) => game.externalGameId);
  let crmGame = db.games.find((game) => game.id === gameId);
  const tables = gamesForDay.map((siteGame, index) => ({
    id: `SITE-${siteGame.externalGameId}`,
    name: `Стол ${index + 1} · сайт ${siteGame.externalGameId}`,
    min: 5,
    max: siteGame.participants.length,
    externalSource: SOURCE,
    externalGameId: siteGame.externalGameId,
    occupiedSeats: siteGame.participants.filter((player) => !player.isFree).length,
    freeSeats: siteGame.participants.filter((player) => player.isFree).length,
  }));

  const gamePatch = {
    id: gameId,
    date: dateRuToIso(first.dateRu),
    time: first.time,
    format: "Кэшфлоу",
    place: first.place,
    minPerTable: 5,
    maxPerTable: Math.max(...tables.map((table) => table.max)),
    tables,
    capacity: tables.reduce((sum, table) => sum + table.max, 0),
    status: "Проведена",
    comment: `Импортировано с сайта Cashflow196: игры ${externalGameIds.join(", ")}`,
    externalSource: SOURCE,
    externalDayText: first.dayText,
    externalGameIds,
    publicGameUrls: gamesForDay.map((game) => game.publicGameUrl).filter(Boolean),
    importedAt,
  };

  if (crmGame) {
    Object.assign(crmGame, gamePatch);
    updatedGames += 1;
  } else {
    db.games.push(gamePatch);
    crmGame = gamePatch;
    createdGames += 1;
  }

  for (const siteGame of gamesForDay) {
    const tableId = `SITE-${siteGame.externalGameId}`;
    for (const participant of siteGame.participants.filter((player) => !player.isFree)) {
      const client = findOrCreateClient(participant.name);
      const alreadyBooked = db.bookings.some((booking) => (
        booking.externalSource === SOURCE &&
        booking.externalGameId === siteGame.externalGameId &&
        booking.clientId === client.id
      ));
      if (alreadyBooked) {
        const booking = db.bookings.find((item) => (
          item.externalSource === SOURCE &&
          item.externalGameId === siteGame.externalGameId &&
          item.clientId === client.id
        ));
        Object.assign(booking, siteBookingPatch(siteGame, participant));
        continue;
      }

      db.bookings.push({
        id: nextId("B", nextBookingNumber++, 5),
        clientId: client.id,
        gameId: crmGame.id,
        tableId,
        status: "Пришел",
        attended: true,
        createdAt: importedAt,
        ...siteBookingPatch(siteGame, participant),
      });
      createdBookings += 1;

      client.status = Number(client.visits || 0) > 0 ? "Повторный игрок" : "Пришел впервые";
      client.visits = Number(client.visits || 0) + 1;
      client.lastGameAt = `${crmGame.date} ${crmGame.time}`;
      client.externalSiteName = participant.name;
      client.externalSources = Array.from(new Set([...(client.externalSources || []), SOURCE]));
      client.lastContactAt ||= importedAt;
    }
  }
}

function siteBookingPatch(siteGame, participant) {
  return {
    externalSource: SOURCE,
    externalGameId: siteGame.externalGameId,
    publicGameUrl: siteGame.publicGameUrl || "",
    sourcePlayerName: participant.name,
    resultPlace: participant.place,
    resultScore: participant.score ?? "",
    siteGamesCount: participant.gamesCount ?? "",
    siteTotalScore: participant.totalScore ?? "",
    siteRating2025: participant.rating2025 ?? "",
    siteWins: participant.wins ?? "",
    sitePlayerUrl: participant.playerUrl || "",
    updatedAt: importedAt,
  };
}

db.games.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
db.updatedAt = importedAt;

await fs.writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  importedSource: SOURCE,
  sourceGames: importedGames.length,
  createdGames,
  updatedGames,
  createdClients,
  matchedClients,
  createdBookings,
}, null, 2));

function findOrCreateClient(rawName) {
  const name = rawName.trim();
  const key = normalizeName(name);
  const existing = clientsByName.get(key) || findTokenNameMatch(name);
  if (existing) {
    matchedClients += 1;
    return existing;
  }

  const client = {
    telegramChatId: "",
    id: nextClientId(),
    udsId: "",
    registeredAt: new Date().toLocaleString("ru-RU"),
    name,
    phone: "",
    email: "",
    telegram: "",
    instagram: "",
    source: "Cashflow196",
    status: "Пришел впервые",
    interest: "Импортирован из истории игр сайта",
    nextGameId: "",
    lastContactAt: importedAt,
    lastGameAt: "",
    visits: 0,
    lastPurchaseAt: "",
    udsPoints: 0,
    udsPaid: 0,
    udsStatus: "",
    referrer: "",
    birthday: "",
    tags: "site-import",
    comment: "Создан автоматически при импорте игр с сайта Cashflow196",
    outreachStatus: "Не писали",
    outreachSentAt: "",
    replyStatus: "Нет ответа",
    lastReply: "",
    nextFollowUpAt: "",
    followUpNote: "",
    externalSiteName: name,
    externalSources: [SOURCE],
  };

  db.clients.push(client);
  clientsByName.set(key, client);
  createdClients += 1;
  return client;
}

function nextClientId() {
  return `CL-${String(nextClientNumber++).padStart(5, "0")}`;
}

function nextId(prefix, value, width) {
  return `${prefix}-${String(value).padStart(width, "0")}`;
}

function maxNumericId(items, prefix) {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  return items.reduce((result, item) => {
    const match = String(item.id || "").match(pattern);
    return match ? Math.max(result, Number(match[1])) : result;
  }, 0);
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/наталия/g, "наталья")
    .replace(/\s+/g, " ")
    .trim();
}

function findTokenNameMatch(name) {
  const targetTokens = nameTokens(name);
  if (targetTokens.length < 2) return null;
  const matches = db.clients.filter((client) => {
    const tokens = nameTokens(client.name);
    return tokens.length === targetTokens.length && tokens.every((token, index) => token === targetTokens[index]);
  });
  return matches.length === 1 ? matches[0] : null;
}

function nameTokens(value) {
  return normalizeName(value).split(" ").filter((token) => token.length > 1).sort();
}

function dayGroupKey(game) {
  return `${dateRuToIso(game.dateRu)}-${game.time.replace(":", "")}-${slug(game.place)}`;
}

function dateRuToIso(value) {
  const [day, month, year] = value.split(".");
  return `${year}-${month}-${day}`;
}

function slug(value) {
  return normalizeName(value)
    .replace(/\s+/g, "-")
    .replace(/[^a-zа-я0-9-]/gi, "")
    .slice(0, 40);
}

function groupBy(items, getKey) {
  const map = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}
