import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const pageUrl = pathToFileURL(fileURLToPath(new URL("./index.html", import.meta.url))).href;

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(pageUrl);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.fill("#authName", "Атлет 1");
await page.fill("#authCode", "1111");
await page.click("#loginButton");
await page.waitForSelector("#workoutName");
await expectVisible(page, "#tourOverlay");
await expectText(page, "#tourTitle", /Старт/);
await page.click("#tourNext");
await expectText(page, "#tourTitle", /Что тренируешь/);
await page.click("#tourSkip");
await expectVisible(page, "#accountTourButton");
await page.click("#accountTourButton");
await expectVisible(page, "#tourOverlay");
await page.click("#tourSkip");

await expectVisible(page, "text=Тренировка, которая подстраивается под тело");
await expectVisible(page, "#readinessScore");
await expectVisible(page, "#workoutBlocks .workout-step");
await expectVisible(page, "#coachWhy .reason-pill");
await expectVisible(page, "#nextAction");
await page.evaluate(() => {
  const session = JSON.parse(localStorage.getItem("kam-fit-coach-mvp:current-user"));
  const key = `kam-fit-coach-mvp:user:${session.id}`;
  const saved = JSON.parse(localStorage.getItem(key));
  saved.activeWorkout = {
    signature: JSON.stringify({
      place: saved.profile.place,
      goal: saved.profile.goal,
      level: saved.profile.level,
      focus: saved.state.trainingFocus,
      trainingDays: Number(saved.profile.trainingDays),
      trainingStyle: saved.profile.trainingStyle,
      mode: saved.quickMode,
      intensity: "high",
      needsLowImpact: false,
      cycleDeload: false,
    }),
    startedAt: new Date().toISOString(),
    exercises: [],
  };
  localStorage.setItem(key, JSON.stringify(saved));
});
await page.reload();
await expectVisible(page, "#exerciseList .exercise-card");

const initialWorkout = await text(page, "#workoutName");
await page.click('[data-mode="short"]');
await page.waitForTimeout(50);
await expectText(page, "#workoutName", /Короткая тренировка/);
await expectText(page, "#nextAction", /25 минут/);

await page.click('[data-mode="pain"]');
await page.waitForTimeout(50);
await expectText(page, "#workoutName", /День без прыжков/);
await expectText(page, "#coachWhy", /есть боль|бережем суставы/);
await page.click('[data-focus="back"]');
await expectText(page, "#workoutName", /Спина/);
await expectText(page, "#exerciseList", /тяга|бицепс/i);
await page.click('[data-focus="legs"]');
await expectText(page, "#workoutName", /Ноги/);
await expectText(page, "#exerciseList", /жим ногами|румынская|сгибание/i);
await page.click('[data-focus="circuit"]');
await expectText(page, "#workoutName", /Круговая/);
await expectText(page, "#coachWhy", /круговых/);

await page.click('[data-plan="week"]');
await expectText(page, "#planOptions", /Неделя/);
await page.selectOption("#trainingDays", "4");
await page.selectOption("#trainingStyle", "circuit");
await expectText(page, "#workoutName", /Круговая/);
await expectText(page, "#coachWhy", /4 круговых/);
await expectText(page, "#planOptions", /4 круговых|круговой стиль/i);
await page.click('[data-plan="month"]');
await expectText(page, "#planOptions", /круговая база|4 недели|месяц/i);
await page.selectOption("#trainingStyle", "split");

await page.selectOption("#place", "home");
await expectText(page, "#workoutBlocks", /резинки|рюкзак|быстрая ходьба|присед/);
await page.selectOption("#place", "gym");
await page.click('[data-mode="normal"]');
await page.selectOption("#sex", "male");
await page.selectOption("#goal", "strength");
await page.selectOption("#level", "advanced");
await page.selectOption("#trainingDays", "2");
await expectText(page, "#coachWhy", /мужской профиль|уровень: опытный|тренировка плотнее/);
await expectText(page, "#exerciseList", /5 x 6/);
await page.selectOption("#sex", "female");
await page.selectOption("#cyclePhase", "menstruation");
await expectText(page, "#coachWhy", /женский профиль|цикл/);
await expectText(page, "#exerciseList", /2 x 10/);
await page.selectOption("#trainingFocus", "chest");
await expectText(page, "#workoutName", /Грудь/);
await expectText(page, "#workoutBlocks", /Дорожка|наклон 12-15|груд/);
await expectText(page, "#exerciseList", /дорожка 4,5-5|жим|кроссовер|разгибание/i);
await expectVisible(page, "#exerciseList .exercise-card");
await page.click("[data-swap='0']");
await page.click("[data-info='0']");
await expectVisible(page, "#techniqueModal");
await expectText(page, "#techniqueSteps", /контрол|стоп|корпус|дых/i);
await expectImageLoaded(page, "#techniqueImage");
await page.click("#closeTechnique");
await page.click("[data-exercise='0'][data-set='0']");
await page.click("[data-exercise='1'][data-set='0']");
await expectText(page, "#activeProgress", /[1-9][0-9]?%/);
await page.click("[data-accept='0']");
await expectText(page, "#exerciseList .exercise-card", /подходов/);
await expectVisible(page, "[data-expand='0']");
await page.click("[data-expand='0']");
await expectVisible(page, "[data-accept='0']");

await page.fill("#resultMinutes", "52");
await page.selectOption("#resultEffort", "hard");
await page.selectOption("#resultPain", "5");
await page.selectOption("#resultCompletion", "partial");
await page.fill("#feedback", "прошло нормально, но колено устало");
await page.click("#logDone");
await expectText(page, "#history", /готовность/);
await expectText(page, "#history", /52 мин/);
await expectText(page, "#history", /часть/);
await expectText(page, "#history", /подход/);
await expectText(page, "#history", /боль после/);
await expectText(page, "#achievement", /1 тренировка|тренировок|Маршрут/);
await expectText(page, "#archiveStats", /Всего|Минуты|Последняя/);
await expectText(page, "#archiveList", /52 мин|Грудь|Сложность|Подходы/);
await expectVisible(page, "#archiveList details[open]");
await page.click('[data-archive-filter="cardio"]');
await expectText(page, "#archiveList", /В этом фильтре пока нет тренировок/);
await page.click('[data-archive-filter="strength"]');
await expectText(page, "#archiveList", /Грудь|52 мин/);

await page.reload();
await expectText(page, "#history", /готовность/);
await expectText(page, "#history", /52 мин/);
await expectText(page, "#archiveList", /Грудь|52 мин/);
await expectText(page, "#achievement", /1 тренировка|тренировок|Маршрут/);
await page.locator("#sleep").evaluate((input) => {
  input.value = "3";
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await expectText(page, "#sleepHint", /мало сна/);
await expectText(page, "#stateImpact", /Сон: мало сна/);

await page.click("#logoutButton");
await page.fill("#authName", "Атлет 2");
await page.fill("#authCode", "2222");
await page.click("#loginButton");
await expectText(page, "#history", /Пока нет сохраненных тренировок/);
await expectText(page, "#archiveList", /В этом фильтре пока нет тренировок/);

for (const viewport of [
  { width: 430, height: 932 },
  { width: 390, height: 844 },
  { width: 375, height: 812 },
  { width: 360, height: 740 },
]) {
  await page.setViewportSize(viewport);
  await page.goto(pageUrl);
  await expectVisible(page, ".mobile-gym-bar");
  await expectBodyClass(page, "device-mobile");
  await page.waitForSelector("#exerciseList .exercise-card");
  await expectVisible(page, "[data-exercise='0'][data-set='0']");
  await expectVisible(page, "[data-field='weight'][data-exercise='0'][data-set='0']");
  await expectVisible(page, "[data-field='reps'][data-exercise='0'][data-set='0']");
  await assertNoHorizontalOverflow(page, viewport.width);
}

if (errors.length) {
  throw new Error(`Browser errors:\n${errors.join("\n")}`);
}

await browser.close();
console.log(`E2E smoke passed. Initial workout: ${initialWorkout}`);

async function text(page, selector) {
  return (await page.locator(selector).first().innerText()).trim();
}

async function expectVisible(page, selector) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible", timeout: 3000 });
}

async function expectText(page, selector, pattern) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: "visible", timeout: 3000 });
  const value = await locator.innerText();
  if (!pattern.test(value)) {
    throw new Error(`Expected ${selector} to match ${pattern}, got: ${value}`);
  }
}

async function assertNoHorizontalOverflow(page, width) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 2) {
    throw new Error(`Horizontal overflow ${overflow}px at ${width}px viewport`);
  }
}

async function expectImageLoaded(page, selector) {
  const loaded = await page.locator(selector).first().evaluate((image) => image.naturalWidth > 0 && image.naturalHeight > 0);
  if (!loaded) throw new Error(`${selector} did not load`);
}

async function expectBodyClass(page, className) {
  const hasClass = await page.evaluate((name) => document.body.classList.contains(name), className);
  if (!hasClass) throw new Error(`body missing ${className}`);
}
