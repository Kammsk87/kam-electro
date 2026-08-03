import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "data", "site-games-import.json");
const BASE_URL = "https://cashflow196.ru";
const MONTHS_BACK = Number(process.env.MONTHS_BACK || 3);
const cutoff = new Date();
cutoff.setHours(0, 0, 0, 0);
cutoff.setMonth(cutoff.getMonth() - MONTHS_BACK);

const discovered = [];
const seenGameUrls = new Set();
let shouldContinue = true;

for (let page = 1; page <= 30 && shouldContinue; page += 1) {
  const url = page === 1 ? `${BASE_URL}/games/` : `${BASE_URL}/games/?page=${page}`;
  const html = await fetchText(url);
  const cards = parseGameCards(html);
  if (!cards.length) break;

  let pageHasRecentGame = false;
  for (const card of cards) {
    if (card.date < cutoff) {
      continue;
    }
    pageHasRecentGame = true;
    if (!seenGameUrls.has(card.url)) {
      seenGameUrls.add(card.url);
      discovered.push(card);
    }
  }

  const oldest = cards
    .map((card) => card.date)
    .filter(Boolean)
    .sort((a, b) => a - b)[0];
  if (!pageHasRecentGame && oldest && oldest < cutoff) shouldContinue = false;
}

const importedGames = [];
for (const [index, card] of discovered.entries()) {
  const html = await fetchText(card.url);
  const details = parseGameDetails(html);
  importedGames.push({
    externalGameId: details.externalGameId || card.externalGameId,
    publicGameUrl: card.url,
    dateRu: details.dateRu || card.dateRu,
    time: details.time || card.time,
    place: details.place || card.place,
    dayText: `${details.dateRu || card.dateRu} ${details.time || card.time} ${details.place || card.place}`,
    participants: details.participants,
  });
  process.stderr.write(`Parsed ${index + 1}/${discovered.length}: ${card.url} (${details.participants.length} players)\n`);
}

importedGames.sort((a, b) => {
  const byDate = dateRuToIso(a.dateRu).localeCompare(dateRuToIso(b.dateRu));
  if (byDate !== 0) return byDate;
  const byTime = a.time.localeCompare(b.time);
  if (byTime !== 0) return byTime;
  return String(a.externalGameId).localeCompare(String(b.externalGameId));
});

await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(importedGames, null, 2)}\n`, "utf8");

const uniquePlayers = new Set(
  importedGames.flatMap((game) => game.participants.filter((player) => !player.isFree).map((player) => normalizeSpaces(player.name))),
);

console.log(JSON.stringify({
  source: "cashflow196_public",
  monthsBack: MONTHS_BACK,
  cutoff: cutoff.toISOString().slice(0, 10),
  output: OUTPUT_PATH,
  games: importedGames.length,
  playerRows: importedGames.reduce((sum, game) => sum + game.participants.length, 0),
  uniquePlayers: uniquePlayers.size,
}, null, 2));

function parseGameCards(html) {
  const main = between(html, "<main", "</main>") || html;
  const linkRegex = /<a\b[^>]*href="(\/games\/\d+\/)"[^>]*>([\s\S]*?)<\/a>/gi;
  const cards = [];
  for (const match of main.matchAll(linkRegex)) {
    const body = match[2];
    const externalGameId = textFromHtml(between(body, "<h3", "</h3>")).match(/\d+/)?.[0] || "";
    const text = textFromHtml(body);
    const info = text.match(/(.+?)\s+(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4})/);
    if (!externalGameId || !info) continue;
    cards.push({
      externalGameId,
      url: new URL(match[1], BASE_URL).toString(),
      place: normalizeSpaces(info[1].replace(/Игра:\s*\d+/i, "")),
      time: info[2],
      dateRu: info[3],
      date: parseRuDate(info[3]),
    });
  }
  return cards;
}

function parseGameDetails(html) {
  const title = textFromHtml(between(html, '<h2 class="game-info__title"', "</h2>"));
  const externalGameId = title.match(/\d+/)?.[0] || "";
  const infoText = textFromHtml(between(html, '<div class="game-info__info"', "</div>"));
  const info = infoText.match(/(\d{2}:\d{2})\s+(\d{2}\.\d{2}\.\d{4}),\s*(.+)$/);
  const table = between(html, '<tbody class="table__main"', "</tbody>") || "";
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) => rowMatch[1]);
  const participants = rows.map(parseParticipantRow).filter(Boolean);
  return {
    externalGameId,
    time: info?.[1] || "",
    dateRu: info?.[2] || "",
    place: normalizeSpaces(info?.[3] || ""),
    participants,
  };
}

function parseParticipantRow(rowHtml) {
  const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cellMatch) => cellMatch[1]);
  if (cells.length < 2) return null;
  const place = Number(textFromHtml(cells[0]));
  const name = normalizeSpaces(textFromHtml(cells[1]));
  if (!name) return null;
  return {
    place: Number.isFinite(place) ? place : "",
    name,
    isFree: /свобод/i.test(name),
    playerUrl: cells[1].match(/href="([^"]+)"/)?.[1] || "",
    gamesCount: Number(textFromHtml(cells[2] || "")) || 0,
    score: Number(textFromHtml(cells[3] || "")) || 0,
    totalScore: Number(textFromHtml(cells[4] || "")) || 0,
    rating2025: Number(textFromHtml(cells[6] || "")) || 0,
    wins: Number(textFromHtml(cells[7] || "")) || 0,
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "cashflow-crm-import/1.0",
      "accept": "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function between(value, startNeedle, endNeedle) {
  const start = value.indexOf(startNeedle);
  if (start === -1) return "";
  const contentStart = value.indexOf(">", start);
  if (contentStart === -1) return "";
  const end = value.indexOf(endNeedle, contentStart + 1);
  if (end === -1) return "";
  return value.slice(contentStart + 1, end);
}

function textFromHtml(html) {
  return decodeHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " "));
}

function decodeHtml(value) {
  return normalizeSpaces(value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">"));
}

function normalizeSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseRuDate(value) {
  const [day, month, year] = String(value).split(".").map(Number);
  return new Date(year, month - 1, day);
}

function dateRuToIso(value) {
  const [day, month, year] = value.split(".");
  return `${year}-${month}-${day}`;
}
