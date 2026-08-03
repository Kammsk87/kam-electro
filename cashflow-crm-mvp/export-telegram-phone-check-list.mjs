import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "data", "db.json");
const OUTPUT_PATH = path.join(__dirname, "data", "telegram-phone-check-list.json");

const db = JSON.parse(await fs.readFile(DB_PATH, "utf8"));
const rows = (db.clients || [])
  .filter((client) => client.phone)
  .filter((client) => !["Найден", "Не найден"].includes(client.telegramPhoneStatus))
  .map((client) => ({
    clientId: client.id,
    name: client.name,
    phone: normalizePhone(client.phone),
    source: client.source || "",
    currentTelegram: client.telegram || "",
  }))
  .filter((row) => row.phone);

await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: OUTPUT_PATH, phones: rows.length }, null, 2));

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return value.startsWith("+") ? value : digits ? `+${digits}` : "";
}
