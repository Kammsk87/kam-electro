const defaults = {
  profile: {
    sex: "female",
    goal: "strength",
    place: "gym",
    level: "beginner",
    trainingDays: "3",
    trainingStyle: "split",
    cyclePhase: "none",
    limitations: "",
  },
  state: {
    sleep: 7,
    energy: 7,
    stress: 4,
    pain: 2,
    trainingFocus: "auto",
    readinessNote: "",
    feedback: "",
    resultMinutes: 45,
    resultEffort: "done",
    resultPain: "0",
    resultCompletion: "full",
  },
  activePlan: "day",
  archiveFilter: "all",
  quickMode: "normal",
  activeWorkout: null,
  tourDone: false,
  history: [],
};

const storageKey = "kam-fit-coach-mvp";
const sessionKey = `${storageKey}:current-user`;
const $ = (id) => document.getElementById(id);

let currentUser = loadCurrentUser();
let data = currentUser ? load() : structuredClone(defaults);
let tourIndex = 0;

function loadCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey));
  } catch {
    return null;
  }
}

function userStorageKey(user = currentUser) {
  return `${storageKey}:user:${user?.id || "guest"}`;
}

function load() {
  const saved = localStorage.getItem(userStorageKey());
  if (!saved) return structuredClone(defaults);
  try {
    const parsed = JSON.parse(saved);
    return {
      ...structuredClone(defaults),
      ...parsed,
      profile: { ...defaults.profile, ...parsed.profile },
      state: { ...defaults.state, ...parsed.state },
    };
  } catch {
    return structuredClone(defaults);
  }
}

function save() {
  if (!currentUser) return;
  localStorage.setItem(userStorageKey(), JSON.stringify(data));
  localStorage.setItem(sessionKey, JSON.stringify(currentUser));
}

function bindInputs() {
  $("authForm").addEventListener("submit", (event) => {
    event.preventDefault();
    login($("authName").value, $("authCode").value);
  });
  $("demoLoginButton").addEventListener("click", () => login("Демо атлет", "0000"));
  $("logoutButton").addEventListener("click", logout);
  $("tourLauncher").addEventListener("click", () => startTour(false));
  $("accountTourButton").addEventListener("click", () => startTour(false));
  $("tourNext").addEventListener("click", nextTourStep);
  $("tourBack").addEventListener("click", prevTourStep);
  $("tourSkip").addEventListener("click", finishTour);

  ["sex", "goal", "place", "level", "trainingDays", "trainingStyle", "cyclePhase", "limitations"].forEach((id) => {
    $(id).value = data.profile[id];
    $(id).addEventListener("input", () => {
      data.profile[id] = $(id).value;
      data.activeWorkout = null;
      save();
      render();
    });
  });

  ["sleep", "energy", "stress", "pain", "trainingFocus", "readinessNote", "feedback", "resultMinutes", "resultEffort", "resultPain", "resultCompletion"].forEach((id) => {
    $(id).value = data.state[id];
    $(id).addEventListener("input", () => {
      data.state[id] = $(id).type === "range" || $(id).type === "number" ? Number($(id).value) : $(id).value;
      if (id === "trainingFocus") data.activeWorkout = null;
      save();
      render();
    });
  });

  document.querySelectorAll(".plan-tab").forEach((button) => {
    button.addEventListener("click", () => {
      data.activePlan = button.dataset.plan;
      save();
      render();
    });
  });

  document.querySelectorAll(".archive-filter").forEach((button) => {
    button.addEventListener("click", () => {
      data.archiveFilter = button.dataset.archiveFilter;
      save();
      render();
    });
  });

  document.querySelectorAll(".quick-chip").forEach((button) => {
    button.addEventListener("click", () => {
      data.quickMode = button.dataset.mode;
      if (data.quickMode === "tired") {
        data.state.energy = Math.min(data.state.energy, 5);
        data.state.stress = Math.max(data.state.stress, 6);
      }
      if (data.quickMode === "pain") data.state.pain = Math.max(data.state.pain, 6);
      data.activeWorkout = null;
      save();
      syncInputs();
      render();
    });
  });

  document.querySelectorAll(".focus-chip").forEach((button) => {
    button.addEventListener("click", () => {
      const focus = button.dataset.focus;
      if (focus === "circuit") {
        data.profile.trainingStyle = "circuit";
        data.state.trainingFocus = "auto";
      } else {
        data.profile.trainingStyle = data.profile.trainingStyle === "circuit" ? "mixed" : data.profile.trainingStyle;
        data.state.trainingFocus = focus;
      }
      data.activeWorkout = null;
      save();
      syncInputs();
      render();
    });
  });

  $("exerciseList").addEventListener("click", (event) => {
    const setButton = event.target.closest("[data-set]");
    const swapButton = event.target.closest("[data-swap]");
    const acceptButton = event.target.closest("[data-accept]");
    const expandButton = event.target.closest("[data-expand]");
    const infoButton = event.target.closest("[data-info]");
    if (setButton) toggleSet(Number(setButton.dataset.exercise), Number(setButton.dataset.set));
    if (swapButton) swapExercise(Number(swapButton.dataset.swap));
    if (acceptButton) acceptExercise(Number(acceptButton.dataset.accept));
    if (expandButton) expandExercise(Number(expandButton.dataset.expand));
    if (infoButton) openTechnique(Number(infoButton.dataset.info));
  });

  $("exerciseList").addEventListener("input", (event) => {
    const input = event.target.closest("[data-field]");
    if (!input) return;
    updateSetValue(Number(input.dataset.exercise), Number(input.dataset.set), input.dataset.field, input.value);
  });

  $("logDone").addEventListener("click", () => logWorkout("done"));
  $("mobileSaveWorkout").addEventListener("click", () => logWorkout("done"));
  $("logEasy").addEventListener("click", () => logWorkout("easy"));
  $("logHard").addEventListener("click", () => logWorkout("hard"));
  $("resetDemo").addEventListener("click", () => {
    data = structuredClone(defaults);
    save();
    window.location.reload();
  });
  $("closeTechnique").addEventListener("click", closeTechnique);
  $("techniqueModal").addEventListener("click", (event) => {
    if (event.target.id === "techniqueModal") closeTechnique();
  });
  window.addEventListener("resize", applyDeviceMode);
  applyDeviceMode();
}

function applyDeviceMode() {
  const width = window.innerWidth;
  const touch = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  document.body.classList.toggle("device-mobile", width <= 640);
  document.body.classList.toggle("device-tablet", width > 640 && width <= 1060);
  document.body.classList.toggle("device-desktop", width > 1060);
  document.body.classList.toggle("device-touch", touch);
}

function login(name, code) {
  const cleanName = name.trim();
  const cleanCode = code.trim();
  if (!cleanName || !cleanCode) {
    $("authForm").classList.add("shake");
    window.setTimeout(() => $("authForm").classList.remove("shake"), 260);
    return;
  }
  currentUser = {
    id: `${slugify(cleanName)}-${slugify(cleanCode)}`,
    name: cleanName,
  };
  localStorage.setItem(sessionKey, JSON.stringify(currentUser));
  data = load();
  syncInputs();
  render();
  window.setTimeout(() => startTour(true), 250);
}

function logout() {
  localStorage.removeItem(sessionKey);
  currentUser = null;
  data = structuredClone(defaults);
  syncInputs();
  render();
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "") || "user";
}

const tourSteps = [
  {
    target: "#today",
    title: "Старт тренировки",
    text: "Открыл приложение в зале: сначала выбери состояние — готов, устал, 25 минут, болит или кардио.",
  },
  {
    target: ".today-switcher",
    title: "Что тренируешь сегодня",
    text: "Если у тебя уже свой режим, выбери день: грудь, спина, ноги, кардио или круговая. План перестроится сразу.",
  },
  {
    target: "#profile",
    title: "База программы",
    text: "Здесь выбери цель, где тренируешься, уровень, сколько дней в неделю и какой формат удобнее.",
  },
  {
    target: ".sliders",
    title: "Состояние сегодня",
    text: "Сон, энергия, стресс и боль меняют нагрузку. Под шкалами видно, что именно влияет на тренировку.",
  },
  {
    target: "#activeWorkout",
    title: "Работа в зале",
    text: "Отмечай подходы, вес и повторы. После упражнения нажми «Принять данные», карточка свернется.",
  },
  {
    target: "[data-info='0']",
    title: "Техника",
    text: "Кнопка «Техника» показывает картинку и простые шаги: как начать, как сделать движение и где не спешить.",
  },
  {
    target: ".coach-panel",
    title: "Итог тренировки",
    text: "После занятия укажи минуты, сложность, боль после и что удалось выполнить. Это влияет на следующий план.",
  },
  {
    target: "#progress",
    title: "Прогресс",
    text: "Здесь видно, что уже сделано: силовые, кардио, восстановление и общие достижения.",
  },
];

function startTour(auto = false) {
  if (auto && data.tourDone) return;
  tourIndex = 0;
  $("tourOverlay").hidden = false;
  renderTourStep();
}

function renderTourStep() {
  const step = tourSteps[tourIndex];
  const target = document.querySelector(step.target);
  $("tourStepCounter").textContent = `Шаг ${tourIndex + 1} из ${tourSteps.length}`;
  $("tourTitle").textContent = step.title;
  $("tourText").textContent = step.text;
  $("tourBack").disabled = tourIndex === 0;
  $("tourNext").textContent = tourIndex === tourSteps.length - 1 ? "Готово" : "Дальше";
  document.querySelectorAll(".tour-target").forEach((item) => item.classList.remove("tour-target"));
  if (target) {
    target.classList.add("tour-target");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function nextTourStep() {
  if (tourIndex >= tourSteps.length - 1) {
    finishTour();
    return;
  }
  tourIndex += 1;
  renderTourStep();
}

function prevTourStep() {
  tourIndex = Math.max(0, tourIndex - 1);
  renderTourStep();
}

function finishTour() {
  $("tourOverlay").hidden = true;
  document.querySelectorAll(".tour-target").forEach((item) => item.classList.remove("tour-target"));
  data.tourDone = true;
  save();
}

function syncInputs() {
  ["sleep", "energy", "stress", "pain", "trainingFocus", "readinessNote", "feedback", "resultMinutes", "resultEffort", "resultPain", "resultCompletion"].forEach((id) => {
    $(id).value = data.state[id];
  });
}

function getReadiness() {
  const { sleep, energy, stress, pain, readinessNote, feedback } = data.state;
  let score = Math.round(sleep * 9 + energy * 8 - stress * 4 - pain * 5 + 35);
  const notes = `${readinessNote} ${feedback}`.toLowerCase();

  if (/бол|поясн|колен|плеч|устал|разбит|не высп/i.test(notes)) score -= 7;
  if (/заряж|энерг|хорош|готов|легко/i.test(notes)) score += 4;
  if (data.quickMode === "tired") score -= 12;
  if (data.quickMode === "pain") score -= 18;
  if (data.quickMode === "short") score -= 4;

  if (data.profile.sex === "female") {
    if (data.profile.cyclePhase === "menstruation") score -= 12;
    if (data.profile.cyclePhase === "luteal") score -= 5;
    if (data.profile.cyclePhase === "follicular") score += 4;
  }

  const lastHard = data.history.slice(0, 2).some((item) => item.feedback === "hard");
  if (lastHard) score -= 7;
  const lastPain = data.history[0]?.result?.painAfter >= 5;
  if (lastPain) score -= 10;
  const lastPartial = data.history[0]?.result?.completion === "partial";
  if (lastPartial) score -= 5;

  return Math.max(20, Math.min(98, score));
}

function scaleMeta(id, value) {
  const map = {
    sleep: [
      [4, "мало сна: минус к нагрузке", "bad"],
      [6, "сон средний: без рекордов", "warn"],
      [10, "сон нормальный: можно работать", "good"],
    ],
    energy: [
      [4, "энергии мало: короткий план", "bad"],
      [7, "энергия рабочая: держим план", "warn"],
      [10, "энергии много: можно прогрессировать", "good"],
    ],
    stress: [
      [3, "стресс низкий: фокус на прогресс", "good"],
      [6, "стресс средний: оставить запас", "warn"],
      [10, "стресс высокий: снизить интенсивность", "bad"],
    ],
    pain: [
      [3, "боль низкая: контролируем технику", "good"],
      [6, "дискомфорт: нужны замены", "warn"],
      [10, "боль высокая: без прыжков и резких движений", "bad"],
    ],
  }[id];
  return map.find(([limit]) => value <= limit);
}

function stateImpactItems() {
  return ["sleep", "energy", "stress", "pain"].map((id) => {
    const value = data.state[id];
    const [, text, tone] = scaleMeta(id, value);
    const label = { sleep: "Сон", energy: "Энергия", stress: "Стресс", pain: "Боль" }[id];
    const effect = { good: "+", warn: "=", bad: "-" }[tone];
    return { label, value, text, tone, effect };
  });
}

function context(score) {
  const { goal, place, level, trainingDays, trainingStyle, limitations, cyclePhase, sex } = data.profile;
  const injuryText = limitations.toLowerCase();
  const needsLowImpact = /колен|спин|плеч|таз|голен|поясн/i.test(injuryText) || score < 55 || data.quickMode === "pain";
  const cycleDeload = sex === "female" && cyclePhase === "menstruation";
  const luteal = sex === "female" && cyclePhase === "luteal";
  const intensity = score >= 78 ? "high" : score >= 58 ? "medium" : "low";
  const experience = { beginner: 2, middle: 3, advanced: 4 }[level];

  return { goal, place, level, trainingDays: Number(trainingDays), trainingStyle, limitations, sex, cyclePhase, needsLowImpact, cycleDeload, luteal, intensity, experience, quickMode: data.quickMode, focus: data.state.trainingFocus };
}

function exerciseLibrary(place) {
  return {
    gym: {
      push: ["жим гантелей", "жим в тренажере", "разведения на плечи"],
      pull: ["тяга верхнего блока", "горизонтальная тяга", "тяга каната к лицу"],
      legs: ["жим ногами", "румынская тяга", "сгибание ног"],
      chest: ["жим гантелей на наклонной", "жим в тренажере на грудь", "сведение рук в кроссовере"],
      shoulders: ["жим плеч в тренажере", "разведения гантелей в стороны", "тяга каната к лицу"],
      arms: ["разгибание рук на блоке", "подъем гантелей на бицепс", "молотковые сгибания"],
      cardio: ["дорожка в наклоне", "велотренажер", "эллипс"],
      core: ["пресс лежа с движением рук и ног", "планка", "пресс в блоке без поворота корпуса"],
    },
    home: {
      push: ["отжимания", "жим резинки", "плечевой жим с рюкзаком"],
      pull: ["тяга резинки", "тяга полотенца", "обратные разведения"],
      legs: ["присед до стула", "ягодичный мост", "выпады назад"],
      chest: ["отжимания", "жим резинки", "разводка с резинкой"],
      shoulders: ["плечевой жим с рюкзаком", "разведения с бутылками", "обратные разведения"],
      arms: ["разгибание резинки", "сгибание резинки", "узкие отжимания"],
      cardio: ["быстрая ходьба", "круг без прыжков", "ступеньки"],
      core: ["планка", "рука-нога на четвереньках", "скручивания медленно"],
    },
    outdoor: {
      push: ["брусья или отжимания", "отжимания на лавке", "стойка у стены"],
      pull: ["подтягивания или негативы", "австралийская тяга", "вис"],
      legs: ["выпады", "приседания", "шаги на тумбу"],
      chest: ["отжимания на брусьях", "отжимания широкие", "отжимания на лавке"],
      shoulders: ["стойка у стены", "отжимания углом", "обратные разведения"],
      arms: ["узкие отжимания", "подтягивания обратным хватом", "вис на турнике"],
      cardio: ["ходьба в темпе", "легкие ускорения", "лестница"],
      core: ["подъем коленей", "планка", "боковая планка"],
    },
  }[place];
}

function chooseWorkout(score) {
  const ctx = context(score);
  const lib = exerciseLibrary(ctx.place);
  const dose = trainingDose(ctx);
  const short = ctx.quickMode === "short";
  const cardioFirst = ctx.quickMode === "cardio";

  let title = {
    strength: "Сила: все тело",
    muscle: "Мышцы: верх + ноги",
    fatloss: "Снижение веса: силовая + кардио",
    health: "Здоровье: спокойно и без перегруза",
  }[ctx.goal];

  if (ctx.cycleDeload) title = "Легче из-за самочувствия";
  if (ctx.needsLowImpact) title = "День без прыжков";
  if (short) title = "Короткая тренировка";
  if (cardioFirst) title = "Кардио + силовой минимум";
  if (ctx.focus === "chest") title = "Грудь + плечи + руки";
  if (ctx.focus === "back") title = "Спина + бицепс";
  if (ctx.focus === "legs") title = "Ноги + ягодицы";
  if (ctx.focus === "cardioMobility") title = "Дорожка + растяжка";
  if (ctx.trainingStyle === "circuit" && ctx.focus === "auto") title = "Круговая тренировка";

  const focusLine = getFocusLine(ctx, lib, dose);
  const heavyLine = focusLine || (cardioFirst
    ? `${lib.cardio[0]} 20-35 минут + 2 круга: ${lib.core[0]}, ${lib.pull[0]}`
    : ctx.goal === "fatloss"
    ? `${dose.rounds} круга без подходов до предела: ${lib.legs[0]}, ${lib.push[0]}, ${lib.pull[0]}, ${lib.core[0]}`
    : `${dose.sets} подхода: ${lib.legs[0]}, ${lib.push[0]}, ${lib.pull[0]}`);

  const blocks = [
    { title: "Старт", body: startProtocol(ctx, lib) },
    { title: "Силовой блок", body: `${heavyLine}. Повторы ${dose.reps}, отдых ${dose.rest}.` },
    { title: "Почему такой объем", body: dose.reason },
    { title: "Финиш", body: finishText(ctx, lib) },
    { title: "Замена", body: swapText(ctx, lib) },
  ];

  return { title, intensity: ctx.intensity, blocks };
}

function trainingDose(ctx) {
  let sets = { beginner: 2, middle: 3, advanced: 4 }[ctx.level];
  let reps = ctx.goal === "strength" ? [6, 8] : ctx.goal === "muscle" ? [8, 12] : [10, 15];
  let rest = ctx.goal === "strength" ? [90, 120] : ctx.goal === "fatloss" ? [45, 60] : [60, 90];
  let rounds = sets;
  const reasons = [];

  reasons.push(`уровень: ${levelLabel(ctx.level)}`);

  if (ctx.intensity === "high") {
    sets += 1;
    rounds += 1;
    reasons.push("готовность высокая: можно добавить объем");
  }
  if (ctx.intensity === "low") {
    sets -= 1;
    rounds -= 1;
    rest[0] = Math.max(45, rest[0] - 15);
    reasons.push("готовность низкая: меньше подходов");
  }

  if (ctx.goal === "strength") reasons.push("цель сила: меньше повторов, больше отдых");
  if (ctx.goal === "muscle") reasons.push("цель мышцы: средние повторы и рабочие подходы");
  if (ctx.goal === "fatloss") {
    rounds += 1;
    rest = [30, 60];
    reasons.push("цель снижение веса: больше движения и короче отдых");
  }
  if (ctx.goal === "health") {
    sets = Math.min(sets, 3);
    reps = [10, 15];
    reasons.push("цель здоровье: без перегруза");
  }

  if (ctx.sex === "male" && (ctx.goal === "strength" || ctx.goal === "muscle") && ctx.intensity !== "low") {
    sets += 1;
    rest[1] += 30;
    reasons.push("мужской профиль: стартово больше силового объема");
  }
  if (ctx.sex === "female") {
    reps = [Math.max(reps[0], 10), Math.max(reps[1], 12)];
    reasons.push("женский профиль: больше контроля техники и самочувствия");
  }
  if (ctx.cycleDeload) {
    sets = Math.min(sets, 2);
    rounds = Math.min(rounds, 2);
    rest[1] += 30;
    reasons.push("менструация: тренировка легче");
  } else if (ctx.luteal) {
    sets = Math.min(sets, 3);
    rounds = Math.min(rounds, 3);
    reasons.push("перед менструацией: оставляем запас сил");
  } else if (ctx.sex === "female" && ctx.cyclePhase === "follicular" && ctx.intensity !== "low") {
    sets += 1;
    reasons.push("после менструации: можно добавить нагрузку");
  }

  if (ctx.trainingStyle === "circuit") {
    rounds = Math.max(2, Math.min(rounds + (ctx.trainingDays >= 4 ? 1 : 0), 5));
    sets = rounds;
    rest = [20, 45];
    reasons.push("круговая: считаем круги, отдых короче");
  }
  if (ctx.trainingDays <= 2) {
    sets += 1;
    reasons.push("2 дня в неделю: тренировка плотнее");
  }
  if (ctx.trainingDays >= 5) {
    sets = Math.max(2, sets - 1);
    rounds = Math.max(2, rounds - 1);
    reasons.push("5 дней в неделю: один день не перегружаем");
  }
  if (ctx.needsLowImpact) {
    sets = Math.min(sets, 2);
    rounds = Math.min(rounds, 2);
    reps = [10, 15];
    rest[1] += 15;
    reasons.push("есть боль или ограничения: меньше объем");
  }
  if (ctx.quickMode === "short") {
    sets = Math.min(sets, 2);
    rounds = Math.min(rounds, 2);
    reasons.push("25 минут: только главное");
  }
  if (ctx.cycleDeload || ctx.needsLowImpact || ctx.quickMode === "short") {
    sets = Math.min(sets, 2);
    rounds = Math.min(rounds, 2);
  } else if (ctx.luteal) {
    sets = Math.min(sets, 3);
    rounds = Math.min(rounds, 3);
  }

  sets = clamp(sets, 1, 5);
  rounds = clamp(rounds, 1, 5);
  return {
    sets,
    rounds,
    reps: `${reps[0]}-${reps[1]}`,
    rest: `${rest[0]}-${rest[1]} сек`,
    reason: reasons.slice(0, 4).join(". ") + ".",
  };
}

function startProtocol(ctx, lib) {
  if (ctx.place === "gym") {
    return "Дорожка 8-12 мин: скорость 4,5-5, наклон 12-15. Затем 4-6 мин растяжки в движении: плечи, грудь, бедра.";
  }
  if (ctx.place === "home") return "5-8 мин ходьбы или простой разминки суставов. Затем растяжка в движении: верх спины, плечи, бедра.";
  return "8-12 мин быстрой ходьбы. Затем растяжка в движении: плечи, верх спины, бедра.";
}

function getFocusLine(ctx, lib, dose) {
  if (ctx.trainingStyle === "circuit" && ctx.focus === "auto") {
    return `${dose.rounds} круга: ${lib.legs[0]}, ${lib.push[0]}, ${lib.pull[0]}, ${lib.core[0]}, ${lib.cardio[1]}. Работа 30-45 сек, отдых ${dose.rest}`;
  }
  if (ctx.focus === "chest") {
    return `${dose.sets} подхода: ${lib.chest[0]}, ${lib.chest[1]}, ${lib.chest[2]}. Добивка: ${accessoryText(ctx, lib)}`;
  }
  if (ctx.focus === "back") return `${dose.sets} подхода: ${lib.pull[0]}, ${lib.pull[1]}, ${lib.pull[2]}. Добивка: ${lib.arms[1]}`;
  if (ctx.focus === "legs") return `${dose.sets} подхода: ${lib.legs[0]}, ${lib.legs[1]}, ${lib.legs[2]}. В конце: пресс и корпус`;
  if (ctx.focus === "cardioMobility") return `${lib.cardio[0]} 25-40 минут + растяжка 10-15 минут`;
  return "";
}

function accessoryText(ctx, lib) {
  if (ctx.quickMode === "short" || ctx.needsLowImpact) return `${lib.shoulders[1]} или ${lib.arms[0]}`;
  if (ctx.trainingDays >= 5) return `${lib.shoulders[1]}, ${lib.arms[0]}`;
  return `${lib.shoulders[1]}, ${lib.arms[0]}, ${lib.arms[1]}`;
}

function finishText(ctx, lib) {
  if (ctx.quickMode === "short") return `${lib.core[1]} 2 подхода и выход. Лучше коротко, чем пропустить.`;
  if (ctx.quickMode === "cardio") return `${lib.cardio[1]} 8 минут легко или растяжка икр/бедер.`;
  if (ctx.needsLowImpact) return `${lib.core[2]} + дыхание 4 минуты. Завершить без боли.`;
  return `${lib.core[0]} + ${lib.cardio[1]} 8-20 минут по дыханию.`;
}

function swapText(ctx, lib) {
  if (ctx.needsLowImpact) return `Болит: ${lib.legs[0]} заменить на ${lib.legs[1]}, прыжки убрать.`;
  if (ctx.quickMode === "tired") return `Нет сил: убрать последний круг, оставить ${lib.pull[0]} и ${lib.core[0]}.`;
  return `Занято оборудование: меняй на ${lib.push[1]}, ${lib.pull[1]}, ${lib.legs[1]}.`;
}

function correctionText(ctx) {
  if (ctx.cycleDeload) return "Не делать подходы до предела, убрать прыжки и рекорды. Цель дня: размяться, подвигаться и не ухудшить самочувствие.";
  if (ctx.needsLowImpact) return "Любая боль выше 3/10 меняет упражнение. Рабочая нагрузка: 6/10.";
  if (ctx.luteal) return "Оставить запас 2-3 повтора, пить воду и не пытаться поставить рекорд.";
  if (ctx.intensity === "high") return "Если последний подход уверенный, добавить 1 подход или 2,5-5% веса.";
  return "Держать технику и после тренировки отметить, насколько было тяжело.";
}

function coachWhy(score) {
  const ctx = context(score);
  const reasons = [];
  reasons.push(sexReason(ctx));
  reasons.push(goalReason(ctx.goal));
  reasons.push(`уровень: ${levelLabel(ctx.level)}`);
  if (ctx.trainingStyle === "circuit") reasons.push(`${ctx.trainingDays} круговых в неделю`);
  if (ctx.trainingDays <= 2) reasons.push("меньше дней: тренировка плотнее");
  if (ctx.trainingDays >= 5) reasons.push("много дней: объем дня ниже");
  if (ctx.quickMode !== "normal") reasons.push(modeLabel(ctx.quickMode));
  if (score < 58) reasons.push("готовность низкая");
  if (score >= 78) reasons.push("можно прогрессировать");
  if (ctx.needsLowImpact) reasons.push("бережем суставы");
  if (ctx.cycleDeload) reasons.push("учтен цикл");
  if (ctx.goal === "fatloss") reasons.push("кардио в приоритете");
  if (data.history[0]?.result?.painAfter >= 5) reasons.push("после прошлой была боль");
  if (data.history[0]?.result?.completion === "partial") reasons.push("прошлый план не закрыт");
  if (!reasons.length) reasons.push("баланс нормальный");
  return reasons.slice(0, 5);
}

function sexReason(ctx) {
  if (ctx.sex === "male") return "мужской профиль";
  if (ctx.sex === "female") return ctx.cyclePhase === "none" ? "женский профиль" : "женский профиль + цикл";
  return "профиль без пола";
}

function goalReason(goal) {
  return {
    strength: "цель: сила",
    muscle: "цель: мышцы",
    fatloss: "цель: снижение веса",
    health: "цель: здоровье",
  }[goal];
}

function modeLabel(mode) {
  return {
    normal: "обычный день",
    tired: "усталость",
    short: "мало времени",
    pain: "есть боль",
    cardio: "кардио-фокус",
  }[mode];
}

function getNextAction(score) {
  const workout = chooseWorkout(score);
  if (data.quickMode === "short") return "Цель: 25 минут и отметка результата.";
  if (data.quickMode === "pain") return "Цель: закончить без усиления боли.";
  if (workout.intensity === "high") return "Цель: +1 подход или чуть больше веса.";
  if (workout.intensity === "low") return "Цель: сохранить привычку и восстановиться.";
  return "Цель: рабочая техника и запас 2 повтора.";
}

function buildDayPlans(score) {
  const ctx = context(score);
  const lib = exerciseLibrary(ctx.place);
  const main = chooseWorkout(score);
  return [
    {
      title: main.title,
      meta: ["основной выбор", labelIntensity(ctx.intensity), "45-70 мин"],
      body: `Разогрев. ${lib.legs[0]} + ${lib.push[0]} + ${lib.pull[0]}. В конце: пресс и легкое кардио.`,
    },
    {
      title: "Короткая версия",
      meta: ["если мало времени", "25-35 мин", "без лишнего"],
      body: `5 мин старт. 2-3 круга: ${lib.push[0]}, ${lib.pull[0]}, ${lib.legs[1]}, ${lib.core[1]}.`,
    },
    {
      title: "Восстановление",
      meta: ["сон/стресс", "20-40 мин", "низкий пульс"],
      body: `${lib.cardio[0]} 20 мин. Легкая растяжка. ${lib.core[2]}. Без подходов до предела.`,
    },
  ];
}

function buildWeekPlans(score) {
  const ctx = context(score);
  const lib = exerciseLibrary(ctx.place);
  const cardioDose = ctx.goal === "fatloss" ? "30-40 мин" : "18-25 мин";
  const strengthDays = ctx.trainingDays;

  if (ctx.trainingStyle === "circuit") {
    return [
      {
        title: `Неделя: ${ctx.trainingDays} круговых`,
        meta: ["круговой стиль", `${ctx.trainingDays} дня`, "работа + отдых"],
        body: circuitWeekBody(ctx, lib),
      },
      {
        title: "Круговая + восстановление",
        meta: ["если усталость", "ровное дыхание", "без подходов до предела"],
        body: "2-3 круга, работа 30-40 сек. Между днями: ходьба, растяжка, сон.",
      },
      {
        title: "Круговая: как усложнять",
        meta: ["каждую неделю", "+1 круг", "или меньше отдых"],
        body: "Сначала добавляй качество техники. Потом +1 круг или -10 сек отдыха.",
      },
    ];
  }

  return [
    {
      title: `Неделя: ${strengthDays} силовых + кардио`,
      meta: ["план под состояние", `${strengthDays} силовых`, "1 легкий день"],
      body: `Пн: ноги + тяга. Ср: жим + пресс. Пт: все тело. Кардио: ${cardioDose}.`,
    },
    {
      title: "Неделя: восстановительный уклон",
      meta: ["стресс/цикл/боль", "легче обычного", "регулярность"],
      body: "2 силовые, 2 легких кардио, 1 растяжка. Вес не форсировать.",
    },
    {
      title: "Неделя: как добавить нагрузку",
      meta: ["если готовность высокая", "чуть больше нагрузки", "отметить сложность"],
      body: "Главное движение: +1 подход или немного больше веса. После тренировки отметить легко/тяжело.",
    },
  ];
}

function circuitWeekBody(ctx, lib) {
  const variants = {
    2: `День 1: все тело. День 2: ${lib.cardio[0]} + круг легче.`,
    3: "Пн: все тело. Ср: верх + пресс. Пт: ноги + кардио.",
    4: "Пн: все тело. Вт: кардио + пресс. Чт: верх. Сб: ноги + растяжка.",
    5: "3 круговых дня, 1 кардио, 1 восстановительная растяжка. Один день обязательно легкий.",
  };
  return variants[ctx.trainingDays] || variants[3];
}

function buildMonthPlans(score) {
  const ctx = context(score);
  const goalLine = {
    strength: "главные упражнения, техника, постепенный рост веса",
    muscle: "больше рабочих подходов, спокойный темп, достаточно еды",
    fatloss: "силовые, кардио, есть чуть меньше без голода",
    health: "регулярность, суставы, сердце, осанка",
  }[ctx.goal];

  return [
    {
      title: ctx.trainingStyle === "circuit" ? "4 недели: круговая база" : "4 недели: базовый план",
      meta: ["месяц", "3 недели рост", "1 неделя легче"],
      body: ctx.trainingStyle === "circuit"
        ? `1: учимся делать круги. 2: +1 круг. 3: чуть меньше отдых. 4: легче на 30-40%. ${ctx.trainingDays} дня/нед.`
        : `1: вход в режим. 2: чуть больше работы. 3: самая рабочая неделя. 4: легче на 30-40%. Фокус: ${goalLine}.`,
    },
    {
      title: "4 недели: снижение веса без потери сил",
      meta: ["кардио", "шаги", "силовые"],
      body: "2-3 силовые, 2 кардио, шаги каждый день. Белок в каждом приеме пищи, без голодовок.",
    },
    {
      title: "4 недели: с учетом женского цикла",
      meta: ["самочувствие", "цикл", "без героизма"],
      body: "Главное не дата в календаре, а самочувствие. Цикл помогает вовремя сделать тренировку легче.",
    },
  ];
}

function labelIntensity(value) {
  return { high: "можно добавить", medium: "рабочая", low: "легче обычного" }[value];
}

function getSignals(score) {
  const signals = [];
  const { sleep, energy, stress, pain } = data.state;
  if (sleep <= 5) signals.push(["Сон", "снизить вес и не работать до предела"]);
  if (energy >= 8 && score > 70) signals.push(["Энергия", "можно добавить нагрузку"]);
  if (stress >= 7) signals.push(["Стресс", "ровный темп и длинная разминка"]);
  if (pain >= 5) signals.push(["Боль", "замена болезненных движений"]);
  if (data.profile.sex === "female" && data.profile.cyclePhase !== "none") {
    signals.push(["Цикл", cycleAdvice(data.profile.cyclePhase)]);
  }
  if (!signals.length) signals.push(["Баланс", "тренируйся по плану"]);
  return signals;
}

function cycleAdvice(phase) {
  return {
    menstruation: "сделать легче, без рекордов",
    follicular: "можно добавить нагрузку, если самочувствие хорошее",
    ovulation: "следить за техникой и суставами",
    luteal: "больше отдыха и запас сил",
    none: "не учитывается",
  }[phase];
}

function getNutrition(score) {
  const goalText = {
    strength: "До: углеводы. После: белок.",
    muscle: "Белок в каждый прием. Еда вокруг тренировки.",
    fatloss: "Белок + овощи. Есть чуть меньше, но не голодать.",
    health: "Вода, клетчатка, регулярность.",
  }[data.profile.goal];

  const recovery =
    score < 55
      ? "Сегодня не урезать еду: восстановление важнее."
      : "В течение 2-3 часов: белок + углеводы.";

  return [goalText, recovery, "Минимум дневника: вода, белок, самочувствие."];
}

function ensureActiveWorkout(score) {
  const ctx = context(score);
  const signature = JSON.stringify({
    place: ctx.place,
    goal: ctx.goal,
    level: ctx.level,
    sex: ctx.sex,
    cyclePhase: ctx.cyclePhase,
    limitations: ctx.limitations,
    focus: ctx.focus,
    trainingDays: ctx.trainingDays,
    trainingStyle: ctx.trainingStyle,
    mode: data.quickMode,
    intensity: ctx.intensity,
    needsLowImpact: ctx.needsLowImpact,
    cycleDeload: ctx.cycleDeload,
  });

  if (data.activeWorkout?.signature === signature && data.activeWorkout.exercises?.length) {
    return data.activeWorkout;
  }

  data.activeWorkout = {
    signature,
    startedAt: new Date().toISOString(),
    exercises: buildActiveExercises(score),
  };
  save();
  return data.activeWorkout;
}

function buildActiveExercises(score) {
  const ctx = context(score);
  const lib = exerciseLibrary(ctx.place);
  const dose = trainingDose(ctx);
  const baseSets = dose.sets;
  const reps = Number(dose.reps.split("-")[0]) || 10;
  const weight = ctx.place === "gym" ? 20 : 0;
  const names = activeExerciseNames(ctx, lib);

  return names.map((name, index) => ({
    name,
    target: targetForExercise(name, index, ctx, baseSets, reps),
    alternatives: alternativesFor(name, lib),
    accepted: false,
    sets: Array.from({ length: isWarmupExercise(name) || (index === 0 && ctx.quickMode === "cardio") ? 1 : baseSets }, () => ({
      reps,
      weight,
      done: false,
    })),
  }));
}

function activeExerciseNames(ctx, lib) {
  const warmup = ctx.place === "gym" ? "дорожка 4,5-5 / наклон 15 + растяжка" : `${lib.cardio[0]} + растяжка`;
  const maxMain = ctx.quickMode === "short" || ctx.needsLowImpact || ctx.trainingDays >= 5 ? 3 : 6;
  if (ctx.trainingStyle === "circuit" && ctx.focus === "auto") return [warmup, lib.legs[0], lib.push[0], lib.pull[0], lib.core[0], lib.cardio[1]].slice(0, maxMain + 2);
  if (ctx.focus === "chest") return [warmup, ...lib.chest, lib.shoulders[1], lib.arms[0], lib.arms[1]].slice(0, maxMain + 1);
  if (ctx.focus === "back") return [warmup, ...lib.pull, lib.arms[1]].slice(0, maxMain + 1);
  if (ctx.focus === "legs") return [warmup, ...lib.legs, lib.core[0]].slice(0, maxMain + 1);
  if (ctx.focus === "cardioMobility") return [warmup, lib.cardio[0], "растяжка 10-15 минут"];
  if (ctx.quickMode === "cardio") return [warmup, lib.cardio[0], lib.pull[0], lib.core[0]];
  return [warmup, lib.legs[0], lib.push[0], lib.pull[0], lib.core[0]].slice(0, maxMain + 1);
}

function isWarmupExercise(name) {
  return /дорож|растяж|размин|ходь/.test(name.toLowerCase());
}

function targetForExercise(name, index, ctx, baseSets, reps) {
  if (isWarmupExercise(name)) return index === 0 ? "8-12 мин + растяжка" : "10-15 мин";
  if (ctx.trainingStyle === "circuit" && ctx.focus === "auto") return `${baseSets} круга · 40 сек`;
  if (ctx.quickMode === "cardio" && index === 1) return "20-35 мин";
  return `${baseSets} x ${reps}`;
}

function levelLabel(value) {
  return { beginner: "начинающий", middle: "средний", advanced: "опытный" }[value] || "начинающий";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function alternativesFor(name, lib) {
  if (isWarmupExercise(name)) return [lib.cardio[1], lib.cardio[2], "суставная разминка"];
  const all = [...lib.legs, ...lib.push, ...lib.pull, ...lib.chest, ...lib.shoulders, ...lib.arms, ...lib.core, ...lib.cardio];
  return all.filter((item) => item !== name).slice(0, 3);
}

function toggleSet(exerciseIndex, setIndex) {
  const workout = data.activeWorkout;
  if (!workout?.exercises[exerciseIndex]?.sets[setIndex]) return;
  const set = workout.exercises[exerciseIndex].sets[setIndex];
  set.done = !set.done;
  workout.exercises[exerciseIndex].accepted = false;
  applyActiveWorkoutResult();
  save();
  render();
}

function updateSetValue(exerciseIndex, setIndex, field, value) {
  const set = data.activeWorkout?.exercises[exerciseIndex]?.sets[setIndex];
  if (!set) return;
  set[field] = Number(value) || 0;
  data.activeWorkout.exercises[exerciseIndex].accepted = false;
  applyActiveWorkoutResult();
  save();
}

function swapExercise(exerciseIndex) {
  const exercise = data.activeWorkout?.exercises[exerciseIndex];
  if (!exercise?.alternatives.length) return;
  const next = exercise.alternatives.shift();
  exercise.alternatives.push(exercise.name);
  exercise.name = next;
  exercise.accepted = false;
  save();
  render();
}

function acceptExercise(exerciseIndex) {
  const exercise = data.activeWorkout?.exercises[exerciseIndex];
  if (!exercise) return;
  exercise.accepted = true;
  applyActiveWorkoutResult();
  save();
  render();
}

function expandExercise(exerciseIndex) {
  const exercise = data.activeWorkout?.exercises[exerciseIndex];
  if (!exercise) return;
  exercise.accepted = false;
  save();
  render();
}

function exerciseSummary(exercise) {
  const doneSets = exercise.sets.filter((set) => set.done);
  const volume = doneSets.reduce((sum, set) => sum + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0);
  const best = doneSets[0] ? `${doneSets[0].weight} кг x ${doneSets[0].reps}` : "нет отмеченных подходов";
  return `${doneSets.length}/${exercise.sets.length} подходов · ${best}${volume ? ` · всего кг за подходы ${volume}` : ""}`;
}

function exerciseTechnique(name) {
  const lower = name.toLowerCase();
  if (/жим ног|присед|выпад|мост|шаги/.test(lower)) return techniqueLibrary.legs;
  if (/тяга верх|горизонт|резин|полотен|подтяг|австрал|канат|лицу|вис/.test(lower)) return techniqueLibrary.pull;
  if (/жим|отжим|брусь|плеч|развед/.test(lower)) return techniqueLibrary.push;
  if (/планк|пресс|рука-нога|скручив|поворот|подъем колен|корпус|боковая/.test(lower)) return techniqueLibrary.core;
  if (/дорож|вело|эллипс|ходь|кардио|лестниц|ускор|ступень|растяж|размин/.test(lower)) return techniqueLibrary.cardio;
  return techniqueLibrary.general;
}

const techniqueLibrary = {
  push: {
    title: "Жим / отжимание",
    kind: "push",
    purpose: "Для груди, плеч и задней части руки. Толкай вес от себя спокойно, плечи держи устойчиво.",
    source: "https://www.anterides.com/exercise/213/flat-bench-dumbbell-press",
    steps: ["Лопатки собрать, стопы поставить устойчиво.", "Опустить вес контролируемо к линии груди.", "Выжать вверх без рывка и без жесткого замка в локтях."],
  },
  pull: {
    title: "Тяга на спину",
    kind: "pull",
    purpose: "Для спины. Сначала опусти плечи и сведи лопатки, потом тяни вес.",
    source: "https://scoutlife.org/fitness-first/blgym/173590/how-to-do-lat-pulldowns-correctly/",
    steps: ["Сесть ровно и не отклоняться сильно назад.", "Потянуть локти вниз и назад, свести лопатки.", "Вернуть вес медленно, без броска."],
  },
  legs: {
    title: "Ноги / жим платформы",
    kind: "legs",
    purpose: "Для ног и ягодиц. Колени должны смотреть туда же, куда носки.",
    source: "https://goodmindandbody.com/reasons-for-knee-pain-after-leg-press/",
    steps: ["Поставить стопы устойчиво, колени не заваливать внутрь.", "Опускаться контролируемо до комфортной глубины.", "Толкать через всю стопу, не выпрямлять колени в жесткий замок."],
  },
  core: {
    title: "Кор / планка",
    kind: "core",
    purpose: "Для пресса и устойчивости тела. Поясницу не проваливай, дыши ровно.",
    source: "https://www.skimble.com/exercises/58675-bridge-to-plank-how-to-do-exercise",
    steps: ["Локти или ладони поставить под плечами.", "Напрячь пресс и ягодицы, вытянуть тело в линию.", "Дышать спокойно, не проваливать поясницу."],
  },
  cardio: {
    title: "Кардио",
    kind: "cardio",
    purpose: "Для сердца и выносливости. Темп должен быть таким, чтобы ты мог сказать короткую фразу.",
    source: "https://en.wikipedia.org/wiki/Treadmill",
    steps: ["Начать с 3-5 минут легкого темпа.", "Держать ровное дыхание и устойчивую технику.", "Закончить 2-3 минутами заминки."],
  },
  general: {
    title: "Техника упражнения",
    kind: "general",
    purpose: "Делай движение спокойно, без боли и без потери контроля.",
    source: "https://commons.wikimedia.org/",
    steps: ["Сначала настрой позицию и дыхание.", "Сделай повтор медленно и контролируемо.", "Остановись, если боль усиливается."],
  },
};

function techniqueDiagram(technique) {
  const captions = {
    push: ["Раз: опусти", "Два: выжми"],
    pull: ["Раз: потяни", "Два: верни"],
    legs: ["Раз: согни", "Два: толкни"],
    core: ["Раз: линия", "Два: держи"],
    cardio: ["Раз: разгон", "Два: ровно"],
    general: ["Раз: контроль", "Два: спокойно"],
  }[technique.kind || "general"];

  const figures = {
    push: '<path d="M115 205h120M140 175l55 30M195 205l40-32M385 185h120M410 170l55 15M465 185l40-18" />',
    pull: '<path d="M110 95h130M175 95v110M140 145l35 60M210 145l-35 60M370 95h130M435 95v110M398 145l37 60M472 145l-37 60" />',
    legs: '<path d="M125 110l70 65M195 175l-35 55M375 110l95 40M470 150l-10 80M95 235h160M340 235h180" />',
    core: '<path d="M95 205h150M115 205l40-50M245 205l-70-50M360 190h170M380 190l65-28M530 190l-75-28" />',
    cardio: '<path d="M90 230h180M125 185l55 45M180 230l45-55M350 230h180M388 175l68 55M456 230l48-42" />',
    general: '<path d="M110 215h130M140 165l65 50M205 215l35-40M370 215h130M400 165l65 50M465 215l35-40" />',
  }[technique.kind || "general"];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 620 360">
      <rect width="620" height="360" fill="#f5f7ef"/>
      <rect x="24" y="24" width="270" height="280" rx="18" fill="#101611"/>
      <rect x="326" y="24" width="270" height="280" rx="18" fill="#101611"/>
      <text x="48" y="64" font-family="Arial" font-size="28" font-weight="800" fill="#d7ff38">${captions[0]}</text>
      <text x="350" y="64" font-family="Arial" font-size="28" font-weight="800" fill="#d7ff38">${captions[1]}</text>
      <g fill="none" stroke="#f4f7ef" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">${figures}</g>
      <circle cx="155" cy="125" r="24" fill="#16d48f"/>
      <circle cx="415" cy="125" r="24" fill="#16d48f"/>
      <text x="34" y="336" font-family="Arial" font-size="19" font-weight="700" fill="#17211b">${technique.title}: схема выполнения</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function openTechnique(exerciseIndex) {
  const exercise = data.activeWorkout?.exercises[exerciseIndex];
  if (!exercise) return;
  const technique = exerciseTechnique(exercise.name);
  $("techniqueTitle").textContent = exercise.name;
  $("techniquePurpose").textContent = technique.purpose;
  $("techniqueImage").src = techniqueDiagram(technique);
  $("techniqueImage").alt = technique.title;
  $("techniqueSource").href = technique.source;
  $("techniqueSteps").innerHTML = technique.steps.map((step) => `<li>${step}</li>`).join("");
  $("techniqueModal").hidden = false;
}

function closeTechnique() {
  $("techniqueModal").hidden = true;
}

function workoutProgress() {
  const sets = data.activeWorkout?.exercises.flatMap((exercise) => exercise.sets) || [];
  if (!sets.length) return { done: 0, total: 0, percent: 0 };
  const done = sets.filter((set) => set.done).length;
  return { done, total: sets.length, percent: Math.round((done / sets.length) * 100) };
}

function applyActiveWorkoutResult() {
  const progress = workoutProgress();
  data.state.resultCompletion = progress.percent >= 90 ? "full" : progress.percent >= 45 ? "partial" : data.state.resultCompletion;
  if (progress.percent >= 100) data.state.resultEffort = data.state.resultEffort === "easy" ? "easy" : "done";
  syncInputs();
}

function activeSummary() {
  return (data.activeWorkout?.exercises || []).map((exercise) => ({
    name: exercise.name,
    doneSets: exercise.sets.filter((set) => set.done).length,
    totalSets: exercise.sets.length,
    volume: exercise.sets
      .filter((set) => set.done)
      .reduce((sum, set) => sum + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0),
  }));
}

function logWorkout(feedback) {
  const score = getReadiness();
  const workout = chooseWorkout(score);
  applyActiveWorkoutResult();
  const kind = workout.blocks[2].body.includes("20 минут") || data.profile.goal === "fatloss"
    ? "cardio"
    : workout.intensity === "low"
      ? "mobility"
      : "strength";

  data.history.unshift({
    date: new Date().toLocaleDateString("ru-RU"),
    title: workout.title,
    score,
    feedback,
    kind,
    note: data.state.feedback.trim(),
    result: {
      minutes: Number(data.state.resultMinutes) || 0,
      effort: data.state.resultEffort,
      painAfter: Number(data.state.resultPain) || 0,
      completion: data.state.resultCompletion,
      exercises: activeSummary(),
    },
  });
  data.history = data.history.slice(0, 20);
  data.activeWorkout = null;
  save();
  render();
}

function renderPlanOptions(score) {
  document.querySelectorAll(".plan-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.plan === data.activePlan);
  });

  const builders = {
    day: buildDayPlans,
    week: buildWeekPlans,
    month: buildMonthPlans,
  };

  $("planOptions").innerHTML = builders[data.activePlan](score)
    .map(
      (plan) => `
        <article class="plan-card">
          <strong>${plan.title}</strong>
          <div class="meta">${plan.meta.map((item) => `<span class="chip">${item}</span>`).join("")}</div>
          <p>${plan.body}</p>
        </article>
      `,
    )
    .join("");
}

function renderActiveWorkout(score) {
  const workout = ensureActiveWorkout(score);
  const progress = workoutProgress();
  $("activeProgress").textContent = `${progress.percent}%`;
  $("exerciseList").innerHTML = workout.exercises
    .map(
      (exercise, exerciseIndex) => `
        <article class="exercise-card ${exercise.accepted ? "accepted" : ""}">
          <div class="exercise-head">
            <div>
              <strong>${exercise.name}</strong>
              <span>${exercise.target}</span>
              <small>${exerciseTechnique(exercise.name).purpose}</small>
            </div>
            <div class="exercise-actions">
              <button class="secondary mini-button" data-info="${exerciseIndex}">Техника</button>
              ${
                exercise.accepted
                  ? `<button class="secondary mini-button" data-expand="${exerciseIndex}">Развернуть</button>`
                  : `<button class="secondary mini-button" data-swap="${exerciseIndex}">Заменить</button>`
              }
            </div>
          </div>
          ${
            exercise.accepted
              ? `<div class="accepted-summary">${exerciseSummary(exercise)}</div>`
              : `
                <div class="set-grid">
                  ${exercise.sets
                    .map(
                      (set, setIndex) => `
                        <div class="set-row ${set.done ? "done" : ""}">
                          <button class="set-check" data-exercise="${exerciseIndex}" data-set="${setIndex}">${set.done ? "✓" : setIndex + 1}</button>
                          <label>
                            кг
                            <input data-field="weight" data-exercise="${exerciseIndex}" data-set="${setIndex}" type="number" min="0" value="${set.weight}" />
                          </label>
                          <label>
                            повт.
                            <input data-field="reps" data-exercise="${exerciseIndex}" data-set="${setIndex}" type="number" min="0" value="${set.reps}" />
                          </label>
                        </div>
                      `,
                    )
                    .join("")}
                </div>
                <button class="accept-button" data-accept="${exerciseIndex}">Принять данные</button>
              `
          }
        </article>
      `,
    )
    .join("");
}

function render() {
  const score = getReadiness();
  const workout = chooseWorkout(score);
  $("authOverlay").hidden = Boolean(currentUser);
  document.body.classList.toggle("locked", !currentUser);
  $("currentUserLabel").textContent = currentUser?.name || "Гость";
  $("userHistoryCount").textContent = `${data.history.length} ${plural(data.history.length, "тренировка", "тренировки", "тренировок")}`;

  document.querySelectorAll(".quick-chip").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === data.quickMode);
  });
  document.querySelectorAll(".focus-chip").forEach((button) => {
    const active = button.dataset.focus === "circuit"
      ? data.profile.trainingStyle === "circuit" && data.state.trainingFocus === "auto"
      : data.state.trainingFocus === button.dataset.focus && data.profile.trainingStyle !== "circuit";
    button.classList.toggle("active", active);
  });

  $("cycleField").style.display = data.profile.sex === "female" ? "grid" : "none";
  $("readinessScore").textContent = score;
  $("readinessTitle").textContent = score >= 78 ? "Высокая" : score >= 58 ? "Рабочая" : "Снизить темп";
  $("readinessText").textContent =
    score >= 78
      ? "Сегодня можно добавить нагрузку: вес, подход или более чистую технику."
      : score >= 58
        ? "Нагрузка рабочая: тренируемся уверенно, но оставляем запас и слушаем суставы."
        : "Сегодня лучше сделать легче: размяться, двигаться спокойно, следить за техникой и восстановиться.";

  renderStateScales();

  $("signals").innerHTML = getSignals(score)
    .map(([title, body]) => `<div class="signal"><strong>${title}</strong><span>${body}</span></div>`)
    .join("");

  $("workoutName").textContent = workout.title;
  $("workoutBadge").textContent = labelIntensity(workout.intensity);
  $("workoutBlocks").innerHTML = workout.blocks
    .map((block) => `<div class="workout-step"><strong>${block.title}</strong><span>${block.body}</span></div>`)
    .join("");
  renderActiveWorkout(score);

  $("coachWhy").innerHTML = coachWhy(score)
    .map((reason) => `<span class="reason-pill">${reason}</span>`)
    .join("");
  $("nextAction").textContent = getNextAction(score);

  renderPlanOptions(score);

  $("nutritionAdvice").innerHTML = getNutrition(score)
    .map((tip) => `<div class="meal-tip">${tip}</div>`)
    .join("");

  const counts = data.history.reduce(
    (acc, item) => {
      acc[item.kind] = (acc[item.kind] || 0) + 1;
      return acc;
    },
    { strength: 0, cardio: 0, mobility: 0 },
  );
  $("strengthCount").textContent = counts.strength;
  $("cardioCount").textContent = counts.cardio;
  $("mobilityCount").textContent = counts.mobility;

  $("history").innerHTML = data.history.length
    ? data.history
        .map(
          (item) =>
            `<li><strong>${item.date}: ${item.title}</strong><br><span>${historyLine(item)}</span></li>`,
        )
        .join("")
    : "<li>Пока нет сохраненных тренировок.</li>";

  $("achievement").innerHTML = getAchievement(counts);
  $("reminder").textContent = getReminder(counts);
  renderArchive();
}

function renderArchive() {
  document.querySelectorAll(".archive-filter").forEach((button) => {
    button.classList.toggle("active", button.dataset.archiveFilter === data.archiveFilter);
  });

  const totalMinutes = data.history.reduce((sum, item) => sum + (item.result?.minutes || 0), 0);
  const lastTitle = data.history[0]?.title || "пока нет";
  $("archiveStats").innerHTML = `
    <div><span>Всего</span><strong>${data.history.length}</strong></div>
    <div><span>Минуты</span><strong>${totalMinutes}</strong></div>
    <div><span>Последняя</span><strong>${escapeHtml(lastTitle)}</strong></div>
  `;

  const filtered = data.archiveFilter === "all"
    ? data.history
    : data.history.filter((item) => item.kind === data.archiveFilter);

  $("archiveList").innerHTML = filtered.length
    ? filtered.map((item, index) => archiveCard(item, index)).join("")
    : `<div class="archive-empty">В этом фильтре пока нет тренировок.</div>`;
}

function renderStateScales() {
  $("focusValue").textContent = focusLabel(data.state.trainingFocus);
  ["sleep", "energy", "stress", "pain"].forEach((id) => {
    const value = data.state[id];
    const [, text, tone] = scaleMeta(id, value);
    $(`${id}Value`).textContent = `${value}/10`;
    $(`${id}Hint`).textContent = text;
    $(`${id}Hint`).dataset.tone = tone;
  });
  $("stateImpact").innerHTML = stateImpactItems()
    .map((item) => `<div class="impact-pill ${item.tone}"><strong>${item.effect}</strong><span>${item.label}: ${item.text}</span></div>`)
    .join("");
}

function focusLabel(value) {
  return {
    auto: "авто",
    chest: "грудь",
    back: "спина",
    legs: "ноги",
    cardioMobility: "кардио",
    circuit: "круговая",
  }[value] || "авто";
}

function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function labelFeedback(value) {
  return { done: "по плану", easy: "легко", hard: "тяжело" }[value];
}

function historyLine(item) {
  const result = item.result;
  const parts = [`готовность ${item.score}`, `отзыв: ${labelFeedback(item.feedback)}`];
  if (result) {
    parts.push(`${result.minutes} мин`);
    parts.push(`сделано: ${labelCompletion(result.completion)}`);
    const doneSets = (result.exercises || []).reduce((sum, exercise) => sum + exercise.doneSets, 0);
    if (doneSets) parts.push(`${doneSets} подхода`);
    if (result.painAfter >= 5) parts.push("боль после");
  }
  if (item.note) parts.push(`заметка: ${item.note}`);
  return escapeHtml(parts.join(", "));
}

function archiveCard(item, index) {
  const result = item.result || {};
  const exercises = result.exercises || [];
  const doneSets = exercises.reduce((sum, exercise) => sum + exercise.doneSets, 0);
  const totalSets = exercises.reduce((sum, exercise) => sum + exercise.totalSets, 0);
  const totalWeight = exercises.reduce((sum, exercise) => sum + (exercise.volume || 0), 0);
  const exerciseRows = exercises.length
    ? exercises.map((exercise) => `
        <li>
          <strong>${escapeHtml(exercise.name)}</strong>
          <span>${exercise.doneSets}/${exercise.totalSets} подходов${exercise.volume ? ` · всего кг ${exercise.volume}` : ""}</span>
        </li>
      `).join("")
    : "<li><span>Упражнения не были отмечены.</span></li>";

  return `
    <details class="archive-card" ${index === 0 ? "open" : ""}>
      <summary>
        <span>
          <strong>${escapeHtml(item.date)} · ${escapeHtml(item.title)}</strong>
          <small>${archiveKindLabel(item.kind)} · ${result.minutes || 0} мин · ${labelCompletion(result.completion)}</small>
        </span>
        <em>${item.score}</em>
      </summary>
      <div class="archive-detail-grid">
        <div><span>Сложность</span><strong>${labelFeedback(result.effort) || labelFeedback(item.feedback)}</strong></div>
        <div><span>Боль после</span><strong>${painLabel(result.painAfter)}</strong></div>
        <div><span>Подходы</span><strong>${doneSets}/${totalSets}</strong></div>
        <div><span>Всего кг</span><strong>${totalWeight}</strong></div>
      </div>
      <ul class="archive-exercises">${exerciseRows}</ul>
      ${item.note ? `<p class="archive-note">Заметка: ${escapeHtml(item.note)}</p>` : ""}
    </details>
  `;
}

function labelCompletion(value) {
  return { full: "весь план", partial: "часть", extra: "с запасом" }[value] || value;
}

function archiveKindLabel(value) {
  return { strength: "силовая", cardio: "кардио", mobility: "восстановление" }[value] || "тренировка";
}

function painLabel(value) {
  const pain = Number(value) || 0;
  if (pain >= 8) return "сильная";
  if (pain >= 5) return "заметная";
  if (pain >= 2) return "легкая";
  return "нет";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getReminder(counts) {
  if (counts.cardio === 0) return "Напоминание: добавить кардио в ближайшие 1-2 тренировки.";
  if (counts.mobility === 0 && data.history.length >= 3) return "Напоминание: добавить растяжку или легкое восстановление в расписание.";
  if (counts.strength === 0) return "Напоминание: нужна силовая база для основных мышечных групп.";
  return "Баланс нормальный. Следующая настройка зависит от того, что ты отметишь после тренировки.";
}

function getAchievement(counts) {
  const total = data.history.length;
  if (!total) return "<strong>Старт</strong><span>Первая тренировка откроет прогресс.</span>";
  const minutes = data.history.reduce((sum, item) => sum + (item.result?.minutes || 0), 0);
  if (minutes >= 180) return "<strong>3 часа работы</strong><span>Накопленная нагрузка растет.</span>";
  if (total === 1) return "<strong>1 тренировка</strong><span>Маршрут начат.</span>";
  if (counts.strength >= 3) return "<strong>Сила растет</strong><span>3+ силовые в журнале.</span>";
  if (counts.cardio >= 2) return "<strong>Сердце в деле</strong><span>Кардио вошло в ритм.</span>";
  return `<strong>${total} тренировок</strong><span>Продолжаем серию.</span>`;
}

bindInputs();
render();
