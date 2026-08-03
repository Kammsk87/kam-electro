import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "data", "db.json");
const RESULTS_PATH = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "data", "telegram-phone-check-results.json");

const db = JSON.parse(await fs.readFile(DB_PATH, "utf8"));
const results = JSON.parse(await fs.readFile(RESULTS_PATH, "utf8"));
const checkedAt = new Date().toISOString();
let updated = 0;
let found = 0;
let missing = 0;

for (const result of results) {
  const client = (db.clients || []).find((item) => (
    item.id === result.clientId ||
    normalizePhone(item.phone) === normalizePhone(result.phone)
  ));
  if (!client) continue;

  const isFound = Boolean(result.found || result.userId || result.user_id);
  client.telegramPhoneStatus = isFound ? "Найден" : "Не найден";
  client.telegramPhoneUserId = String(result.userId || result.user_id || "");
  client.telegramPhoneUsername = normalizeUsername(result.username || "");
  client.telegramPhoneFirstName = result.firstName || result.first_name || "";
  client.telegramPhoneLastName = result.lastName || result.last_name || "";
  client.telegramPhoneCheckedAt = result.checkedAt || checkedAt;

  if (!client.telegram && client.telegramPhoneUsername) client.telegram = client.telegramPhoneUsername;
  updated += 1;
  if (isFound) found += 1;
  else missing += 1;
}

db.updatedAt = checkedAt;
await fs.writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ imported: updated, found, missing }, null, 2));

function normalizeUsername(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.startsWith("@") ? text : `@${text}`;
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return value ? String(value).trim() : "";
}
