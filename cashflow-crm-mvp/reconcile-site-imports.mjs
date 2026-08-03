import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "data", "db.json");
const SOURCE = "cashflow196_admin";

const db = JSON.parse(await fs.readFile(DB_PATH, "utf8"));
const importedClientIds = new Set(
  db.bookings
    .filter((booking) => booking.externalSource === SOURCE)
    .map((booking) => booking.clientId),
);

const importedClients = db.clients.filter((client) => importedClientIds.has(client.id) && !client.phone);
const baseClients = db.clients.filter((client) => !importedClientIds.has(client.id) && client.phone);
const merges = [];

for (const importedClient of importedClients) {
  const match = findNameMatch(importedClient, baseClients);
  if (!match) continue;
  mergeClient(importedClient, match);
  merges.push({
    fromId: importedClient.id,
    fromName: importedClient.name,
    toId: match.id,
    toName: match.name,
    phone: match.phone,
  });
}

if (merges.length) {
  const removeIds = new Set(merges.map((merge) => merge.fromId));
  db.clients = db.clients.filter((client) => !removeIds.has(client.id));
  db.updatedAt = new Date().toISOString();
  await fs.writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  source: SOURCE,
  mergedClients: merges.length,
  merges,
}, null, 2));

function findNameMatch(importedClient, candidates) {
  const scored = candidates
    .map((candidate) => ({ candidate, score: nameScore(importedClient.name, candidate.name) }))
    .filter((item) => item.score >= 1)
    .sort((a, b) => b.score - a.score);

  if (scored.length !== 1) return null;
  return scored[0].candidate;
}

function mergeClient(fromClient, toClient) {
  for (const booking of db.bookings) {
    if (booking.clientId === fromClient.id) booking.clientId = toClient.id;
  }

  const importedVisits = Number(fromClient.visits || 0);
  toClient.visits = Number(toClient.visits || 0) + importedVisits;
  toClient.lastGameAt = latestDateTime(toClient.lastGameAt, fromClient.lastGameAt);
  toClient.status = Number(toClient.visits || 0) > 1 ? "Повторный игрок" : "Пришел впервые";
  toClient.externalSiteName ||= fromClient.externalSiteName || fromClient.name;
  toClient.externalSources = Array.from(new Set([
    ...(Array.isArray(toClient.externalSources) ? toClient.externalSources : []),
    ...(Array.isArray(fromClient.externalSources) ? fromClient.externalSources : []),
    SOURCE,
  ]));
  toClient.siteAliases = Array.from(new Set([
    ...(Array.isArray(toClient.siteAliases) ? toClient.siteAliases : []),
    fromClient.externalSiteName || fromClient.name,
  ]));
  toClient.comment = [toClient.comment, `Склеено с импортом сайта: ${fromClient.name}`]
    .filter(Boolean)
    .join(" · ");
}

function nameScore(a, b) {
  const aTokens = nameTokens(a);
  const bTokens = nameTokens(b);
  if (aTokens.length < 2 || bTokens.length < 2) return 0;
  if (aTokens.length !== bTokens.length) return 0;
  return aTokens.every((token, index) => token === bTokens[index]) ? 1 : 0;
}

function nameTokens(value) {
  return normalizeName(value).split(" ").filter((token) => token.length > 1).sort();
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

function latestDateTime(a, b) {
  if (!a) return b || "";
  if (!b) return a || "";
  const aTime = new Date(String(a).replace(" ", "T")).getTime();
  const bTime = new Date(String(b).replace(" ", "T")).getTime();
  if (Number.isNaN(aTime)) return b;
  if (Number.isNaN(bTime)) return a;
  return bTime > aTime ? b : a;
}
