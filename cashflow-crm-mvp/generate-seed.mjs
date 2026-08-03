import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "/Users/aleksandr/Downloads/UDS. Клиенты 12.06.xlsx";
const outputPath = "/Users/aleksandr/Documents/New project KAM/cashflow-crm-mvp/data/seed-clients.js";

function normalizePhone(value) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return raw;
}

function get(row, headers, name) {
  const idx = headers.findIndex((header) => header.toLowerCase().trim() === name.toLowerCase().trim());
  return idx >= 0 ? row[idx] ?? "" : "";
}

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);
const sheetInfo = JSON.parse((await workbook.inspect({ kind: "sheet" })).ndjson.trim().split("\n")[0]);
const [, lastCol, lastRowText] = sheetInfo.range.match(/^A1:([A-Z]+)(\d+)$/) ?? [];
const table = await workbook.inspect({
  kind: "table",
  sheetId: sheetInfo.id,
  range: `A1:${lastCol}${lastRowText}`,
  include: "values",
  maxChars: 2_000_000,
  tableMaxRows: Number(lastRowText),
  tableMaxCols: 26,
});

const matrix = JSON.parse(table.ndjson.trim().split("\n")[0]).values;
const headerRow = String(matrix[0]?.[0] ?? "").includes("UDS") ? 1 : 0;
const headers = matrix[headerRow].map((value) => String(value ?? "").trim());
const rows = matrix.slice(headerRow + 1).filter((row) => row.some((value) => String(value ?? "").trim()));

const clients = rows.map((row, index) => ({
  id: `CL-${String(index + 1).padStart(5, "0")}`,
  udsId: String(get(row, headers, "ID Клиента") || ""),
  registeredAt: String(get(row, headers, "Регистрация") || ""),
  name: String(get(row, headers, "Клиент") || "Без имени").trim(),
  phone: normalizePhone(get(row, headers, "Телефон")),
  email: String(get(row, headers, "E-mail") || "").trim(),
  telegram: "",
  instagram: "",
  source: String(get(row, headers, "Источник трафика") || "UDS").trim() || "UDS",
  status: "Новый из базы",
  interest: "",
  nextGameId: "",
  lastContactAt: "",
  lastGameAt: "",
  visits: 0,
  lastPurchaseAt: String(get(row, headers, "Дата последней покупки") || ""),
  udsPoints: Number(get(row, headers, "Баллы") || 0),
  udsPaid: Number(get(row, headers, "Оплачено ([RUB])") || 0),
  udsStatus: String(get(row, headers, "Статус") || ""),
  referrer: String(get(row, headers, "По рекомендации участника:") || ""),
  birthday: String(get(row, headers, "Дата рождения") || ""),
  tags: String(get(row, headers, "Теги") || ""),
  comment: "",
}));

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(
  outputPath,
  `window.CASHFLOW_SEED_CLIENTS = ${JSON.stringify(clients, null, 2)};\n`,
  "utf8",
);

console.log(`Seed clients written: ${clients.length}`);
