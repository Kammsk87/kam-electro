const storageKey = "crypto-strategy-bot-v1";

const defaultRules = [
  "Не считать стратегию готовой без точки отмены сценария и заранее заданного стопа.",
  "Риск на сделку держать в пределах 0.25-1.5%, если рынок не имеет явного тренда.",
  "Пробой торговать только после закрепления или ретеста уровня.",
  "После серии убыточных сделок снижать риск и прекращать торговлю до пересмотра плана."
];

const knowledgeSources = [
  {
    title: "О криптовалюте просто",
    author: "Джулиан Хосп",
    theme: "база блокчейна и криптоактивов",
    rules: [
      "Сначала проверять, какую реальную функцию выполняет актив: сеть, платежи, DeFi, инфраструктура или только спекулятивный нарратив.",
      "Не строить стратегию без понимания эмиссии, ликвидности, роли токена и основных рисков проекта."
    ]
  },
  {
    title: "Эпоха криптовалют",
    author: "Пол Винья, Майкл Кейси",
    theme: "макро-контекст цифровых валют",
    rules: [
      "Учитывать, что крипторынок реагирует не только на график, но и на макроэкономику, регулирование, доверие к финансовой системе и новости индустрии.",
      "Для среднесрочных идей проверять общий рыночный цикл и доминирование биткоина."
    ]
  },
  {
    title: "Цифровое золото",
    author: "Натаниел Поппер",
    theme: "история биткоина и рыночные циклы",
    rules: [
      "Отделять долгосрочный тезис по биткоину от краткосрочного трейда: у них разные точки входа, риск и горизонт.",
      "Не покупать актив только из-за истории роста: текущая ликвидность и структура цены важнее прошлой легенды."
    ]
  },
  {
    title: "Как заработать на криптовалютах и блокчейне",
    author: "Светлана Русова, Андрей Рябых",
    theme: "выбор монет и базовый риск",
    rules: [
      "Перед сделкой по альткоину проверять команду, токеномику, биржевую ликвидность, капитализацию и ближайшие события.",
      "Не концентрировать весь риск в одном активе или одном нарративе."
    ]
  },
  {
    title: "101 ответ на вопросы о криптовалютах",
    author: "Вячеслав Семенчук, Павел Андреев",
    theme: "термины и безопасность новичка",
    rules: [
      "Если стратегия использует термин, который трейдер не может объяснить, сначала дать короткое определение и только потом торговый план.",
      "Отмечать операционные риски: биржа, кошелек, комиссии, ввод-вывод, фишинг, неверная сеть перевода."
    ]
  },
  {
    title: "How to Day Trade for a Living",
    author: "Andrew Aziz",
    theme: "дейтрейдинг и дисциплина",
    rules: [
      "Каждая intraday-стратегия должна иметь подготовку до входа: уровни, сценарий, отмену, размер позиции и условия выхода.",
      "Не торговать импульс без объема и не переносить внутридневную ошибку в долгосрочную позицию."
    ]
  },
  {
    title: "The Crypto Trader",
    author: "Glen Goodman",
    theme: "практические криптостратегии",
    rules: [
      "Комбинировать техническую картину с новостным фоном, поведением биткоина и настроением рынка.",
      "В волатильных фазах снижать плечо, дробить вход и заранее планировать частичную фиксацию."
    ]
  },
  {
    title: "Blockchain Basics",
    author: "Daniel Drescher",
    theme: "технологическая проверка проекта",
    rules: [
      "Для фундаментального фильтра проверять тип сети, консенсус, назначение смарт-контрактов и устойчивость инфраструктуры.",
      "Не приравнивать хороший график к хорошему проекту: технологический риск остается отдельным фильтром."
    ]
  },
  {
    title: "Blockchain Revolution",
    author: "Don Tapscott, Alex Tapscott",
    theme: "сценарии применения блокчейна",
    rules: [
      "Для инвестиционных идей искать не только хайп, но и понятный сектор применения: финансы, логистика, DAO, права, данные.",
      "Если нарратив не подтверждается пользовательской активностью или капиталом, стратегия должна быть только краткосрочной."
    ]
  },
  {
    title: "Investing in Cryptocurrencies For Dummies",
    author: "Kiana Danial",
    theme: "портфельный подход и осторожность",
    rules: [
      "Разделять портфельные идеи и активный трейдинг: для портфеля важны диверсификация, горизонт и ребалансировка.",
      "Не увеличивать риск после прибыльной серии без нового торгового основания."
    ]
  },
  {
    title: "Путь криптовалютного трейдера",
    author: "Денис Цыро, Арсений Цыро",
    theme: "скальпинг и психология",
    rules: [
      "Для скальпинга требовать стабильный рынок, узкий спред, ликвидный стакан и быстрый выход при потере импульса.",
      "Включать психологический фильтр: усталость, тильт и желание отыграться запрещают новые сделки."
    ]
  },
  {
    title: "Криптотрейдинг: Искусство побеждать",
    author: "Ждан Стерлинг",
    theme: "система трейдинга",
    rules: [
      "Стратегия должна состоять из сетапа, фильтров, входа, стопа, целей, сопровождения и постанализа.",
      "Если нет статистики по стратегии, выдавать ее как гипотезу для бэктеста, а не как готовый торговый сигнал."
    ]
  },
  {
    title: "Разумный инвестор",
    author: "Бенджамин Грэм",
    theme: "запас прочности и дисциплина",
    rules: [
      "Перед входом требовать запас прочности: сделка должна иметь понятную асимметрию, где потенциальная цель существенно выше принятого риска.",
      "Не путать рыночное настроение с ценностью актива: резкий рост цены без подтверждения ликвидностью, качеством проекта и risk/reward не является самостоятельным основанием для входа.",
      "Если нет явного преимущества, лучше пропустить сделку и сохранить капитал."
    ]
  },
  {
    title: "Человек, который разгадал рынок",
    author: "Грегори Цукерман",
    theme: "квантовый подход и проверка гипотез",
    rules: [
      "Любой торговый сигнал считать гипотезой, пока он не подтвержден статистикой, повторяемостью и контролем риска.",
      "Не доверять единичному паттерну: сигнал должен подтверждаться несколькими независимыми признаками, например трендом, объемом, спредом и структурой свечей.",
      "Остерегаться переобучения: слишком сложная логика без простой причины может хорошо выглядеть на истории и плохо работать в реальном рынке."
    ]
  }
];

const state = {
  rules: loadRules(),
  lastStrategy: "",
  lastUserIdea: "",
  tradePlan: null,
  detectedMode: "trend",
  live: {
    enabled: false,
    socket: null,
    reconnectTimer: null,
    reconnectAttempts: 0,
    asset: "",
    timeframe: "",
    status: "offline",
    ticker: null,
    book: null,
    candles: [],
    updatedAt: null,
    lastStrategyRefresh: 0
  }
};

const asset = document.querySelector("#asset");
const timeframe = document.querySelector("#timeframe");
const marketMode = document.querySelector("#marketMode");
const risk = document.querySelector("#risk");
const riskValue = document.querySelector("#riskValue");
const conservative = document.querySelector("#conservative");
const includeLongs = document.querySelector("#includeLongs");
const includeShorts = document.querySelector("#includeShorts");
const trainingInput = document.querySelector("#trainingInput");
const rulesContainer = document.querySelector("[data-rules]");
const sourcesContainer = document.querySelector("[data-sources]");
const sourceCount = document.querySelector("[data-source-count]");
const strategyContainer = document.querySelector("[data-strategy]");
const confidence = document.querySelector("[data-confidence]");
const chartLabel = document.querySelector("[data-chart-label]");
const chartTitle = document.querySelector("[data-chart-title]");
const rr = document.querySelector("[data-rr]");
const maxRisk = document.querySelector("[data-max-risk]");
const filterCount = document.querySelector("[data-filter-count]");
const planSide = document.querySelector("[data-plan-side]");
const planEntry = document.querySelector("[data-plan-entry]");
const planStop = document.querySelector("[data-plan-stop]");
const planTarget = document.querySelector("[data-plan-target]");
const liveStatus = document.querySelector("[data-live-status]");
const liveToggle = document.querySelector("[data-live-toggle]");
const livePrice = document.querySelector("[data-live-price]");
const liveBook = document.querySelector("[data-live-book]");
const liveSpread = document.querySelector("[data-live-spread]");
const liveVolume = document.querySelector("[data-live-volume]");
const liveUpdated = document.querySelector("[data-live-updated]");
const chatLog = document.querySelector("[data-chat-log]");
const chatForm = document.querySelector("[data-chat-form]");
const chatInput = document.querySelector("#chatInput");
const canvas = document.querySelector("#marketChart");
const ctx = canvas.getContext("2d");

function loadRules() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    return Array.isArray(saved?.rules) && saved.rules.length ? saved.rules : defaultRules;
  } catch (error) {
    return defaultRules;
  }
}

function persist() {
  localStorage.setItem(storageKey, JSON.stringify({ rules: state.rules }));
}

function renderRules() {
  rulesContainer.innerHTML = "";
  state.rules.slice(-6).forEach((rule) => {
    const item = document.createElement("div");
    item.className = "rule-item";
    item.textContent = rule;
    rulesContainer.append(item);
  });
}

function renderSources() {
  sourcesContainer.innerHTML = "";
  sourceCount.textContent = `${knowledgeSources.length} источников`;
  knowledgeSources.forEach((source) => {
    const item = document.createElement("div");
    item.className = "source-item";
    item.innerHTML = `<strong>${escapeHtml(source.title)}</strong><span>${escapeHtml(source.theme)}</span>`;
    sourcesContainer.append(item);
  });
}

function getContext() {
  const resolvedMode = marketMode.value === "auto" ? state.detectedMode : marketMode.value;
  return {
    asset: asset.value,
    timeframe: timeframe.value,
    mode: resolvedMode,
    modeSource: marketMode.value === "auto" ? "auto" : "manual",
    risk: Number(risk.value),
    conservative: conservative.checked,
    includeLongs: includeLongs.checked,
    includeShorts: includeShorts.checked,
    rules: state.rules,
    sourceRules: knowledgeSources.flatMap((source) => source.rules),
    live: getLiveSnapshot()
  };
}

function modeLabel(mode) {
  const labels = {
    trend: "трендовый рынок",
    range: "боковик",
    breakout: "пробой уровня",
    pullback: "откат после импульса",
    "high-volatility": "высокая волатильность"
  };
  return labels[mode] || mode;
}

function buildStrategy(userIdea = "", tradePlan = null) {
  const context = getContext();
  const isFast = ["5m", "15m"].includes(context.timeframe);
  const side = describeSelectedSides(context);
  const rrTarget = context.conservative ? "1 : 2.2" : "1 : 1.7";
  const setup = {
    trend: "работать от направления старшего тренда, входить после импульса и неглубокого отката к EMA/VWAP",
    range: "искать сделки от границ диапазона, избегать входов в середине канала",
    breakout: "ждать пробой уровня, закрепление выше/ниже и ретест с удержанием объема",
    pullback: "искать возврат к зоне спроса/предложения после сильного движения",
    "high-volatility": "уменьшить размер позиции, ждать сужения спреда и подтверждения свечной структуры"
  }[context.mode];

  const entryFilters = [
    context.conservative ? "закрытие свечи за уровнем, а не вход по первому касанию" : "допускается агрессивный вход малой позицией",
    "объем выше среднего за последние 20 свечей",
    isFast ? "проверка направления на 1h перед входом" : "проверка структуры на старшем таймфрейме",
    "нет ближайших новостных или ликвидационных зон прямо перед целью"
  ];

  const bookRules = selectBookRules(context);
  const rules = context.rules.slice(-4).map((rule) => `<li>${escapeHtml(rule)}</li>`).join("");
  const bookRuleItems = bookRules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("");
  const sourceNames = knowledgeSources
    .slice(0, 6)
    .map((source) => source.title)
    .join("; ");
  const liveBlock = buildLiveStrategyBlock(context);
  const tradePlanBlock = buildTradePlanBlock(tradePlan);
  const investorDisciplineBlock = buildInvestorDisciplineBlock(context, tradePlan);
  const idea = userIdea ? `<p><strong>Уточнение из чата:</strong> ${escapeHtml(userIdea)}</p>` : "";

  const html = `
    <h2>${context.asset}: стратегия под ${modeLabel(context.mode)}</h2>
    ${idea}
    <section>
      <h3>Логика сетапа</h3>
      <p>Рабочая гипотеза: ${setup}. Направление: ${side}. Таймфрейм исполнения: ${context.timeframe}.</p>
    </section>
    ${liveBlock}
    ${tradePlanBlock}
    ${investorDisciplineBlock}
    <section>
      <h3>Условия входа</h3>
      <ul>${entryFilters.map((filter) => `<li>${filter}</li>`).join("")}</ul>
    </section>
    <section>
      <h3>Риск и сопровождение</h3>
      <ul>
        <li>Риск на сделку: не более ${context.risk.toFixed(2)}% от депозита.</li>
        <li>Стоп: за локальный экстремум или за уровень отмены сценария.</li>
        <li>Цель: частичная фиксация на ${rrTarget}, остаток вести по структуре.</li>
        <li>Если цена возвращается под уровень входа без импульса, сделка отменяется.</li>
      </ul>
    </section>
    <section>
      <h3>Правила обучения, которые учтены</h3>
      <ul>${rules}</ul>
    </section>
    <section>
      <h3>Книжная база</h3>
      <p>Использованы тезисы из ${knowledgeSources.length} источников: ${escapeHtml(sourceNames)} и др.</p>
      <ul>${bookRuleItems}</ul>
    </section>
    <p class="risk-note">Это исследовательский план, а не финансовая рекомендация. Перед реальной сделкой нужна проверка на истории, демо или малом размере позиции.</p>
  `;

  state.lastStrategy = stripTags(html);
  return html;
}

function buildInvestorDisciplineBlock(context, tradePlan) {
  const primary = tradePlan?.primary;
  const rrText = primary
    ? `${primary.side}: риск ${formatPrice(Math.abs(primary.entry - primary.stop))}, цель до ${formatPrice(primary.target2)}`
    : "риск/цель еще не рассчитаны";
  const edgeChecks = [
    "Запас прочности: вход разрешен только если стоп заранее известен, а цель дает асимметрию не хуже выбранного risk/reward.",
    context.live.active
      ? "Квантовый фильтр: live-сигнал должен подтверждаться не одной свечой, а сочетанием цены, объема, спреда и режима рынка."
      : "Квантовый фильтр: без live-данных стратегия остается гипотезой для теста, а не готовым сигналом.",
    "Фильтр переобучения: если причина сделки слишком сложная или зависит от одного редкого паттерна, позицию лучше уменьшить или пропустить."
  ];

  return `
    <section>
      <h3>Фильтр Грэма и Цукермана</h3>
      <p>${escapeHtml(rrText)}. Этот блок добавляет дисциплину инвестора и проверку статистического преимущества.</p>
      <ul>${edgeChecks.map((check) => `<li>${escapeHtml(check)}</li>`).join("")}</ul>
    </section>
  `;
}

function buildTradePlanBlock(tradePlan) {
  if (!tradePlan?.scenarios?.length) {
    return "";
  }

  const rows = tradePlan.scenarios.map((scenario) => `
    <li>
      <strong>${scenario.side}</strong>: вход ${formatPrice(scenario.entry)}, стоп ${formatPrice(scenario.stop)},
      цель 1 ${formatPrice(scenario.target1)}, цель 2 ${formatPrice(scenario.target2)}.
      ${escapeHtml(scenario.comment)}
    </li>
  `).join("");

  return `
    <section>
      <h3>План на графике</h3>
      <p>На графике отмечены планируемая точка входа, зона риска, цели и прогнозная траектория по сценарию.</p>
      <ul>${rows}</ul>
    </section>
  `;
}

function buildLiveStrategyBlock(context) {
  if (!context.live.active) {
    return `
      <section>
        <h3>Рыночные данные</h3>
        <p>Live-режим выключен. Стратегия построена по выбранному сценарию и обучающим правилам.</p>
      </section>
    `;
  }

  const trendText = context.live.trendPct >= 0
    ? `свечная динамика положительная: +${context.live.trendPct.toFixed(2)}%`
    : `свечная динамика отрицательная: ${context.live.trendPct.toFixed(2)}%`;
  const spreadText = context.live.spreadPct > 0.08
    ? "спред повышенный, вход лучше подтверждать лимитной заявкой или пропустить"
    : "спред приемлемый для наблюдения";

  return `
    <section>
      <h3>Live-рынок</h3>
      <ul>
        <li>Источник: ${escapeHtml(context.live.exchange)} public WebSocket, ${escapeHtml(context.live.symbol)}.</li>
        <li>Последняя цена: ${formatPrice(context.live.lastPrice)}; bid/ask: ${formatPrice(context.live.bid)} / ${formatPrice(context.live.ask)}.</li>
        <li>${trendText}; ${spreadText} (${context.live.spreadPct.toFixed(3)}%).</li>
        <li>24h объем: ${formatCompact(context.live.volume24h)} USDT. Сигнал стоит игнорировать, если поток данных устарел или свечи перестали обновляться.</li>
      </ul>
    </section>
  `;
}

function selectBookRules(context) {
  const selected = [
    ...knowledgeSources.find((source) => source.title === "Криптотрейдинг: Искусство побеждать").rules,
    ...knowledgeSources.find((source) => source.title === "The Crypto Trader").rules,
    ...knowledgeSources.find((source) => source.title === "Разумный инвестор").rules,
    ...knowledgeSources.find((source) => source.title === "Человек, который разгадал рынок").rules
  ];

  if (["5m", "15m"].includes(context.timeframe)) {
    selected.push(...knowledgeSources.find((source) => source.title === "How to Day Trade for a Living").rules);
    selected.push(...knowledgeSources.find((source) => source.title === "Путь криптовалютного трейдера").rules);
  }

  if (context.mode === "range" || context.mode === "high-volatility") {
    selected.push("При боковике или высокой волатильности снижать ожидания по движению и фиксировать прибыль частями.");
  }

  if (context.asset !== "BTC/USDT") {
    selected.push(...knowledgeSources.find((source) => source.title === "Как заработать на криптовалютах и блокчейне").rules);
  }

  return [...new Set(selected)].slice(0, 10);
}

function generateStrategy(userIdea = "") {
  syncAutoMarketMode();
  const context = getContext();
  const tradePlan = buildTradePlan(context);
  state.tradePlan = tradePlan;
  strategyContainer.innerHTML = buildStrategy(userIdea, tradePlan);
  confidence.textContent = `${context.rules.length + context.sourceRules.length} правил учтено`;
  rr.textContent = context.conservative ? "1 : 2.2" : "1 : 1.7";
  maxRisk.textContent = `${context.risk.toFixed(2)}%`;
  filterCount.textContent = context.conservative ? "4" : "3";
  chartLabel.textContent = `${context.asset} · ${context.timeframe}`;
  chartTitle.textContent = context.live.active
    ? `Live свечи · ${formatModeTitle(context)} · ${selectedSidesLabel(tradePlan)}`
    : `Сценарий цены · ${formatModeTitle(context)} · ${selectedSidesLabel(tradePlan)}`;
  renderTradePlanReadout(tradePlan);
  if (context.live.active && state.live.candles.length > 1) {
    drawLiveChart(state.live.candles, tradePlan);
  } else {
    drawChart(context.mode, tradePlan);
  }
}

function syncAutoMarketMode() {
  if (!state.live.enabled || state.live.candles.length < 18) {
    return;
  }
  const detectedMode = detectMarketMode(state.live.candles);
  if (detectedMode) state.detectedMode = detectedMode;
}

function detectMarketMode(candles) {
  const recent = candles.slice(-40);
  const sample = recent.length >= 40 ? recent : candles.slice(-recent.length);
  if (sample.length < 18) return state.detectedMode;

  const last = sample[sample.length - 1];
  const previous = sample.slice(0, -1);
  const first = sample[0];
  const high = Math.max(...sample.map((candle) => candle.high));
  const low = Math.min(...sample.map((candle) => candle.low));
  const previousHigh = Math.max(...previous.map((candle) => candle.high));
  const previousLow = Math.min(...previous.map((candle) => candle.low));
  const rangePct = ((high - low) / last.close) * 100;
  const trendPct = ((last.close - first.close) / first.close) * 100;
  const avgRangePct = average(sample.map((candle) => ((candle.high - candle.low) / candle.close) * 100));
  const lastRangePct = ((last.high - last.low) / last.close) * 100;
  const avgVolume = average(previous.slice(-20).map((candle) => candle.volume));
  const volumeImpulse = avgVolume > 0 && last.volume > avgVolume * 1.25;
  const volatilityLimit = timeframe.value === "5m" ? 1.1 : timeframe.value === "15m" ? 1.6 : timeframe.value === "1h" ? 2.4 : 3.6;

  if (avgRangePct > volatilityLimit || lastRangePct > avgRangePct * 2.4) {
    return "high-volatility";
  }

  const breaksUp = last.close > previousHigh * 1.0015;
  const breaksDown = last.close < previousLow * 0.9985;
  if ((breaksUp || breaksDown) && volumeImpulse) {
    return "breakout";
  }

  const last10 = sample.slice(-10);
  const recentTrendPct = ((last.close - last10[0].close) / last10[0].close) * 100;
  const impulseUp = trendPct > Math.max(1.2, rangePct * 0.22);
  const impulseDown = trendPct < -Math.max(1.2, rangePct * 0.22);
  const recentCounterMove = impulseUp ? recentTrendPct < -avgRangePct * 0.7 : impulseDown ? recentTrendPct > avgRangePct * 0.7 : false;
  if (recentCounterMove) {
    return "pullback";
  }

  if (Math.abs(trendPct) > Math.max(1.4, rangePct * 0.28)) {
    return "trend";
  }

  if (rangePct < Math.max(1.8, avgRangePct * 4.8) && Math.abs(trendPct) < rangePct * 0.25) {
    return "range";
  }

  return Math.abs(trendPct) >= rangePct * 0.18 ? "trend" : "range";
}

function formatModeTitle(context) {
  return context.modeSource === "auto"
    ? `авто: ${modeLabel(context.mode)}`
    : `ручной: ${modeLabel(context.mode)}`;
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function drawChart(mode, tradePlan = null) {
  const width = canvas.width;
  const height = canvas.height;
  const pad = { left: 52, right: 190, top: 34, bottom: 54 };
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#111518";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let x = 40; x < width; x += 70) {
    ctx.beginPath();
    ctx.moveTo(x, 24);
    ctx.lineTo(x, height - 32);
    ctx.stroke();
  }
  for (let y = 40; y < height; y += 55) {
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(width - 24, y);
    ctx.stroke();
  }

  const points = makePricePath(mode, 68, width, height);
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      ctx.moveTo(point.x, point.y);
    } else {
      ctx.lineTo(point.x, point.y);
    }
  });
  ctx.strokeStyle = "rgba(154,166,173,0.72)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const last = points[points.length - 1];
  ctx.fillStyle = "#f3b14d";
  ctx.beginPath();
  ctx.arc(last.x, last.y, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(243,177,77,0.14)";
  ctx.fillRect(width * 0.62, height * 0.22, width * 0.26, height * 0.18);
  ctx.strokeStyle = "rgba(243,177,77,0.65)";
  ctx.strokeRect(width * 0.62, height * 0.22, width * 0.26, height * 0.18);

  ctx.fillStyle = "#9aa6ad";
  ctx.font = "700 14px Inter, system-ui, sans-serif";
  ctx.fillText("зона решения", width * 0.64, height * 0.32);

  if (tradePlan) {
    const levels = tradePlan.scenarios.flatMap((scenario) => [scenario.entry, scenario.stop, scenario.target1, scenario.target2]);
    const min = Math.min(...levels) * 0.998;
    const max = Math.max(...levels) * 1.002;
    const range = max - min || max * 0.001 || 1;
    drawTradePlanOverlay(tradePlan, {
      pad,
      chartWidth: width - pad.left - pad.right,
      chartHeight: height - pad.top - pad.bottom,
      priceToY: (price) => priceToY(price, min, range, pad, height - pad.top - pad.bottom)
    });
    drawScenarioBadge(tradePlan, pad.left, pad.top);
  }
}

function makePricePath(mode, count, width, height) {
  const points = [];
  const left = 36;
  const right = width - 36;
  const top = 34;
  const bottom = height - 42;
  const span = right - left;

  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    let base;
    if (mode === "trend") base = 0.72 - t * 0.42;
    else if (mode === "range") base = 0.48 + Math.sin(t * Math.PI * 6) * 0.13;
    else if (mode === "breakout") base = t < 0.58 ? 0.56 + Math.sin(t * 18) * 0.05 : 0.52 - (t - 0.58) * 0.74;
    else if (mode === "pullback") base = t < 0.38 ? 0.72 - t * 0.68 : 0.46 + (t - 0.38) * 0.22;
    else base = 0.52 + Math.sin(t * Math.PI * 12) * 0.19 + Math.sin(t * 41) * 0.06;

    const noise = Math.sin(i * 1.7) * 0.025 + Math.cos(i * 0.8) * 0.018;
    const y = top + Math.max(0.08, Math.min(0.9, base + noise)) * (bottom - top);
    points.push({ x: left + t * span, y });
  }
  return points;
}

function drawLiveChart(candles, tradePlan = null) {
  const width = canvas.width;
  const height = canvas.height;
  const pad = { left: 52, right: 190, top: 34, bottom: 54 };
  const visible = candles.slice(-80);
  const planLevels = tradePlan?.scenarios?.flatMap((scenario) => [scenario.entry, scenario.stop, scenario.target1, scenario.target2]) || [];
  const lows = [...visible.map((candle) => candle.low), ...planLevels];
  const highs = [...visible.map((candle) => candle.high), ...planLevels];
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const range = max - min || max * 0.001 || 1;
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const candleWidth = Math.max(3, chartWidth / visible.length * 0.62);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#111518";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }

  visible.forEach((candle, index) => {
    const x = pad.left + (chartWidth / Math.max(1, visible.length - 1)) * index;
    const openY = priceToY(candle.open, min, range, pad, chartHeight);
    const closeY = priceToY(candle.close, min, range, pad, chartHeight);
    const highY = priceToY(candle.high, min, range, pad, chartHeight);
    const lowY = priceToY(candle.low, min, range, pad, chartHeight);
    const up = candle.close >= candle.open;

    ctx.strokeStyle = up ? "#55c7a2" : "#ef6b5b";
    ctx.fillStyle = up ? "rgba(85,199,162,0.82)" : "rgba(239,107,91,0.82)";
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();
    ctx.fillRect(x - candleWidth / 2, Math.min(openY, closeY), candleWidth, Math.max(2, Math.abs(closeY - openY)));
  });

  const last = visible[visible.length - 1];
  ctx.fillStyle = "#f3b14d";
  ctx.font = "700 14px Inter, system-ui, sans-serif";
  ctx.fillText(`last ${formatPrice(last.close)}`, pad.left, height - 16);

  if (tradePlan) {
    drawTradePlanOverlay(tradePlan, {
      pad,
      chartWidth,
      chartHeight,
      priceToY: (price) => priceToY(price, min, range, pad, chartHeight)
    });
    drawScenarioBadge(tradePlan, pad.left, pad.top);
  }
}

function priceToY(price, min, range, pad, chartHeight) {
  return pad.top + (1 - (price - min) / range) * chartHeight;
}

function buildTradePlan(context) {
  ensureAtLeastOneScenario();
  const basePrice = getPlanBasePrice(context);
  const volatilityPct = getVolatilityPct(context);
  const rr1 = context.conservative ? 1.6 : 1.25;
  const rr2 = context.conservative ? 2.2 : 1.7;
  const entryShiftPct = getEntryShiftPct(context);
  const riskDistance = basePrice * volatilityPct;

  const longEntry = basePrice * (1 + entryShiftPct.long);
  const longRisk = Math.max(riskDistance, longEntry * 0.0035);
  const long = {
    side: "LONG",
    entry: longEntry,
    stop: longEntry - longRisk,
    target1: longEntry + longRisk * rr1,
    target2: longEntry + longRisk * rr2,
    confidence: context.live.active && context.live.trendPct >= -0.2 ? "основной" : "условный",
    comment: "подходит, если цена удерживает входную зону и объем подтверждает движение."
  };

  const shortEntry = basePrice * (1 + entryShiftPct.short);
  const shortRisk = Math.max(riskDistance, shortEntry * 0.0035);
  const short = {
    side: "SHORT",
    entry: shortEntry,
    stop: shortEntry + shortRisk,
    target1: shortEntry - shortRisk * rr1,
    target2: shortEntry - shortRisk * rr2,
    confidence: context.live.active && context.live.trendPct <= 0.2 ? "основной" : "альтернатива",
    comment: "активируется при потере уровня, слабой реакции покупателя и подтверждении продавца."
  };

  const scenarios = [];
  if (includeLongs.checked) scenarios.push(long);
  if (includeShorts.checked) scenarios.push(short);

  return {
    source: context.live.active ? "live" : "simulation",
    basePrice,
    scenarios,
    primary: scenarios[0] || long
  };
}

function ensureAtLeastOneScenario() {
  if (!includeLongs.checked && !includeShorts.checked) {
    includeLongs.checked = true;
  }
}

function describeSelectedSides(context) {
  if (context.includeLongs && context.includeShorts) return "long и short по подтверждению";
  if (context.includeShorts) return "только short-сценарий по подтверждению";
  return "только long-сценарий по подтверждению";
}

function getPlanBasePrice(context) {
  if (context.live.active && context.live.lastPrice > 0) return context.live.lastPrice;
  const defaults = {
    "BTC/USDT": 76000,
    "ETH/USDT": 4200,
    "SOL/USDT": 175,
    "BNB/USDT": 680,
    "XRP/USDT": 2.25,
    "TON/USDT": 6.4,
    "ADA/USDT": 0.72,
    "DOGE/USDT": 0.18,
    "TRX/USDT": 0.27,
    "AVAX/USDT": 38,
    "LINK/USDT": 18,
    "DOT/USDT": 7.2,
    "MATIC/USDT": 0.75,
    "LTC/USDT": 95,
    "BCH/USDT": 470,
    "UNI/USDT": 11,
    "AAVE/USDT": 280,
    "APT/USDT": 10,
    "SUI/USDT": 3.7,
    "ARB/USDT": 1.15,
    "OP/USDT": 2.6,
    "NEAR/USDT": 6.4,
    "ATOM/USDT": 9,
    "INJ/USDT": 28,
    "FIL/USDT": 6,
    "ETC/USDT": 30,
    "SEI/USDT": 0.52,
    "TIA/USDT": 9.5,
    "TWT/USDT": 1.2
  };
  return defaults[context.asset] || 100;
}

function getVolatilityPct(context) {
  const candles = state.live.candles.slice(-20);
  if (context.live.active && candles.length > 4) {
    const avgRange = candles.reduce((sum, candle) => sum + (candle.high - candle.low) / candle.close, 0) / candles.length;
    return Math.max(0.004, Math.min(0.035, avgRange * 1.15));
  }

  const byFrame = {
    "5m": 0.006,
    "15m": 0.009,
    "1h": 0.014,
    "4h": 0.022,
    "1d": 0.035
  };
  const modeBoost = context.mode === "high-volatility" ? 1.35 : context.mode === "range" ? 0.82 : 1;
  return byFrame[context.timeframe] * modeBoost;
}

function getEntryShiftPct(context) {
  const shift = {
    trend: { long: context.conservative ? -0.0015 : 0, short: 0.0015 },
    range: { long: -0.004, short: 0.004 },
    breakout: { long: 0.002, short: -0.002 },
    pullback: { long: -0.003, short: 0.003 },
    "high-volatility": { long: -0.0025, short: 0.0025 }
  }[context.mode] || { long: 0, short: 0 };
  return shift;
}

function renderTradePlanReadout(tradePlan) {
  const primary = tradePlan?.primary;
  const secondary = tradePlan?.scenarios?.find((scenario) => scenario.side !== primary?.side);
  if (!primary) {
    planSide.textContent = "нет данных";
    planEntry.textContent = "нет данных";
    planStop.textContent = "нет данных";
    planTarget.textContent = "нет данных";
    return;
  }

  planSide.textContent = secondary ? `${primary.side} / ${secondary.side}` : primary.side;
  planEntry.textContent = secondary ? `${formatPrice(primary.entry)} / ${formatPrice(secondary.entry)}` : formatPrice(primary.entry);
  planStop.textContent = secondary ? `${formatPrice(primary.stop)} / ${formatPrice(secondary.stop)}` : formatPrice(primary.stop);
  planTarget.textContent = secondary ? `${formatPrice(primary.target2)} / ${formatPrice(secondary.target2)}` : formatPrice(primary.target2);
}

function selectedSidesLabel(tradePlan) {
  const sides = tradePlan?.scenarios?.map((scenario) => scenario.side) || [];
  if (sides.includes("LONG") && sides.includes("SHORT")) return "LONG + SHORT";
  if (sides.includes("SHORT")) return "SHORT";
  return "LONG";
}

function drawScenarioBadge(tradePlan, x, y) {
  const label = `Показан: ${selectedSidesLabel(tradePlan)}`;
  const color = selectedSidesLabel(tradePlan) === "SHORT"
    ? "#ef6b5b"
    : selectedSidesLabel(tradePlan) === "LONG"
      ? "#55c7a2"
      : "#f3b14d";
  ctx.fillStyle = "rgba(17,21,24,0.86)";
  ctx.fillRect(x + 6, y + 8, 174, 28);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 6, y + 8, 174, 28);
  ctx.fillStyle = color;
  ctx.font = "800 13px Inter, system-ui, sans-serif";
  ctx.fillText(label, x + 18, y + 27);
}

function drawTradePlanOverlay(tradePlan, scale) {
  const colors = {
    LONG: "#55c7a2",
    SHORT: "#ef6b5b"
  };

  tradePlan.scenarios.forEach((scenario, index) => {
    const color = colors[scenario.side];
    const xStart = scale.pad.left + scale.chartWidth * 0.66;
    const xMid = scale.pad.left + scale.chartWidth * (0.78 + index * 0.04);
    const xEnd = scale.pad.left + scale.chartWidth * 0.96;

    drawLevelLine(scenario.entry, "ENTRY", color, scale, scenario.side, 0);
    drawLevelLine(scenario.stop, "STOP", "#ef6b5b", scale, scenario.side, 1);
    drawLevelLine(scenario.target1, "T1", "#f3b14d", scale, scenario.side, 2);
    drawLevelLine(scenario.target2, "T2", color, scale, scenario.side, 3);

    const yEntry = scale.priceToY(scenario.entry);
    const yTarget1 = scale.priceToY(scenario.target1);
    const yTarget2 = scale.priceToY(scenario.target2);
    const yStop = scale.priceToY(scenario.stop);

    ctx.strokeStyle = color;
    ctx.lineWidth = scenario.side === "LONG" ? 3 : 2;
    ctx.setLineDash(scenario.side === "SHORT" ? [7, 7] : []);
    ctx.beginPath();
    ctx.moveTo(xStart, yEntry);
    ctx.bezierCurveTo(xMid, yEntry, xMid, yTarget1, xEnd, yTarget2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(239,107,91,0.66)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.moveTo(xStart, yEntry);
    ctx.lineTo(xEnd * 0.94, yStop);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(xStart, yEntry, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "800 12px Inter, system-ui, sans-serif";
    ctx.fillText(scenario.side, xStart - 18, yEntry - 10);
  });
}

function drawLevelLine(price, label, color, scale, side, levelIndex) {
  const y = scale.priceToY(price);
  const laneX = scale.pad.left + scale.chartWidth + (side === "LONG" ? 10 : 96);
  const rowShift = side === "LONG" ? -6 : 10;
  const labelY = y + rowShift + (levelIndex % 2 === 0 ? -2 : 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(label === "ENTRY" ? [] : [6, 6]);
  ctx.beginPath();
  ctx.moveTo(scale.pad.left, y);
  ctx.lineTo(scale.pad.left + scale.chartWidth, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(17,21,24,0.88)";
  ctx.fillRect(laneX - 4, labelY - 13, 82, 18);
  ctx.fillStyle = color;
  ctx.font = "800 10px Inter, system-ui, sans-serif";
  ctx.fillText(`${side[0]} ${label}`, laneX, labelY);
  ctx.fillText(formatPrice(price), laneX, labelY + 10);
}

function addMessage(role, text) {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.innerHTML = `<strong>${role === "user" ? "Вы" : "Бот"}</strong><p>${escapeHtml(text)}</p>`;
  chatLog.append(message);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function answerChat(text) {
  state.lastUserIdea = text;
  generateStrategy(text);
  addMessage("bot", "Собрал стратегию по твоему запросу и применил правила из обучающей базы. Проверь блок риска и точку отмены сценария перед тестом.");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stripTags(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent.replace(/\n\s+/g, "\n").trim();
}

function randomizeScenario() {
  const assets = [...asset.options];
  const modes = [...marketMode.options].filter((option) => option.value !== "auto");
  const frames = [...timeframe.options];
  asset.value = assets[Math.floor(Math.random() * assets.length)].value;
  marketMode.value = modes[Math.floor(Math.random() * modes.length)].value;
  timeframe.value = frames[Math.floor(Math.random() * frames.length)].value;
  risk.value = String([0.5, 0.75, 1, 1.25, 1.5][Math.floor(Math.random() * 5)]);
  updateRiskLabel();
  if (state.live.enabled) {
    restartLiveConnection();
  }
  generateStrategy();
}

function updateRiskLabel() {
  riskValue.textContent = `${Number(risk.value).toFixed(1)}%`;
}

document.querySelector("[data-add-training]").addEventListener("click", () => {
  const value = trainingInput.value.trim();
  if (!value) return;
  state.rules.push(value);
  trainingInput.value = "";
  persist();
  renderRules();
  generateStrategy();
});

document.querySelector("[data-reset-training]").addEventListener("click", () => {
  state.rules = [...defaultRules];
  persist();
  renderRules();
  generateStrategy();
});

document.querySelector("[data-generate]").addEventListener("click", () => generateStrategy());
document.querySelector("[data-randomize]").addEventListener("click", randomizeScenario);
liveToggle.addEventListener("click", () => {
  if (state.live.enabled) {
    stopLiveConnection("offline");
  } else {
    startLiveConnection();
  }
});

document.querySelector("[data-copy]").addEventListener("click", async () => {
  if (!state.lastStrategy) generateStrategy();
  try {
    await navigator.clipboard.writeText(state.lastStrategy);
    confidence.textContent = "стратегия скопирована";
  } catch (error) {
    const fallback = document.createElement("textarea");
    fallback.value = state.lastStrategy;
    fallback.style.position = "fixed";
    fallback.style.left = "-9999px";
    document.body.append(fallback);
    fallback.select();
    document.execCommand("copy");
    fallback.remove();
    confidence.textContent = "стратегия скопирована";
  }
});

document.querySelector("[data-clear-chat]").addEventListener("click", () => {
  chatLog.innerHTML = "";
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  addMessage("user", text);
  chatInput.value = "";
  answerChat(text);
});

[asset, timeframe, marketMode, conservative, includeLongs, includeShorts].forEach((control) => {
  control.addEventListener("change", () => {
    ensureAtLeastOneScenario();
    if ((control === asset || control === timeframe) && state.live.enabled) {
      restartLiveConnection();
    }
    generateStrategy(state.lastUserIdea);
  });
});

risk.addEventListener("input", () => {
  updateRiskLabel();
  generateStrategy();
});

renderRules();
renderSources();
updateRiskLabel();
renderLiveReadout();
generateStrategy();

function startLiveConnection() {
  state.live.enabled = true;
  state.live.reconnectAttempts = 0;
  setLiveStatus("connecting");
  connectLiveSocket();
}

function restartLiveConnection() {
  closeLiveSocket();
  state.live.candles = [];
  state.live.ticker = null;
  state.live.book = null;
  state.live.updatedAt = null;
  setLiveStatus("connecting");
  connectLiveSocket();
}

function stopLiveConnection(status) {
  state.live.enabled = false;
  state.live.reconnectAttempts = 0;
  closeLiveSocket();
  state.live.candles = [];
  state.live.ticker = null;
  state.live.book = null;
  state.live.updatedAt = null;
  setLiveStatus(status);
  renderLiveReadout();
  generateStrategy(state.lastUserIdea);
}

function closeLiveSocket() {
  window.clearTimeout(state.live.reconnectTimer);
  state.live.reconnectTimer = null;
  if (state.live.socket) {
    state.live.socket.onclose = null;
    state.live.socket.close();
    state.live.socket = null;
  }
}

async function connectLiveSocket() {
  const symbol = toBinanceSymbol(asset.value);
  const interval = timeframe.value;
  state.live.asset = asset.value;
  state.live.timeframe = interval;

  await loadHistoricalCandles(symbol, interval);

  const topics = [
    `tickers.${symbol}`,
    `orderbook.1.${symbol}`,
    `kline.${toBybitInterval(interval)}.${symbol}`
  ];
  const url = "wss://stream.bybit.com/v5/public/spot";

  try {
    const socket = new WebSocket(url);
    state.live.socket = socket;

    socket.addEventListener("open", () => {
      state.live.reconnectAttempts = 0;
      setLiveStatus("online");
      socket.send(JSON.stringify({ op: "subscribe", args: topics }));
    });

    socket.addEventListener("message", (event) => {
      handleLiveMessage(JSON.parse(event.data));
    });

    socket.addEventListener("error", () => {
      setLiveStatus("error");
    });

    socket.addEventListener("close", () => {
      if (state.live.enabled) scheduleReconnect();
    });
  } catch (error) {
    setLiveStatus("error");
    scheduleReconnect();
  }
}

async function loadHistoricalCandles(symbol, interval) {
  try {
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${toBybitInterval(interval)}&limit=80`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Kline request failed");
    const data = await response.json();
    if (data.retCode !== 0 || !Array.isArray(data.result?.list)) throw new Error(data.retMsg || "Kline response failed");
    state.live.candles = data.result.list.slice().reverse().map((item) => ({
      openTime: item[0],
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
      closeTime: Number(item[0]) + intervalToMs(interval) - 1
    }));
    generateStrategy(state.lastUserIdea);
  } catch (error) {
    state.live.candles = [];
    setLiveStatus("no data");
  }
}

function handleLiveMessage(message) {
  const topic = message.topic || "";
  const data = message.data;
  if (!data) return;

  if (topic.startsWith("tickers.")) {
    state.live.ticker = {
      lastPrice: Number(data.lastPrice),
      priceChangePct: Number(data.price24hPcnt) * 100,
      volume: Number(data.volume24h),
      quoteVolume: Number(data.turnover24h)
    };
  }

  if (topic.startsWith("orderbook.")) {
    const bid = data.b?.[0];
    const ask = data.a?.[0];
    state.live.book = {
      bid: Number(bid?.[0]),
      ask: Number(ask?.[0]),
      bidQty: Number(bid?.[1]),
      askQty: Number(ask?.[1])
    };
  }

  if (topic.startsWith("kline.")) {
    data.forEach(upsertLiveCandle);
  }

  state.live.updatedAt = Date.now();
  renderLiveReadout();
  maybeRefreshLiveStrategy();
}

function upsertLiveCandle(kline) {
  const candle = {
    openTime: kline.start,
    open: Number(kline.open),
    high: Number(kline.high),
    low: Number(kline.low),
    close: Number(kline.close),
    volume: Number(kline.volume),
    closeTime: kline.end
  };
  const last = state.live.candles[state.live.candles.length - 1];
  if (last?.openTime === candle.openTime) {
    state.live.candles[state.live.candles.length - 1] = candle;
  } else {
    state.live.candles.push(candle);
    state.live.candles = state.live.candles.slice(-120);
  }
}

function scheduleReconnect() {
  setLiveStatus("reconnecting");
  const delay = Math.min(30000, 1500 * 2 ** state.live.reconnectAttempts);
  state.live.reconnectAttempts += 1;
  window.clearTimeout(state.live.reconnectTimer);
  state.live.reconnectTimer = window.setTimeout(connectLiveSocket, delay);
}

function maybeRefreshLiveStrategy() {
  const now = Date.now();
  if (now - state.live.lastStrategyRefresh < 4000) return;
  state.live.lastStrategyRefresh = now;
  generateStrategy(state.lastUserIdea);
}

function setLiveStatus(status) {
  state.live.status = status;
  liveStatus.textContent = status;
  liveToggle.textContent = state.live.enabled ? "Выключить live" : "Включить live";
  liveToggle.classList.toggle("is-live", state.live.enabled);
}

function renderLiveReadout() {
  const snapshot = getLiveSnapshot();
  if (!snapshot.active) {
    livePrice.textContent = "нет данных";
    liveBook.textContent = "нет данных";
    liveSpread.textContent = "нет данных";
    liveVolume.textContent = "нет данных";
    liveUpdated.textContent = "нет данных";
    return;
  }

  livePrice.textContent = formatPrice(snapshot.lastPrice);
  liveBook.textContent = `${formatPrice(snapshot.bid)} / ${formatPrice(snapshot.ask)}`;
  liveSpread.textContent = `${snapshot.spreadPct.toFixed(3)}%`;
  liveVolume.textContent = `${formatCompact(snapshot.volume24h)} USDT`;
  liveUpdated.textContent = new Date(snapshot.updatedAt).toLocaleTimeString("ru-RU");
}

function getLiveSnapshot() {
  const ticker = state.live.ticker;
  const book = state.live.book;
  const candles = state.live.candles;
  const lastCandle = candles[candles.length - 1];
  const firstCandle = candles[Math.max(0, candles.length - 20)];
  const lastPrice = ticker?.lastPrice || lastCandle?.close || 0;
  const bid = book?.bid || lastPrice;
  const ask = book?.ask || lastPrice;
  const spreadPct = bid && ask ? ((ask - bid) / ((ask + bid) / 2)) * 100 : 0;
  const trendPct = firstCandle?.close && lastCandle?.close
    ? ((lastCandle.close - firstCandle.close) / firstCandle.close) * 100
    : 0;

  return {
    active: state.live.enabled && Boolean(state.live.updatedAt || candles.length),
    exchange: "Bybit",
    symbol: state.live.asset || asset.value,
    lastPrice,
    bid,
    ask,
    spreadPct,
    trendPct,
    volume24h: ticker?.quoteVolume || 0,
    updatedAt: state.live.updatedAt || Date.now()
  };
}

function toBinanceSymbol(value) {
  return value.replace("/", "").toUpperCase();
}

function toBybitInterval(value) {
  const intervals = {
    "5m": "5",
    "15m": "15",
    "1h": "60",
    "4h": "240",
    "1d": "D"
  };
  return intervals[value] || "15";
}

function intervalToMs(value) {
  const intervals = {
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000
  };
  return intervals[value] || intervals["15m"];
}

function formatPrice(value) {
  if (!Number.isFinite(value) || value <= 0) return "нет данных";
  if (value >= 1000) return value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString("ru-RU", { maximumFractionDigits: 4 });
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 8 });
}

function formatCompact(value) {
  if (!Number.isFinite(value) || value <= 0) return "нет данных";
  return Intl.NumberFormat("ru-RU", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}
