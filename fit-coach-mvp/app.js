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
  quickMode: "normal",
  activeWorkout: null,
  history: [],
};

const storageKey = "kam-fit-coach-mvp";
const sessionKey = `${storageKey}:current-user`;
const $ = (id) => document.getElementById(id);

let currentUser = loadCurrentUser();
let data = currentUser ? load() : structuredClone(defaults);

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
      [10, "боль высокая: низкоударный режим", "bad"],
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

  return { goal, place, level, trainingDays: Number(trainingDays), trainingStyle, needsLowImpact, cycleDeload, luteal, intensity, experience, quickMode: data.quickMode, focus: data.state.trainingFocus };
}

function exerciseLibrary(place) {
  return {
    gym: {
      push: ["жим гантелей", "жим в тренажере", "разведения на плечи"],
      pull: ["тяга верхнего блока", "горизонтальная тяга", "face pull"],
      legs: ["жим ногами", "румынская тяга", "сгибание ног"],
      chest: ["жим гантелей на наклонной", "жим в тренажере на грудь", "сведение рук в кроссовере"],
      shoulders: ["жим плеч в тренажере", "разведения гантелей в стороны", "face pull"],
      arms: ["разгибание рук на блоке", "подъем гантелей на бицепс", "молотковые сгибания"],
      cardio: ["дорожка в наклоне", "велотренажер", "эллипс"],
      core: ["dead bug", "планка", "анти-ротация в блоке"],
    },
    home: {
      push: ["отжимания", "жим резинки", "плечевой жим с рюкзаком"],
      pull: ["тяга резинки", "тяга полотенца", "обратные разведения"],
      legs: ["присед до стула", "ягодичный мост", "выпады назад"],
      chest: ["отжимания", "жим резинки", "разводка с резинкой"],
      shoulders: ["плечевой жим с рюкзаком", "разведения с бутылками", "обратные разведения"],
      arms: ["разгибание резинки", "сгибание резинки", "узкие отжимания"],
      cardio: ["быстрая ходьба", "низкоударный круг", "ступеньки"],
      core: ["планка", "bird dog", "скручивания медленно"],
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
  const short = ctx.quickMode === "short";
  const cardioFirst = ctx.quickMode === "cardio";
  const rounds = short ? 2 : ctx.intensity === "high" ? ctx.experience + 1 : ctx.intensity === "medium" ? ctx.experience : 2;
  const reps = ctx.intensity === "high" ? "6-10" : ctx.intensity === "medium" ? "8-12" : "10-15 спокойно";
  const rest = ctx.intensity === "high" ? "90-120 сек" : ctx.intensity === "medium" ? "60-90 сек" : "45-60 сек";

  let title = {
    strength: "Сила: полный корпус",
    muscle: "Гипертрофия: верх + ноги",
    fatloss: "Метаболика: силовая + кардио",
    health: "Тонус: движение без перегруза",
  }[ctx.goal];

  if (ctx.cycleDeload) title = "Мягкая тренировка с учетом цикла";
  if (ctx.needsLowImpact) title = "Низкоударный день";
  if (short) title = "Короткая тренировка";
  if (cardioFirst) title = "Кардио + силовой минимум";
  if (ctx.focus === "chest") title = "Грудь + плечи + руки";
  if (ctx.focus === "back") title = "Спина + бицепс";
  if (ctx.focus === "legs") title = "Ноги + ягодицы";
  if (ctx.focus === "cardioMobility") title = "Дорожка + растяжка";
  if (ctx.trainingStyle === "circuit" && ctx.focus === "auto") title = "Круговая тренировка";

  const focusLine = getFocusLine(ctx, lib, rounds, reps);
  const heavyLine = focusLine || (cardioFirst
    ? `${lib.cardio[0]} 20-35 минут + 2 круга: ${lib.core[0]}, ${lib.pull[0]}`
    : ctx.goal === "fatloss"
    ? `${rounds} круга без отказа: ${lib.legs[0]}, ${lib.push[0]}, ${lib.pull[0]}, ${lib.core[0]}`
    : `${rounds} подхода: ${lib.legs[0]}, ${lib.push[0]}, ${lib.pull[0]}`);

  const blocks = [
    { title: "Старт", body: startProtocol(ctx, lib) },
    { title: "Силовой блок", body: `${heavyLine}. Повторы ${reps}, отдых ${rest}.` },
    { title: "Финиш", body: finishText(ctx, lib) },
    { title: "Замена", body: swapText(ctx, lib) },
  ];

  return { title, intensity: ctx.intensity, blocks };
}

function startProtocol(ctx, lib) {
  if (ctx.place === "gym") {
    return "Дорожка 8-12 мин: скорость 4,5-5, наклон 12-15. Затем 4-6 мин динамической растяжки плеч, груди, бедер.";
  }
  if (ctx.place === "home") return "5-8 мин ходьбы/суставной разминки. Затем динамическая растяжка грудного отдела, плеч и бедер.";
  return "8-12 мин ходьбы в темпе. Затем динамическая растяжка плеч, грудного отдела и бедер.";
}

function getFocusLine(ctx, lib, rounds, reps) {
  if (ctx.trainingStyle === "circuit" && ctx.focus === "auto") {
    return `${rounds} круга: ${lib.legs[0]}, ${lib.push[0]}, ${lib.pull[0]}, ${lib.core[0]}, ${lib.cardio[1]}. Работа 40 сек, отдых 20-40 сек`;
  }
  if (ctx.focus === "chest") {
    return `${rounds} подхода: ${lib.chest[0]}, ${lib.chest[1]}, ${lib.chest[2]}. Добивка: ${lib.shoulders[1]}, ${lib.arms[0]}, ${lib.arms[1]}`;
  }
  if (ctx.focus === "back") return `${rounds} подхода: ${lib.pull[0]}, ${lib.pull[1]}, ${lib.pull[2]}. Добивка: ${lib.arms[1]}`;
  if (ctx.focus === "legs") return `${rounds} подхода: ${lib.legs[0]}, ${lib.legs[1]}, ${lib.legs[2]}. Добивка: кор`;
  if (ctx.focus === "cardioMobility") return `${lib.cardio[0]} 25-40 минут + растяжка 10-15 минут`;
  return "";
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
  if (ctx.cycleDeload) return "Убрать отказ, прыжки и рекорды. Цель дня: кровоток, техника, ощущение контроля.";
  if (ctx.needsLowImpact) return "Любая боль выше 3/10 меняет упражнение. Рабочая нагрузка: 6/10.";
  if (ctx.luteal) return "Оставить запас 2-3 повтора, добавить воду и не гнаться за пульсом.";
  if (ctx.intensity === "high") return "Если последний подход уверенный, добавить 1 подход или 2,5-5% веса.";
  return "Держать технику, записать RPE и ощущения после тренировки.";
}

function coachWhy(score) {
  const ctx = context(score);
  const reasons = [];
  if (ctx.trainingStyle === "circuit") reasons.push(`${ctx.trainingDays} круговых в неделю`);
  if (ctx.quickMode !== "normal") reasons.push(modeLabel(ctx.quickMode));
  if (score < 58) reasons.push("готовность низкая");
  if (score >= 78) reasons.push("можно прогрессировать");
  if (ctx.needsLowImpact) reasons.push("бережем суставы");
  if (ctx.cycleDeload) reasons.push("учтен цикл");
  if (ctx.goal === "fatloss") reasons.push("кардио в приоритете");
  if (data.history[0]?.result?.painAfter >= 5) reasons.push("после прошлой была боль");
  if (data.history[0]?.result?.completion === "partial") reasons.push("прошлый план не закрыт");
  if (!reasons.length) reasons.push("баланс нормальный");
  return reasons.slice(0, 3);
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
  if (workout.intensity === "high") return "Цель: +1 подход или +2,5% веса.";
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
      body: `Разогрев. ${lib.legs[0]} + ${lib.push[0]} + ${lib.pull[0]}. Финиш: кор и легкое кардио.`,
    },
    {
      title: "Короткая версия",
      meta: ["если мало времени", "25-35 мин", "без лишнего"],
      body: `5 мин старт. 2-3 круга: ${lib.push[0]}, ${lib.pull[0]}, ${lib.legs[1]}, ${lib.core[1]}.`,
    },
    {
      title: "Восстановление",
      meta: ["сон/стресс", "20-40 мин", "низкий пульс"],
      body: `${lib.cardio[0]} 20 мин. Мобилизация. ${lib.core[2]}. Без отказа.`,
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
        meta: ["круговой стиль", `${ctx.trainingDays} дня`, "40/20"],
        body: circuitWeekBody(ctx, lib),
      },
      {
        title: "Круговая + восстановление",
        meta: ["если усталость", "пульс под контролем", "без отказа"],
        body: "2-3 круга, работа 30-40 сек. Между днями: ходьба, растяжка, сон.",
      },
      {
        title: "Круговая прогрессия",
        meta: ["каждую неделю", "+1 круг", "или меньше отдых"],
        body: "Сначала добавляй качество техники. Потом +1 круг или -10 сек отдыха.",
      },
    ];
  }

  return [
    {
      title: `Неделя: ${strengthDays} силовых + кардио`,
      meta: ["адаптивная сетка", `${strengthDays} силовых`, "1 разгрузка"],
      body: `Пн: ноги + тяга. Ср: жим + кор. Пт: полный корпус. Кардио: ${cardioDose}.`,
    },
    {
      title: "Неделя: восстановительный уклон",
      meta: ["стресс/цикл/боль", "мягкий режим", "регулярность"],
      body: "2 силовые, 2 легких кардио, 1 мобилизация. Вес не форсировать.",
    },
    {
      title: "Неделя: прогрессия",
      meta: ["если готовность высокая", "нагрузка +5%", "контроль RPE"],
      body: "Главное движение: +1 подход или +2,5-5%. После тренировки отметить легко/тяжело.",
    },
  ];
}

function circuitWeekBody(ctx, lib) {
  const variants = {
    2: `День 1: полный корпус. День 2: ${lib.cardio[0]} + круг легче.`,
    3: "Пн: полный корпус. Ср: верх + кор. Пт: ноги + кардио.",
    4: "Пн: полный корпус. Вт: кардио-кор. Чт: верх. Сб: ноги + мобилизация.",
    5: "3 круговых дня, 1 кардио, 1 восстановительная растяжка. Один день обязательно легкий.",
  };
  return variants[ctx.trainingDays] || variants[3];
}

function buildMonthPlans(score) {
  const ctx = context(score);
  const goalLine = {
    strength: "главные движения, техника, постепенный рост веса",
    muscle: "объем подходов, контроль темпа, питание в плюс",
    fatloss: "силовая база, кардио, устойчивый дефицит",
    health: "регулярность, суставы, сердце, осанка",
  }[ctx.goal];

  return [
    {
      title: ctx.trainingStyle === "circuit" ? "4 недели: круговая база" : "4 недели: базовый мезоцикл",
      meta: ["месяц", "3+1", "умная разгрузка"],
      body: ctx.trainingStyle === "circuit"
        ? `1: техника кругов. 2: +1 круг. 3: меньше отдых. 4: разгрузка 60-70%. ${ctx.trainingDays} дня/нед.`
        : `1: вход. 2: +объем. 3: пик. 4: разгрузка 60-70%. Фокус: ${goalLine}.`,
    },
    {
      title: "4 недели: жиросжигание без слива сил",
      meta: ["кардио", "NEAT", "силовая база"],
      body: "2-3 силовые, 2 кардио, шаги ежедневно. Белок высокий, дефицит умеренный.",
    },
    {
      title: "4 недели: женская адаптация цикла",
      meta: ["фазы", "самочувствие", "без героизма"],
      body: "Не календарь командует, а симптомы. Фаза цикла только снижает риск перегруза.",
    },
  ];
}

function labelIntensity(value) {
  return { high: "прогрессия", medium: "рабочая", low: "мягкая" }[value];
}

function getSignals(score) {
  const signals = [];
  const { sleep, energy, stress, pain } = data.state;
  if (sleep <= 5) signals.push(["Сон", "снизить вес и убрать отказ"]);
  if (energy >= 8 && score > 70) signals.push(["Энергия", "можно прогрессировать"]);
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
    menstruation: "мягкий режим",
    follicular: "окно прогрессии",
    ovulation: "контроль суставов",
    luteal: "больше восстановления",
    none: "не учитывается",
  }[phase];
}

function getNutrition(score) {
  const goalText = {
    strength: "До: углеводы. После: белок.",
    muscle: "Белок в каждый прием. Еда вокруг тренировки.",
    fatloss: "Белок + овощи. Дефицит без голода.",
    health: "Вода, клетчатка, регулярность.",
  }[data.profile.goal];

  const recovery =
    score < 55
      ? "Сегодня не урезать еду: восстановление важнее."
      : "В течение 2-3 часов: белок + углеводы.";

  return [goalText, recovery, "Минимум дневника: вода, белок, самочувствие."];
}

function ensureActiveWorkout(score) {
  const signature = JSON.stringify({
    place: data.profile.place,
    goal: data.profile.goal,
    level: data.profile.level,
    mode: data.quickMode,
    intensity: context(score).intensity,
  });

  if (data.activeWorkout?.signature === signature) return data.activeWorkout;

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
  const baseSets = ctx.quickMode === "short" ? 2 : ctx.intensity === "high" ? 4 : ctx.intensity === "medium" ? 3 : 2;
  const reps = ctx.intensity === "high" ? 8 : ctx.intensity === "medium" ? 10 : 12;
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
  if (ctx.trainingStyle === "circuit" && ctx.focus === "auto") return [warmup, lib.legs[0], lib.push[0], lib.pull[0], lib.core[0], lib.cardio[1]];
  if (ctx.focus === "chest") return [warmup, ...lib.chest, lib.shoulders[1], lib.arms[0], lib.arms[1]];
  if (ctx.focus === "back") return [warmup, ...lib.pull, lib.arms[1]];
  if (ctx.focus === "legs") return [warmup, ...lib.legs, lib.core[0]];
  if (ctx.focus === "cardioMobility") return [warmup, lib.cardio[0], "растяжка 10-15 минут"];
  if (ctx.quickMode === "cardio") return [warmup, lib.cardio[0], lib.pull[0], lib.core[0]];
  return [warmup, lib.legs[0], lib.push[0], lib.pull[0], lib.core[0]];
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
  return `${doneSets.length}/${exercise.sets.length} подходов · ${best}${volume ? ` · объем ${volume}` : ""}`;
}

function exerciseTechnique(name) {
  const lower = name.toLowerCase();
  if (/жим ног|присед|выпад|мост|шаги/.test(lower)) return techniqueLibrary.legs;
  if (/тяга верх|горизонт|резин|полотен|подтяг|австрал|face pull|вис/.test(lower)) return techniqueLibrary.pull;
  if (/жим|отжим|брусь|плеч|развед/.test(lower)) return techniqueLibrary.push;
  if (/планк|планк|dead bug|bird|скручив|анти|подъем колен|кор|боковая/.test(lower)) return techniqueLibrary.core;
  if (/дорож|вело|эллипс|ходь|кардио|лестниц|ускор|ступень|растяж|размин/.test(lower)) return techniqueLibrary.cardio;
  return techniqueLibrary.general;
}

const techniqueLibrary = {
  push: {
    title: "Жим / отжимание",
    kind: "push",
    purpose: "Для груди, плеч и трицепса. Толкай вес от себя без потери контроля плеч.",
    source: "https://www.anterides.com/exercise/213/flat-bench-dumbbell-press",
    steps: ["Лопатки собрать, стопы поставить устойчиво.", "Опустить вес контролируемо к линии груди.", "Выжать вверх без рывка и без жесткого замка в локтях."],
  },
  pull: {
    title: "Тяга на спину",
    kind: "pull",
    purpose: "Для широчайших и верхней части спины. Начинай движение плечами и лопатками.",
    source: "https://scoutlife.org/fitness-first/blgym/173590/how-to-do-lat-pulldowns-correctly/",
    steps: ["Зафиксировать корпус и не заваливаться назад.", "Потянуть локти вниз и назад, свести лопатки.", "Вернуть вес медленно, сохраняя контроль."],
  },
  legs: {
    title: "Ноги / жим платформы",
    kind: "legs",
    purpose: "Для квадрицепса, ягодиц и задней поверхности бедра. Колени идут по линии носков.",
    source: "https://goodmindandbody.com/reasons-for-knee-pain-after-leg-press/",
    steps: ["Поставить стопы устойчиво, колени не заваливать внутрь.", "Опускаться контролируемо до комфортной глубины.", "Толкать через всю стопу, не выпрямлять колени в жесткий замок."],
  },
  core: {
    title: "Кор / планка",
    kind: "core",
    purpose: "Для корпуса. Держи ребра, таз и поясницу под контролем.",
    source: "https://www.skimble.com/exercises/58675-bridge-to-plank-how-to-do-exercise",
    steps: ["Локти или ладони поставить под плечами.", "Напрячь пресс и ягодицы, вытянуть тело в линию.", "Дышать спокойно, не проваливать поясницу."],
  },
  cardio: {
    title: "Кардио",
    kind: "cardio",
    purpose: "Для сердца и выносливости. Держи темп, при котором можно говорить короткими фразами.",
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

  $("cycleField").style.display = data.profile.sex === "female" ? "grid" : "none";
  $("readinessScore").textContent = score;
  $("readinessTitle").textContent = score >= 78 ? "Высокая" : score >= 58 ? "Рабочая" : "Снизить темп";
  $("readinessText").textContent =
    score >= 78
      ? "Сегодня можно строить тренировку вокруг прогрессии: вес, подход или качество техники."
      : score >= 58
        ? "Нагрузка рабочая: тренируемся уверенно, но оставляем запас и слушаем суставы."
        : "Тело просит мягкий формат: движение, кровоток, техника и восстановление без героизма.";

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
  return parts.join(", ");
}

function labelCompletion(value) {
  return { full: "весь план", partial: "часть", extra: "с запасом" }[value] || value;
}

function getReminder(counts) {
  if (counts.cardio === 0) return "Напоминание: добавить кардио в ближайшие 1-2 тренировки.";
  if (counts.mobility === 0 && data.history.length >= 3) return "Напоминание: поставить восстановление и мобилизацию в расписание.";
  if (counts.strength === 0) return "Напоминание: нужна силовая база для основных мышечных групп.";
  return "Баланс нормальный. Следующая коррекция зависит от обратной связи после тренировки.";
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
