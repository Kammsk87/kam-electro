const storageKey = "crypto-strategy-bot-v1";
const paperJournalKey = "crypto-strategy-bot-paper-journal-v1";
const paperSessionKey = "crypto-strategy-bot-session-id";
const depositKey = "crypto-strategy-bot-deposit-v1";
const autopilotKey = "crypto-strategy-bot-autopilot-v1";
const learningPolicyKey = "crypto-strategy-bot-learning-policy-v1";
const remoteJournalConfigKey = "crypto-strategy-bot-remote-journal-v1";
const remoteClientIdKey = "crypto-strategy-bot-client-id";
const cmcRadarConfigKey = "crypto-strategy-bot-cmc-radar-v1";
const newsAnalyticsConfigKey = "crypto-strategy-bot-news-analytics-v1";
const rejectedSignalsKey = "crypto-strategy-bot-rejected-signals-v1";

const currentSessionId = getCurrentSessionId();
const currentClientId = getCurrentClientId();
const autopilotMinScore = 74;
const autopilotScanMs = 30000;
const autopilotDuplicateCooldownMs = 60 * 60 * 1000;
const autopilotMaxActivePerSide = 3;
const manualMaxSingleTradePct = 10;
const manualMaxPortfolioPct = 50;
const autopilotMaxSingleTradePct = 7;
const autopilotMaxPortfolioPct = 35;
const strictAutopilotMinScore = 78;
const scalpingMinScore = 80;
const scalpingRiskPct = 0.35;
const scalpingMaxSingleTradePct = 4;
const scalpingMaxSpreadPct = 0.08;
const scalpingMinVolumeRatio = 1.05;
const crashRiskOffDrop12Pct = -3;
const crashRiskOffDrop24Pct = -5.5;
const crashSevereDrop12Pct = -6;
const crashSevereDrop24Pct = -10;
const crashEmergencyLongLossPct = 1.8;
const dailyMaxLossPct = 3;
const dailyMaxStops = 3;
const paperFeePct = 0.12;
const paperSlippagePct = 0.04;
const learningReviewMs = 10 * 60 * 1000;
const learningReviewHour = 23;
const targetWinRatePct = 60;
const baseQuarantineAssets = new Set([
  "AAVE/USDT",
  "AVAX/USDT",
  "BCH/USDT",
  "ETC/USDT",
  "LINK/USDT",
  "OP/USDT",
  "TWT/USDT"
]);
const emaProfiles = [
  { id: "ema-34", label: "EMA 34", period: 34, color: "#c084fc", role: "быстрая EMA из чисел Фибоначчи: фильтр импульса и отката." },
  { id: "ema-89", label: "EMA 89", period: 89, color: "#38bdf8", role: "медленная EMA из чисел Фибоначчи: фильтр старшего направления." }
];

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

const rsiProfiles = {
  "BTC/USDT": [
    rsiProfile("btc-rsi-14", "RSI 14", 14, "#6da8ff", "Базовый фильтр перекупленности/перепроданности для ликвидного тренда."),
    rsiProfile("btc-rsi-21", "RSI 21", 21, "#f3b14d", "Медленный фильтр структуры, чтобы отсекать рыночный шум.")
  ],
  "ETH/USDT": [
    rsiProfile("eth-rsi-14", "RSI 14", 14, "#6da8ff", "Основной фильтр импульса и отката."),
    rsiProfile("eth-rsi-10", "RSI 10", 10, "#55c7a2", "Более быстрый входной фильтр для активных intraday-движений.")
  ],
  "SOL/USDT": [
    rsiProfile("sol-rsi-9", "RSI 9", 9, "#55c7a2", "Быстрый фильтр для волатильных импульсов SOL."),
    rsiProfile("sol-rsi-14", "RSI 14", 14, "#6da8ff", "Контроль перегрева и подтверждение силы движения.")
  ],
  "BNB/USDT": [
    rsiProfile("bnb-rsi-14", "RSI 14", 14, "#6da8ff", "Сбалансированный фильтр для более плавной структуры BNB."),
    rsiProfile("bnb-rsi-21", "RSI 21", 21, "#f3b14d", "Медленный режим для отсечения ложных сигналов.")
  ],
  "XRP/USDT": [
    rsiProfile("xrp-rsi-7", "RSI 7", 7, "#ef6b5b", "Быстрый фильтр резких новостных импульсов XRP."),
    rsiProfile("xrp-rsi-14", "RSI 14", 14, "#6da8ff", "Базовая проверка перегрева перед входом.")
  ],
  "TON/USDT": [
    rsiProfile("ton-rsi-10", "RSI 10", 10, "#55c7a2", "Фильтр локальных импульсов и откатов."),
    rsiProfile("ton-rsi-21", "RSI 21", 21, "#f3b14d", "Медленный фильтр для более чистого тренда.")
  ],
  "ADA/USDT": [
    rsiProfile("ada-rsi-14", "RSI 14", 14, "#6da8ff", "Стандартный фильтр диапазонов и откатов."),
    rsiProfile("ada-rsi-21", "RSI 21", 21, "#f3b14d", "Подходит для более медленных swing-сценариев.")
  ],
  "DOGE/USDT": [
    rsiProfile("doge-rsi-7", "RSI 7", 7, "#ef6b5b", "Быстрый фильтр мем-импульсов и резких разворотов."),
    rsiProfile("doge-rsi-14", "RSI 14", 14, "#6da8ff", "Контроль перегрева после сильных движений.")
  ],
  "TRX/USDT": [
    rsiProfile("trx-rsi-14", "RSI 14", 14, "#6da8ff", "Базовый фильтр для устойчивых диапазонов TRX."),
    rsiProfile("trx-rsi-21", "RSI 21", 21, "#f3b14d", "Медленный фильтр для спокойного тренда.")
  ],
  "AVAX/USDT": [
    rsiProfile("avax-rsi-10", "RSI 10", 10, "#55c7a2", "Быстрый фильтр для волатильных входов."),
    rsiProfile("avax-rsi-14", "RSI 14", 14, "#6da8ff", "Баланс импульса и риска перегрева.")
  ],
  "LINK/USDT": [
    rsiProfile("link-rsi-14", "RSI 14", 14, "#6da8ff", "Хорош для трендовых и новостных движений LINK."),
    rsiProfile("link-rsi-21", "RSI 21", 21, "#f3b14d", "Фильтр структуры для среднесрочных входов.")
  ],
  "DOT/USDT": [
    rsiProfile("dot-rsi-14", "RSI 14", 14, "#6da8ff", "Базовый фильтр отката."),
    rsiProfile("dot-rsi-21", "RSI 21", 21, "#f3b14d", "Медленный фильтр для спокойной структуры.")
  ],
  "MATIC/USDT": [
    rsiProfile("matic-rsi-10", "RSI 10", 10, "#55c7a2", "Быстрый фильтр импульса."),
    rsiProfile("matic-rsi-14", "RSI 14", 14, "#6da8ff", "Контроль перегрева и ложных пробоев.")
  ],
  "LTC/USDT": [
    rsiProfile("ltc-rsi-14", "RSI 14", 14, "#6da8ff", "Классический фильтр для ликвидного актива."),
    rsiProfile("ltc-rsi-21", "RSI 21", 21, "#f3b14d", "Медленный фильтр swing-структуры.")
  ],
  "BCH/USDT": [
    rsiProfile("bch-rsi-10", "RSI 10", 10, "#55c7a2", "Быстрее реагирует на резкие движения BCH."),
    rsiProfile("bch-rsi-14", "RSI 14", 14, "#6da8ff", "Базовый фильтр перегрева.")
  ],
  "UNI/USDT": [
    rsiProfile("uni-rsi-14", "RSI 14", 14, "#6da8ff", "Фильтр DeFi-нарратива и откатов."),
    rsiProfile("uni-rsi-21", "RSI 21", 21, "#f3b14d", "Отсекает шум в менее резких движениях.")
  ],
  "AAVE/USDT": [
    rsiProfile("aave-rsi-14", "RSI 14", 14, "#6da8ff", "Базовая оценка импульса AAVE."),
    rsiProfile("aave-rsi-21", "RSI 21", 21, "#f3b14d", "Подходит для swing-фильтра.")
  ],
  "APT/USDT": [
    rsiProfile("apt-rsi-9", "RSI 9", 9, "#55c7a2", "Быстрый фильтр волатильных импульсов."),
    rsiProfile("apt-rsi-14", "RSI 14", 14, "#6da8ff", "Контроль перегрева и подтверждение тренда.")
  ],
  "SUI/USDT": [
    rsiProfile("sui-rsi-9", "RSI 9", 9, "#55c7a2", "Быстрый фильтр импульса."),
    rsiProfile("sui-rsi-14", "RSI 14", 14, "#6da8ff", "Базовый фильтр разворота/продолжения.")
  ],
  "ARB/USDT": [
    rsiProfile("arb-rsi-10", "RSI 10", 10, "#55c7a2", "Быстрый фильтр для L2-нарратива."),
    rsiProfile("arb-rsi-14", "RSI 14", 14, "#6da8ff", "Стандартный контроль перегрева.")
  ],
  "OP/USDT": [
    rsiProfile("op-rsi-10", "RSI 10", 10, "#55c7a2", "Быстрый фильтр отката."),
    rsiProfile("op-rsi-14", "RSI 14", 14, "#6da8ff", "Основной фильтр силы движения.")
  ],
  "NEAR/USDT": [
    rsiProfile("near-rsi-10", "RSI 10", 10, "#55c7a2", "Подходит для быстрых импульсов NEAR."),
    rsiProfile("near-rsi-14", "RSI 14", 14, "#6da8ff", "Базовая проверка перегрева.")
  ],
  "ATOM/USDT": [
    rsiProfile("atom-rsi-14", "RSI 14", 14, "#6da8ff", "Базовый фильтр структуры."),
    rsiProfile("atom-rsi-21", "RSI 21", 21, "#f3b14d", "Медленный фильтр swing-сценариев.")
  ],
  "INJ/USDT": [
    rsiProfile("inj-rsi-9", "RSI 9", 9, "#55c7a2", "Быстрый фильтр сильных импульсов."),
    rsiProfile("inj-rsi-14", "RSI 14", 14, "#6da8ff", "Контроль перегрева после тренда.")
  ],
  "FIL/USDT": [
    rsiProfile("fil-rsi-14", "RSI 14", 14, "#6da8ff", "Базовый фильтр отката."),
    rsiProfile("fil-rsi-21", "RSI 21", 21, "#f3b14d", "Медленный фильтр для более шумного актива.")
  ],
  "ETC/USDT": [
    rsiProfile("etc-rsi-10", "RSI 10", 10, "#55c7a2", "Быстрый фильтр резких импульсов ETC."),
    rsiProfile("etc-rsi-14", "RSI 14", 14, "#6da8ff", "Базовый фильтр перегрева.")
  ],
  "SEI/USDT": [
    rsiProfile("sei-rsi-7", "RSI 7", 7, "#ef6b5b", "Очень быстрый фильтр молодой волатильной монеты."),
    rsiProfile("sei-rsi-14", "RSI 14", 14, "#6da8ff", "Контроль ложных импульсов.")
  ],
  "TIA/USDT": [
    rsiProfile("tia-rsi-9", "RSI 9", 9, "#55c7a2", "Быстрый фильтр волатильных входов."),
    rsiProfile("tia-rsi-14", "RSI 14", 14, "#6da8ff", "Базовая оценка перегрева.")
  ],
  "TWT/USDT": [
    rsiProfile("twt-rsi-10", "RSI 10", 10, "#55c7a2", "Быстрый фильтр локального импульса TWT."),
    rsiProfile("twt-rsi-21", "RSI 21", 21, "#f3b14d", "Медленный фильтр для отсечения шума.")
  ]
};

function rsiProfile(id, label, period, color, role) {
  return { id, label, period, color, role };
}

function getCurrentSessionId() {
  let sessionId = sessionStorage.getItem(paperSessionKey);
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.round(Math.random() * 10000)}`;
    sessionStorage.setItem(paperSessionKey, sessionId);
  }
  return sessionId;
}

function getCurrentClientId() {
  let clientId = localStorage.getItem(remoteClientIdKey);
  if (!clientId) {
    clientId = `client-${Date.now()}-${Math.round(Math.random() * 100000)}`;
    localStorage.setItem(remoteClientIdKey, clientId);
  }
  return clientId;
}

function loadRemoteJournalConfig() {
  const sharedConfig = normalizeRemoteJournalConfig(window.BOTALIN_REMOTE_JOURNAL_CONFIG);
  try {
    const saved = JSON.parse(localStorage.getItem(remoteJournalConfigKey));
    const savedConfig = normalizeRemoteJournalConfig(saved);
    return isRemoteJournalConfigFilled(savedConfig) ? savedConfig : sharedConfig;
  } catch (error) {
    return sharedConfig;
  }
}

function normalizeRemoteJournalConfig(config = {}) {
  return {
    url: String(config?.url || "").trim().replace(/\/$/, ""),
    anonKey: String(config?.anonKey || "").trim(),
    table: String(config?.table || "crypto_strategy_trades").trim() || "crypto_strategy_trades"
  };
}

function isRemoteJournalConfigFilled(config) {
  return Boolean(config?.url && config?.anonKey && config?.table);
}

function loadCmcRadarConfig() {
  const sharedConfig = normalizeCmcRadarConfig(window.BOTALIN_MARKET_RADAR_CONFIG);
  try {
    const saved = JSON.parse(localStorage.getItem(cmcRadarConfigKey));
    const savedConfig = normalizeCmcRadarConfig(saved);
    return savedConfig.apiKey || savedConfig.proxyUrl ? { ...sharedConfig, ...savedConfig } : sharedConfig;
  } catch (error) {
    return sharedConfig;
  }
}

function normalizeCmcRadarConfig(config = {}) {
  return {
    apiKey: String(config?.apiKey || "").trim(),
    proxyUrl: String(config?.proxyUrl || "").trim().replace(/\/$/, ""),
    limit: Number(config?.limit) || 100,
    minVolume24h: Number(config?.minVolume24h) || 50000000,
    minAgeDays: Number(config?.minAgeDays) || 180,
    topCount: Number(config?.topCount) || 10
  };
}

function loadNewsAnalyticsConfig() {
  const sharedConfig = normalizeNewsAnalyticsConfig(window.BOTALIN_NEWS_CONFIG);
  try {
    const saved = JSON.parse(localStorage.getItem(newsAnalyticsConfigKey));
    const savedConfig = normalizeNewsAnalyticsConfig(saved);
    return hasNewsAnalyticsConfig(savedConfig) ? { ...sharedConfig, ...savedConfig } : sharedConfig;
  } catch (error) {
    return sharedConfig;
  }
}

function normalizeNewsAnalyticsConfig(config = {}) {
  return {
    exchangeUrl: String(config?.exchangeUrl || "").trim(),
    cmcApiKey: String(config?.cmcApiKey || "").trim(),
    cmcProxyUrl: String(config?.cmcProxyUrl || "").trim().replace(/\/$/, ""),
    cftcUrl: String(config?.cftcUrl || "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm").trim(),
    manualText: String(config?.manualText || "").trim()
  };
}

function hasNewsAnalyticsConfig(config) {
  return Boolean(config?.exchangeUrl || config?.cmcApiKey || config?.cmcProxyUrl || config?.cftcUrl || config?.manualText);
}

function createEmptyMarketIntel() {
  return {
    loading: false,
    updatedAt: null,
    backtest: null,
    derivatives: null,
    sentiment: null,
    learning: null,
    monthlyGoal: null,
    news: null,
    notes: ["Интеллект-фильтры ждут обновления."]
  };
}

function loadAutopilotState() {
  try {
    const saved = JSON.parse(localStorage.getItem(autopilotKey));
    return {
      enabled: Boolean(saved?.enabled),
      scalpingEnabled: Boolean(saved?.scalpingEnabled),
      lastEntryAt: Number(saved?.lastEntryAt) || 0,
      lastScanAt: 0,
      lastMessage: String(saved?.lastMessage || "наблюдает")
    };
  } catch (error) {
    return { enabled: false, scalpingEnabled: false, lastEntryAt: 0, lastScanAt: 0, lastMessage: "наблюдает" };
  }
}

function loadLearningPolicy() {
  try {
    const saved = JSON.parse(localStorage.getItem(learningPolicyKey));
    return {
      lastReviewDate: String(saved?.lastReviewDate || ""),
      reviewedAt: Number(saved?.reviewedAt) || 0,
      blockedAssets: Array.isArray(saved?.blockedAssets) ? saved.blockedAssets : [],
      blockedPatterns: Array.isArray(saved?.blockedPatterns) ? saved.blockedPatterns : [],
      preferredPatterns: Array.isArray(saved?.preferredPatterns) ? saved.preferredPatterns : [],
      notes: Array.isArray(saved?.notes) ? saved.notes : []
    };
  } catch (error) {
    return { lastReviewDate: "", reviewedAt: 0, blockedAssets: [], blockedPatterns: [], preferredPatterns: [], notes: [] };
  }
}

function loadRejectedSignals() {
  try {
    const saved = JSON.parse(localStorage.getItem(rejectedSignalsKey));
    return Array.isArray(saved?.items) ? saved.items.slice(-300) : [];
  } catch (error) {
    return [];
  }
}

const state = {
  rules: loadRules(),
  lastStrategy: "",
  lastUserIdea: "",
  tradePlan: null,
  signalQuality: null,
  paperTrades: loadPaperTrades(),
  rejectedSignals: loadRejectedSignals(),
  activePaperTradeId: null,
  paperPriceCache: {},
  paperPriceLastFetch: 0,
  remoteJournal: {
    config: loadRemoteJournalConfig(),
    syncing: false,
    lastSyncAt: 0,
    status: "local"
  },
  cmcRadar: {
    config: loadCmcRadarConfig(),
    assets: [],
    updatedAt: 0,
    status: "off",
    error: ""
  },
  newsAnalytics: {
    config: loadNewsAnalyticsConfig(),
    items: [],
    updatedAt: 0,
    status: "off",
    error: "",
    sourceStatus: []
  },
  marketIntel: createEmptyMarketIntel(),
  autopilot: loadAutopilotState(),
  learningPolicy: loadLearningPolicy(),
  emaPreferences: {},
  detectedMode: "trend",
  rsiPreferences: {},
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
const deposit = document.querySelector("#deposit");
const conservative = document.querySelector("#conservative");
const includeLongs = document.querySelector("#includeLongs");
const includeShorts = document.querySelector("#includeShorts");
const cmcApiKey = document.querySelector("#cmcApiKey");
const cmcProxyUrl = document.querySelector("#cmcProxyUrl");
const cmcLimit = document.querySelector("#cmcLimit");
const cmcMinVolume = document.querySelector("#cmcMinVolume");
const cmcStatus = document.querySelector("[data-cmc-status]");
const cmcSave = document.querySelector("[data-cmc-save]");
const cmcRefresh = document.querySelector("[data-cmc-refresh]");
const cmcRadarList = document.querySelector("[data-cmc-radar-list]");
const exchangeNewsUrl = document.querySelector("#exchangeNewsUrl");
const cmcNewsApiKey = document.querySelector("#cmcNewsApiKey");
const cmcNewsProxyUrl = document.querySelector("#cmcNewsProxyUrl");
const cftcNewsUrl = document.querySelector("#cftcNewsUrl");
const manualNewsInput = document.querySelector("#manualNewsInput");
const newsStatus = document.querySelector("[data-news-status]");
const newsSave = document.querySelector("[data-news-save]");
const newsRefresh = document.querySelector("[data-news-refresh]");
const newsList = document.querySelector("[data-news-list]");
const trainingInput = document.querySelector("#trainingInput");
const rulesContainer = document.querySelector("[data-rules]");
const sourcesContainer = document.querySelector("[data-sources]");
const sourceCount = document.querySelector("[data-source-count]");
const rsiAssetLabel = document.querySelector("[data-rsi-asset]");
const rsiControls = document.querySelector("[data-rsi-controls]");
const emaControls = document.querySelector("[data-ema-controls]");
const strategyContainer = document.querySelector("[data-strategy]");
const confidence = document.querySelector("[data-confidence]");
const chartLabel = document.querySelector("[data-chart-label]");
const chartTitle = document.querySelector("[data-chart-title]");
const rr = document.querySelector("[data-rr]");
const maxRisk = document.querySelector("[data-max-risk]");
const filterCount = document.querySelector("[data-filter-count]");
const signalScore = document.querySelector("[data-signal-score]");
const planSide = document.querySelector("[data-plan-side]");
const planEntry = document.querySelector("[data-plan-entry]");
const planStop = document.querySelector("[data-plan-stop]");
const planTarget = document.querySelector("[data-plan-target]");
const backtestScore = document.querySelector("[data-backtest-score]");
const monthlyGoal = document.querySelector("[data-monthly-goal]");
const derivativesScore = document.querySelector("[data-derivatives-score]");
const learningScore = document.querySelector("[data-learning-score]");
const autopilotStatus = document.querySelector("[data-autopilot-status]");
const intelDetails = document.querySelector("[data-intel-details]");
const intelRefresh = document.querySelector("[data-intel-refresh]");
const autopilotToggle = document.querySelector("[data-autopilot-toggle]");
const scalpingMode = document.querySelector("#scalpingMode");
const liveStatus = document.querySelector("[data-live-status]");
const liveToggle = document.querySelector("[data-live-toggle]");
const livePrice = document.querySelector("[data-live-price]");
const liveBook = document.querySelector("[data-live-book]");
const liveSpread = document.querySelector("[data-live-spread]");
const liveVolume = document.querySelector("[data-live-volume]");
const liveUpdated = document.querySelector("[data-live-updated]");
const remoteUrl = document.querySelector("#remoteUrl");
const remoteKey = document.querySelector("#remoteKey");
const remoteTable = document.querySelector("#remoteTable");
const remoteStatus = document.querySelector("[data-remote-status]");
const remoteSave = document.querySelector("[data-remote-save]");
const remoteSync = document.querySelector("[data-remote-sync]");
const paperCanvas = document.querySelector("#paperChart");
const paperCtx = paperCanvas.getContext("2d");
const paperAmount = document.querySelector("#paperAmount");
const paperSide = document.querySelector("#paperSide");
const paperStatus = document.querySelector("[data-paper-status]");
const paperEntry = document.querySelector("[data-paper-entry]");
const paperCurrent = document.querySelector("[data-paper-current]");
const paperPnl = document.querySelector("[data-paper-pnl]");
const paperResult = document.querySelector("[data-paper-result]");
const walletFree = document.querySelector("[data-wallet-free]");
const walletReserved = document.querySelector("[data-wallet-reserved]");
const paperEnter = document.querySelector("[data-paper-enter]");
const paperReset = document.querySelector("[data-paper-reset]");
const paperClear = document.querySelector("[data-paper-clear]");
const exportJournal = document.querySelector("[data-export-journal]");
const journalRows = document.querySelector("[data-journal-rows]");
const journalOpen = document.querySelector("[data-journal-open]");
const journalClosed = document.querySelector("[data-journal-closed]");
const journalPnl = document.querySelector("[data-journal-pnl]");
const journalWinloss = document.querySelector("[data-journal-winloss]");
const archiveToggle = document.querySelector("[data-archive-toggle]");
const archiveRefresh = document.querySelector("[data-archive-refresh]");
const archivePanel = document.querySelector("[data-archive-panel]");
const archiveRows = document.querySelector("[data-archive-rows]");
const archiveTotal = document.querySelector("[data-archive-total]");
const archiveManual = document.querySelector("[data-archive-manual]");
const archiveAuto = document.querySelector("[data-archive-auto]");
const archivePnl = document.querySelector("[data-archive-pnl]");
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

function loadPaperTrades() {
  try {
    const saved = JSON.parse(localStorage.getItem(paperJournalKey));
    return Array.isArray(saved?.trades) ? saved.trades.map(normalizePaperTrade).filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function normalizePaperTrade(trade) {
  if (!trade || !Number.isFinite(Number(trade.entry)) || !Number.isFinite(Number(trade.amount))) return null;
  const entry = Number(trade.entry);
  const amount = Number(trade.amount);
  const side = trade.side === "SHORT" ? "SHORT" : "LONG";
  const stop = Number(trade.stop) || entry;
  const target = Number(trade.target) || entry;
  const target1 = Number(trade.target1) || target;
  const status = ["pending", "open", "partial", "target", "stop"].includes(trade.status) ? trade.status : "open";
  const isActiveStatus = ["pending", "open", "partial"].includes(status);
  const initialQuantity = Number(trade.initialQuantity) || Number(trade.quantity) || amount / entry;
  const target1Quantity = Number(trade.target1Quantity) || initialQuantity * 0.5;
  const remainingQuantity = Number.isFinite(Number(trade.remainingQuantity))
    ? Number(trade.remainingQuantity)
    : ["target", "stop"].includes(status)
      ? 0
      : status === "partial"
        ? Math.max(0, initialQuantity - target1Quantity)
        : initialQuantity;
  const normalizedExitPrice = normalizePaperExitPrice({ ...trade, side, status, stop, target });
  const legacyClosedPnl = normalizedExitPrice
    ? calculatePaperPnlForQuantity({ side, entry }, normalizedExitPrice, initialQuantity)
    : 0;
  const realizedPnl = Number.isFinite(Number(trade.realizedPnl))
    ? Number(trade.realizedPnl)
    : ["target", "stop"].includes(status)
      ? legacyClosedPnl
      : 0;
  const normalizedPnl = Number.isFinite(Number(trade.pnl))
    ? Number(trade.pnl)
    : normalizedExitPrice
      ? realizedPnl
      : 0;
  const normalizedPnlPct = normalizedExitPrice ? (normalizedPnl / amount) * 100 : Number(trade.pnlPct) || 0;
  const history = Array.isArray(trade.history) && trade.history.length
    ? trade.history
    : [{ time: Number(trade.openedAt) || Date.now(), price: normalizedExitPrice || entry, pnl: normalizedPnl, pnlPct: normalizedPnlPct }];
  const normalizedTrade = {
    ...trade,
    id: String(trade.id || `trade-${Date.now()}-${Math.round(Math.random() * 1000)}`),
    asset: String(trade.asset || "BTC/USDT"),
    sessionId: String(trade.sessionId || "legacy"),
    timeframe: String(trade.timeframe || "15m"),
    mode: String(trade.mode || ""),
    modeSource: String(trade.modeSource || ""),
    strategyMode: String(trade.strategyMode || trade.strategySnapshot?.context?.strategyMode || "standard"),
    side,
    amount,
    deposit: Number(trade.deposit) || loadDeposit(),
    riskBudget: Number(trade.riskBudget) || (Number(trade.deposit) || loadDeposit()) * 0.02,
    riskLimitPct: Number(trade.riskLimitPct) || 2,
    autopilot: Boolean(trade.autopilot),
    autopilotReason: String(trade.autopilotReason || ""),
    entry,
    quantity: Number(trade.quantity) || amount / entry,
    stop,
    target,
    target1,
    initialQuantity,
    target1Quantity,
    remainingQuantity,
    realizedPnl,
    target1HitAt: Number(trade.target1HitAt) || null,
    target1ExitPrice: Number(trade.target1ExitPrice) || null,
    placedPrice: Number(trade.placedPrice) || entry,
    triggerDirection: trade.triggerDirection === "below" ? "below" : "above",
    executionType: String(trade.executionType || ""),
    immediateFill: Boolean(trade.immediateFill),
    openedAt: Number(trade.openedAt) || Date.now(),
    filledAt: Number(trade.filledAt) || null,
    closedAt: Number(trade.closedAt) || null,
    status,
    result: String(trade.result || "в работе"),
    decision: String(trade.decision || ""),
    score: Number(trade.score) || null,
    strategySnapshot: normalizeStrategySnapshot(trade.strategySnapshot),
    lastCheckedAt: Number(trade.lastCheckedAt) || Number(trade.openedAt) || Date.now(),
    exitPrice: normalizedExitPrice,
    pnl: normalizedPnl,
    pnlPct: normalizedPnlPct,
    reservedAmount: Number.isFinite(Number(trade.reservedAmount))
      ? Number(trade.reservedAmount)
      : Number(trade.budgetReserved)
        ? amount
        : 0,
    releasedAmount: Number.isFinite(Number(trade.releasedAmount)) ? Number(trade.releasedAmount) : 0,
    releasedPnl: Number.isFinite(Number(trade.releasedPnl)) ? Number(trade.releasedPnl) : 0,
    budgetReserved: Boolean(trade.budgetReserved),
    walletSettled: Boolean(trade.walletSettled || (!isActiveStatus && trade.budgetReserved)),
    history
  };
  return ensureBybitPaperState(normalizedTrade);
}

function ensureBybitPaperState(trade) {
  const bybitSymbol = toBinanceSymbol(trade.asset);
  const orderLinkId = trade.orderLinkId || `paper-${trade.id}`;
  const closeSide = trade.side === "LONG" ? "Sell" : "Buy";
  const openingSide = trade.side === "LONG" ? "Buy" : "Sell";
  const orderType = getOpeningOrderType(trade.side, trade.placedPrice, trade.entry, trade.executionType);
  const isPositionActive = ["open", "partial"].includes(trade.status);
  const tp1Order = trade.tp1Order || buildPaperTpslOrder(trade, "TakeProfit", closeSide, "target1");
  const tp2Order = trade.tp2Order || trade.tpOrder || buildPaperTpslOrder(trade, "TakeProfit", closeSide, "target2");

  return {
    ...trade,
    bybitSymbol,
    category: trade.category || "linear",
    positionIdx: Number(trade.positionIdx) || 0,
    orderLinkId,
    openingOrder: trade.openingOrder || {
      orderId: `${trade.id}-entry`,
      orderLinkId,
      category: "linear",
      symbol: bybitSymbol,
      side: openingSide,
      orderType,
      price: trade.entry,
      qty: trade.quantity,
      timeInForce: "GTC",
      reduceOnly: false,
      orderStatus: trade.status === "pending" ? "New" : "Filled",
      triggerPrice: orderType === "Conditional" ? trade.entry : null,
      triggerDirection: trade.triggerDirection === "above" ? 1 : 2,
      lastPriceOnCreated: trade.placedPrice
    },
    position: trade.position || {
      symbol: bybitSymbol,
      side: trade.side === "LONG" ? "Buy" : "Sell",
      size: isPositionActive ? getRemainingQuantity(trade) : 0,
      avgPrice: isPositionActive ? trade.entry : null,
      positionStatus: isPositionActive ? "Normal" : trade.status === "pending" ? "None" : "Closed",
      closedPnl: ["target", "stop"].includes(trade.status) ? trade.pnl : 0
    },
    tp1Order,
    tp2Order,
    tpOrder: tp2Order,
    slOrder: trade.slOrder || buildPaperTpslOrder(trade, "StopLoss", closeSide)
  };
}

function buildPaperTpslOrder(trade, type, side, targetLevel = "target2") {
  const isTakeProfit = type === "TakeProfit";
  const isFirstTarget = targetLevel === "target1";
  const triggerPrice = isTakeProfit && isFirstTarget ? trade.target1 : isTakeProfit ? trade.target : trade.stop;
  const isClosedByThisOrder = (isTakeProfit && trade.status === "target") || (!isTakeProfit && trade.status === "stop");
  const isFirstTargetFilled = isTakeProfit && isFirstTarget && Boolean(trade.target1HitAt);
  const isClosedByOtherOrder = (isTakeProfit && trade.status === "stop") || (!isTakeProfit && trade.status === "target");
  return {
    orderId: `${trade.id}-${isTakeProfit ? isFirstTarget ? "tp1" : "tp2" : "sl"}`,
    parentOrderLinkId: trade.orderLinkId || `paper-${trade.id}`,
    symbol: toBinanceSymbol(trade.asset),
    side,
    reduceOnly: true,
    stopOrderType: type,
    orderType: "Market",
    triggerPrice,
    orderStatus: trade.status === "pending" ? "Inactive" : isFirstTargetFilled || isClosedByThisOrder ? "Filled" : isClosedByOtherOrder ? "Cancelled" : "Untriggered"
  };
}

function normalizePaperExitPrice(trade) {
  if (trade.status === "target") return Number(trade.target) || null;
  if (trade.status === "stop") return Number(trade.stop) || null;
  return Number(trade.exitPrice) || null;
}

function normalizeStrategySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  return {
    ...snapshot,
    version: String(snapshot.version || "1"),
    capturedAt: Number(snapshot.capturedAt) || Date.now(),
    strategyText: String(snapshot.strategyText || ""),
    strategyHtml: String(snapshot.strategyHtml || ""),
    outcome: snapshot.outcome && typeof snapshot.outcome === "object" ? snapshot.outcome : null
  };
}

function persist() {
  localStorage.setItem(storageKey, JSON.stringify({ rules: state.rules }));
}

function persistPaperTrades() {
  localStorage.setItem(paperJournalKey, JSON.stringify({ trades: state.paperTrades }));
  scheduleRemoteJournalSync();
}

function persistRejectedSignals() {
  localStorage.setItem(rejectedSignalsKey, JSON.stringify({ items: state.rejectedSignals.slice(-300) }));
}

function rememberRejectedSignal(context, signalQuality, gate, tradePlan = null, source = "autopilot") {
  const best = signalQuality?.best || {};
  const item = {
    id: `reject-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    time: Date.now(),
    source,
    asset: context.asset,
    timeframe: context.timeframe,
    mode: context.mode,
    side: best.side || "",
    score: Number(best.score) || 0,
    reason: String(gate?.reason || "фильтр"),
    patternKey: getQualityPatternKey(context, best.side),
    marketStructure: context.intel?.marketStructure || null,
    news: context.news || summarizeNewsForAsset(context.asset),
    scenarios: tradePlan?.scenarios?.map(snapshotScenario) || []
  };
  const duplicate = state.rejectedSignals.some((signal) =>
    signal.asset === item.asset &&
    signal.timeframe === item.timeframe &&
    signal.side === item.side &&
    signal.reason === item.reason &&
    Date.now() - Number(signal.time) < 10 * 60 * 1000
  );
  if (!duplicate) {
    state.rejectedSignals.push(item);
    state.rejectedSignals = state.rejectedSignals.slice(-300);
    persistRejectedSignals();
  }
}

function loadDeposit() {
  const saved = Number(localStorage.getItem(depositKey));
  return Number.isFinite(saved) && saved >= 0 ? saved : 10000;
}

function persistDeposit() {
  localStorage.setItem(depositKey, String(getDepositValue()));
}

function getDepositValue() {
  const value = Number(deposit.value);
  return Number.isFinite(value) && value >= 0 ? value : 10000;
}

function setDepositValue(value, options = {}) {
  const normalized = Math.max(0, Number(value) || 0);
  deposit.value = normalized.toFixed(2);
  persistDeposit();
  if (!options.silent) {
    renderWalletReadout();
    renderStrategyIntelligence();
  }
}

function adjustDepositValue(delta, options = {}) {
  setDepositValue(getDepositValue() + (Number(delta) || 0), options);
}

function getReservedPaperBudget() {
  return state.paperTrades
    .filter(isPaperTradeActive)
    .reduce((sum, trade) => sum + Math.max(0, (Number(trade.reservedAmount) || 0) - (Number(trade.releasedAmount) || 0)), 0);
}

function getTradeAllocationLimits(options = {}) {
  if (options.scalping) {
    return { singlePct: scalpingMaxSingleTradePct, portfolioPct: autopilotMaxPortfolioPct };
  }
  return options.autopilot
    ? { singlePct: autopilotMaxSingleTradePct, portfolioPct: autopilotMaxPortfolioPct }
    : { singlePct: manualMaxSingleTradePct, portfolioPct: manualMaxPortfolioPct };
}

function getMaxTradeAmountByWallet(options = {}) {
  const free = getDepositValue();
  const reserved = getReservedPaperBudget();
  const budgetBase = Math.max(free + reserved, free);
  const limits = getTradeAllocationLimits(options);
  const singleLimit = budgetBase * (limits.singlePct / 100);
  const portfolioLimitLeft = Math.max(0, budgetBase * (limits.portfolioPct / 100) - reserved);
  return Math.max(0, Math.floor(Math.min(free, singleLimit, portfolioLimitLeft) * 100) / 100);
}

function renderWalletReadout() {
  const free = getDepositValue();
  const reserved = getReservedPaperBudget();
  if (walletFree) walletFree.textContent = `${free.toFixed(2)} USDT`;
  if (walletReserved) walletReserved.textContent = `${reserved.toFixed(2)} USDT`;
  if (paperAmount) {
    paperAmount.max = String(getMaxTradeAmountByWallet());
  }
}

function reservePaperBudget(amount) {
  const normalizedAmount = Math.floor((Number(amount) || 0) * 100) / 100;
  const available = getDepositValue();
  if (normalizedAmount < 10 || normalizedAmount > available + 0.0001) return false;
  adjustDepositValue(-normalizedAmount, { silent: true });
  renderWalletReadout();
  renderStrategyIntelligence();
  return true;
}

function settlePaperBudget(trade, releasedAmount, pnlDelta, options = {}) {
  const amount = Math.max(0, Number(releasedAmount) || 0);
  const pnl = Number(pnlDelta) || 0;
  trade.releasedAmount = (Number(trade.releasedAmount) || 0) + amount;
  trade.releasedPnl = (Number(trade.releasedPnl) || 0) + pnl;
  adjustDepositValue(amount + pnl, { silent: true });
  if (!options.silent) {
    renderWalletReadout();
    renderStrategyIntelligence();
  }
}

function reconcileLegacyPaperBudget() {
  let changed = false;
  state.paperTrades.forEach((trade) => {
    if (!isPaperTradeActive(trade) || trade.budgetReserved) return;
    const amount = Math.max(0, Number(trade.amount) || 0);
    const reserve = Math.min(amount, getDepositValue());
    trade.reservedAmount = reserve;
    trade.releasedAmount = 0;
    trade.releasedPnl = 0;
    trade.budgetReserved = reserve > 0;
    changed = true;
    if (reserve > 0) adjustDepositValue(-reserve, { silent: true });
  });
  if (changed) {
    persistPaperTrades();
    renderWalletReadout();
  }
}

function initRemoteJournalControls() {
  const config = state.remoteJournal.config;
  remoteUrl.value = config.url;
  remoteKey.value = config.anonKey;
  remoteTable.value = config.table || "crypto_strategy_trades";
  renderRemoteJournalStatus();
}

function saveRemoteJournalConfig() {
  state.remoteJournal.config = normalizeRemoteJournalConfig({
    url: remoteUrl.value,
    anonKey: remoteKey.value,
    table: remoteTable.value
  });
  localStorage.setItem(remoteJournalConfigKey, JSON.stringify(state.remoteJournal.config));
  setRemoteJournalStatus(isRemoteJournalConfigured() ? "saved" : "local");
  syncRemoteJournal(true);
}

function isRemoteJournalConfigured() {
  const config = state.remoteJournal.config;
  return Boolean(config.url && config.anonKey && config.table);
}

function renderRemoteJournalStatus() {
  remoteStatus.textContent = state.remoteJournal.status;
}

function setRemoteJournalStatus(status) {
  state.remoteJournal.status = status;
  renderRemoteJournalStatus();
}

function initCmcRadarControls() {
  const config = state.cmcRadar.config;
  cmcApiKey.value = config.apiKey;
  cmcProxyUrl.value = config.proxyUrl;
  cmcLimit.value = String(config.limit);
  cmcMinVolume.value = String(config.minVolume24h);
  renderCmcRadar();
}

function saveCmcRadarConfig() {
  state.cmcRadar.config = normalizeCmcRadarConfig({
    apiKey: cmcApiKey.value,
    proxyUrl: cmcProxyUrl.value,
    limit: cmcLimit.value,
    minVolume24h: cmcMinVolume.value
  });
  localStorage.setItem(cmcRadarConfigKey, JSON.stringify(state.cmcRadar.config));
  renderCmcRadar();
  refreshCmcRadar(true);
}

function isCmcRadarConfigured() {
  const config = state.cmcRadar.config;
  return Boolean(config.proxyUrl || config.apiKey);
}

function setCmcRadarStatus(status, error = "") {
  state.cmcRadar.status = status;
  state.cmcRadar.error = error;
  renderCmcRadar();
}

async function refreshCmcRadar(force = false) {
  if (!isCmcRadarConfigured()) {
    setCmcRadarStatus("off");
    return;
  }
  if (!force && Date.now() - state.cmcRadar.updatedAt < 10 * 60 * 1000) return;
  setCmcRadarStatus("sync");
  try {
    const listings = await fetchCmcListings();
    state.cmcRadar.assets = buildCmcRadarAssets(listings);
    state.cmcRadar.updatedAt = Date.now();
    setCmcRadarStatus(`top ${state.cmcRadar.assets.length}`);
    generateStrategy(state.lastUserIdea);
  } catch (error) {
    setCmcRadarStatus("error", "CMC недоступен: проверь API key или proxy URL");
  }
}

async function fetchCmcListings() {
  const config = state.cmcRadar.config;
  const params = new URLSearchParams({
    start: "1",
    limit: String(config.limit),
    convert: "USD",
    sort: "market_cap",
    cryptocurrency_type: "coins"
  });
  const url = config.proxyUrl
    ? `${config.proxyUrl}?${params.toString()}`
    : `https://pro-api.coinmarketcap.com/v3/cryptocurrency/listings/latest?${params.toString()}`;
  const response = await fetch(url, {
    headers: config.proxyUrl ? {} : { "X-CMC_PRO_API_KEY": config.apiKey }
  });
  if (!response.ok) throw new Error("CMC request failed");
  const data = await response.json();
  return Array.isArray(data?.data) ? data.data : [];
}

function buildCmcRadarAssets(listings) {
  const config = state.cmcRadar.config;
  const now = Date.now();
  return listings
    .map(normalizeCmcAsset)
    .filter((item) => item.asset && item.rank <= config.limit)
    .filter((item) => item.volume24h >= config.minVolume24h)
    .filter((item) => item.ageDays >= config.minAgeDays)
    .sort((a, b) => b.radarScore - a.radarScore)
    .slice(0, config.topCount)
    .map((item) => ({ ...item, updatedAt: now }));
}

function normalizeCmcAsset(item) {
  const quote = item.quote?.USD || {};
  const symbol = String(item.symbol || "").toUpperCase();
  const marketCap = Number(quote.market_cap) || 0;
  const fdv = Number(quote.fully_diluted_market_cap) || 0;
  const fdvRatio = marketCap > 0 && fdv > 0 ? fdv / marketCap : 1;
  const ageDays = item.date_added ? (Date.now() - new Date(item.date_added).getTime()) / 86400000 : 0;
  const volume24h = Number(quote.volume_24h) || 0;
  const volumeChange24h = Number(quote.volume_change_24h) || 0;
  const change30d = Number(quote.percent_change_30d) || 0;
  const change90d = Number(quote.percent_change_90d) || 0;
  const liquidityBonus = Math.min(20, Math.log10(Math.max(1, volume24h)) * 2);
  const fdvPenalty = fdvRatio > 2 ? Math.min(30, (fdvRatio - 2) * 8) : 0;
  const radarScore = change30d + change90d + volumeChange24h + liquidityBonus - fdvPenalty;
  return {
    id: item.id,
    symbol,
    name: item.name,
    slug: item.slug,
    tags: Array.isArray(item.tags) ? item.tags.slice(0, 6) : [],
    asset: findAssetValueBySymbol(symbol),
    rank: Number(item.cmc_rank) || 9999,
    price: Number(quote.price) || 0,
    volume24h,
    volumeChange24h,
    change1h: Number(quote.percent_change_1h) || 0,
    change24h: Number(quote.percent_change_24h) || 0,
    change7d: Number(quote.percent_change_7d) || 0,
    change30d,
    change60d: Number(quote.percent_change_60d) || 0,
    change90d,
    marketCap,
    dominance: Number(quote.market_cap_dominance) || 0,
    circulatingSupply: Number(item.circulating_supply) || 0,
    totalSupply: Number(item.total_supply) || 0,
    maxSupply: Number(item.max_supply) || 0,
    fullyDilutedMarketCap: fdv,
    numMarketPairs: Number(item.num_market_pairs) || 0,
    dateAdded: item.date_added || "",
    ageDays,
    fdvRatio,
    radarScore
  };
}

function findAssetValueBySymbol(symbol) {
  const option = [...asset.options].find((item) => item.value.replace("/USDT", "") === symbol);
  return option?.value || "";
}

function getMarketRadarAsset(symbol = asset.value) {
  return state.cmcRadar.assets.find((item) => item.asset === symbol) || null;
}

function getCmcRadarScanAssets() {
  const values = state.cmcRadar.assets.map((item) => item.asset).filter(Boolean);
  return values.length ? values : null;
}

function renderCmcRadar() {
  cmcStatus.textContent = state.cmcRadar.status;
  if (!state.cmcRadar.assets.length) {
    cmcRadarList.innerHTML = `<span>${escapeHtml(state.cmcRadar.error || "CMC выбирает монеты для наблюдения, входы остаются по Bybit.")}</span>`;
    return;
  }
  cmcRadarList.innerHTML = state.cmcRadar.assets.map((item, index) => `
    <button type="button" data-cmc-asset="${escapeHtml(item.asset)}">
      <strong>${index + 1}. ${escapeHtml(item.symbol)}</strong>
      <span>#${item.rank} · 30д ${item.change30d.toFixed(1)}% · 90д ${item.change90d.toFixed(1)}%</span>
      <em>${Math.round(item.radarScore)}</em>
    </button>
  `).join("");
  cmcRadarList.querySelectorAll("[data-cmc-asset]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!button.dataset.cmcAsset) return;
      asset.value = button.dataset.cmcAsset;
      renderRsiControls();
      if (state.live.enabled) restartLiveConnection();
      generateStrategy(state.lastUserIdea);
      refreshStrategyIntelligence(true);
    });
  });
}

function initNewsAnalyticsControls() {
  const config = state.newsAnalytics.config;
  exchangeNewsUrl.value = config.exchangeUrl;
  cmcNewsApiKey.value = config.cmcApiKey;
  cmcNewsProxyUrl.value = config.cmcProxyUrl;
  cftcNewsUrl.value = config.cftcUrl;
  manualNewsInput.value = config.manualText;
  renderNewsAnalytics();
}

function saveNewsAnalyticsConfig() {
  state.newsAnalytics.config = normalizeNewsAnalyticsConfig({
    exchangeUrl: exchangeNewsUrl.value,
    cmcApiKey: cmcNewsApiKey.value,
    cmcProxyUrl: cmcNewsProxyUrl.value,
    cftcUrl: cftcNewsUrl.value,
    manualText: manualNewsInput.value
  });
  localStorage.setItem(newsAnalyticsConfigKey, JSON.stringify(state.newsAnalytics.config));
  renderNewsAnalytics();
  refreshNewsAnalytics(true);
}

function isNewsAnalyticsConfigured() {
  const config = state.newsAnalytics.config;
  return Boolean(config.exchangeUrl || config.cmcProxyUrl || config.cmcApiKey || config.cftcUrl);
}

function setNewsAnalyticsStatus(status, error = "") {
  state.newsAnalytics.status = status;
  state.newsAnalytics.error = error;
  renderNewsAnalytics();
}

async function refreshNewsAnalytics(force = false) {
  if (!isNewsAnalyticsConfigured()) {
    setNewsAnalyticsStatus("off");
    return;
  }
  if (!force && Date.now() - state.newsAnalytics.updatedAt < 15 * 60 * 1000) return;
  setNewsAnalyticsStatus("sync");
  try {
    const items = await fetchNewsAnalyticsItems();
    state.newsAnalytics.items = items.map(analyzeNewsItem).sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 40);
    state.newsAnalytics.updatedAt = Date.now();
    const failed = state.newsAnalytics.sourceStatus.filter((source) => !source.ok).length;
    setNewsAnalyticsStatus(failed ? `${state.newsAnalytics.items.length} / ${failed} err` : `${state.newsAnalytics.items.length}`);
    generateStrategy(state.lastUserIdea);
  } catch (error) {
    setNewsAnalyticsStatus("error", "Новости недоступны: проверь URL, CMC key или proxy");
  }
}

async function fetchNewsAnalyticsItems() {
  const config = state.newsAnalytics.config;
  const sources = [
    { id: "manual", enabled: Boolean(config.manualText), run: () => Promise.resolve(parseManualNewsFeed(config.manualText)) },
    { id: "exchange", enabled: Boolean(config.exchangeUrl), run: () => fetchGenericNewsFeed(config.exchangeUrl, "exchange") },
    { id: "cmc", enabled: Boolean(config.cmcProxyUrl || config.cmcApiKey || state.cmcRadar.config.apiKey), run: () => fetchCmcNewsFeed(config) },
    { id: "cftc", enabled: Boolean(config.cftcUrl), run: () => fetchGenericNewsFeed(config.cftcUrl, "cftc") }
  ];
  const enabledSources = sources.filter((source) => source.enabled);
  const results = await Promise.all(enabledSources.map(async (source) => {
    try {
      const items = await source.run();
      return { id: source.id, ok: true, count: items.length, items };
    } catch (error) {
      return { id: source.id, ok: false, count: 0, error: getNewsErrorText(error) };
    }
  }));
  state.newsAnalytics.sourceStatus = results.map(({ id, ok, count, error }) => ({ id, ok, count, error: error || "" }));
  return results.flatMap((result) => result.items || []);
}

function parseManualNewsFeed(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());
      const hasStructured = parts.length >= 3;
      return normalizeNewsItem({
        title: hasStructured ? parts.slice(2).join(" | ") : line,
        sentiment: hasStructured ? parts[1] : "",
        symbol: hasStructured ? parts[0] : "",
        date: Date.now()
      }, "manual");
    })
    .filter(Boolean);
}

function getNewsErrorText(error) {
  const text = String(error?.message || error || "ошибка").toLowerCase();
  if (text.includes("failed to fetch") || text.includes("cors")) return "CORS/proxy";
  if (text.includes("401") || text.includes("403") || text.includes("key")) return "API key";
  return text.slice(0, 80);
}

async function fetchCmcNewsFeed(config) {
  const params = new URLSearchParams({ limit: "20" });
  const url = config.cmcProxyUrl
    ? `${config.cmcProxyUrl}?${params.toString()}`
    : `https://pro-api.coinmarketcap.com/v1/content/latest?${params.toString()}`;
  const apiKey = config.cmcApiKey || state.cmcRadar.config.apiKey;
  const response = await fetch(url, {
    headers: config.cmcProxyUrl ? {} : { "X-CMC_PRO_API_KEY": apiKey }
  });
  if (!response.ok) throw new Error(`CMC news request failed ${response.status}`);
  return normalizeNewsPayload(await response.json(), "cmc");
}

async function fetchGenericNewsFeed(url, source) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${source} news request failed ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return normalizeNewsPayload(await response.json(), source);
  return normalizeNewsText(await response.text(), source, url);
}

function normalizeNewsPayload(payload, source) {
  const rawItems = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.results)
          ? payload.results
          : [];
  return rawItems.map((item) => normalizeNewsItem(item, source)).filter(Boolean);
}

function normalizeNewsItem(item, source) {
  if (!item) return null;
  const title = String(item.title || item.headline || item.name || item.enTitle || "").trim();
  const body = String(item.description || item.subtitle || item.summary || item.content || item.text || "").trim();
  if (!title && !body) return null;
  const symbols = [
    ...(Array.isArray(item.currencies) ? item.currencies.map((currency) => currency.symbol || currency.name) : []),
    ...(Array.isArray(item.assets) ? item.assets : []),
    ...(Array.isArray(item.coins) ? item.coins : []),
    item.symbol
  ].filter(Boolean).map((symbol) => String(symbol).toUpperCase().replace("/USDT", ""));
  return {
    source,
    title,
    body,
    url: String(item.url || item.link || item.source_url || ""),
    publishedAt: parseNewsDate(item.published_at || item.publishedAt || item.created_at || item.releaseDate || item.date),
    rawSentiment: String(item.sentiment || item.marketSentiment || item.direction || item.label || "").toLowerCase(),
    symbols
  };
}

function normalizeNewsText(text, source, url = "") {
  const clean = stripTags(text).replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (source === "cftc") {
    return [{
      source,
      title: "CFTC Commitments of Traders",
      body: clean.slice(0, 1200),
      url,
      publishedAt: Date.now(),
      rawSentiment: "",
      symbols: ["BTC", "ETH"]
    }];
  }
  return clean
    .split(/(?<=[.!?])\s+/)
    .filter((line) => line.length > 24)
    .slice(0, 10)
    .map((line) => ({
      source,
      title: line.slice(0, 120),
      body: line,
      url,
      publishedAt: Date.now(),
      rawSentiment: "",
      symbols: extractSymbolsFromText(line)
    }));
}

function parseNewsDate(value) {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
}

function analyzeNewsItem(item) {
  const text = `${item.rawSentiment} ${item.title} ${item.body}`.toLowerCase();
  const bullishWords = ["bull", "bullish", "листинг", "listing", "launch", "approval", "approve", "etf inflow", "partnership", "upgrade", "mainnet", "record inflow", "accumulation", "longs increase"];
  const bearishWords = ["bear", "bearish", "delist", "delisting", "hack", "exploit", "lawsuit", "fine", "ban", "outflow", "liquidation", "default", "probe", "investigation", "shorts increase"];
  const regulatoryWords = ["cftc", "sec", "regulator", "commission", "enforcement", "санкц", "регулятор", "расслед"];
  let score = 0;
  bullishWords.forEach((word) => { if (text.includes(word)) score += 14; });
  bearishWords.forEach((word) => { if (text.includes(word)) score -= 16; });
  if (item.source === "exchange" && /bullish|long|рост|быч/.test(text)) score += 18;
  if (item.source === "exchange" && /bearish|short|паден|медвеж/.test(text)) score -= 18;
  if (item.source === "cftc" && /non-commercial|managed money|leveraged/.test(text)) score += text.includes("long") ? 8 : 0;
  if (regulatoryWords.some((word) => text.includes(word)) && score < 0) score -= 8;
  const symbols = [...new Set([...(item.symbols || []), ...extractSymbolsFromText(`${item.title} ${item.body}`)])];
  const boundedScore = Math.max(-100, Math.min(100, score));
  return {
    ...item,
    symbols,
    score: boundedScore,
    sentiment: boundedScore >= 18 ? "bullish" : boundedScore <= -18 ? "bearish" : "neutral",
    isRegulatory: regulatoryWords.some((word) => text.includes(word))
  };
}

function extractSymbolsFromText(text) {
  const upper = String(text || "").toUpperCase();
  const symbols = [...asset.options].map((option) => option.value.replace("/USDT", ""));
  return symbols.filter((symbol) => upper.includes(symbol));
}

function summarizeNewsForAsset(symbol = asset.value) {
  const assetSymbol = symbol.replace("/USDT", "");
  const relevant = state.newsAnalytics.items.filter((item) => {
    if (!item.symbols.length) return item.source === "cftc" && ["BTC", "ETH"].includes(assetSymbol);
    return item.symbols.includes(assetSymbol) || item.symbols.includes("BTC");
  }).slice(0, 8);
  if (!relevant.length) return { score: 0, bias: "NEUTRAL", items: [], regulatoryRisk: false, summary: "новостной фон не подключен или нет релевантных новостей" };
  const score = relevant.reduce((sum, item) => sum + item.score, 0) / relevant.length;
  const regulatoryRisk = relevant.some((item) => item.isRegulatory && item.score <= -18);
  const bias = score >= 14 ? "BULLISH" : score <= -14 ? "BEARISH" : "NEUTRAL";
  return {
    score,
    bias,
    items: relevant,
    regulatoryRisk,
    summary: `${bias} · ${score >= 0 ? "+" : ""}${score.toFixed(0)} · ${relevant.length} нов.`
  };
}

function renderNewsAnalytics() {
  newsStatus.textContent = state.newsAnalytics.status;
  const sourceText = renderNewsSourceStatus();
  if (!state.newsAnalytics.items.length) {
    newsList.innerHTML = `
      <span>${escapeHtml(state.newsAnalytics.error || "Новостей пока нет. Для CMC/CFTC часто нужен proxy URL или ручные новости.")}</span>
      ${sourceText}
    `;
    return;
  }
  const summary = summarizeNewsForAsset(asset.value);
  newsList.innerHTML = `
    <button type="button">
      <strong>${escapeHtml(summary.summary)}</strong>
      <span>Биржа + CMC News + CFTC COT влияют на score сделки</span>
      <em>${summary.bias}</em>
    </button>
    ${summary.items.slice(0, 5).map((item) => `
      <button type="button">
        <strong>${escapeHtml(item.source.toUpperCase())} · ${escapeHtml(item.sentiment)}</strong>
        <span>${escapeHtml(item.title || item.body.slice(0, 90))}</span>
        <em>${item.score >= 0 ? "+" : ""}${item.score}</em>
      </button>
    `).join("")}
    ${sourceText}
  `;
}

function renderNewsSourceStatus() {
  if (!state.newsAnalytics.sourceStatus.length) return "";
  return state.newsAnalytics.sourceStatus.map((source) => `
    <button type="button">
      <strong>${escapeHtml(source.id.toUpperCase())} · ${source.ok ? "ok" : "error"}</strong>
      <span>${source.ok ? `${source.count} новостей` : source.error || "нет данных"}</span>
      <em>${source.ok ? source.count : "!"}</em>
    </button>
  `).join("");
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

function renderRsiControls() {
  const profiles = getRsiProfilesForAsset(asset.value);
  rsiAssetLabel.textContent = asset.value.split("/")[0];
  rsiControls.innerHTML = "";

  profiles.forEach((profile) => {
    const prefs = getRsiPreference(profile.id);
    const item = document.createElement("div");
    item.className = "indicator-item";
    item.innerHTML = `
      <strong>${escapeHtml(profile.label)} · period ${profile.period}</strong>
      <span>${escapeHtml(profile.role)}</span>
      <div class="indicator-actions">
        <label class="check-row">
          <input type="checkbox" data-rsi-show="${profile.id}" ${prefs.show ? "checked" : ""}>
          <span>на график</span>
        </label>
        <label class="check-row">
          <input type="checkbox" data-rsi-use="${profile.id}" ${prefs.use ? "checked" : ""}>
          <span>в стратегию</span>
        </label>
      </div>
    `;
    rsiControls.append(item);
  });

  rsiControls.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.dataset.rsiShow || input.dataset.rsiUse;
      const prefs = getRsiPreference(id);
      if (input.dataset.rsiShow) prefs.show = input.checked;
      if (input.dataset.rsiUse) prefs.use = input.checked;
      state.rsiPreferences[id] = prefs;
      generateStrategy(state.lastUserIdea);
    });
  });
}

function renderEmaControls() {
  emaControls.innerHTML = "";
  emaProfiles.forEach((profile) => {
    const prefs = getEmaPreference(profile.id);
    const item = document.createElement("div");
    item.className = "indicator-item";
    item.innerHTML = `
      <strong>${escapeHtml(profile.label)} · period ${profile.period}</strong>
      <span>${escapeHtml(profile.role)}</span>
      <div class="indicator-actions">
        <label class="check-row">
          <input type="checkbox" data-ema-show="${profile.id}" ${prefs.show ? "checked" : ""}>
          <span>на график</span>
        </label>
        <label class="check-row">
          <input type="checkbox" data-ema-use="${profile.id}" ${prefs.use ? "checked" : ""}>
          <span>в стратегию</span>
        </label>
      </div>
    `;
    emaControls.append(item);
  });

  emaControls.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.dataset.emaShow || input.dataset.emaUse;
      const prefs = getEmaPreference(id);
      if (input.dataset.emaShow) prefs.show = input.checked;
      if (input.dataset.emaUse) prefs.use = input.checked;
      state.emaPreferences[id] = prefs;
      generateStrategy(state.lastUserIdea);
    });
  });
}

function getRsiProfilesForAsset(symbol) {
  return rsiProfiles[symbol] || rsiProfiles["BTC/USDT"];
}

function getRsiPreference(id) {
  return state.rsiPreferences[id] || { show: true, use: true };
}

function getSelectedRsiIndicators(symbol = asset.value) {
  return getRsiProfilesForAsset(symbol).map((profile) => {
    const prefs = getRsiPreference(profile.id);
    return { ...profile, show: prefs.show, use: prefs.use };
  });
}

function getEmaPreference(id) {
  return state.emaPreferences[id] || { show: true, use: true };
}

function getSelectedEmaIndicators() {
  return emaProfiles.map((profile) => {
    const prefs = getEmaPreference(profile.id);
    return { ...profile, show: prefs.show, use: prefs.use };
  });
}

function getContext() {
  const resolvedMode = marketMode.value === "auto" ? state.detectedMode : marketMode.value;
  return {
    asset: asset.value,
    timeframe: timeframe.value,
    mode: resolvedMode,
    modeSource: marketMode.value === "auto" ? "auto" : "manual",
    strategyMode: "standard",
    risk: Number(risk.value),
    conservative: conservative.checked,
    includeLongs: includeLongs.checked,
    includeShorts: includeShorts.checked,
    rules: state.rules,
    sourceRules: knowledgeSources.flatMap((source) => source.rules),
    rsi: getSelectedRsiIndicators(asset.value),
    ema: getSelectedEmaIndicators(),
    deposit: getDepositValue(),
    intel: state.marketIntel,
    news: summarizeNewsForAsset(asset.value),
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

function buildStrategy(userIdea = "", tradePlan = null, signalQuality = null) {
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
  const totalRules = context.rules.length + context.sourceRules.length;
  const rules = context.rules.slice(-4).map((rule) => `<li>${escapeHtml(rule)}</li>`).join("");
  const bookRuleItems = bookRules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("");
  const sourceNames = knowledgeSources
    .slice(0, 6)
    .map((source) => source.title)
    .join("; ");
  const liveBlock = buildLiveStrategyBlock(context);
  const newsBlock = buildNewsStrategyBlock(context);
  const intelligenceBlock = buildIntelligenceStrategyBlock(context);
  const tradePlanBlock = buildTradePlanBlock(tradePlan);
  const rsiBlock = buildRsiStrategyBlock(context);
  const emaBlock = buildEmaStrategyBlock(context);
  const signalQualityBlock = buildSignalQualityBlock(signalQuality);
  const historyRestrictionsBlock = buildHistoryRestrictionsBlock(context, tradePlan);
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
    ${newsBlock}
    ${intelligenceBlock}
    ${tradePlanBlock}
    ${signalQualityBlock}
    ${historyRestrictionsBlock}
    ${rsiBlock}
    ${emaBlock}
    ${investorDisciplineBlock}
    <section>
      <h3>Условия входа</h3>
      <ul>${entryFilters.map((filter) => `<li>${filter}</li>`).join("")}</ul>
    </section>
    <section>
      <h3>Риск и сопровождение</h3>
      <ul>
        <li>Депозит: ${formatPrice(context.deposit)} USDT. Риск на сделку: не более ${Math.min(context.risk, 2).toFixed(2)}% от депозита.</li>
        <li>Размер позиции: ручной вход до ${manualMaxSingleTradePct}% капитала на сделку, автобот до ${autopilotMaxSingleTradePct}%; суммарно автобот держит в рынке не больше ${autopilotMaxPortfolioPct}% капитала.</li>
        <li>Стоп: за локальный экстремум или за уровень отмены сценария.</li>
        <li>Цель: частичная фиксация на ${rrTarget}, остаток вести по структуре.</li>
        <li>Если цена возвращается под уровень входа без импульса, сделка отменяется.</li>
      </ul>
    </section>
    <details>
      <summary>${totalRules} правил учтено в стратегии</summary>
      <section>
        <h3>Правила обучения</h3>
        <ul>${rules}</ul>
      </section>
    </details>
    <details>
      <summary>Книжная база: ${knowledgeSources.length} источников</summary>
      <section>
        <p>Использованы тезисы из ${escapeHtml(sourceNames)} и др.</p>
        <ul>${bookRuleItems}</ul>
      </section>
    </details>
    <p class="risk-note">Это исследовательский план, а не финансовая рекомендация. Перед реальной сделкой нужна проверка на истории, демо или малом размере позиции.</p>
  `;

  state.lastStrategy = stripTags(html);
  return html;
}

function buildSignalQualityBlock(signalQuality) {
  if (!signalQuality?.scenarios?.length) return "";

  const rows = signalQuality.scenarios.map((scenario) => `
    <li>
      <strong>${scenario.side}: ${scenario.score}/100</strong> — ${escapeHtml(scenario.decision)}.
      ${escapeHtml(scenario.summary)}
    </li>
  `).join("");

  return `
    <section>
      <h3>Качество сигнала</h3>
      <p><strong>${signalQuality.best.score}/100</strong>: ${escapeHtml(signalQuality.best.decision)}. ${escapeHtml(signalQuality.verdict)}</p>
      <ul>${rows}</ul>
    </section>
  `;
}

function buildHistoryRestrictionsBlock(context, tradePlan) {
  const warnings = tradePlan?.scenarios
    ?.flatMap((scenario) => getManualStrategyRestrictions(context, scenario))
    ?.filter((item, index, list) => list.indexOf(item) === index) || [];
  if (!warnings.length) {
    return `
      <section>
        <h3>Ограничения из журнала</h3>
        <p>По текущей монете, таймфрейму и стороне нет жесткого запрета из истории. Вход все равно только после подтверждения графиком.</p>
      </section>
    `;
  }

  return `
    <section>
      <h3>Ограничения из журнала</h3>
      <ul>${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
    </section>
  `;
}

function buildRsiStrategyBlock(context) {
  const used = context.rsi.filter((indicator) => indicator.use);
  if (!used.length) {
    return `
      <section>
        <h3>RSI-фильтры</h3>
        <p>RSI не учитывается в стратегии: все RSI-фильтры выключены в меню.</p>
      </section>
    `;
  }

  const candles = getCandlesForRsi(context);
  const rows = used.map((indicator) => {
    const value = getLatestRsiValue(candles, indicator.period);
    const signal = describeRsiSignal(value, context);
    const valueText = Number.isFinite(value) ? value.toFixed(1) : "нет live-данных";
    return `<li><strong>${escapeHtml(indicator.label)}</strong>: ${valueText}. ${escapeHtml(signal)} ${escapeHtml(indicator.role)}</li>`;
  }).join("");

  return `
    <section>
      <h3>RSI-фильтры</h3>
      <ul>${rows}</ul>
    </section>
  `;
}

function buildEmaStrategyBlock(context) {
  const used = context.ema.filter((indicator) => indicator.use);
  if (!used.length) {
    return `
      <section>
        <h3>EMA Фибоначчи</h3>
        <p>EMA 34/89 не учитываются в стратегии: фильтры выключены в меню.</p>
      </section>
    `;
  }

  const candles = getCandlesForRsi(context);
  const rows = used.map((indicator) => {
    const latest = getLatestEmaValue(candles.map((candle) => candle.close), indicator.period);
    const lastClose = candles[candles.length - 1]?.close;
    const signal = Number.isFinite(latest) && Number.isFinite(lastClose)
      ? lastClose >= latest
        ? "цена выше EMA, фильтр поддерживает long или удержание импульса"
        : "цена ниже EMA, фильтр поддерживает short или осторожность с long"
      : "нужно больше свечей для расчета";
    return `<li><strong>${escapeHtml(indicator.label)}</strong>: ${Number.isFinite(latest) ? formatPrice(latest) : "нет данных"}. ${escapeHtml(signal)}.</li>`;
  }).join("");

  return `
    <section>
      <h3>EMA Фибоначчи</h3>
      <ul>${rows}</ul>
    </section>
  `;
}

function buildInvestorDisciplineBlock(context, tradePlan) {
  const primary = tradePlan?.primary;
  const rrText = primary
    ? `${primary.side}: риск ${formatPrice(Math.abs(primary.entry - primary.stop))}, цель до ${formatPrice(primary.target2)}`
    : "риск/цель еще не рассчитаны";
  const edgeChecks = [
    "Запас прочности: вход разрешен только если стоп заранее известен, а цель дает асимметрию не хуже выбранного risk/reward.",
    `Лучшие сетапы: автобот входит только при score не ниже ${strictAutopilotMinScore}/100 и положительной статистике похожей связки.`,
    `Дневной стоп: после ${dailyMaxStops} стопов или убытка ${dailyMaxLossPct}% автобот прекращает входы до следующего дня.`,
    `Реализм демо: каждая сделка учитывает комиссию ${paperFeePct}% и проскальзывание ${paperSlippagePct}% на исполнении.`,
    state.autopilot.scalpingEnabled
      ? `Скальпинг-модуль активен: вход только на 5m/15m при EMA9/21 momentum, RSI14, VWAP, ATR и узком спреде.`
      : "Скальпинг-модуль выключен и не участвует в автоскане.",
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

function buildNewsStrategyBlock(context) {
  const news = context.news || summarizeNewsForAsset(context.asset);
  const items = news.items?.slice(0, 4) || [];
  const action = news.bias === "BULLISH"
    ? "long-сценарии получают подтверждение, short требует сильного графического сигнала"
    : news.bias === "BEARISH"
      ? "short-сценарии получают подтверждение, long лучше брать только после разворота"
      : "новости не дают сильного перекоса, решает график и риск";
  const regulatory = news.regulatoryRisk
    ? "<li>Есть регуляторный негатив: автобот снижает score и не должен брать агрессивный long.</li>"
    : "";

  return `
    <section>
      <h3>Новостной фон</h3>
      <p><strong>${escapeHtml(news.summary)}</strong>. ${escapeHtml(action)}.</p>
      <ul>
        ${regulatory}
        ${items.length
          ? items.map((item) => `<li>${escapeHtml(item.source.toUpperCase())}: ${escapeHtml(item.sentiment)} (${item.score >= 0 ? "+" : ""}${item.score}) — ${escapeHtml(item.title || item.body.slice(0, 100))}</li>`).join("")
          : "<li>Ленты не подключены или по монете нет релевантных заголовков.</li>"}
      </ul>
    </section>
  `;
}

function buildIntelligenceStrategyBlock(context) {
  const intel = context.intel || createEmptyMarketIntel();
  const backtestText = intel.backtest
    ? `бэктест: ${intel.backtest.trades} сделок, winrate ${intel.backtest.winRate.toFixed(0)}%, expectancy ${intel.backtest.expectancyPct.toFixed(2)}%, просадка ${intel.backtest.maxDrawdownPct.toFixed(2)}%`
    : "бэктест еще не рассчитан";
  const goalText = intel.monthlyGoal
    ? `факт за 30 дней ${intel.monthlyGoal.currentPct.toFixed(2)}%, до цели 10% осталось ${Math.max(0, 10 - intel.monthlyGoal.currentPct).toFixed(2)}%`
    : "цель 10%/мес еще не рассчитана";
  const derivativesText = intel.derivatives
    ? `${intel.derivatives.bias}; funding ${formatSigned(intel.derivatives.fundingRatePct, 4)}%, OI ${formatCompact(intel.derivatives.openInterest)}`
    : "деривативные фильтры ждут данных";
  const learningText = intel.learning
    ? `${intel.learning.closedTrades} закрытых сделок в архиве; ${intel.learning.bestPattern || "паттерн еще не выделен"}`
    : "самообучение ждет закрытых сделок";

  return `
    <section>
      <h3>Лаборатория точности</h3>
      <ul>
        <li>${escapeHtml(backtestText)}.</li>
        <li>${escapeHtml(goalText)}.</li>
        <li>${escapeHtml(derivativesText)}.</li>
        <li>${escapeHtml(learningText)}.</li>
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
  const signalQuality = evaluateSignalQuality(context, tradePlan);
  state.tradePlan = tradePlan;
  state.signalQuality = signalQuality;
  strategyContainer.classList.add("compact");
  strategyContainer.innerHTML = buildStrategy(userIdea, tradePlan, signalQuality);
  confidence.textContent = `${context.rules.length + context.sourceRules.length} правил учтено`;
  rr.textContent = context.conservative ? "1 : 2.2" : "1 : 1.7";
  maxRisk.textContent = `${context.risk.toFixed(2)}%`;
  filterCount.textContent = String((context.conservative ? 4 : 3) + context.rsi.filter((indicator) => indicator.use).length + context.ema.filter((indicator) => indicator.use).length + 4);
  renderSignalQualityReadout(signalQuality);
  renderNewsAnalytics();
  renderStrategyIntelligence();
  chartLabel.textContent = `${context.asset} · ${context.timeframe}`;
  chartTitle.textContent = context.live.active
    ? `Live свечи · ${formatModeTitle(context)} · ${selectedSidesLabel(tradePlan)}`
    : `Сценарий цены · ${formatModeTitle(context)} · ${selectedSidesLabel(tradePlan)}`;
  renderTradePlanReadout(tradePlan);
  syncPaperSideOptions(tradePlan);
  if (context.live.active && state.live.candles.length > 1) {
    drawLiveChart(state.live.candles, tradePlan);
  } else {
    drawChart(context.mode, tradePlan);
  }
  updatePaperTrades();
}

function renderSignalQualityReadout(signalQuality) {
  if (!signalQuality?.best) {
    signalScore.textContent = "--";
    return;
  }
  signalScore.textContent = `${signalQuality.best.score}/100`;
}

function renderStrategyIntelligence() {
  state.marketIntel.learning = analyzeLearningJournal();
  state.marketIntel.monthlyGoal = calculateMonthlyGoalProgress();
  state.marketIntel.news = summarizeNewsForAsset(asset.value);
  const intel = state.marketIntel;
  const backtest = intel.backtest;
  const goal = intel.monthlyGoal;
  const derivatives = intel.derivatives;
  const learning = intel.learning;
  const news = intel.news;
  const dailyRisk = getDailyRiskState();
  const lastReject = state.rejectedSignals[state.rejectedSignals.length - 1];

  backtestScore.textContent = backtest
    ? `${backtest.winRate.toFixed(0)}% · ${backtest.expectancyPct >= 0 ? "+" : ""}${backtest.expectancyPct.toFixed(2)}%`
    : intel.loading ? "считаю" : "нет данных";
  monthlyGoal.textContent = goal
    ? `${goal.currentPct >= 0 ? "+" : ""}${goal.currentPct.toFixed(2)}% / 10%`
    : "нет данных";
  derivativesScore.textContent = derivatives
    ? `${derivatives.sideBias || "NEUTRAL"} · ${formatSigned(derivatives.fundingRatePct, 3)}%`
    : "нет данных";
  learningScore.textContent = learning
    ? `${learning.closedTrades} сделок · ${learning.winRate.toFixed(0)}%`
    : "нет данных";
  autopilotStatus.textContent = state.autopilot.enabled ? state.autopilot.lastMessage : "выключен";
  autopilotToggle.textContent = state.autopilot.enabled ? "Авто-бот: вкл" : "Авто-бот: выкл";
  autopilotToggle.classList.toggle("is-live", state.autopilot.enabled);
  if (scalpingMode) scalpingMode.checked = Boolean(state.autopilot.scalpingEnabled);
  const learningMode = isRemoteJournalConfigured()
    ? "Обучение общее: опыт подтягивается из Supabase перед анализом и автосделками."
    : "Обучение локальное: для общего опыта подключи Supabase в блоке Общий журнал.";
  const newsText = news ? `Новостной фон: ${news.summary}.` : "";
  const scalpingText = state.autopilot.scalpingEnabled
    ? `Скальпинг включен: EMA9/21, RSI14, VWAP, ATR, объем x${scalpingMinVolumeRatio}, спред до ${scalpingMaxSpreadPct}%.`
    : "Скальпинг выключен.";
  const riskText = `Дневной риск: ${dailyRisk.pnl >= 0 ? "+" : ""}${dailyRisk.pnl.toFixed(2)} USDT, стопов ${dailyRisk.stops}/${dailyMaxStops}, лимит ${dailyMaxLossPct}%.`;
  const rejectText = lastReject ? `Последний отказ: ${lastReject.asset} ${lastReject.timeframe} ${lastReject.side} - ${lastReject.reason}.` : "Отказов автобота пока нет.";
  intelDetails.textContent = `${learningMode} ${formatLearningPolicyNote()} ${newsText} ${scalpingText} ${riskText} ${rejectText} ${intel.notes.join(" ")}`;
}

async function refreshStrategyIntelligence(force = false) {
  await refreshSharedLearningMemory(false);
  const context = getContext();
  const now = Date.now();
  if (!force && state.marketIntel.updatedAt && now - state.marketIntel.updatedAt < 60000 && state.marketIntel.asset === context.asset && state.marketIntel.timeframe === context.timeframe) {
    renderStrategyIntelligence();
    return;
  }

  state.marketIntel = { ...state.marketIntel, loading: true, asset: context.asset, timeframe: context.timeframe, notes: ["Обновляю бэктест, деривативные фильтры, сентимент и журнал."] };
  renderStrategyIntelligence();

  const [candlesResult, derivativesResult, sentimentResult] = await Promise.allSettled([
    fetchHistoricalCandlesFor(context.asset, context.timeframe, 320),
    fetchDerivativeIntel(context.asset),
    fetchSentimentIntel()
  ]);

  const candles = candlesResult.status === "fulfilled" ? candlesResult.value : [];
  const derivatives = derivativesResult.status === "fulfilled" ? derivativesResult.value : null;
  const sentiment = sentimentResult.status === "fulfilled" ? sentimentResult.value : null;
  state.marketIntel = buildMarketIntelForContext(context, candles, derivatives, sentiment);
  generateStrategy(state.lastUserIdea);
}

async function refreshSharedLearningMemory(force = false) {
  if (!isRemoteJournalConfigured() || state.remoteJournal.syncing) return false;
  await syncRemoteJournal(force);
  return true;
}

function buildMarketIntelForContext(context, candles, derivatives = null, sentiment = null) {
  const backtest = candles.length ? runStrategyBacktest(candles, context) : null;
  const marketStructure = candles.length ? analyzeMarketStructure(candles) : null;
  const higherTimeframe = candles.length ? analyzeHigherTimeframeProxy(candles) : null;
  const marketCrash = candles.length ? analyzeMarketCrashRisk(candles) : null;
  const marketRadar = getMarketRadarAsset(context.asset);
  const learning = analyzeLearningJournal(context.asset);
  const monthly = calculateMonthlyGoalProgress();
  const notes = buildIntelNotes(backtest, derivatives, sentiment, learning, monthly, candles.length, marketStructure, marketRadar, higherTimeframe, marketCrash);
  return {
    loading: false,
    updatedAt: Date.now(),
    asset: context.asset,
    timeframe: context.timeframe,
    backtest,
    marketStructure,
    higherTimeframe,
    marketCrash,
    marketRadar,
    derivatives,
    sentiment,
    learning,
    monthlyGoal: monthly,
    notes
  };
}

function analyzeMarketCrashRisk(candles) {
  const last = candles[candles.length - 1];
  if (!last || candles.length < 30) return { level: "UNKNOWN", riskOff: false, severe: false, summary: "нужно больше свечей для crash-guard" };
  const close = last.close;
  const change = (lookback) => {
    const base = candles[Math.max(0, candles.length - 1 - lookback)]?.close;
    return base > 0 ? ((close - base) / base) * 100 : 0;
  };
  const drop12 = change(12);
  const drop24 = change(24);
  const drop48 = change(48);
  const recent = candles.slice(-8);
  const redStreak = [...recent].reverse().findIndex((candle) => candle.close >= candle.open);
  const redCount = redStreak === -1 ? recent.length : redStreak;
  const previousVolume = average(candles.slice(-40, -8).map((candle) => candle.volume));
  const recentVolume = average(recent.map((candle) => candle.volume));
  const volumeSpike = previousVolume > 0 ? recentVolume / previousVolume : 1;
  const severe = drop12 <= crashSevereDrop12Pct || drop24 <= crashSevereDrop24Pct || (drop12 <= -4.5 && redCount >= 5 && volumeSpike >= 1.4);
  const riskOff = severe || drop12 <= crashRiskOffDrop12Pct || drop24 <= crashRiskOffDrop24Pct || drop48 <= -8 || (redCount >= 4 && volumeSpike >= 1.25);
  const level = severe ? "CRASH" : riskOff ? "RISK_OFF" : "NORMAL";
  return {
    level,
    riskOff,
    severe,
    drop12,
    drop24,
    drop48,
    redCount,
    volumeSpike,
    summary: `${level}: 12св ${drop12.toFixed(2)}%, 24св ${drop24.toFixed(2)}%, volume x${volumeSpike.toFixed(2)}`
  };
}

function analyzeHigherTimeframeProxy(candles) {
  const closes = candles.map((candle) => candle.close);
  const ema34 = calculateEmaSeries(closes, 34);
  const ema89 = calculateEmaSeries(closes, 89);
  const last = closes.length - 1;
  if (last < 90) return { direction: "UNKNOWN", strength: 0, note: "нужно больше свечей для старшего фильтра" };
  const slope = ema34[last] - ema34[Math.max(0, last - 12)];
  const direction = ema34[last] > ema89[last] && slope > 0
    ? "LONG"
    : ema34[last] < ema89[last] && slope < 0
      ? "SHORT"
      : "NEUTRAL";
  return {
    direction,
    strength: Math.abs(slope / closes[last]) * 100,
    note: `старший фильтр по EMA34/89: ${direction}`
  };
}

async function fetchHistoricalCandlesFor(symbol, interval, limit = 320) {
  const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${toBinanceSymbol(symbol)}&interval=${toBybitInterval(interval)}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Kline request failed");
  const data = await response.json();
  if (data.retCode !== 0 || !Array.isArray(data.result?.list)) throw new Error(data.retMsg || "Kline response failed");
  return data.result.list.slice().reverse().map((item) => ({
    openTime: Number(item[0]),
    open: Number(item[1]),
    high: Number(item[2]),
    low: Number(item[3]),
    close: Number(item[4]),
    volume: Number(item[5]),
    closeTime: Number(item[0]) + intervalToMs(interval) - 1
  }));
}

async function fetchDerivativeIntel(symbol) {
  const bybitSymbol = toBinanceSymbol(symbol);
  const [fundingResult, oiResult, ratioResult] = await Promise.allSettled([
    fetchJson(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${bybitSymbol}&limit=1`),
    fetchJson(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${bybitSymbol}&intervalTime=15min&limit=2`),
    fetchJson(`https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${bybitSymbol}&period=15min&limit=1`)
  ]);

  const funding = fundingResult.status === "fulfilled" ? Number(fundingResult.value.result?.list?.[0]?.fundingRate) * 100 : 0;
  const oiList = oiResult.status === "fulfilled" ? oiResult.value.result?.list || [] : [];
  const openInterest = Number(oiList[0]?.openInterest) || 0;
  const prevOpenInterest = Number(oiList[1]?.openInterest) || openInterest;
  const oiChangePct = prevOpenInterest > 0 ? ((openInterest - prevOpenInterest) / prevOpenInterest) * 100 : 0;
  const ratio = ratioResult.status === "fulfilled" ? ratioResult.value.result?.list?.[0] : null;
  const longShortRatio = Number(ratio?.buyRatio) && Number(ratio?.sellRatio) ? Number(ratio.buyRatio) / Number(ratio.sellRatio) : 1;

  let sideBias = "NEUTRAL";
  let bias = "деривативы нейтральны";
  if (Math.abs(funding) > 0.05 && Math.abs(oiChangePct) > 1.5) {
    sideBias = "CAUTION";
    bias = "фандинг и OI показывают перегрев";
  } else if (funding < -0.015 && longShortRatio < 0.9) {
    sideBias = "LONG";
    bias = "рынок перегружен short, long допустим только по подтверждению";
  } else if (funding > 0.015 && longShortRatio > 1.1) {
    sideBias = "SHORT";
    bias = "рынок перегружен long, short допустим только по подтверждению";
  }

  return { fundingRatePct: funding || 0, openInterest, oiChangePct, longShortRatio, sideBias, bias };
}

async function fetchSentimentIntel() {
  const data = await fetchJson("https://api.alternative.me/fng/?limit=1");
  const item = data.data?.[0];
  return {
    value: Number(item?.value) || 50,
    label: String(item?.value_classification || "Neutral"),
    updatedAt: Number(item?.timestamp) ? Number(item.timestamp) * 1000 : Date.now()
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Request failed");
  return response.json();
}

function runStrategyBacktest(candles, context) {
  const closes = candles.map((candle) => candle.close);
  const ema34 = calculateEmaSeries(closes, 34);
  const ema89 = calculateEmaSeries(closes, 89);
  const rsi14 = calculateRsiSeries(closes, 14);
  const atr14 = calculateAtrSeries(candles, 14);
  const adxBundle = calculateAdxSeries(candles, 14);
  const trades = [];

  for (let i = 90; i < candles.length - 12; i += 1) {
    const candle = candles[i];
    const structure = getBacktestStructureAt(candles, atr14, adxBundle, i);
    const atrRiskPct = structure.atrPct ? structure.atrPct / 100 : 0;
    const riskDistance = Math.max(candle.close * 0.0035, candle.close * Math.max(0.004, Math.min(0.03, atrRiskPct * 1.25)));
    const rr1 = context.conservative ? 1.6 : 1.25;
    const rr2 = context.conservative ? 2.2 : 1.7;
    const candidates = [];

    const strongTrend = structure.adx >= 18;
    const longStructure = structure.plusDi >= structure.minusDi && structure.priceVsVwapPct >= -0.35 && structure.volumeRatio >= 0.75;
    const shortStructure = structure.minusDi >= structure.plusDi && structure.priceVsVwapPct <= 0.35 && structure.volumeRatio >= 0.75;

    if (context.includeLongs && strongTrend && longStructure && candle.close > ema34[i] && ema34[i] > ema89[i] && rsi14[i] >= 42 && rsi14[i] <= 68) {
      candidates.push({ side: "LONG", entry: candle.close, stop: candle.close - riskDistance, target1: candle.close + riskDistance * rr1, target2: candle.close + riskDistance * rr2 });
    }
    if (context.includeShorts && strongTrend && shortStructure && candle.close < ema34[i] && ema34[i] < ema89[i] && rsi14[i] >= 32 && rsi14[i] <= 58) {
      candidates.push({ side: "SHORT", entry: candle.close, stop: candle.close + riskDistance, target1: candle.close - riskDistance * rr1, target2: candle.close - riskDistance * rr2 });
    }

    candidates.slice(0, 1).forEach((candidate) => {
      const result = simulateBacktestTrade(candidate, candles.slice(i + 1, i + 13));
      if (result) trades.push(result);
    });
  }

  const wins = trades.filter((trade) => trade.pnlPct > 0).length;
  const totalPct = trades.reduce((sum, trade) => sum + trade.pnlPct, 0);
  const equity = trades.reduce((items, trade) => {
    const previous = items[items.length - 1] || 0;
    items.push(previous + trade.pnlPct);
    return items;
  }, []);
  const maxDrawdownPct = calculateMaxDrawdown(equity);
  const avgPnlPct = trades.length ? totalPct / trades.length : 0;
  return {
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    expectancyPct: avgPnlPct,
    totalPct,
    maxDrawdownPct,
    sample: trades.slice(-12)
  };
}

function simulateBacktestTrade(plan, futureCandles) {
  let partial = false;
  let pnlPct = 0;
  for (const candle of futureCandles) {
    const hitStop = plan.side === "LONG" ? candle.low <= plan.stop : candle.high >= plan.stop;
    const hitT1 = plan.side === "LONG" ? candle.high >= plan.target1 : candle.low <= plan.target1;
    const hitT2 = plan.side === "LONG" ? candle.high >= plan.target2 : candle.low <= plan.target2;
    const riskPct = Math.abs(plan.entry - plan.stop) / plan.entry * 100;

    if (hitStop) {
      pnlPct += partial ? -riskPct * 0.5 : -riskPct;
      return { side: plan.side, status: "stop", pnlPct: pnlPct - (paperFeePct + paperSlippagePct) * (partial ? 1.5 : 2) };
    }
    if (!partial && hitT1) {
      pnlPct += Math.abs(plan.target1 - plan.entry) / plan.entry * 100 * 0.5;
      partial = true;
    }
    if (hitT2) {
      pnlPct += Math.abs(plan.target2 - plan.entry) / plan.entry * 100 * (partial ? 0.5 : 1);
      return { side: plan.side, status: "target", pnlPct: pnlPct - (paperFeePct + paperSlippagePct) * (partial ? 2 : 2) };
    }
  }
  return { side: plan.side, status: partial ? "partial" : "timeout", pnlPct: pnlPct - (paperFeePct + paperSlippagePct) };
}

function getBacktestStructureAt(candles, atrSeries, adxBundle, index) {
  const slice = candles.slice(Math.max(0, index - 95), index + 1);
  const vwap = calculateRollingVwap(slice);
  const candle = candles[index];
  const previous = candles.slice(Math.max(0, index - 20), index);
  const avgVolume = average(previous.map((item) => item.volume));
  const atr = atrSeries[index];
  return {
    adx: Number.isFinite(adxBundle.adx[index]) ? adxBundle.adx[index] : 0,
    plusDi: Number.isFinite(adxBundle.plusDi[index]) ? adxBundle.plusDi[index] : 0,
    minusDi: Number.isFinite(adxBundle.minusDi[index]) ? adxBundle.minusDi[index] : 0,
    atrPct: candle.close > 0 && Number.isFinite(atr) ? (atr / candle.close) * 100 : 0,
    vwap,
    priceVsVwapPct: vwap > 0 ? ((candle.close - vwap) / vwap) * 100 : 0,
    volumeRatio: avgVolume > 0 ? candle.volume / avgVolume : 1
  };
}

function calculateMaxDrawdown(equity) {
  let peak = 0;
  let maxDrawdown = 0;
  equity.forEach((value) => {
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, peak - value);
  });
  return maxDrawdown;
}

function analyzeLearningJournal(symbol = null) {
  const closed = state.paperTrades.filter((trade) => !isPaperTradeActive(trade) && (!symbol || trade.asset === symbol));
  const wins = closed.filter((trade) => trade.pnl > 0).length;
  const sideStats = ["LONG", "SHORT"].reduce((acc, side) => {
    const trades = closed.filter((trade) => trade.side === side);
    acc[side] = {
      trades: trades.length,
      avgPnl: trades.length ? average(trades.map((trade) => Number(trade.pnl) || 0)) : 0
    };
    return acc;
  }, {});
  const bestSide = Object.entries(sideStats).sort((a, b) => b[1].avgPnl - a[1].avgPnl)[0];
  const bestPattern = bestSide && bestSide[1].trades ? `${bestSide[0]} дает средний PnL ${bestSide[1].avgPnl.toFixed(2)} USDT` : "";
  return {
    closedTrades: closed.length,
    winRate: closed.length ? (wins / closed.length) * 100 : 0,
    sideStats,
    patternStats: buildLearningPatternStats(closed),
    bestPattern
  };
}

function buildLearningPatternStats(trades) {
  const stats = {};
  trades.forEach((trade) => {
    const key = getLearningPatternKey(trade.asset, trade.timeframe, trade.side);
    stats[key] ||= {
      key,
      asset: trade.asset,
      timeframe: trade.timeframe,
      side: trade.side,
      trades: 0,
      wins: 0,
      losses: 0,
      pnl: 0
    };
    stats[key].trades += 1;
    stats[key].pnl += Number(trade.pnl) || 0;
    if ((Number(trade.pnl) || 0) > 0) stats[key].wins += 1;
    else stats[key].losses += 1;
  });

  Object.values(stats).forEach((item) => {
    item.winRate = item.trades ? (item.wins / item.trades) * 100 : 0;
    item.avgPnl = item.trades ? item.pnl / item.trades : 0;
  });
  return stats;
}

function getLearningPatternKey(symbol, interval, side) {
  return `${symbol || "unknown"}|${interval || "unknown"}|${side || "unknown"}`;
}

function persistLearningPolicy() {
  localStorage.setItem(learningPolicyKey, JSON.stringify(state.learningPolicy));
}

function getLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shouldRunDailyLearningReview(force = false) {
  if (force) return true;
  const now = new Date();
  return now.getHours() >= learningReviewHour && state.learningPolicy.lastReviewDate !== getLocalDateKey(now);
}

async function runDailyLearningReview(force = false) {
  if (!shouldRunDailyLearningReview(force)) return false;
  await refreshSharedLearningMemory(true);
  const closed = state.paperTrades.filter((trade) => !isPaperTradeActive(trade));
  const today = getLocalDateKey();
  if (closed.length < 10) {
    state.learningPolicy = {
      ...state.learningPolicy,
      lastReviewDate: today,
      reviewedAt: Date.now(),
      notes: [`Самоанализ: закрытых сделок ${closed.length}, для корректировки нужно минимум 10.`]
    };
    persistLearningPolicy();
    renderStrategyIntelligence();
    return true;
  }

  const assetStats = buildLearningGroupStats(closed, (trade) => trade.asset);
  const patternStats = buildLearningGroupStats(closed, (trade) => getLearningPatternKey(trade.asset, trade.timeframe, trade.side));
  const blockedAssets = Object.values(assetStats)
    .filter((item) => item.trades >= 5 && (item.winRate < 45 || item.avgPnl <= 0))
    .map((item) => item.key);
  const blockedPatterns = Object.values(patternStats)
    .filter((item) => item.trades >= 3 && (item.winRate < 50 || item.avgPnl <= 0))
    .map((item) => item.key);
  const preferredPatterns = Object.values(patternStats)
    .filter((item) => item.trades >= 5 && item.winRate >= targetWinRatePct && item.avgPnl > 0)
    .sort((a, b) => b.avgPnl - a.avgPnl)
    .slice(0, 12)
    .map((item) => item.key);

  state.learningPolicy = {
    lastReviewDate: today,
    reviewedAt: Date.now(),
    blockedAssets,
    blockedPatterns,
    preferredPatterns,
    notes: [
      `Самоанализ: ${closed.length} закрытых сделок.`,
      `Заблокировано монет: ${blockedAssets.length}.`,
      `Заблокировано связок: ${blockedPatterns.length}.`,
      `Приоритетных связок: ${preferredPatterns.length}.`
    ]
  };
  persistLearningPolicy();
  renderStrategyIntelligence();
  generateStrategy(state.lastUserIdea);
  return true;
}

function buildLearningGroupStats(trades, keyFn) {
  return trades.reduce((acc, trade) => {
    const key = keyFn(trade);
    if (!key) return acc;
    acc[key] ||= { key, trades: 0, wins: 0, losses: 0, pnl: 0, avgPnl: 0, winRate: 0 };
    acc[key].trades += 1;
    acc[key].pnl += Number(trade.pnl) || 0;
    if ((Number(trade.pnl) || 0) > 0) acc[key].wins += 1;
    else acc[key].losses += 1;
    acc[key].avgPnl = acc[key].pnl / acc[key].trades;
    acc[key].winRate = (acc[key].wins / acc[key].trades) * 100;
    return acc;
  }, {});
}

function formatLearningPolicyNote() {
  const policy = state.learningPolicy;
  if (!policy?.reviewedAt) return "Самоанализ еще не проводился.";
  return `${policy.notes.join(" ")} Последний пересмотр: ${new Date(policy.reviewedAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`;
}

function isAssetQuarantined(symbol) {
  return baseQuarantineAssets.has(symbol) || state.learningPolicy.blockedAssets.includes(symbol);
}

function isPatternBlocked(symbol, interval, side) {
  return state.learningPolicy.blockedPatterns.includes(getLearningPatternKey(symbol, interval, side));
}

function isPatternPreferred(symbol, interval, side) {
  return state.learningPolicy.preferredPatterns.includes(getLearningPatternKey(symbol, interval, side));
}

function calculateMonthlyGoalProgress() {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const trades = state.paperTrades.filter((trade) => !isPaperTradeActive(trade) && (trade.closedAt || trade.openedAt) >= since);
  const pnl = trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0);
  const depositValue = getDepositValue();
  const currentPct = depositValue > 0 ? (pnl / depositValue) * 100 : 0;
  return {
    trades: trades.length,
    pnl,
    currentPct,
    targetPct: 10,
    remainingPct: Math.max(0, 10 - currentPct)
  };
}

function analyzeMarketStructure(candles) {
  const closes = candles.map((candle) => candle.close);
  const atrSeries = calculateAtrSeries(candles, 14);
  const adxBundle = calculateAdxSeries(candles, 14);
  const last = candles[candles.length - 1];
  const atr = getLatestFiniteValue(atrSeries);
  const adx = getLatestFiniteValue(adxBundle.adx);
  const plusDi = getLatestFiniteValue(adxBundle.plusDi);
  const minusDi = getLatestFiniteValue(adxBundle.minusDi);
  const vwap = calculateRollingVwap(candles.slice(-96));
  const volumeWindow = candles.slice(-21, -1);
  const avgVolume = average(volumeWindow.map((candle) => candle.volume));
  const volumeRatio = avgVolume > 0 ? last.volume / avgVolume : 1;
  return {
    adx: Number.isFinite(adx) ? adx : 0,
    plusDi: Number.isFinite(plusDi) ? plusDi : 0,
    minusDi: Number.isFinite(minusDi) ? minusDi : 0,
    atr,
    atrPct: last.close > 0 && Number.isFinite(atr) ? (atr / last.close) * 100 : 0,
    vwap,
    priceVsVwapPct: vwap > 0 ? ((last.close - vwap) / vwap) * 100 : 0,
    volumeRatio: Number.isFinite(volumeRatio) ? volumeRatio : 1,
    lastClose: last.close,
    ema34: getLatestEmaValue(closes, 34),
    ema89: getLatestEmaValue(closes, 89)
  };
}

function buildIntelNotes(backtest, derivatives, sentiment, learning, monthly, candleCount, marketStructure = null, marketRadar = null, higherTimeframe = null, marketCrash = null) {
  const notes = [];
  const journalScope = isRemoteJournalConfigured() ? "общий" : "локальный";
  notes.push(candleCount ? `Бэктест рассчитан по ${candleCount} свечам Bybit.` : "Bybit-история временно недоступна, бэктест не обновлен.");
  if (backtest) notes.push(`Бэктест winrate ${backtest.winRate.toFixed(0)}% при цели не ниже ${targetWinRatePct}%, матожидание ${backtest.expectancyPct >= 0 ? "+" : ""}${backtest.expectancyPct.toFixed(2)}% на сделку, просадка ${backtest.maxDrawdownPct.toFixed(2)}%.`);
  if (marketStructure) notes.push(`Структура рынка: ADX ${marketStructure.adx.toFixed(0)}, ATR ${marketStructure.atrPct.toFixed(2)}%, цена ${marketStructure.priceVsVwapPct >= 0 ? "выше" : "ниже"} VWAP на ${Math.abs(marketStructure.priceVsVwapPct).toFixed(2)}%, объем x${marketStructure.volumeRatio.toFixed(2)}.`);
  if (higherTimeframe?.note) notes.push(higherTimeframe.note);
  if (marketCrash?.summary) notes.push(`Crash-guard: ${marketCrash.summary}.`);
  if (marketRadar) notes.push(`CMC-радар допускает монету: #${marketRadar.rank}, score ${marketRadar.radarScore.toFixed(0)}, объем ${formatCompact(marketRadar.volume24h)} USDT, 30д ${marketRadar.change30d.toFixed(1)}%, 90д ${marketRadar.change90d.toFixed(1)}%.`);
  if (derivatives) notes.push(`${derivatives.bias}.`);
  else notes.push("Деривативные данные недоступны для этой пары или временно не ответили.");
  if (sentiment) notes.push(`Fear & Greed: ${sentiment.value} (${sentiment.label}).`);
  if (learning) notes.push(`${journalScope} журнал этой пары: ${learning.closedTrades} закрытых сделок, winrate ${learning.winRate.toFixed(0)}%. Связки ниже 60% авто-бот блокирует после накопления статистики.`);
  if (monthly) notes.push(`До цели 10%/мес: ${monthly.remainingPct.toFixed(2)}% от депозита.`);
  notes.push("CoinGlass-ликвидации можно подключить отдельным ключом API: сейчас бот готов учитывать этот слой, но не хранит ключи в коде.");
  return notes;
}

function getAvailableAutopilotAssets() {
  const radarAssets = getCmcRadarScanAssets();
  if (radarAssets) return radarAssets;
  return [...asset.options]
    .map((option) => option.value)
    .filter((value, index, list) => value && list.indexOf(value) === index);
}

function getAvailableAutopilotTimeframes() {
  return [...timeframe.options]
    .map((option) => option.value || option.textContent)
    .filter((value, index, list) => value && list.indexOf(value) === index);
}

function getAvailableScalpingTimeframes() {
  return ["5m", "15m"];
}

function createScanContext(symbol, interval = timeframe.value, candles = [], derivatives = null, sentiment = null, strategyMode = "standard") {
  const base = getContext();
  const live = createRestLiveSnapshot(symbol, candles);
  const mode = marketMode.value === "auto" && candles.length >= 18 ? detectMarketMode(candles) : base.mode;
  return {
    ...base,
    asset: symbol,
    timeframe: interval,
    mode,
    modeSource: marketMode.value === "auto" ? "auto-scan" : base.modeSource,
    strategyMode,
    scanCandles: candles,
    rsi: getSelectedRsiIndicators(symbol),
    ema: getSelectedEmaIndicators(),
    news: summarizeNewsForAsset(symbol),
    live,
    intel: null,
    scan: true
  };
}

function createRestLiveSnapshot(symbol, candles) {
  const last = candles[candles.length - 1];
  const first = candles[Math.max(0, candles.length - 40)] || candles[0] || last;
  const previous = candles[candles.length - 2] || last;
  const lastPrice = Number(last?.close) || getPlanBasePrice({ asset: symbol, live: { active: false } });
  const trendPct = first?.close ? ((lastPrice - first.close) / first.close) * 100 : 0;
  const spreadPct = lastPrice > 0 && previous?.close ? Math.abs(lastPrice - previous.close) / lastPrice * 100 * 0.08 : 0.02;
  const volume24h = candles.slice(-96).reduce((sum, candle) => sum + (Number(candle.volume) || 0) * (Number(candle.close) || 0), 0);

  return {
    active: candles.length > 1,
    exchange: "Bybit REST scan",
    symbol,
    lastPrice,
    bid: lastPrice * (1 - spreadPct / 200),
    ask: lastPrice * (1 + spreadPct / 200),
    spreadPct,
    volume24h,
    trendPct,
    ticker: null,
    book: null,
    updatedAt: Date.now()
  };
}

function scoreAutopilotCandidate(context, tradePlan, signalQuality, intel) {
  const best = signalQuality?.best;
  if (!best) return -Infinity;
  const backtest = intel?.backtest;
  const monthly = intel?.monthlyGoal;
  const gate = evaluateAutopilotQualityGate(context, signalQuality, intel, tradePlan);
  if (!gate.ok) return gate.score;
  let score = best.score;
  if (context.strategyMode === "scalping") {
    const scalp = tradePlan?.scalpingSignal;
    score = Math.max(score, scalp?.score || 0);
    if (scalp?.volumeRatio >= 1.6) score += 5;
    if (scalp?.spreadPct <= scalpingMaxSpreadPct * 0.7) score += 4;
    if (scalp?.atrPct >= 0.25 && scalp?.atrPct <= 1.1) score += 4;
  }
  if (backtest?.trades >= 8) score += Math.max(-8, Math.min(16, backtest.expectancyPct * 20));
  if (backtest?.winRate >= targetWinRatePct) score += 8;
  if (backtest?.maxDrawdownPct > 4.5) score -= 8;
  if (monthly?.currentPct < -6) score -= 10;
  if (intel?.derivatives?.sideBias === "CAUTION") score -= 6;
  if (intel?.derivatives?.sideBias === best.side) score += 4;
  const news = context.news || summarizeNewsForAsset(context.asset);
  if (news.bias === "BULLISH") score += best.side === "LONG" ? 6 : -5;
  if (news.bias === "BEARISH") score += best.side === "SHORT" ? 6 : -7;
  if (news.regulatoryRisk) score -= 8;
  const qualityPattern = getQualityPatternStat(context, best.side);
  if (qualityPattern?.trades >= 3) score += qualityPattern.winRate >= targetWinRatePct && qualityPattern.avgPnl > 0 ? 8 : -12;
  if (intel?.higherTimeframe?.direction === best.side) score += 6;
  if (intel?.higherTimeframe?.direction && !["NEUTRAL", "UNKNOWN", best.side].includes(intel.higherTimeframe.direction)) score -= 12;
  if (isPatternPreferred(context.asset, context.timeframe, best.side)) score += 8;
  return Math.round(score);
}

function evaluateAutopilotQualityGate(context, signalQuality, intel, tradePlan = null) {
  const best = signalQuality?.best;
  const backtest = intel?.backtest;
  const pattern = getLearningPatternStat(context.asset, context.timeframe, best?.side);
  if (!best) return { ok: false, reason: "нет сигнала", score: -Infinity };
  const scenario = getAutopilotScenario(tradePlan, best.side);
  const dailyRisk = getDailyRiskState();
  const qualityPattern = getQualityPatternStat(context, best.side);
  if (dailyRisk.blocked) {
    return { ok: false, reason: `дневной стоп: ${dailyRisk.lossPct.toFixed(2)}% убытка или ${dailyRisk.stops} стопов`, score: best.score - 90 };
  }
  const crash = intel?.marketCrash;
  if (crash?.severe) {
    return { ok: false, reason: `crash-guard ${crash.level}: новые входы заблокированы`, score: best.score - 95 };
  }
  if (crash?.riskOff && best.side === "LONG") {
    return { ok: false, reason: `risk-off: рынок просел, LONG запрещен (${crash.drop12.toFixed(2)}% / 12св)`, score: best.score - 75 };
  }
  if (context.strategyMode === "scalping") {
    return evaluateScalpingQualityGate(context, signalQuality, intel, tradePlan, dailyRisk);
  }
  if (context.timeframe === "15m" && best.side === "LONG") {
    return { ok: false, reason: "15m LONG отключен после анализа журнала", score: best.score - 70 };
  }
  if (isAssetQuarantined(context.asset)) {
    return { ok: false, reason: `${context.asset} в карантине после серии слабых сделок`, score: best.score - 65 };
  }
  if (isPatternBlocked(context.asset, context.timeframe, best.side)) {
    return { ok: false, reason: "связка заблокирована ежедневным самоанализом", score: best.score - 60 };
  }
  if (getActiveAutopilotSideCount(best.side) >= autopilotMaxActivePerSide) {
    return { ok: false, reason: `лимит ${autopilotMaxActivePerSide} активных ${best.side}`, score: best.score - 45 };
  }
  if (scenario && hasRecentSimilarAutopilotSignal(context, scenario)) {
    return { ok: false, reason: "дубль похожего сигнала в течение 60 минут", score: best.score - 55 };
  }
  if (best.score < strictAutopilotMinScore) return { ok: false, reason: `режим лучших сетапов: score ${best.score}/100 ниже ${strictAutopilotMinScore}`, score: best.score - 100 };
  if (!backtest || backtest.trades < 8) return { ok: false, reason: "недостаточно сделок в бэктесте", score: best.score - 55 };
  if (backtest.winRate < 55) return { ok: false, reason: `бэктест winrate ${backtest.winRate.toFixed(0)}% ниже 55%`, score: best.score - 45 };
  if (backtest.expectancyPct <= 0) return { ok: false, reason: `матожидание ${backtest.expectancyPct.toFixed(2)}% не положительное`, score: best.score - 45 };
  if (backtest.maxDrawdownPct > 4.5) return { ok: false, reason: `просадка ${backtest.maxDrawdownPct.toFixed(2)}% выше лимита`, score: best.score - 35 };
  if (state.cmcRadar.assets.length && !getMarketRadarAsset(context.asset)) {
    return { ok: false, reason: "монета не прошла CMC-радар", score: best.score - 32 };
  }
  const radarAsset = getMarketRadarAsset(context.asset);
  if (radarAsset && isSuspiciousPumpAsset(radarAsset)) {
    return { ok: false, reason: "анти-памп фильтр: резкий рост без комфортной базы", score: best.score - 36 };
  }
  if (intel?.marketStructure?.adx < 18 && (context.mode === "trend" || context.mode === "breakout")) {
    return { ok: false, reason: `ADX ${intel.marketStructure.adx.toFixed(0)} слабый для ${modeLabel(context.mode)}`, score: best.score - 30 };
  }
  if (intel?.marketStructure?.adx < 15 || intel?.marketStructure?.atrPct < 0.25 || intel?.marketStructure?.volumeRatio < 0.7) {
    return { ok: false, reason: "рыночный шум: слабый ADX/ATR/объем", score: best.score - 34 };
  }
  if (intel?.marketStructure?.volumeRatio < 1 && context.mode === "breakout") {
    return { ok: false, reason: "пробой без повышенного объема", score: best.score - 28 };
  }
  if (intel?.marketStructure?.atrPct > 4.5) {
    return { ok: false, reason: `ATR ${intel.marketStructure.atrPct.toFixed(2)}% выше лимита умеренного риска`, score: best.score - 30 };
  }
  if (intel?.higherTimeframe?.direction && !["NEUTRAL", "UNKNOWN", best.side].includes(intel.higherTimeframe.direction)) {
    return { ok: false, reason: `старший таймфрейм против ${best.side}`, score: best.score - 42 };
  }
  if (pattern?.trades >= 3 && pattern.winRate < targetWinRatePct) {
    return { ok: false, reason: `журнал связки ${pattern.winRate.toFixed(0)}% ниже ${targetWinRatePct}%`, score: best.score - 40 };
  }
  if (pattern?.trades >= 3 && pattern.avgPnl <= 0) {
    return { ok: false, reason: "журнал связки имеет отрицательный средний PnL", score: best.score - 35 };
  }
  if (qualityPattern?.trades >= 3 && (qualityPattern.winRate < targetWinRatePct || qualityPattern.avgPnl <= 0)) {
    return { ok: false, reason: `детальный паттерн ${qualityPattern.winRate.toFixed(0)}% и ${qualityPattern.avgPnl.toFixed(2)}% avg`, score: best.score - 38 };
  }
  if (intel?.derivatives?.sideBias === "CAUTION") return { ok: false, reason: "деривативы показывают перегрев", score: best.score - 25 };
  if (intel?.sentiment?.value >= 82 && best.side === "LONG") return { ok: false, reason: "экстремальная жадность блокирует late long", score: best.score - 20 };
  if (intel?.sentiment?.value <= 18 && best.side === "SHORT") return { ok: false, reason: "экстремальный страх блокирует late short", score: best.score - 20 };
  const news = context.news || summarizeNewsForAsset(context.asset);
  if (news.regulatoryRisk && best.side === "LONG") return { ok: false, reason: "регуляторный негатив из новостей блокирует long", score: best.score - 35 };
  if (news.bias === "BULLISH" && best.side === "SHORT") return { ok: false, reason: "новостной фон против short", score: best.score - 24 };
  if (news.bias === "BEARISH" && best.side === "LONG") return { ok: false, reason: "новостной фон против long", score: best.score - 28 };
  return { ok: true, reason: "фильтры 60% пройдены", score: best.score };
}

function evaluateScalpingQualityGate(context, signalQuality, intel, tradePlan, dailyRisk) {
  const best = signalQuality?.best;
  const signal = tradePlan?.scalpingSignal || evaluateScalpingSetup(context, context.scanCandles || []);
  const scenario = getAutopilotScenario(tradePlan, best?.side);
  if (!best || !scenario) return { ok: false, reason: "скальпинг: нет сценария", score: -Infinity };
  const crash = intel?.marketCrash;
  if (crash?.severe) return { ok: false, reason: "скальпинг: CRASH режим, входы запрещены", score: best.score - 80 };
  if (crash?.riskOff && best.side === "LONG") return { ok: false, reason: "скальпинг: risk-off запрещает long", score: best.score - 65 };
  if (!getAvailableScalpingTimeframes().includes(context.timeframe)) {
    return { ok: false, reason: "скальпинг разрешен только на 5m/15m", score: best.score - 70 };
  }
  if (!signal.side || signal.side !== best.side) {
    return { ok: false, reason: "скальпинг: EMA/VWAP/RSI не совпали", score: best.score - 62 };
  }
  if (signal.score < scalpingMinScore) {
    return { ok: false, reason: `скальпинг score ${signal.score}/100 ниже ${scalpingMinScore}`, score: best.score - 58 };
  }
  if (signal.spreadPct > scalpingMaxSpreadPct) {
    return { ok: false, reason: `скальпинг: спред ${signal.spreadPct.toFixed(3)}% выше лимита`, score: best.score - 55 };
  }
  if (signal.volumeRatio < scalpingMinVolumeRatio) {
    return { ok: false, reason: `скальпинг: объем x${signal.volumeRatio.toFixed(2)} слабый`, score: best.score - 48 };
  }
  if (signal.atrPct < 0.18 || signal.atrPct > 1.8) {
    return { ok: false, reason: `скальпинг: ATR ${signal.atrPct.toFixed(2)}% вне диапазона`, score: best.score - 42 };
  }
  if (intel?.higherTimeframe?.direction && !["NEUTRAL", "UNKNOWN", best.side].includes(intel.higherTimeframe.direction)) {
    return { ok: false, reason: `скальпинг: старший EMA-фильтр против ${best.side}`, score: best.score - 44 };
  }
  const news = context.news || summarizeNewsForAsset(context.asset);
  if (news.regulatoryRisk) return { ok: false, reason: "скальпинг: регуляторный риск", score: best.score - 40 };
  if (hasRecentSimilarAutopilotSignal(context, scenario)) {
    return { ok: false, reason: "скальпинг: дубль похожего входа", score: best.score - 45 };
  }
  const pattern = getQualityPatternStat(context, best.side);
  if (pattern?.trades >= 3 && (pattern.winRate < targetWinRatePct || pattern.avgPnl <= 0)) {
    return { ok: false, reason: `скальпинг-паттерн слабый: ${pattern.winRate.toFixed(0)}%`, score: best.score - 36 };
  }
  if (dailyRisk.stops >= 2) {
    return { ok: false, reason: "скальпинг выключен после 2 дневных стопов", score: best.score - 45 };
  }
  return { ok: true, reason: "скальпинг-фильтры пройдены", score: Math.max(best.score, signal.score) };
}

function isSuspiciousPumpAsset(radarAsset) {
  if (!radarAsset) return false;
  const tooFast = radarAsset.change1h > 8 || radarAsset.change24h > 28;
  const weakBase = radarAsset.volume24h < state.cmcRadar.config.minVolume24h * 1.4 || radarAsset.ageDays < 365 || radarAsset.fdvRatio > 3;
  return tooFast && weakBase;
}

function getLearningPatternStat(symbol, interval, side) {
  if (!symbol || !interval || !side) return null;
  const learning = analyzeLearningJournal(symbol);
  return learning.patternStats[getLearningPatternKey(symbol, interval, side)] || null;
}

function getQualityPatternKey(context, side) {
  const rsi = context.rsi?.filter((item) => item.use).map((item) => item.period).join("-") || "no-rsi";
  const ema = context.ema?.filter((item) => item.use).map((item) => item.period).join("-") || "no-ema";
  const atrBand = context.intel?.marketStructure?.atrPct > 4.5 ? "atr-high" : context.intel?.marketStructure?.atrPct < 0.35 ? "atr-low" : "atr-ok";
  return [context.asset, context.timeframe, side, context.mode, rsi, ema, atrBand].join("|");
}

function getQualityPatternStat(context, side) {
  const key = getQualityPatternKey(context, side);
  const closed = state.paperTrades.filter((trade) => !isPaperTradeActive(trade) && trade.strategySnapshot?.qualityPatternKey === key);
  if (!closed.length) return null;
  const wins = closed.filter((trade) => Number(trade.pnl) > 0).length;
  const avgPnl = average(closed.map((trade) => Number(trade.pnlPct) || 0));
  return { key, trades: closed.length, winRate: (wins / closed.length) * 100, avgPnl };
}

function getDailyRiskState() {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const trades = state.paperTrades.filter((trade) => !isPaperTradeActive(trade) && (Number(trade.closedAt) || Number(trade.openedAt) || 0) >= dayStart.getTime());
  const pnl = trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0);
  const budgetBase = Math.max(1, getDepositValue() + getReservedPaperBudget());
  const lossPct = pnl < 0 ? Math.abs(pnl) / budgetBase * 100 : 0;
  const stops = trades.filter((trade) => trade.status === "stop" || Number(trade.pnl) < 0).length;
  return { trades: trades.length, pnl, lossPct, stops, blocked: lossPct >= dailyMaxLossPct || stops >= dailyMaxStops };
}

function getAutopilotScenario(tradePlan, side) {
  return tradePlan?.scenarios?.find((scenario) => scenario.side === side) || null;
}

function getActiveAutopilotSideCount(side) {
  return state.paperTrades.filter((trade) => trade.autopilot && trade.side === side && isPaperTradeActive(trade)).length;
}

function hasRecentSimilarAutopilotSignal(context, scenario) {
  const now = Date.now();
  return state.paperTrades.some((trade) => {
    if (!trade.autopilot || trade.asset !== context.asset || trade.timeframe !== context.timeframe || trade.side !== scenario.side) return false;
    const openedAt = Number(trade.openedAt) || 0;
    if (!openedAt || now - openedAt > autopilotDuplicateCooldownMs) return false;
    const entry = Number(trade.entry);
    const scenarioEntry = Number(scenario.entry);
    if (!Number.isFinite(entry) || !Number.isFinite(scenarioEntry) || scenarioEntry <= 0) return true;
    return Math.abs(entry - scenarioEntry) / scenarioEntry <= 0.003;
  });
}

function toggleAutopilot() {
  state.autopilot.enabled = !state.autopilot.enabled;
  state.autopilot.lastMessage = state.autopilot.enabled ? "включен, ждет сигнал" : "выключен";
  persistAutopilot();
  renderStrategyIntelligence();
  if (state.autopilot.enabled) {
    runAutopilotScan(true);
  }
}

function toggleScalpingMode() {
  state.autopilot.scalpingEnabled = scalpingMode.checked;
  state.autopilot.lastMessage = state.autopilot.scalpingEnabled
    ? "скальпинг включен, ждет микро-сетап"
    : "скальпинг выключен";
  persistAutopilot();
  renderStrategyIntelligence();
  generateStrategy(state.lastUserIdea);
  if (state.autopilot.enabled) runAutopilotScan(true);
}

function persistAutopilot() {
  localStorage.setItem(autopilotKey, JSON.stringify({
    enabled: state.autopilot.enabled,
    scalpingEnabled: state.autopilot.scalpingEnabled,
    lastEntryAt: state.autopilot.lastEntryAt,
    lastMessage: state.autopilot.lastMessage
  }));
}

async function runAutopilotScan(force = false) {
  if (!state.autopilot.enabled) return;
  const now = Date.now();
  if (!force && now - state.autopilot.lastScanAt < autopilotScanMs) return;
  state.autopilot.lastScanAt = now;
  await refreshSharedLearningMemory(false);
  await runDailyLearningReview(false);

  if (now - state.autopilot.lastEntryAt < 5 * 60 * 1000) {
    state.autopilot.lastMessage = "пауза после входа";
    renderStrategyIntelligence();
    return;
  }

  const candidates = await scanAutopilotCandidates();
  if (!state.autopilot.enabled) {
    renderStrategyIntelligence();
    return;
  }
  const bestCandidate = candidates[0] || null;

  if (bestCandidate && bestCandidate.autopilotScore >= autopilotMinScore) {
    if (bestCandidate.context.asset === asset.value) {
      state.marketIntel = bestCandidate.intel;
      state.tradePlan = bestCandidate.tradePlan;
      state.signalQuality = bestCandidate.signalQuality;
      generateStrategy(state.lastUserIdea);
    }
    const trade = enterPaperTrade({
      autopilot: true,
      scalping: bestCandidate.context.strategyMode === "scalping",
      context: bestCandidate.context,
      tradePlan: bestCandidate.tradePlan,
      signalQuality: bestCandidate.signalQuality,
      side: bestCandidate.signalQuality.best.side,
      strategyHtml: buildAutopilotStrategyHtml(bestCandidate),
      reason: `${bestCandidate.context.strategyMode === "scalping" ? "SCALP " : ""}${bestCandidate.context.asset} ${bestCandidate.context.timeframe}: score ${bestCandidate.signalQuality.best.score}/100, scan ${bestCandidate.autopilotScore}/100`
    });
    if (trade) state.autopilot.lastEntryAt = Date.now();
    state.autopilot.lastMessage = trade ? `вошел: ${trade.strategyMode === "scalping" ? "SCALP " : ""}${trade.side} ${trade.asset} ${trade.timeframe}` : "сигнал был, вход не создан";
  } else {
    const gate = bestCandidate ? evaluateAutopilotQualityGate(bestCandidate.context, bestCandidate.signalQuality, bestCandidate.intel, bestCandidate.tradePlan) : null;
    if (bestCandidate) {
      const rejectGate = gate?.ok
        ? { ok: false, reason: `итоговый score ${bestCandidate.autopilotScore}/100 ниже ${autopilotMinScore}`, score: bestCandidate.autopilotScore }
        : gate;
      rememberRejectedSignal(bestCandidate.context, bestCandidate.signalQuality, rejectGate, bestCandidate.tradePlan, "autopilot");
    }
    state.autopilot.lastMessage = bestCandidate
      ? `лучший: ${bestCandidate.context.strategyMode === "scalping" ? "SCALP " : ""}${bestCandidate.context.asset} ${bestCandidate.context.timeframe} ${bestCandidate.autopilotScore}/100, вход запрещен: ${gate?.reason || "фильтр"}`
      : "нет монет без активной сделки";
  }

  persistAutopilot();
  renderStrategyIntelligence();
}

function isPaperTradeActiveForAsset(symbol) {
  return state.paperTrades.some((trade) => trade.asset === symbol && isPaperTradeActive(trade));
}

async function scanAutopilotCandidates() {
  const symbols = getAvailableAutopilotAssets().filter((symbol) => !isPaperTradeActiveForAsset(symbol));
  const intervals = getAvailableAutopilotTimeframes();
  const scalpingIntervals = state.autopilot.scalpingEnabled ? getAvailableScalpingTimeframes() : [];
  if (!symbols.length) return [];

  state.autopilot.lastMessage = `сканирую ${symbols.length} монет x ${intervals.length + scalpingIntervals.length} ТФ${state.autopilot.scalpingEnabled ? " + скальпинг" : ""}`;
  renderStrategyIntelligence();
  const sentiment = await fetchSentimentIntel().catch(() => null);
  const preliminary = [];

  for (const symbol of symbols) {
    if (!state.autopilot.enabled) break;
    for (const interval of intervals) {
      if (!state.autopilot.enabled) break;
      try {
        const candles = await fetchHistoricalCandlesFor(symbol, interval, 220);
        const context = createScanContext(symbol, interval, candles, null, sentiment);
        const intel = buildMarketIntelForContext(context, candles, null, sentiment);
        context.intel = intel;
        const tradePlan = buildTradePlan(context);
        const signalQuality = evaluateSignalQuality(context, tradePlan);
        const autopilotScore = scoreAutopilotCandidate(context, tradePlan, signalQuality, intel);
        preliminary.push({ context, candles, intel, tradePlan, signalQuality, autopilotScore });
      } catch (error) {
        preliminary.push({ error, context: { asset: symbol, timeframe: interval }, autopilotScore: -Infinity });
      }
    }
    for (const interval of scalpingIntervals) {
      if (!state.autopilot.enabled) break;
      try {
        const candles = await fetchHistoricalCandlesFor(symbol, interval, 180);
        const context = createScanContext(symbol, interval, candles, null, sentiment, "scalping");
        const intel = buildMarketIntelForContext(context, candles, null, sentiment);
        context.intel = intel;
        const tradePlan = buildTradePlan(context);
        const signalQuality = evaluateSignalQuality(context, tradePlan);
        const autopilotScore = scoreAutopilotCandidate(context, tradePlan, signalQuality, intel);
        preliminary.push({ context, candles, intel, tradePlan, signalQuality, autopilotScore });
      } catch (error) {
        preliminary.push({ error, context: { asset: symbol, timeframe: interval, strategyMode: "scalping" }, autopilotScore: -Infinity });
      }
    }
  }

  const top = preliminary
    .filter((candidate) => Number.isFinite(candidate.autopilotScore))
    .sort((a, b) => b.autopilotScore - a.autopilotScore)
    .slice(0, 4);

  const enriched = [];
  for (const candidate of top) {
    if (!state.autopilot.enabled) break;
    const derivatives = await fetchDerivativeIntel(candidate.context.asset).catch(() => null);
    const context = { ...candidate.context };
    const intel = buildMarketIntelForContext(context, candidate.candles, derivatives, sentiment);
    context.intel = intel;
    const tradePlan = buildTradePlan(context);
    const signalQuality = evaluateSignalQuality(context, tradePlan);
    const autopilotScore = scoreAutopilotCandidate(context, tradePlan, signalQuality, intel);
    enriched.push({ context, candles: candidate.candles, intel, tradePlan, signalQuality, autopilotScore });
  }

  return enriched.sort((a, b) => b.autopilotScore - a.autopilotScore);
}

function buildAutopilotStrategyHtml(candidate) {
  const best = candidate.signalQuality.best;
  const plan = candidate.tradePlan.scenarios.find((scenario) => scenario.side === best.side) || candidate.tradePlan.primary;
  return `
    <h2>${candidate.context.asset} · ${candidate.context.timeframe}: авто-бот выбрал ${best.side}</h2>
    <section>
      <h3>Причина входа</h3>
      <p>Скан всех монет и таймфреймов: итоговый score ${candidate.autopilotScore}/100, сигнал ${best.score}/100. ${escapeHtml(best.decision)}.</p>
    </section>
    <section>
      <h3>План</h3>
      <p>Entry ${formatPrice(plan.entry)}, stop ${formatPrice(plan.stop)}, T1 ${formatPrice(plan.target1)}, T2 ${formatPrice(plan.target2)}.</p>
    </section>
    <section>
      <h3>Фильтры</h3>
      <p>${escapeHtml(candidate.intel.notes.join(" "))}</p>
    </section>
  `;
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
  const detectedFrame = candles === state.live.candles ? timeframe.value : null;
  const volatilityLimit = detectedFrame === "5m" ? 1.1 : detectedFrame === "15m" ? 1.6 : detectedFrame === "1h" ? 2.4 : 3.6;

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

function evaluateSignalQuality(context, tradePlan) {
  const scenarios = tradePlan.scenarios.map((scenario) => evaluateScenarioQuality(context, scenario));
  const best = scenarios.reduce((winner, item) => item.score > winner.score ? item : winner, scenarios[0]);
  const verdict = best.score >= 80
    ? "Сигнал сильный, но вход все равно только по подтверждению и с заданным стопом."
    : best.score >= 60
      ? "Сигнал умеренный: допустим малый или обычный риск без увеличения позиции."
      : best.score >= 40
        ? "Сигнал слабый: лучше ждать подтверждения уровня, объема или RSI."
        : "Сделку лучше пропустить: вероятность случайного входа выше, чем качество преимущества.";

  return { best, scenarios, verdict };
}

function evaluateScenarioQuality(context, scenario) {
  const reasons = [];
  let score = 48;
  const riskDistance = Math.abs(scenario.entry - scenario.stop);
  const rewardDistance = Math.abs(scenario.target2 - scenario.entry);
  const rrValue = riskDistance > 0 ? rewardDistance / riskDistance : 0;

  if (rrValue >= 2.1) addScore(16, "risk/reward дает запас прочности");
  else if (rrValue >= 1.6) addScore(9, "risk/reward приемлемый");
  else addScore(-12, "risk/reward слабый для умеренного риска");

  if (context.risk <= 1) addScore(7, "риск на сделку умеренный");
  else if (context.risk <= 1.5) addScore(3, "риск не выше среднего");
  else addScore(-8, "риск выше комфортного диапазона");

  if (context.live.active) {
    if (context.live.spreadPct <= 0.04) addScore(9, "спред узкий");
    else if (context.live.spreadPct <= 0.1) addScore(3, "спред допустимый");
    else addScore(-13, "спред широкий");

    if (context.live.volume24h > 50000000) addScore(8, "ликвидность высокая");
    else if (context.live.volume24h > 5000000) addScore(4, "ликвидность достаточная");
    else addScore(-7, "ликвидность слабая");

    const trendFitsLong = scenario.side === "LONG" && context.live.trendPct >= -0.25;
    const trendFitsShort = scenario.side === "SHORT" && context.live.trendPct <= 0.25;
    if (trendFitsLong || trendFitsShort) addScore(8, "направление не конфликтует с динамикой свечей");
    else addScore(-9, "направление конфликтует с текущей динамикой");
  } else {
    addScore(-5, "нет live-подтверждения рынка");
  }

  if (context.mode === "high-volatility") addScore(-8, "высокая волатильность требует меньшего размера позиции");
  if (context.mode === "breakout") addScore(5, "режим пробоя дает потенциал движения");
  if (context.mode === "range" && scenario.side === "LONG") addScore(2, "в боковике long допустим только от поддержки");
  if (context.mode === "range" && scenario.side === "SHORT") addScore(2, "в боковике short допустим только от сопротивления");

  const intelResult = evaluateIntelForScenario(context, scenario);
  addScore(intelResult.delta, intelResult.reason);
  const rsiResult = evaluateRsiForScenario(context, scenario.side);
  addScore(rsiResult.delta, rsiResult.reason);
  const emaResult = evaluateEmaForScenario(context, scenario.side);
  addScore(emaResult.delta, emaResult.reason);
  const structureResult = evaluateMarketStructureForScenario(context, scenario);
  addScore(structureResult.delta, structureResult.reason);
  const radarResult = evaluateMarketRadarForScenario(context);
  addScore(radarResult.delta, radarResult.reason);
  const newsResult = evaluateNewsForScenario(context, scenario);
  addScore(newsResult.delta, newsResult.reason);
  const historyResult = evaluateHistoryRestrictionsForScenario(context, scenario);
  addScore(historyResult.delta, historyResult.reason);

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  const decision = finalScore >= 80
    ? "можно рассматривать вход"
    : finalScore >= 60
      ? "только с умеренным риском"
      : finalScore >= 40
        ? "ждать подтверждения"
        : "пропустить сделку";

  return {
    side: scenario.side,
    score: finalScore,
    decision,
    summary: reasons.slice(0, 4).join("; ")
  };

  function addScore(delta, reason) {
    score += delta;
    reasons.push(`${delta > 0 ? "+" : ""}${delta}: ${reason}`);
  }
}

function evaluateIntelForScenario(context, scenario) {
  const intel = context.intel || {};
  let delta = 0;
  const reasons = [];

  if (intel.backtest?.trades >= 12) {
    if (intel.backtest.expectancyPct > 0.2 && intel.backtest.winRate >= 48) {
      delta += 7;
      reasons.push("бэктест показывает положительное ожидание");
    } else if (intel.backtest.expectancyPct < 0) {
      delta -= 8;
      reasons.push("бэктест по текущему режиму отрицательный");
    }
  }

  if (intel.derivatives?.sideBias) {
    if (intel.derivatives.sideBias === scenario.side) {
      delta += 5;
      reasons.push("деривативные данные не спорят со стороной сделки");
    } else if (intel.derivatives.sideBias === "CAUTION") {
      delta -= 5;
      reasons.push("фандинг/OI указывают на перегрев");
    } else {
      delta -= 4;
      reasons.push("деривативный перекос против выбранной стороны");
    }
  }

  if (intel.sentiment?.value) {
    if (intel.sentiment.value >= 78 && scenario.side === "LONG") {
      delta -= 5;
      reasons.push("жадность повышает риск позднего long");
    } else if (intel.sentiment.value <= 22 && scenario.side === "SHORT") {
      delta -= 5;
      reasons.push("экстремальный страх повышает риск позднего short");
    } else {
      delta += 2;
      reasons.push("сентимент не экстремальный");
    }
  }

  if (intel.learning?.sideStats?.[scenario.side]?.trades >= 3) {
    const stat = intel.learning.sideStats[scenario.side];
    if (stat.avgPnl > 0) {
      delta += 4;
      reasons.push("журнал подтверждает сторону сделки");
    } else {
      delta -= 4;
      reasons.push("журнал показывает слабую сторону сделки");
    }
  }

  return { delta, reason: reasons.join("; ") || "лабораторные фильтры еще не накопили данных" };
}

function evaluateMarketStructureForScenario(context, scenario) {
  const structure = context.intel?.marketStructure;
  if (!structure) return { delta: -2, reason: "ADX/ATR/VWAP еще не рассчитаны" };

  let delta = 0;
  const reasons = [];
  const trendAligned = scenario.side === "LONG"
    ? structure.plusDi >= structure.minusDi
    : structure.minusDi >= structure.plusDi;
  const vwapAligned = scenario.side === "LONG"
    ? structure.priceVsVwapPct >= -0.25
    : structure.priceVsVwapPct <= 0.25;

  if (structure.adx >= 25 && trendAligned) {
    delta += 8;
    reasons.push("ADX подтверждает силу направления");
  } else if (structure.adx < 18 && (context.mode === "trend" || context.mode === "breakout")) {
    delta -= 8;
    reasons.push("ADX слабый для трендового входа");
  } else if (!trendAligned) {
    delta -= 6;
    reasons.push("DI-линии спорят со стороной сделки");
  } else {
    delta += 2;
    reasons.push("ADX нейтральный, но направление не конфликтует");
  }

  if (vwapAligned) {
    delta += 4;
    reasons.push("цена не конфликтует с VWAP");
  } else {
    delta -= 6;
    reasons.push("цена по VWAP против выбранной стороны");
  }

  if (structure.volumeRatio >= 1.2) {
    delta += 4;
    reasons.push("объем выше среднего");
  } else if (context.mode === "breakout" && structure.volumeRatio < 1) {
    delta -= 6;
    reasons.push("пробой без объема рискован");
  }

  if (structure.atrPct > 4.5) {
    delta -= 7;
    reasons.push("ATR слишком высокий для умеренного риска");
  } else if (structure.atrPct >= 0.35) {
    delta += 2;
    reasons.push("ATR достаточный для движения");
  }

  return { delta, reason: reasons.join("; ") };
}

function evaluateMarketRadarForScenario(context) {
  if (!state.cmcRadar.assets.length) return { delta: 0, reason: "CMC-радар не подключен" };
  const radarAsset = getMarketRadarAsset(context.asset);
  if (!radarAsset) return { delta: -7, reason: "монета не входит в текущий топ CMC-радара" };
  let delta = 5;
  const reasons = [`CMC-радар допустил монету #${radarAsset.rank}`];
  if (radarAsset.radarScore > 80) {
    delta += 4;
    reasons.push("сильный momentum/volume score");
  }
  if (radarAsset.fdvRatio > 3) {
    delta -= 4;
    reasons.push("FDV заметно выше капитализации");
  }
  if (radarAsset.volumeChange24h < -25) {
    delta -= 3;
    reasons.push("интерес за 24ч падает");
  }
  return { delta, reason: reasons.join("; ") };
}

function evaluateNewsForScenario(context, scenario) {
  const news = context.news || summarizeNewsForAsset(context.asset);
  if (!news.items?.length) return { delta: 0, reason: "новостной фон не подключен" };
  let delta = 0;
  const reasons = [];
  if (news.bias === "BULLISH") {
    delta += scenario.side === "LONG" ? 9 : -7;
    reasons.push(scenario.side === "LONG" ? "новости поддерживают long" : "новости против short");
  } else if (news.bias === "BEARISH") {
    delta += scenario.side === "SHORT" ? 9 : -9;
    reasons.push(scenario.side === "SHORT" ? "новости поддерживают short" : "новости против long");
  } else {
    delta += 1;
    reasons.push("новостной фон нейтральный");
  }
  if (news.regulatoryRisk) {
    delta -= scenario.side === "LONG" ? 8 : 3;
    reasons.push("регуляторный риск требует снижения агрессии");
  }
  return { delta, reason: reasons.join("; ") };
}

function evaluateHistoryRestrictionsForScenario(context, scenario) {
  const warnings = getManualStrategyRestrictions(context, scenario);
  if (!warnings.length) return { delta: 0, reason: "журнал не накладывает запрет на этот сценарий" };
  const hardPenalty = warnings.some((warning) => warning.includes("не применять"));
  return {
    delta: hardPenalty ? -28 : -14,
    reason: warnings.join("; ")
  };
}

function getManualStrategyRestrictions(context, scenario) {
  const warnings = [];
  if (context.timeframe === "15m" && scenario.side === "LONG") {
    warnings.push("15m LONG не применять для ручного входа: по журналу 1 WIN / 11 LOSS.");
  }
  if (context.intel?.marketCrash?.riskOff && scenario.side === "LONG") {
    warnings.push(`Crash-guard ${context.intel.marketCrash.level}: ручной LONG запрещен до стабилизации рынка.`);
  }
  if (isAssetQuarantined(context.asset)) {
    warnings.push(`${context.asset} в карантине после анализа журнала: ручной вход только после отдельного подтверждения и минимальным размером.`);
  }
  if (isPatternBlocked(context.asset, context.timeframe, scenario.side)) {
    warnings.push("Эта связка монета/таймфрейм/сторона заблокирована ежедневным самоанализом.");
  }
  if (hasRecentSimilarAutopilotSignal(context, scenario)) {
    warnings.push("Похожий авто-сигнал уже был недавно: не дублировать вход руками без нового сетапа.");
  }
  const qualityPattern = getQualityPatternStat(context, scenario.side);
  if (qualityPattern?.trades >= 3 && (qualityPattern.winRate < targetWinRatePct || qualityPattern.avgPnl <= 0)) {
    warnings.push(`Детальная связка индикаторов слабая: ${qualityPattern.trades} сделок, winrate ${qualityPattern.winRate.toFixed(0)}%, avg ${qualityPattern.avgPnl.toFixed(2)}%.`);
  }
  return warnings;
}

function evaluateEmaForScenario(context, side) {
  const used = context.ema.filter((indicator) => indicator.use);
  if (!used.length) return { delta: 0, reason: "EMA 34/89 выключены" };
  const candles = getCandlesForRsi(context);
  const closes = candles.map((candle) => candle.close);
  const lastClose = closes[closes.length - 1];
  const ema34 = getLatestEmaValue(closes, 34);
  const ema89 = getLatestEmaValue(closes, 89);
  if (!Number.isFinite(lastClose) || !Number.isFinite(ema34) || !Number.isFinite(ema89)) {
    return { delta: -2, reason: "EMA 34/89 не рассчитаны из-за нехватки свечей" };
  }
  const bullish = lastClose >= ema34 && ema34 >= ema89;
  const bearish = lastClose <= ema34 && ema34 <= ema89;
  if (side === "LONG" && bullish) return { delta: 8, reason: "EMA 34 выше EMA 89 и поддерживает long" };
  if (side === "SHORT" && bearish) return { delta: 8, reason: "EMA 34 ниже EMA 89 и поддерживает short" };
  if ((side === "LONG" && bearish) || (side === "SHORT" && bullish)) return { delta: -8, reason: "EMA 34/89 конфликтуют с направлением сделки" };
  return { delta: 1, reason: "EMA 34/89 дают нейтральный фильтр" };
}

function evaluateRsiForScenario(context, side) {
  const used = context.rsi.filter((indicator) => indicator.use);
  if (!used.length) return { delta: 0, reason: "RSI выключен" };
  const candles = getCandlesForRsi(context);
  const values = used
    .map((indicator) => getLatestRsiValue(candles, indicator.period))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return { delta: -3, reason: "RSI не рассчитан из-за нехватки свечей" };
  const avgRsi = average(values);

  if (side === "LONG") {
    if (avgRsi >= 42 && avgRsi <= 62) return { delta: 10, reason: `RSI ${avgRsi.toFixed(1)} поддерживает long без перегрева` };
    if (avgRsi < 35) return { delta: 5, reason: `RSI ${avgRsi.toFixed(1)} показывает перепроданность, нужен разворот` };
    if (avgRsi > 70) return { delta: -14, reason: `RSI ${avgRsi.toFixed(1)} перегрет для long` };
    return { delta: -2, reason: `RSI ${avgRsi.toFixed(1)} нейтрален для long` };
  }

  if (avgRsi >= 38 && avgRsi <= 58) return { delta: 10, reason: `RSI ${avgRsi.toFixed(1)} поддерживает short без экстремума` };
  if (avgRsi > 65) return { delta: 6, reason: `RSI ${avgRsi.toFixed(1)} показывает перекупленность, нужен разворот вниз` };
  if (avgRsi < 30) return { delta: -14, reason: `RSI ${avgRsi.toFixed(1)} перепродан для short` };
  return { delta: -2, reason: `RSI ${avgRsi.toFixed(1)} нейтрален для short` };
}

function drawChart(mode, tradePlan = null) {
  const width = canvas.width;
  const height = canvas.height;
  const compact = height < 380;
  const rsiBox = getRsiPanelBox(width, height, compact);
  const pad = { left: 52, right: 190, top: 28, bottom: compact ? 96 : 54 };
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

  const points = makePricePath(mode, 68, width, height, compact);
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
  drawEmaOverlay(makeSyntheticRsiCandles(mode, tradePlan?.basePrice), getVisibleEmaIndicators(), {
    pad,
    chartWidth: width - pad.left - pad.right,
    chartHeight: height - pad.top - pad.bottom,
    min: tradePlan ? Math.min(...tradePlan.scenarios.flatMap((scenario) => [scenario.entry, scenario.stop, scenario.target1, scenario.target2])) * 0.998 : tradePlan?.basePrice * 0.98 || 1,
    range: tradePlan ? (Math.max(...tradePlan.scenarios.flatMap((scenario) => [scenario.entry, scenario.stop, scenario.target1, scenario.target2])) * 1.002 - Math.min(...tradePlan.scenarios.flatMap((scenario) => [scenario.entry, scenario.stop, scenario.target1, scenario.target2])) * 0.998) : tradePlan?.basePrice * 0.04 || 1
  });
  drawRsiPanel(makeSyntheticRsiCandles(mode, tradePlan?.basePrice), getVisibleRsiIndicators(), rsiBox);
}

function makePricePath(mode, count, width, height, compact = false) {
  const points = [];
  const left = 36;
  const right = width - 36;
  const top = 34;
  const bottom = compact ? height - 92 : height - 42;
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
  const compact = height < 380;
  const rsiBox = getRsiPanelBox(width, height, compact);
  const pad = { left: 52, right: 190, top: 28, bottom: compact ? 96 : 54 };
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
  ctx.fillText(`last ${formatPrice(last.close)}`, pad.left, compact ? rsiBox.y - 8 : height - 16);

  if (tradePlan) {
    drawTradePlanOverlay(tradePlan, {
      pad,
      chartWidth,
      chartHeight,
      priceToY: (price) => priceToY(price, min, range, pad, chartHeight)
    });
    drawScenarioBadge(tradePlan, pad.left, pad.top);
  }
  drawEmaOverlay(visible, getVisibleEmaIndicators(), { pad, chartWidth, chartHeight, min, range });
  drawRsiPanel(visible, getVisibleRsiIndicators(), rsiBox);
}

function getRsiPanelBox(width, height, compact = false) {
  const panelHeight = compact ? 58 : 92;
  return {
    x: 52,
    y: height - panelHeight - 24,
    width: width - 52 - 190,
    height: panelHeight
  };
}

function drawEmaOverlay(candles, indicators, scale) {
  const visible = indicators.filter((indicator) => indicator.show);
  if (!visible.length || candles.length < 4) return;

  visible.forEach((indicator, index) => {
    const values = calculateEmaSeries(candles.map((candle) => candle.close), indicator.period);
    ctx.beginPath();
    values.forEach((value, pointIndex) => {
      if (!Number.isFinite(value)) return;
      const x = scale.pad.left + (pointIndex / Math.max(1, values.length - 1)) * scale.chartWidth;
      const y = priceToY(value, scale.min, scale.range || 1, scale.pad, scale.chartHeight);
      if (pointIndex === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = indicator.color;
    ctx.lineWidth = 2;
    ctx.setLineDash(index === 0 ? [] : [5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    const latest = values.filter((value) => Number.isFinite(value)).at(-1);
    if (Number.isFinite(latest)) {
      ctx.fillStyle = indicator.color;
      ctx.font = "800 11px Inter, system-ui, sans-serif";
      ctx.fillText(`${indicator.label} ${formatPrice(latest)}`, scale.pad.left + 12, scale.pad.top + 18 + index * 14);
    }
  });
}

function priceToY(price, min, range, pad, chartHeight) {
  return pad.top + (1 - (price - min) / range) * chartHeight;
}

function drawRsiPanel(candles, indicators, box) {
  const visible = indicators.filter((indicator) => indicator.show);
  if (!visible.length || candles.length < 8) return;

  ctx.fillStyle = "rgba(9,12,15,0.88)";
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.strokeRect(box.x, box.y, box.width, box.height);

  [70, 50, 30].forEach((level) => {
    const y = rsiToY(level, box);
    ctx.strokeStyle = level === 50 ? "rgba(255,255,255,0.18)" : "rgba(243,177,77,0.25)";
    ctx.setLineDash(level === 50 ? [] : [5, 6]);
    ctx.beginPath();
    ctx.moveTo(box.x, y);
    ctx.lineTo(box.x + box.width, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#9aa6ad";
    ctx.font = "700 10px Inter, system-ui, sans-serif";
    ctx.fillText(String(level), box.x + box.width + 8, y + 3);
  });

  visible.forEach((indicator, lineIndex) => {
    const values = calculateRsiSeries(candles.map((candle) => candle.close), indicator.period);
    const start = Math.max(0, values.length - candles.length);
    ctx.strokeStyle = indicator.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let hasPoint = false;
    values.slice(start).forEach((value, index, arr) => {
      if (!Number.isFinite(value)) return;
      const x = box.x + (box.width / Math.max(1, arr.length - 1)) * index;
      const y = rsiToY(value, box);
      if (!hasPoint) {
        ctx.moveTo(x, y);
        hasPoint = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    if (hasPoint) ctx.stroke();
    const latest = getLatestRsiValue(candles, indicator.period);
    ctx.fillStyle = indicator.color;
    ctx.font = "800 11px Inter, system-ui, sans-serif";
    ctx.fillText(`${indicator.label}: ${Number.isFinite(latest) ? latest.toFixed(1) : "--"}`, box.x + 10 + lineIndex * 150, box.y + 16);
  });
}

function rsiToY(value, box) {
  return box.y + (1 - value / 100) * box.height;
}

function getVisibleRsiIndicators() {
  return getSelectedRsiIndicators().filter((indicator) => indicator.show);
}

function getVisibleEmaIndicators() {
  return getSelectedEmaIndicators().filter((indicator) => indicator.show);
}

function getCandlesForRsi(context) {
  if (context.live.active && state.live.candles.length) return state.live.candles.slice(-80);
  return makeSyntheticRsiCandles(context.mode, getPlanBasePrice(context));
}

function makeSyntheticRsiCandles(mode, basePrice = 100) {
  const points = [];
  for (let i = 0; i < 80; i += 1) {
    const t = i / 79;
    let factor;
    if (mode === "trend") factor = 1 + t * 0.045 + Math.sin(i * 0.55) * 0.006;
    else if (mode === "range") factor = 1 + Math.sin(i * 0.45) * 0.018;
    else if (mode === "breakout") factor = 1 + (t > 0.62 ? (t - 0.62) * 0.11 : Math.sin(i * 0.35) * 0.008);
    else if (mode === "pullback") factor = 1 + t * 0.04 - Math.max(0, t - 0.62) * 0.065 + Math.sin(i * 0.4) * 0.005;
    else factor = 1 + Math.sin(i * 0.75) * 0.035 + Math.cos(i * 0.21) * 0.012;
    const close = basePrice * factor;
    points.push({ close, open: close, high: close * 1.002, low: close * 0.998, volume: 1 });
  }
  return points;
}

function getLatestRsiValue(candles, period) {
  const values = calculateRsiSeries(candles.map((candle) => candle.close), period);
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(values[i])) return values[i];
  }
  return NaN;
}

function getLatestEmaValue(closes, period) {
  const values = calculateEmaSeries(closes, period);
  return getLatestFiniteValue(values);
}

function getLatestFiniteValue(values) {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(values[i])) return values[i];
  }
  return NaN;
}

function calculateEmaSeries(closes, period) {
  const result = Array(closes.length).fill(NaN);
  if (!closes.length) return result;
  const multiplier = 2 / (period + 1);
  let ema = closes[0];
  result[0] = ema;
  for (let i = 1; i < closes.length; i += 1) {
    ema = closes[i] * multiplier + ema * (1 - multiplier);
    result[i] = ema;
  }
  return result;
}

function calculateRsiSeries(closes, period) {
  const result = Array(closes.length).fill(NaN);
  if (closes.length <= period) return result;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i += 1) {
    const delta = closes[i] - closes[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return result;
}

function calculateAtrSeries(candles, period = 14) {
  const result = Array(candles.length).fill(NaN);
  if (candles.length <= period) return result;
  const trueRanges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });
  let atr = average(trueRanges.slice(1, period + 1));
  result[period] = atr;
  for (let i = period + 1; i < candles.length; i += 1) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result[i] = atr;
  }
  return result;
}

function calculateAdxSeries(candles, period = 14) {
  const adx = Array(candles.length).fill(NaN);
  const plusDi = Array(candles.length).fill(NaN);
  const minusDi = Array(candles.length).fill(NaN);
  if (candles.length <= period * 2) return { adx, plusDi, minusDi };

  const trueRanges = Array(candles.length).fill(0);
  const plusDm = Array(candles.length).fill(0);
  const minusDm = Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];
    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;
    trueRanges[i] = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );
    plusDm[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[i] = downMove > upMove && downMove > 0 ? downMove : 0;
  }

  let smoothedTr = sumValues(trueRanges.slice(1, period + 1));
  let smoothedPlus = sumValues(plusDm.slice(1, period + 1));
  let smoothedMinus = sumValues(minusDm.slice(1, period + 1));
  const dx = Array(candles.length).fill(NaN);

  for (let i = period; i < candles.length; i += 1) {
    if (i > period) {
      smoothedTr = smoothedTr - smoothedTr / period + trueRanges[i];
      smoothedPlus = smoothedPlus - smoothedPlus / period + plusDm[i];
      smoothedMinus = smoothedMinus - smoothedMinus / period + minusDm[i];
    }
    plusDi[i] = smoothedTr > 0 ? (smoothedPlus / smoothedTr) * 100 : 0;
    minusDi[i] = smoothedTr > 0 ? (smoothedMinus / smoothedTr) * 100 : 0;
    const directionalSum = plusDi[i] + minusDi[i];
    dx[i] = directionalSum > 0 ? Math.abs(plusDi[i] - minusDi[i]) / directionalSum * 100 : 0;
  }

  let adxValue = average(dx.slice(period, period * 2).filter(Number.isFinite));
  adx[period * 2 - 1] = adxValue;
  for (let i = period * 2; i < candles.length; i += 1) {
    adxValue = (adxValue * (period - 1) + dx[i]) / period;
    adx[i] = adxValue;
  }
  return { adx, plusDi, minusDi };
}

function calculateRollingVwap(candles) {
  const totals = candles.reduce((acc, candle) => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const volume = Number(candle.volume) || 0;
    acc.priceVolume += typicalPrice * volume;
    acc.volume += volume;
    return acc;
  }, { priceVolume: 0, volume: 0 });
  return totals.volume > 0 ? totals.priceVolume / totals.volume : 0;
}

function sumValues(values) {
  return values.reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function describeRsiSignal(value, context) {
  if (!Number.isFinite(value)) return "Недостаточно свечей для расчета; фильтр описан как профиль, но не подтверждает вход.";
  if (context.includeLongs && value < 35) return "Поддерживает поиск long после подтверждения разворота из перепроданности.";
  if (context.includeShorts && value > 65) return "Поддерживает поиск short после подтверждения слабости из перекупленности.";
  if (value > 45 && value < 55) return "Нейтральная зона: вход лучше подтверждать уровнем, объемом и структурой свечей.";
  if (value >= 55 && value <= 65) return "Умеренно бычья зона: long допустим по тренду, short только от сопротивления.";
  if (value >= 35 && value <= 45) return "Умеренно медвежья зона: short допустим по тренду, long только от сильной поддержки.";
  return "Экстремальная зона: вход без подтверждения повышает риск ложного сигнала.";
}

function buildTradePlan(context) {
  if (context.strategyMode === "scalping") {
    return buildScalpingTradePlan(context);
  }
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

function buildScalpingTradePlan(context) {
  ensureAtLeastOneScenario();
  const candles = context.scanCandles || state.live.candles;
  const basePrice = getPlanBasePrice(context);
  const signal = evaluateScalpingSetup(context, candles);
  const executable = getScalpingExecutionPrices(context, basePrice, signal.spreadPct);
  const atrPct = Number(signal.atrPct) || Math.max(0.18, getVolatilityPct(context) * 100);
  const riskDistance = basePrice * Math.max(0.0012, Math.min(0.0048, atrPct / 100 * 0.55));
  const rr1 = 0.55;
  const rr2 = 0.9;

  const longEntry = executable.longEntry;
  const long = {
    side: "LONG",
    entry: longEntry,
    executionType: "marketable",
    orderPrice: executable.longOrderPrice,
    immediateFill: true,
    stop: longEntry - riskDistance,
    target1: longEntry + riskDistance * rr1,
    target2: longEntry + riskDistance * rr2,
    confidence: signal.side === "LONG" ? "скальпинг-сигнал" : "условный",
    comment: `скальпинг EMA9/21 + RSI + VWAP: ${signal.reason}`
  };

  const shortEntry = executable.shortEntry;
  const short = {
    side: "SHORT",
    entry: shortEntry,
    executionType: "marketable",
    orderPrice: executable.shortOrderPrice,
    immediateFill: true,
    stop: shortEntry + riskDistance,
    target1: shortEntry - riskDistance * rr1,
    target2: shortEntry - riskDistance * rr2,
    confidence: signal.side === "SHORT" ? "скальпинг-сигнал" : "условный",
    comment: `скальпинг EMA9/21 + RSI + VWAP: ${signal.reason}`
  };

  const scenarios = [];
  if (includeLongs.checked && (!signal.side || signal.side === "LONG")) scenarios.push(long);
  if (includeShorts.checked && (!signal.side || signal.side === "SHORT")) scenarios.push(short);

  return {
    source: "scalping",
    basePrice,
    scalpingSignal: signal,
    scenarios: scenarios.length ? scenarios : [long, short].filter((scenario) => scenario.side === signal.side),
    primary: scenarios[0] || (signal.side === "SHORT" ? short : long)
  };
}

function getScalpingExecutionPrices(context, basePrice, signalSpreadPct = 0) {
  const live = context.live || {};
  const spreadPct = Math.max(Number(signalSpreadPct) || 0, Number(live.spreadPct) || 0.02);
  const halfSpread = spreadPct / 200;
  const slippage = paperSlippagePct / 100;
  const bid = Number(live.bid) > 0 ? Number(live.bid) : basePrice * (1 - halfSpread);
  const ask = Number(live.ask) > 0 ? Number(live.ask) : basePrice * (1 + halfSpread);
  return {
    longEntry: ask * (1 + slippage),
    shortEntry: bid * (1 - slippage),
    longOrderPrice: ask * (1 + slippage * 1.8),
    shortOrderPrice: bid * (1 - slippage * 1.8)
  };
}

function evaluateScalpingSetup(context, candles = []) {
  const usable = candles.length >= 35 ? candles : getCandlesForRsi(context);
  const closes = usable.map((candle) => candle.close);
  const lastIndex = closes.length - 1;
  if (lastIndex < 30) return { ok: false, side: "", score: 0, reason: "недостаточно свечей для скальпинга" };

  const ema9 = calculateEmaSeries(closes, 9);
  const ema21 = calculateEmaSeries(closes, 21);
  const rsi14 = calculateRsiSeries(closes, 14);
  const atr14 = calculateAtrSeries(usable, 14);
  const vwap = calculateRollingVwap(usable.slice(-48));
  const last = usable[lastIndex];
  const previous = usable[lastIndex - 1];
  const avgVolume = average(usable.slice(-21, -1).map((candle) => candle.volume));
  const volumeRatio = avgVolume > 0 ? last.volume / avgVolume : 1;
  const atrPct = last.close > 0 && Number.isFinite(atr14[lastIndex]) ? (atr14[lastIndex] / last.close) * 100 : 0;
  const spreadPct = context.live?.spreadPct ?? 0.08;
  const longCross = previous.close <= ema9[lastIndex - 1] && last.close > ema9[lastIndex];
  const shortCross = previous.close >= ema9[lastIndex - 1] && last.close < ema9[lastIndex];
  const longContinuation = last.close > ema9[lastIndex] && ema9[lastIndex] > ema21[lastIndex] && ema9[lastIndex] >= ema9[lastIndex - 3];
  const shortContinuation = last.close < ema9[lastIndex] && ema9[lastIndex] < ema21[lastIndex] && ema9[lastIndex] <= ema9[lastIndex - 3];
  const longMomentum = ema9[lastIndex] > ema21[lastIndex] && (longCross || longContinuation) && last.close >= vwap * 0.999;
  const shortMomentum = ema9[lastIndex] < ema21[lastIndex] && (shortCross || shortContinuation) && last.close <= vwap * 1.001;
  const rsi = rsi14[lastIndex];
  const longRsi = rsi >= 48 && rsi <= 68;
  const shortRsi = rsi >= 32 && rsi <= 52;
  const side = longMomentum && longRsi ? "LONG" : shortMomentum && shortRsi ? "SHORT" : "";

  let score = 40;
  if (side) score += 28;
  if (volumeRatio >= scalpingMinVolumeRatio) score += 14;
  else score -= 12;
  if (spreadPct <= scalpingMaxSpreadPct) score += 12;
  else score -= 18;
  if (atrPct >= 0.18 && atrPct <= 1.8) score += 10;
  else score -= 10;
  if (Math.abs(last.close - vwap) / last.close * 100 < 0.9) score += 5;
  else score -= 6;

  const reasons = [
    side ? `${side} momentum` : "нет чистого EMA/VWAP momentum",
    `RSI ${Number.isFinite(rsi) ? rsi.toFixed(1) : "n/a"}`,
    `volume x${volumeRatio.toFixed(2)}`,
    `spread ${spreadPct.toFixed(3)}%`,
    `ATR ${atrPct.toFixed(2)}%`
  ];
  return { ok: Boolean(side) && score >= scalpingMinScore, side, score: Math.max(0, Math.min(100, Math.round(score))), rsi, volumeRatio, spreadPct, atrPct, vwap, reason: reasons.join("; ") };
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

function syncPaperSideOptions(tradePlan) {
  const availableSides = new Set((tradePlan?.scenarios || []).map((scenario) => scenario.side));
  [...paperSide.options].forEach((option) => {
    option.disabled = availableSides.size > 0 && !availableSides.has(option.value);
  });

  if (!availableSides.has(paperSide.value)) {
    const fallback = tradePlan?.scenarios?.[0]?.side;
    if (fallback) paperSide.value = fallback;
  }

  const bestSide = getBestScenarioSide(tradePlan);
  if (bestSide && availableSides.has(bestSide)) {
    paperSide.value = bestSide;
  }
}

function enterPaperTrade(options = {}) {
  const context = options.context || getContext();
  const tradePlan = options.tradePlan || state.tradePlan || buildTradePlan(context);
  const signalQuality = options.signalQuality || state.signalQuality;
  const side = options.side || signalQuality?.best?.side || getBestScenarioSide(tradePlan) || paperSide.value;
  const scenario = tradePlan.scenarios.find((item) => item.side === side) || tradePlan.primary;
  if (!scenario) return;

  const availableBudget = getDepositValue();
  if (availableBudget < 10) {
    paperStatus.textContent = "недостаточно бюджета";
    paperResult.textContent = "Свободный бюджет меньше минимальной суммы сделки 10 USDT";
    renderWalletReadout();
    return null;
  }

  const maxWalletAmount = getMaxTradeAmountByWallet(options);
  if (maxWalletAmount < 10) {
    paperStatus.textContent = "лимит бюджета";
    paperResult.textContent = options.autopilot
      ? `Автобот не вошел: в рынке уже занято до ${autopilotMaxPortfolioPct}% капитала или свободного бюджета недостаточно`
      : "Сделка не открыта: превышен лимит открытых позиций";
    renderWalletReadout();
    return null;
  }

  const requestedAmount = Math.max(10, Number(paperAmount.value) || 1000);
  const amount = clampTradeAmountByRisk(Math.min(requestedAmount, availableBudget, maxWalletAmount), scenario, options);
  const riskBudgetAtEntry = getRiskBudget(options);
  if (amount < 10 || !reservePaperBudget(amount)) {
    paperStatus.textContent = "недостаточно бюджета";
    paperResult.textContent = "Сделка не открыта: сумма превышает свободный бюджет";
    renderWalletReadout();
    return null;
  }
  paperAmount.value = String(amount);
  const entry = scenario.entry;
  const quantity = amount / entry;
  const target1Quantity = quantity * 0.5;
  const id = `trade-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  const quality = signalQuality?.scenarios?.find((item) => item.side === scenario.side);
  const placedPrice = scenario.orderPrice || getExecutableMarketPrice(context.asset) || tradePlan.basePrice || entry;
  const triggerDirection = getOrderTriggerDirection(scenario.side, placedPrice, entry);
  const strategySnapshot = createStrategySnapshot(context, tradePlan, scenario, quality, { ...options, signalQuality });

  const trade = {
    id,
    index: state.paperTrades.length + 1,
    sessionId: currentSessionId,
    asset: context.asset,
    timeframe: context.timeframe,
    mode: context.mode,
    modeSource: context.modeSource,
    side: scenario.side,
    amount,
    deposit: context.deposit,
    reservedAmount: amount,
    releasedAmount: 0,
    releasedPnl: 0,
    budgetReserved: true,
    walletSettled: false,
    riskBudget: riskBudgetAtEntry,
    riskLimitPct: options.scalping ? scalpingRiskPct : Math.min(Number(risk.value) || 1, 2),
    autopilot: Boolean(options.autopilot),
    strategyMode: options.scalping ? "scalping" : context.strategyMode || "standard",
    autopilotReason: String(options.reason || ""),
    entry,
    quantity,
    initialQuantity: quantity,
    remainingQuantity: quantity,
    target1Quantity,
    realizedPnl: 0,
    stop: scenario.stop,
    target: scenario.target2,
    target1: scenario.target1,
    target1HitAt: null,
    target1ExitPrice: null,
    placedPrice,
    triggerDirection,
    executionType: scenario.executionType || "conditional",
    immediateFill: Boolean(scenario.immediateFill),
    openedAt: Date.now(),
    filledAt: null,
    closedAt: null,
    status: scenario.immediateFill ? "open" : "pending",
    result: scenario.immediateFill ? "позиция открыта моментально" : "ордер ожидает вход",
    decision: quality?.decision || "",
    score: quality?.score || null,
    strategySnapshot,
    lastCheckedAt: Date.now(),
    exitPrice: null,
    pnl: 0,
    pnlPct: 0,
    history: [{ time: Date.now(), price: scenario.immediateFill ? entry : placedPrice, pnl: 0, pnlPct: 0 }]
  };

  const normalizedTrade = ensureBybitPaperState(trade);
  if (scenario.immediateFill) {
    markPaperOpeningOrderFilled(normalizedTrade);
  }
  state.paperTrades.push(normalizedTrade);
  state.activePaperTradeId = id;
  persistPaperTrades();
  updatePaperTrades();
  if (options.context && options.context.asset !== asset.value) {
    renderTradeJournal();
  }
  return trade;
}

function createStrategySnapshot(context, tradePlan, scenario, quality, options = {}) {
  const signalQuality = options.signalQuality || state.signalQuality;
  const strategyHtml = options.strategyHtml || (context.asset === asset.value ? strategyContainer.innerHTML : "") || buildStrategy(state.lastUserIdea, tradePlan, signalQuality);
  const allScenarios = (tradePlan?.scenarios || []).map(snapshotScenario);
  const snapshot = {
    version: "2",
    capturedAt: Date.now(),
    strategyText: options.strategyHtml ? stripTags(strategyHtml) : state.lastStrategy || stripTags(strategyHtml),
    strategyHtml,
    userIdea: state.lastUserIdea || "",
    context: {
      asset: context.asset,
      timeframe: context.timeframe,
      mode: context.mode,
      modeSource: context.modeSource,
      strategyMode: context.strategyMode || "standard",
      risk: Math.min(Number(context.risk) || 1, 2),
      conservative: context.conservative,
      includeLongs: context.includeLongs,
      includeShorts: context.includeShorts,
      deposit: context.deposit,
      live: {
        active: Boolean(context.live?.active),
        symbol: context.live?.symbol || context.asset,
        ticker: context.live?.ticker || null,
        book: context.live?.book || null,
        updatedAt: context.live?.updatedAt || null
      },
      rsi: context.rsi.map(snapshotIndicator),
      ema: context.ema.map(snapshotIndicator)
    },
    intelligence: {
      backtest: context.intel?.backtest || null,
      marketStructure: context.intel?.marketStructure || null,
      marketCrash: context.intel?.marketCrash || null,
      marketRadar: context.intel?.marketRadar || null,
      scalpingSignal: tradePlan?.scalpingSignal || null,
      derivatives: context.intel?.derivatives || null,
      sentiment: context.intel?.sentiment || null,
      learning: context.intel?.learning || null,
      monthlyGoal: context.intel?.monthlyGoal || null,
      notes: context.intel?.notes || []
    },
    selectedScenario: snapshotScenario(scenario),
    allScenarios,
    signalQuality: {
      selected: quality || null,
      best: signalQuality?.best || null,
      verdict: signalQuality?.verdict || "",
      scenarios: signalQuality?.scenarios || []
    },
    execution: {
      autopilot: Boolean(options.autopilot),
      reason: String(options.reason || ""),
      minScore: strictAutopilotMinScore,
      feePct: paperFeePct,
      slippagePct: paperSlippagePct
    },
    qualityPatternKey: getQualityPatternKey(context, scenario.side),
    rules: [...context.rules],
    sourceRules: [...context.sourceRules],
    knowledgeSources: knowledgeSources.map((source) => ({
      title: source.title,
      author: source.author,
      theme: source.theme,
      rules: [...source.rules]
    })),
    outcome: null
  };

  return JSON.parse(JSON.stringify(snapshot));
}

function snapshotScenario(scenario) {
  if (!scenario) return null;
  return {
    side: scenario.side,
    entry: scenario.entry,
    stop: scenario.stop,
    target1: scenario.target1,
    target2: scenario.target2,
    executionType: scenario.executionType || "",
    orderPrice: scenario.orderPrice || null,
    immediateFill: Boolean(scenario.immediateFill),
    risk: Math.abs(scenario.entry - scenario.stop),
    reward1: Math.abs(scenario.target1 - scenario.entry),
    reward2: Math.abs(scenario.target2 - scenario.entry)
  };
}

function snapshotIndicator(indicator) {
  return {
    id: indicator.id,
    label: indicator.label,
    period: indicator.period,
    show: indicator.show,
    use: indicator.use,
    role: indicator.role
  };
}

function getBestScenarioSide(tradePlan) {
  const sides = new Set((tradePlan?.scenarios || []).map((scenario) => scenario.side));
  const bestSide = state.signalQuality?.best?.side;
  if (bestSide && sides.has(bestSide)) return bestSide;
  return null;
}

function getOrderTriggerDirection(side, placedPrice, entry) {
  if (side === "LONG") return entry >= placedPrice ? "above" : "below";
  return entry <= placedPrice ? "below" : "above";
}

function getOpeningOrderType(side, placedPrice, entry, executionType = "") {
  if (executionType === "marketable") return "Market";
  const isLimitEntry = side === "LONG" ? entry <= placedPrice : entry >= placedPrice;
  return isLimitEntry ? "Limit" : "Conditional";
}

function getRiskBudget(options = {}) {
  const riskPct = options.scalping ? scalpingRiskPct : Math.min(Number(risk.value) || 1, 2);
  return getDepositValue() * (riskPct / 100);
}

function clampTradeAmountByRisk(requestedAmount, scenario, options = {}) {
  const availableBudget = Math.max(0, getDepositValue());
  const maxWalletAmount = getMaxTradeAmountByWallet(options);
  const riskPerUnit = Math.abs(scenario.entry - scenario.stop);
  if (!Number.isFinite(riskPerUnit) || riskPerUnit <= 0) {
    return Math.max(0, Math.min(requestedAmount, availableBudget, maxWalletAmount));
  }
  const maxAmount = (getRiskBudget(options) / riskPerUnit) * scenario.entry;
  return Math.max(0, Math.min(requestedAmount, availableBudget, maxWalletAmount, Math.floor(maxAmount * 100) / 100));
}

function resetPaperTrade(shouldDraw = true) {
  state.activePaperTradeId = null;
  paperStatus.textContent = "ожидает вход";
  paperEntry.textContent = "нет данных";
  paperCurrent.textContent = "нет данных";
  paperPnl.textContent = "0.00 USDT";
  paperPnl.style.color = "";
  paperResult.textContent = "нет сделки";
  renderWalletReadout();
  if (shouldDraw) drawPaperChart();
}

function clearPaperJournal() {
  state.paperTrades = state.paperTrades.filter((trade) => trade.sessionId !== currentSessionId);
  state.activePaperTradeId = null;
  persistPaperTrades();
  resetPaperTrade(false);
  renderTradeJournal();
  drawPaperChart();
}

let remoteSyncTimer = null;

function scheduleRemoteJournalSync() {
  if (!isRemoteJournalConfigured()) return;
  if (state.remoteJournal.syncing) return;
  window.clearTimeout(remoteSyncTimer);
  remoteSyncTimer = window.setTimeout(() => syncRemoteJournal(false), 1200);
}

async function syncRemoteJournal(force = false) {
  if (!isRemoteJournalConfigured()) {
    renderRemoteJournalStatus();
    return;
  }
  if (state.remoteJournal.syncing) return;
  if (!force && Date.now() - state.remoteJournal.lastSyncAt < 12000) return;

  state.remoteJournal.syncing = true;
  setRemoteJournalStatus("sync");
  try {
    await pushRemoteJournalTrades();
    const remoteTrades = await fetchRemoteJournalTrades();
    mergeRemoteJournalTrades(remoteTrades);
    state.remoteJournal.lastSyncAt = Date.now();
    setRemoteJournalStatus(`shared ${state.paperTrades.length}`);
    localStorage.setItem(paperJournalKey, JSON.stringify({ trades: state.paperTrades }));
    renderTradeJournal();
    updatePaperTrades();
  } catch (error) {
    setRemoteJournalStatus("error");
  } finally {
    state.remoteJournal.syncing = false;
  }
}

async function pushRemoteJournalTrades() {
  const rows = state.paperTrades.map((trade) => ({
    id: trade.id,
    client_id: currentClientId,
    session_id: trade.sessionId,
    asset: trade.asset,
    timeframe: trade.timeframe,
    side: trade.side,
    status: trade.status,
    opened_at: toIsoOrNull(trade.openedAt),
    closed_at: toIsoOrNull(trade.closedAt),
    updated_at: toIsoOrNull(getTradeUpdatedAt(trade)),
    pnl: Number(trade.pnl) || 0,
    trade
  }));
  if (!rows.length) return;
  await remoteJournalFetch(`/${encodeURIComponent(state.remoteJournal.config.table)}?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows)
  });
}

async function fetchRemoteJournalTrades() {
  const table = encodeURIComponent(state.remoteJournal.config.table);
  const rows = await remoteJournalFetch(`/${table}?select=*&order=updated_at.desc&limit=5000`);
  return Array.isArray(rows) ? rows.map((row) => row.trade).filter(Boolean) : [];
}

async function remoteJournalFetch(path, options = {}) {
  const config = state.remoteJournal.config;
  const response = await fetch(`${config.url}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error("Remote journal request failed");
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function mergeRemoteJournalTrades(remoteTrades) {
  const byId = new Map(state.paperTrades.map((trade) => [trade.id, trade]));
  remoteTrades.forEach((trade) => {
    const normalized = normalizePaperTrade(trade);
    if (!normalized) return;
    const local = byId.get(normalized.id);
    if (!local || getTradeUpdatedAt(normalized) >= getTradeUpdatedAt(local)) {
      byId.set(normalized.id, normalized);
    }
  });
  state.paperTrades = [...byId.values()].sort((a, b) => (Number(a.openedAt) || 0) - (Number(b.openedAt) || 0));
}

function getTradeUpdatedAt(trade) {
  const historyTime = Array.isArray(trade.history) && trade.history.length ? Number(trade.history[trade.history.length - 1].time) || 0 : 0;
  return Math.max(
    Number(trade.updatedAt) || 0,
    Number(trade.closedAt) || 0,
    Number(trade.target1HitAt) || 0,
    Number(trade.filledAt) || 0,
    Number(trade.lastCheckedAt) || 0,
    historyTime,
    Number(trade.openedAt) || 0
  );
}

function toIsoOrNull(timestamp) {
  const value = Number(timestamp);
  return Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null;
}

function updatePaperTrades() {
  if (!state.paperTrades.length) {
    renderWalletReadout();
    renderTradeJournal();
    drawPaperChart();
    return;
  }

  refreshOpenPaperTradePrices();
  state.paperTrades.forEach((trade) => updateSinglePaperTrade(trade));
  const activeTrade = getActivePaperTrade();
  if (activeTrade) {
    const currentPrice = getPaperTradePrice(activeTrade);
    renderPaperReadout(activeTrade, currentPrice, activeTrade.pnl, activeTrade.pnlPct);
    drawPaperChart(activeTrade);
  } else {
    resetPaperTrade(false);
    drawPaperChart();
  }
  persistPaperTrades();
  renderWalletReadout();
  renderTradeJournal();
}

async function refreshOpenPaperTradePrices(force = false) {
  const now = Date.now();
  if (!force && now - state.paperPriceLastFetch < 9000) return;
  const openAssets = [...new Set(state.paperTrades.filter(isPaperTradeActive).map((trade) => trade.asset))];
  if (!openAssets.length) return;

  state.paperPriceLastFetch = now;
  const currentSnapshot = getLiveSnapshot();
  const liveSymbol = toBinanceSymbol(currentSnapshot.symbol);
  const liveTickerPrice = state.live.ticker?.symbol === liveSymbol ? Number(state.live.ticker?.lastPrice) : 0;
  if (currentSnapshot.active && liveTickerPrice > 0) {
    state.paperPriceCache[currentSnapshot.symbol] = {
      price: liveTickerPrice,
      updatedAt: currentSnapshot.updatedAt,
      source: "live"
    };
  }

  const assetsToFetch = openAssets.filter((symbol) => {
    const cached = state.paperPriceCache[symbol];
    return !cached || now - cached.updatedAt > 9000;
  });

  let changed = false;
  if (assetsToFetch.length) {
    const results = await Promise.allSettled(assetsToFetch.map(fetchPaperTickerPrice));
    results.forEach((result, index) => {
      if (result.status !== "fulfilled" || !result.value?.price) return;
      state.paperPriceCache[assetsToFetch[index]] = {
        price: result.value.price,
        updatedAt: Date.now(),
        source: "Bybit"
      };
      changed = true;
    });
  }

  const replayChanged = await reconcileActivePaperTradesWithCandles();
  if (changed || replayChanged) updatePaperTradesFromCachedPrices();
}

async function fetchPaperTickerPrice(symbol) {
  const url = `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${toBinanceSymbol(symbol)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Ticker request failed");
  const data = await response.json();
  const ticker = data.result?.list?.[0];
  const price = Number(ticker?.lastPrice);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Ticker price unavailable");
  return { price };
}

function updatePaperTradesFromCachedPrices() {
  state.paperTrades.forEach((trade) => updateSinglePaperTrade(trade));
  const activeTrade = getActivePaperTrade();
  if (activeTrade) {
    const currentPrice = getPaperTradePrice(activeTrade);
    renderPaperReadout(activeTrade, currentPrice, activeTrade.pnl, activeTrade.pnlPct);
    drawPaperChart(activeTrade);
  }
  persistPaperTrades();
  renderTradeJournal();
}

async function reconcileActivePaperTradesWithCandles() {
  const activeTrades = state.paperTrades.filter(isPaperTradeActive);
  if (!activeTrades.length) return false;

  const results = await Promise.allSettled(activeTrades.map(replayPaperTradeFromBybitCandles));
  return results.some((result) => result.status === "fulfilled" && result.value);
}

async function replayPaperTradeFromBybitCandles(trade) {
  const start = Math.max(Number(trade.lastCheckedAt) || Number(trade.openedAt) || Date.now(), Date.now() - 90 * 24 * 60 * 60 * 1000);
  const intervalMs = intervalToMs(trade.timeframe);
  let changed = false;
  let cursor = Math.max(0, start - intervalMs);
  let requests = 0;

  while (isPaperTradeActive(trade) && cursor < Date.now() && requests < 6) {
    requests += 1;
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${toBinanceSymbol(trade.asset)}&interval=${toBybitInterval(trade.timeframe)}&start=${cursor}&limit=1000`;
    const response = await fetch(url);
    if (!response.ok) break;
    const data = await response.json();
    if (data.retCode !== 0 || !Array.isArray(data.result?.list) || !data.result.list.length) break;

    const candles = data.result.list.slice().reverse().map((item) => ({
      openTime: Number(item[0]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      closeTime: Number(item[0]) + intervalMs - 1
    }));

    candles.forEach((candle) => {
      if (!isPaperTradeActive(trade) || candle.closeTime <= (Number(trade.lastCheckedAt) || 0)) return;
      if (replayPaperTradeCandle(trade, candle)) changed = true;
      trade.lastCheckedAt = candle.closeTime;
    });

    const lastCandle = candles[candles.length - 1];
    const nextCursor = lastCandle ? lastCandle.closeTime + 1 : cursor;
    if (nextCursor <= cursor || candles.length < 1000) break;
    cursor = nextCursor;
  }

  return changed;
}

function replayPaperTradeCandle(trade, candle) {
  let changed = false;

  if (trade.status === "pending") {
    const triggered = trade.triggerDirection === "above" ? candle.high >= trade.entry : candle.low <= trade.entry;
    if (!triggered) {
      appendPaperPoint(trade, candle.close, 0, 0);
      return true;
    }
    fillPaperOpeningOrder(trade);
    changed = true;
  }

  if (!["open", "partial"].includes(trade.status)) return changed;

  const hitStop = trade.side === "LONG" ? candle.low <= trade.stop : candle.high >= trade.stop;
  const hitTarget1 = trade.side === "LONG" ? candle.high >= trade.target1 : candle.low <= trade.target1;
  const hitTarget2 = trade.side === "LONG" ? candle.high >= trade.target : candle.low <= trade.target;

  if (hitStop) {
    closePaperPositionByTpsl(trade, "stop");
    return true;
  }

  if (trade.status === "open" && hitTarget1) {
    executePartialTakeProfit(trade);
    changed = true;
  }

  if (["open", "partial"].includes(trade.status) && hitTarget2) {
    closePaperPositionByTpsl(trade, "target");
    return true;
  }

  const pnl = calculatePaperPnl(trade, candle.close);
  const pnlPct = (pnl / trade.amount) * 100;
  trade.pnl = pnl;
  trade.pnlPct = pnlPct;
  appendPaperPoint(trade, candle.close, pnl, pnlPct);
  return true;
}

function updateSinglePaperTrade(trade) {
  const currentPrice = getPaperTradePrice(trade);
  if (trade.status === "pending") {
    trade.pnl = 0;
    trade.pnlPct = 0;
    if (currentPrice > 0) appendPaperPoint(trade, currentPrice, 0, 0);
    if (currentPrice > 0 && isPaperOrderTriggered(trade, currentPrice)) {
      fillPaperOpeningOrder(trade);
      return;
    } else {
      return;
    }
  }

  const pnl = calculatePaperPnl(trade, currentPrice);
  const pnlPct = (pnl / trade.amount) * 100;
  trade.pnl = pnl;
  trade.pnlPct = pnlPct;

  if (["open", "partial"].includes(trade.status)) {
    appendPaperPoint(trade, currentPrice, pnl, pnlPct);
    const hitTarget1 = trade.side === "LONG" ? currentPrice >= trade.target1 : currentPrice <= trade.target1;
    const hitTarget2 = trade.side === "LONG" ? currentPrice >= trade.target : currentPrice <= trade.target;
    const hitStop = trade.side === "LONG" ? currentPrice <= trade.stop : currentPrice >= trade.stop;
    const emergencyStop = isEmergencyCrashStop(trade, currentPrice);

    if (hitStop || emergencyStop) {
      closePaperPositionByTpsl(trade, "stop", emergencyStop ? currentPrice : null);
      return;
    }

    if (trade.status === "open" && hitTarget1) {
      executePartialTakeProfit(trade);
    }

    if (["open", "partial"].includes(trade.status) && hitTarget2) {
      closePaperPositionByTpsl(trade, "target");
    }
  }
}

function fillPaperOpeningOrder(trade) {
  trade.status = "open";
  trade.filledAt = Date.now();
  trade.result = "позиция открыта";
  markPaperOpeningOrderFilled(trade);
  appendPaperPoint(trade, trade.entry, 0, 0);
}

function markPaperOpeningOrderFilled(trade) {
  trade.status = "open";
  trade.filledAt = trade.filledAt || Date.now();
  trade.openingOrder.orderStatus = "Filled";
  trade.openingOrder.avgPrice = trade.entry;
  trade.openingOrder.cumExecQty = trade.quantity;
  trade.openingOrder.leavesQty = 0;
  trade.remainingQuantity = getInitialQuantity(trade);
  trade.realizedPnl = Number(trade.realizedPnl) || 0;
  trade.position.size = trade.quantity;
  trade.position.avgPrice = trade.entry;
  trade.position.positionStatus = "Normal";
  trade.tp1Order.orderStatus = "Untriggered";
  trade.tp2Order.orderStatus = "Untriggered";
  trade.tpOrder = trade.tp2Order;
  trade.slOrder.orderStatus = "Untriggered";
}

function executePartialTakeProfit(trade) {
  if (trade.target1HitAt) return;
  const closingQuantity = Math.min(getRemainingQuantity(trade), Number(trade.target1Quantity) || getInitialQuantity(trade) * 0.5);
  if (closingQuantity <= 0) return;

  const partialPnl = calculatePaperPnlForQuantity(trade, trade.target1, closingQuantity);
  const reservePerUnit = getInitialQuantity(trade) > 0 ? (Number(trade.reservedAmount) || 0) / getInitialQuantity(trade) : 0;
  const releasedReserve = reservePerUnit * closingQuantity;
  trade.status = "partial";
  trade.target1HitAt = Date.now();
  trade.target1ExitPrice = trade.target1;
  trade.realizedPnl = getRealizedPnl(trade) + partialPnl;
  trade.remainingQuantity = Math.max(0, getRemainingQuantity(trade) - closingQuantity);
  trade.pnl = trade.realizedPnl;
  trade.pnlPct = (trade.pnl / trade.amount) * 100;
  trade.result = "T1: 50% зафиксировано, остаток ждет T2";
  trade.position.size = trade.remainingQuantity;
  trade.position.positionStatus = trade.remainingQuantity > 0 ? "Normal" : "Closed";
  trade.position.closedPnl = trade.realizedPnl;
  trade.tp1Order.orderStatus = "Filled";
  trade.tp1Order.avgPrice = trade.target1;
  trade.tp1Order.cumExecQty = closingQuantity;
  trade.tp1Order.leavesQty = 0;
  trade.tp2Order.orderStatus = trade.remainingQuantity > 0 ? "Untriggered" : "Cancelled";
  trade.tpOrder = trade.tp2Order;
  settlePaperBudget(trade, releasedReserve, partialPnl);
  updateStrategySnapshotOutcome(trade, "partial");
  appendPaperPoint(trade, trade.target1, trade.pnl, trade.pnlPct);
}

function closePaperPositionByTpsl(trade, closeType, overrideExitPrice = null) {
  const isTarget = closeType === "target";
  const exitPrice = Number(overrideExitPrice) > 0 ? Number(overrideExitPrice) : isTarget ? trade.target : trade.stop;
  const closingQuantity = getRemainingQuantity(trade);
  const exitPnl = getRealizedPnl(trade) + calculatePaperPnlForQuantity(trade, exitPrice, closingQuantity);
  const exitPnlPct = (exitPnl / trade.amount) * 100;
  const filledOrder = isTarget ? trade.tp2Order : trade.slOrder;
  const reservedAmount = Number(trade.reservedAmount) || 0;
  const alreadyReleasedAmount = Number(trade.releasedAmount) || 0;
  const alreadyReleasedPnl = Number(trade.releasedPnl) || 0;
  const remainingReserve = Math.max(0, reservedAmount - alreadyReleasedAmount);
  const remainingPnl = exitPnl - alreadyReleasedPnl;
  const presetResult = String(trade.result || "");

  trade.status = closeType;
  trade.closedAt = Date.now();
  trade.exitPrice = exitPrice;
  trade.realizedPnl = exitPnl;
  trade.remainingQuantity = 0;
  trade.pnl = exitPnl;
  trade.pnlPct = exitPnlPct;
  trade.result = presetResult.includes("аварийный crash-stop")
    ? presetResult
    : isTarget
      ? `${trade.side} отработал: T1 50% + T2 остаток`
      : trade.target1HitAt
        ? `${trade.side}: T1 зафиксирован, остаток закрыт по стопу`
        : `${trade.side} не отработал`;
  trade.position.size = 0;
  trade.position.positionStatus = "Closed";
  trade.position.closedPnl = exitPnl;
  filledOrder.orderStatus = "Filled";
  filledOrder.avgPrice = exitPrice;
  filledOrder.cumExecQty = closingQuantity;
  filledOrder.leavesQty = 0;
  if (isTarget) {
    trade.slOrder.orderStatus = "Cancelled";
  } else {
    if (!trade.target1HitAt) trade.tp1Order.orderStatus = "Cancelled";
    trade.tp2Order.orderStatus = "Cancelled";
  }
  trade.tpOrder = trade.tp2Order;
  if (!trade.walletSettled) {
    settlePaperBudget(trade, remainingReserve, remainingPnl);
    trade.walletSettled = true;
  }
  updateStrategySnapshotOutcome(trade, closeType);
  appendPaperPoint(trade, exitPrice, exitPnl, exitPnlPct);
}

function updateStrategySnapshotOutcome(trade, eventType) {
  if (!trade.strategySnapshot) return;
  trade.strategySnapshot.outcome = {
    eventType,
    status: trade.status,
    result: trade.result,
    side: trade.side,
    openedAt: trade.openedAt,
    filledAt: trade.filledAt,
    closedAt: trade.closedAt,
    target1HitAt: trade.target1HitAt,
    entry: trade.entry,
    stop: trade.stop,
    target1: trade.target1,
    target2: trade.target,
    exitPrice: trade.exitPrice,
    amount: trade.amount,
    initialQuantity: getInitialQuantity(trade),
    remainingQuantity: getRemainingQuantity(trade),
    realizedPnl: trade.realizedPnl,
    pnl: trade.pnl,
    pnlPct: trade.pnlPct,
    updatedAt: Date.now()
  };
}

function isPaperOrderTriggered(trade, currentPrice) {
  return trade.triggerDirection === "above"
    ? currentPrice >= trade.entry
    : currentPrice <= trade.entry;
}

function appendPaperPoint(trade, price, pnl, pnlPct) {
  const lastPoint = trade.history[trade.history.length - 1];
  if (lastPoint && Math.abs(lastPoint.price - price) < price * 0.000001 && Date.now() - lastPoint.time < 1000) {
    return;
  }

  trade.history.push({ time: Date.now(), price, pnl, pnlPct });
  if (trade.history.length > 180) {
    trade.history = trade.history.slice(-180);
  }
}

function isPaperTradeActive(trade) {
  return ["pending", "open", "partial"].includes(trade.status);
}

function getInitialQuantity(trade) {
  return Number(trade.initialQuantity) || Number(trade.quantity) || Number(trade.amount) / Number(trade.entry) || 0;
}

function getRemainingQuantity(trade) {
  if (Number.isFinite(Number(trade.remainingQuantity))) return Number(trade.remainingQuantity);
  if (["target", "stop"].includes(trade.status)) return 0;
  if (trade.status === "partial") return Math.max(0, getInitialQuantity(trade) - (Number(trade.target1Quantity) || getInitialQuantity(trade) * 0.5));
  return getInitialQuantity(trade);
}

function isEmergencyCrashStop(trade, currentPrice) {
  if (trade.side !== "LONG" || !["open", "partial"].includes(trade.status)) return false;
  const entry = Number(trade.entry);
  if (!entry || !currentPrice) return false;
  const lossPct = ((currentPrice - entry) / entry) * 100;
  if (lossPct <= -crashEmergencyLongLossPct) {
    trade.result = `аварийный crash-stop: LONG закрыт при ${lossPct.toFixed(2)}%`;
    return true;
  }
  const history = Array.isArray(trade.history) ? trade.history.slice(-6) : [];
  const first = history[0]?.price;
  if (first > 0) {
    const fastDropPct = ((currentPrice - first) / first) * 100;
    if (fastDropPct <= -1.2 && lossPct < -0.5) {
      trade.result = `аварийный crash-stop: быстрое падение ${fastDropPct.toFixed(2)}%`;
      return true;
    }
  }
  return false;
}

function getRealizedPnl(trade) {
  return Number.isFinite(Number(trade.realizedPnl)) ? Number(trade.realizedPnl) : 0;
}

function calculatePaperPnlForQuantity(trade, price, quantity) {
  const direction = trade.side === "LONG" ? 1 : -1;
  const gross = (price - trade.entry) * quantity * direction;
  return gross - calculatePaperTradingCosts(trade, price, quantity);
}

function calculatePaperPnl(trade, price) {
  return getRealizedPnl(trade) + calculatePaperPnlForQuantity(trade, price, getRemainingQuantity(trade));
}

function calculatePaperTradingCosts(trade, price, quantity) {
  const entryNotional = Number(trade.entry) * quantity;
  const exitNotional = Number(price) * quantity;
  const fee = (entryNotional + exitNotional) * (paperFeePct / 100);
  const slippage = (entryNotional + exitNotional) * (paperSlippagePct / 100);
  return fee + slippage;
}

function getActivePaperTrade() {
  if (state.activePaperTradeId) {
    const selected = state.paperTrades.find((trade) => trade.id === state.activePaperTradeId);
    if (selected) return selected;
  }
  return [...state.paperTrades].reverse().find(isPaperTradeActive) || state.paperTrades[state.paperTrades.length - 1] || null;
}

function renderPaperReadout(trade, currentPrice, pnl, pnlPct) {
  const statusLabels = {
    pending: "ордер ожидает вход",
    open: "сделка открыта",
    partial: "T1 зафиксирован",
    target: "цель достигнута",
    stop: "стоп сработал"
  };
  paperStatus.textContent = statusLabels[trade.status] || "в работе";
  paperEntry.textContent = `${trade.side} · ${formatPrice(trade.entry)}`;
  paperCurrent.textContent = formatPrice(currentPrice);
  paperPnl.textContent = `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USDT (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%)`;
  paperPnl.style.color = pnl >= 0 ? "#55c7a2" : "#ef6b5b";
  paperResult.textContent = trade.result;
}

function renderTradeJournal() {
  renderTradeArchive();
  renderWalletReadout();
  const trades = getVisibleJournalTrades();
  const openTrades = trades.filter(isPaperTradeActive);
  const closedTrades = trades.filter((trade) => !isPaperTradeActive(trade));
  const wins = closedTrades.filter((trade) => trade.pnl >= 0);
  const losses = closedTrades.filter((trade) => trade.pnl < 0);
  const totalPnl = trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0);

  journalOpen.textContent = String(openTrades.length);
  journalClosed.textContent = String(closedTrades.length);
  journalPnl.textContent = `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} USDT`;
  journalPnl.style.color = totalPnl >= 0 ? "#55c7a2" : "#ef6b5b";
  journalWinloss.textContent = `${wins.length} / ${losses.length}`;

  if (!trades.length) {
    journalRows.innerHTML = `<tr><td colspan="10">В этой сессии сделок пока нет, активных сделок из прошлых запусков тоже нет</td></tr>`;
    return;
  }

  journalRows.innerHTML = trades.map((trade, index) => {
    const currentPrice = getPaperTradePrice(trade);
    const isActive = getActivePaperTrade()?.id === trade.id;
    const statusClass = trade.status === "pending" ? "pending" : trade.status === "open" ? "open" : trade.status === "partial" ? "partial" : trade.pnl >= 0 ? "win" : "loss";
    const statusLabel = trade.status === "pending" ? "PENDING" : trade.status === "open" ? "OPEN" : trade.status === "partial" ? "T1 50%" : trade.pnl >= 0 ? "WIN" : "LOSS";
    const sideClass = trade.side === "SHORT" ? "short" : "long";
    return `
      <tr class="${isActive ? "is-active" : ""}">
        <td><button type="button" data-view-trade="${escapeHtml(trade.id)}">${index + 1}</button></td>
        <td>${formatJournalTime(trade.openedAt)}</td>
        <td>${escapeHtml(trade.asset.replace("/USDT", ""))}</td>
        <td><span class="side-badge ${sideClass}">${trade.side}</span></td>
        <td>${formatPrice(trade.entry)}</td>
        <td>${trade.amount.toFixed(2)}</td>
        <td>${formatPrice(trade.exitPrice || currentPrice)}</td>
        <td style="color:${trade.pnl >= 0 ? "#55c7a2" : "#ef6b5b"}">${trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}</td>
        <td style="color:${trade.pnl >= 0 ? "#55c7a2" : "#ef6b5b"}">${trade.pnlPct >= 0 ? "+" : ""}${trade.pnlPct.toFixed(2)}%</td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
      </tr>
    `;
  }).join("");

  journalRows.querySelectorAll("[data-view-trade]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activePaperTradeId = button.dataset.viewTrade;
      updatePaperTrades();
    });
  });
}

function getVisibleJournalTrades() {
  return state.paperTrades.filter((trade) => trade.sessionId === currentSessionId || isPaperTradeActive(trade));
}

function renderTradeArchive() {
  if (!archiveRows) return;
  const trades = [...state.paperTrades].sort((a, b) => getTradeSortTime(b) - getTradeSortTime(a));
  const manualTrades = trades.filter((trade) => !trade.autopilot);
  const autoTrades = trades.filter((trade) => trade.autopilot);
  const totalPnl = trades.reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0);

  archiveTotal.textContent = String(trades.length);
  archiveManual.textContent = String(manualTrades.length);
  archiveAuto.textContent = String(autoTrades.length);
  archivePnl.textContent = `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} USDT`;
  archivePnl.style.color = totalPnl >= 0 ? "#55c7a2" : "#ef6b5b";

  if (!trades.length) {
    archiveRows.innerHTML = `<tr><td colspan="11">Архив пока пуст: сделки будут появляться здесь из ручных входов и авто-бота</td></tr>`;
    return;
  }

  archiveRows.innerHTML = trades.map((trade, index) => {
    const currentPrice = getPaperTradePrice(trade);
    const statusClass = trade.status === "pending" ? "pending" : trade.status === "open" ? "open" : trade.status === "partial" ? "partial" : trade.pnl >= 0 ? "win" : "loss";
    const statusLabel = trade.status === "pending" ? "PENDING" : trade.status === "open" ? "OPEN" : trade.status === "partial" ? "T1 50%" : trade.pnl >= 0 ? "WIN" : "LOSS";
    const sideClass = trade.side === "SHORT" ? "short" : "long";
    const sourceClass = trade.autopilot ? "auto" : "manual";
    const sourceLabel = trade.autopilot ? "АВТО" : "РУЧНОЙ";
    return `
      <tr>
        <td><button type="button" data-view-archive-trade="${escapeHtml(trade.id)}">${index + 1}</button></td>
        <td>${formatArchiveTime(trade.openedAt)}</td>
        <td><span class="source-badge ${sourceClass}">${sourceLabel}</span></td>
        <td>${escapeHtml(trade.asset.replace("/USDT", ""))}</td>
        <td>${escapeHtml(trade.timeframe || "")}</td>
        <td><span class="side-badge ${sideClass}">${trade.side}</span></td>
        <td>${formatPrice(trade.entry)}</td>
        <td>${formatPrice(trade.exitPrice || currentPrice)}</td>
        <td style="color:${trade.pnl >= 0 ? "#55c7a2" : "#ef6b5b"}">${trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}</td>
        <td style="color:${trade.pnl >= 0 ? "#55c7a2" : "#ef6b5b"}">${trade.pnlPct >= 0 ? "+" : ""}${trade.pnlPct.toFixed(2)}%</td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
      </tr>
    `;
  }).join("");

  archiveRows.querySelectorAll("[data-view-archive-trade]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activePaperTradeId = button.dataset.viewArchiveTrade;
      updatePaperTrades();
    });
  });
}

function getTradeSortTime(trade) {
  return Number(trade.closedAt || trade.updatedAt || trade.openedAt) || 0;
}

function toggleTradeArchive() {
  if (!archivePanel || !archiveToggle) return;
  const shouldOpen = archivePanel.hasAttribute("hidden");
  if (shouldOpen) {
    archivePanel.removeAttribute("hidden");
    archiveToggle.textContent = "Скрыть";
  } else {
    archivePanel.setAttribute("hidden", "");
    archiveToggle.textContent = "Показать";
  }
  renderTradeArchive();
}

function exportJournalToExcel() {
  const rows = state.paperTrades.map((trade, index) => ({
    "#": index + 1,
    "Сессия": trade.sessionId || "",
    "Время": formatJournalTime(trade.openedAt),
    "Монета": trade.asset,
    "Сторона": trade.side,
    "Статус": trade.status,
    "Entry": trade.entry,
    "Stop": trade.stop,
    "Target 1": trade.target1,
    "Target 2": trade.target,
    "T1 исполнен": trade.target1HitAt ? formatJournalTime(trade.target1HitAt) : "",
    "Цена T1": trade.target1ExitPrice || "",
    "Остаток qty": getRemainingQuantity(trade),
    "Сумма USDT": trade.amount,
    "Депозит": trade.deposit || "",
    "Риск лимит %": trade.riskLimitPct || "",
    "Авто-бот": trade.autopilot ? "да" : "нет",
    "Причина авто-бота": trade.autopilotReason || "",
    "Цена выхода": trade.exitPrice || "",
    "PnL USDT": trade.pnl,
    "PnL %": trade.pnlPct,
    "Win/Loss": Number(trade.pnl) > 0 ? "WIN" : !isPaperTradeActive(trade) ? "LOSS" : "",
    "Pattern": getLearningPatternKey(trade.asset, trade.timeframe, trade.side),
    "Стратегия сохранена": trade.strategySnapshot ? "да" : "нет",
    "Стратегия текст": trade.strategySnapshot?.strategyText || "",
    "Контекст стратегии JSON": trade.strategySnapshot ? JSON.stringify(trade.strategySnapshot) : "",
    "Итог для обучения JSON": trade.strategySnapshot?.outcome ? JSON.stringify(trade.strategySnapshot.outcome) : "",
    "Order ID": trade.openingOrder?.orderId || "",
    "TP1 статус": trade.tp1Order?.orderStatus || "",
    "TP2 статус": trade.tp2Order?.orderStatus || trade.tpOrder?.orderStatus || "",
    "SL статус": trade.slOrder?.orderStatus || ""
  }));

  const headers = Object.keys(rows[0] || { "#": "", "Сессия": "", "Время": "", "Монета": "", "Статус": "" });
  const tableRows = [
    `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`,
    ...rows.map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(String(row[header] ?? ""))}</td>`).join("")}</tr>`)
  ].join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${tableRows}</table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `crypto-strategy-journal-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatJournalTime(timestamp) {
  return new Date(timestamp).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatArchiveTime(timestamp) {
  return new Date(timestamp).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getCurrentMarketPrice(symbol = asset.value) {
  return getExecutableMarketPrice(symbol);
}

function getExecutableMarketPrice(symbol = asset.value) {
  const liveTickerPrice = state.live.ticker?.symbol === toBinanceSymbol(symbol) ? Number(state.live.ticker?.lastPrice) : 0;
  if (state.live.enabled && liveTickerPrice > 0) return liveTickerPrice;
  const cached = state.paperPriceCache[symbol];
  if (cached?.price > 0) return cached.price;
  return 0;
}

function getPaperTradePrice(trade) {
  if (trade.status !== "open" && trade.exitPrice) return trade.exitPrice;
  const currentPrice = getCurrentMarketPrice(trade.asset);
  return currentPrice || trade.history[trade.history.length - 1]?.price || trade.entry;
}

function drawPaperChart(trade = null) {
  const width = paperCanvas.width;
  const height = paperCanvas.height;
  const pad = { left: 54, right: 128, top: 24, bottom: 38 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;

  paperCtx.clearRect(0, 0, width, height);
  paperCtx.fillStyle = "#111518";
  paperCtx.fillRect(0, 0, width, height);

  paperCtx.strokeStyle = "rgba(255,255,255,0.08)";
  paperCtx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + chartHeight / 4 * i;
    paperCtx.beginPath();
    paperCtx.moveTo(pad.left, y);
    paperCtx.lineTo(width - pad.right, y);
    paperCtx.stroke();
  }

  if (!trade) {
    paperCtx.fillStyle = "#9aa6ad";
    paperCtx.font = "800 16px Inter, system-ui, sans-serif";
    paperCtx.fillText("Открой демо-сделку, чтобы проверить стратегию на live-цене", pad.left, height / 2);
    return;
  }

  const history = trade.history.length > 1 ? trade.history : [
    ...trade.history,
    { ...trade.history[0], time: trade.history[0].time + 1, price: trade.history[0].price, pnl: 0, pnlPct: 0 }
  ];
  const levels = [trade.entry, trade.stop, trade.target, trade.target1, ...history.map((point) => point.price)];
  const min = Math.min(...levels) * 0.998;
  const max = Math.max(...levels) * 1.002;
  const range = max - min || max * 0.001 || 1;
  const priceToY = (price) => pad.top + (max - price) / range * chartHeight;
  const pointToX = (index) => pad.left + (index / Math.max(1, history.length - 1)) * chartWidth;

  drawPaperLevel(trade.entry, "ENTRY", "#6da8ff", priceToY, pad, chartWidth);
  drawPaperLevel(trade.stop, "STOP", "#ef6b5b", priceToY, pad, chartWidth);
  drawPaperLevel(trade.target1, "T1 50%", "#f3b14d", priceToY, pad, chartWidth);
  drawPaperLevel(trade.target, "T2", "#55c7a2", priceToY, pad, chartWidth);

  paperCtx.beginPath();
  history.forEach((point, index) => {
    const x = pointToX(index);
    const y = priceToY(point.price);
    if (index === 0) paperCtx.moveTo(x, y);
    else paperCtx.lineTo(x, y);
  });
  const last = history[history.length - 1];
  paperCtx.strokeStyle = last.pnl >= 0 ? "#55c7a2" : "#ef6b5b";
  paperCtx.lineWidth = 3;
  paperCtx.stroke();

  paperCtx.fillStyle = last.pnl >= 0 ? "#55c7a2" : "#ef6b5b";
  paperCtx.beginPath();
  paperCtx.arc(pointToX(history.length - 1), priceToY(last.price), 5, 0, Math.PI * 2);
  paperCtx.fill();

  paperCtx.fillStyle = "#eef2f3";
  paperCtx.font = "800 13px Inter, system-ui, sans-serif";
  paperCtx.fillText(`${trade.side} · ${trade.amount.toFixed(0)} USDT`, pad.left, 18);
}

function drawPaperLevel(price, label, color, priceToY, pad, chartWidth) {
  const y = priceToY(price);
  paperCtx.strokeStyle = color;
  paperCtx.lineWidth = 1;
  paperCtx.setLineDash(label === "ENTRY" ? [] : [6, 6]);
  paperCtx.beginPath();
  paperCtx.moveTo(pad.left, y);
  paperCtx.lineTo(pad.left + chartWidth, y);
  paperCtx.stroke();
  paperCtx.setLineDash([]);
  paperCtx.fillStyle = "rgba(17,21,24,0.88)";
  paperCtx.fillRect(pad.left + chartWidth + 10, y - 12, 104, 24);
  paperCtx.fillStyle = color;
  paperCtx.font = "800 11px Inter, system-ui, sans-serif";
  paperCtx.fillText(label, pad.left + chartWidth + 16, y - 1);
  paperCtx.fillText(formatPrice(price), pad.left + chartWidth + 16, y + 10);
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
  renderRsiControls();
  if (state.live.enabled) {
    restartLiveConnection();
  }
  generateStrategy();
}

function updateRiskLabel() {
  if (Number(risk.value) > 2) risk.value = "2";
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
paperEnter.addEventListener("click", () => enterPaperTrade());
paperReset.addEventListener("click", () => resetPaperTrade());
paperClear.addEventListener("click", clearPaperJournal);
exportJournal.addEventListener("click", exportJournalToExcel);
archiveToggle.addEventListener("click", toggleTradeArchive);
archiveRefresh.addEventListener("click", async () => {
  await syncRemoteJournal(true);
  renderTradeArchive();
});
intelRefresh.addEventListener("click", () => refreshStrategyIntelligence(true));
autopilotToggle.addEventListener("click", toggleAutopilot);
scalpingMode.addEventListener("change", toggleScalpingMode);
remoteSave.addEventListener("click", saveRemoteJournalConfig);
remoteSync.addEventListener("click", () => syncRemoteJournal(true));
cmcSave.addEventListener("click", saveCmcRadarConfig);
cmcRefresh.addEventListener("click", () => refreshCmcRadar(true));
newsSave.addEventListener("click", saveNewsAnalyticsConfig);
newsRefresh.addEventListener("click", () => refreshNewsAnalytics(true));
paperSide.addEventListener("change", () => {
  resetPaperTrade();
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
    if (control === asset) {
      renderRsiControls();
    }
    if ((control === asset || control === timeframe) && state.live.enabled) {
      restartLiveConnection();
    }
    generateStrategy(state.lastUserIdea);
    refreshStrategyIntelligence(true);
  });
});

risk.addEventListener("input", () => {
  updateRiskLabel();
  generateStrategy();
  refreshStrategyIntelligence(false);
});

deposit.addEventListener("input", () => {
  persistDeposit();
  renderWalletReadout();
  generateStrategy(state.lastUserIdea);
  renderStrategyIntelligence();
});

renderRules();
renderSources();
renderRsiControls();
renderEmaControls();
initRemoteJournalControls();
initCmcRadarControls();
initNewsAnalyticsControls();
deposit.value = String(loadDeposit());
scalpingMode.checked = Boolean(state.autopilot.scalpingEnabled);
reconcileLegacyPaperBudget();
updateRiskLabel();
renderLiveReadout();
renderWalletReadout();
renderTradeJournal();
generateStrategy();
refreshStrategyIntelligence(false);
refreshOpenPaperTradePrices(true);
syncRemoteJournal(true);
refreshCmcRadar(false);
refreshNewsAnalytics(false);
runDailyLearningReview(false);
if (state.autopilot.enabled) {
  runAutopilotScan(true);
}
window.setInterval(() => refreshOpenPaperTradePrices(), 10000);
window.setInterval(() => runAutopilotScan(), autopilotScanMs);
window.setInterval(() => runDailyLearningReview(false), learningReviewMs);
window.setInterval(() => syncRemoteJournal(false), 30000);
window.setInterval(() => refreshCmcRadar(false), 10 * 60 * 1000);
window.setInterval(() => refreshNewsAnalytics(false), 15 * 60 * 1000);

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
      handleLiveMessage(JSON.parse(event.data), symbol);
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

function handleLiveMessage(message, expectedSymbol = toBinanceSymbol(state.live.asset || asset.value)) {
  const topic = message.topic || "";
  const data = message.data;
  if (!data) return;
  const topicSymbol = getTopicSymbol(topic);
  if (topicSymbol && topicSymbol !== expectedSymbol) return;
  if (expectedSymbol !== toBinanceSymbol(state.live.asset || asset.value)) return;

  if (topic.startsWith("tickers.")) {
    state.live.ticker = {
      symbol: topicSymbol,
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
      symbol: topicSymbol,
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
  updatePaperTrades();
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

function getTopicSymbol(topic) {
  const parts = topic.split(".");
  return parts[parts.length - 1] || "";
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
  const currentBybitSymbol = toBinanceSymbol(state.live.asset || asset.value);
  const validTicker = ticker?.symbol === currentBybitSymbol ? ticker : null;
  const validBook = book?.symbol === currentBybitSymbol ? book : null;
  const lastPrice = validTicker?.lastPrice || lastCandle?.close || 0;
  const bid = validBook?.bid || lastPrice;
  const ask = validBook?.ask || lastPrice;
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
    volume24h: validTicker?.quoteVolume || 0,
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

function formatSigned(value, digits = 2) {
  const number = Number(value) || 0;
  return `${number >= 0 ? "+" : ""}${number.toFixed(digits)}`;
}

function formatCompact(value) {
  if (!Number.isFinite(value) || value <= 0) return "нет данных";
  return Intl.NumberFormat("ru-RU", {
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}
