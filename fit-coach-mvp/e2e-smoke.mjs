import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const pageUrl = pathToFileURL(fileURLToPath(new URL("./index.html", import.meta.url))).href;

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
const errors = [];

page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(pageUrl);
await page.evaluate(() => localStorage.clear());
await page.reload();

await expectText(page, "body", /Привет! Я твой тренер/);
await page.getByRole("button", { name: /Поехали/ }).click();
await page.getByPlaceholder("Введи имя").fill("Алексей");
await page.getByRole("button", { name: "Далее" }).click();
await page.getByRole("button", { name: /Начинающий/ }).click();
await page.getByRole("button", { name: "Далее" }).click();
await page.getByRole("button", { name: /Набор силы/ }).click();
await page.getByRole("button", { name: "Далее" }).click();
await page.getByRole("button", { name: "45 мин" }).click();
await page.getByRole("button", { name: "Далее" }).click();
await page.getByRole("button", { name: /Начать первую тренировку/ }).click();

await expectText(page, "body", /Привет, Алексей|Как ты сегодня|Тренировка дня/);
await expectText(page, "body", /Готовность/);
await expectNoText(page, "body", /Питание|Планы|Расчет/);
await page.getByRole("button", { name: /Начать тренировку/ }).click();

await expectText(page, "body", /Таймер|Подход 1/);
await expectVisible(page, "input[type='number']");
await page.getByRole("button", { name: /Записать подход/ }).click();
await expectText(page, "body", /Отдых|Пропустить отдых/);
await page.getByRole("button", { name: /Пропустить отдых/ }).click();

page.once("dialog", (dialog) => dialog.accept());
await page.getByRole("button", { name: /Завершить тренировку/ }).last().click();
await expectText(page, "body", /Тренировка завершена|Как прошло/);
await page.getByRole("button", { name: /Сохранить и выйти/ }).click();
await expectText(page, "body", /Как ты сегодня/);

await page.getByRole("button", { name: /История/ }).click();
await expectText(page, "body", /История тренировок|Экспорт JSON/);
await expectText(page, "body", /Силовая|подход/);

await page.getByRole("button", { name: /Профиль/ }).click();
await expectText(page, "body", /Данные профиля|Данные и приватность/);
await expectVisible(page, "text=⬇ Экспортировать все данные");

for (const viewport of [
  { width: 390, height: 844 },
  { width: 375, height: 812 },
  { width: 1440, height: 1000 },
]) {
  await page.setViewportSize(viewport);
  await page.reload();
  await assertNoHorizontalOverflow(page, viewport.width);
}

if (errors.length) {
  throw new Error(`Browser errors:\n${errors.join("\n")}`);
}

await browser.close();
console.log("E2E smoke passed for React SPA");

async function expectText(page, selector, pattern) {
  await page.waitForFunction(
    ([target, source, flags]) => {
      const node = document.querySelector(target);
      return node && new RegExp(source, flags).test(node.textContent || "");
    },
    [selector, pattern.source, pattern.flags],
    { timeout: 5000 },
  );
}

async function expectNoText(page, selector, pattern) {
  const value = await page.locator(selector).textContent();
  if (pattern.test(value || "")) throw new Error(`Expected ${selector} not to match ${pattern}`);
}

async function expectVisible(page, selector) {
  await page.locator(selector).first().waitFor({ state: "visible", timeout: 5000 });
}

async function assertNoHorizontalOverflow(page, viewportWidth) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) throw new Error(`Horizontal overflow ${overflow}px at viewport ${viewportWidth}`);
}
