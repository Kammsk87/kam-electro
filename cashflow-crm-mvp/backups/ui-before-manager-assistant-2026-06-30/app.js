const STATUSES = [
  "Все",
  "Новый из базы",
  "Интересовался",
  "Выбирает дату",
  "Записан",
  "Пришел впервые",
  "Повторный игрок",
  "Не пришел",
  "Спящий",
];
const BOT_USERNAME = "Cashflow_196_bot";
const API_BASE = `${window.location.protocol}//${window.location.host}`;

let state = { clients: [], games: [], bookings: [], tasks: [] };
let selectedClientId = "";
let activeStatus = "Все";
let activeSegment = "all";
let saveTimer = null;
const selectedInviteIds = new Set();

const el = {
  todayLine: document.querySelector("#todayLine"),
  kpiGrid: document.querySelector("#kpiGrid"),
  searchInput: document.querySelector("#searchInput"),
  statusFilterSelect: document.querySelector("#statusFilterSelect"),
  segmentFilterSelect: document.querySelector("#segmentFilterSelect"),
  clientCount: document.querySelector("#clientCount"),
  clientList: document.querySelector("#clientList"),
  clientDetail: document.querySelector("#clientDetail"),
  gamesList: document.querySelector("#gamesList"),
  tasksList: document.querySelector("#tasksList"),
  resetDemoBtn: document.querySelector("#resetDemoBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  openAddClientBtn: document.querySelector("#openAddClientBtn"),
  addGameBtn: document.querySelector("#addGameBtn"),
  clientDialog: document.querySelector("#clientDialog"),
  clientForm: document.querySelector("#clientForm"),
  gameDialog: document.querySelector("#gameDialog"),
  gameForm: document.querySelector("#gameForm"),
  botRunBtn: document.querySelector("#botRunBtn"),
  syncStatus: document.querySelector("#syncStatus"),
  inviteSummary: document.querySelector("#inviteSummary"),
  inviteGameSelect: document.querySelector("#inviteGameSelect"),
  inviteList: document.querySelector("#inviteList"),
  selectInviteTopBtn: document.querySelector("#selectInviteTopBtn"),
  clearInviteBtn: document.querySelector("#clearInviteBtn"),
  createInvitesBtn: document.querySelector("#createInvitesBtn"),
  managerNameInput: document.querySelector("#managerNameInput"),
  openInstructionBtn: document.querySelector("#openInstructionBtn"),
  instructionDialog: document.querySelector("#instructionDialog"),
  closeInstructionBtn: document.querySelector("#closeInstructionBtn"),
  instructionContent: document.querySelector("#instructionContent"),
};

init();

async function init() {
  el.todayLine.textContent = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  renderFilterSelects();
  bindEvents();
  await loadState();
  render();
}

async function loadState() {
  setSync("Загружаю...");
  const response = await fetch(`${API_BASE}/api/state`, { credentials: "include" });
  if (!response.ok) throw new Error("Не удалось загрузить состояние CRM");
  state = await response.json();
  selectedClientId = state.clients[0]?.id ?? "";
  setSync("Сервер подключен");
}

async function persistState() {
  setSync("Сохраняю...");
  const response = await fetch(`${API_BASE}/api/state`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (!response.ok) {
    setSync("Ошибка сохранения");
    throw new Error("Не удалось сохранить состояние CRM");
  }
  state = await response.json();
  setSync(`Сохранено ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`);
}

function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistState().catch((error) => {
      console.error(error);
      alert(error.message);
    });
  }, 150);
}

function setSync(text) {
  if (el.syncStatus) el.syncStatus.textContent = text;
}

function bindEvents() {
  el.searchInput.addEventListener("input", render);

  el.statusFilterSelect.addEventListener("change", () => {
    activeStatus = el.statusFilterSelect.value;
    selectedInviteIds.clear();
    render();
  });

  el.segmentFilterSelect.addEventListener("change", () => {
    activeSegment = el.segmentFilterSelect.value;
    selectedInviteIds.clear();
    render();
  });

  el.resetDemoBtn.addEventListener("click", async () => {
    if (!confirm("Сбросить серверную базу и заново загрузить клиентов из UDS?")) return;
    const response = await fetch(`${API_BASE}/api/reset`, { method: "POST", credentials: "include" });
    if (!response.ok) {
      alert("Не удалось сбросить базу");
      return;
    }
    state = await response.json();
    selectedClientId = state.clients[0]?.id ?? "";
    render();
    setSync("База сброшена");
  });

  el.exportBtn.addEventListener("click", exportState);
  el.openAddClientBtn.addEventListener("click", () => el.clientDialog.showModal());
  el.addGameBtn.addEventListener("click", () => el.gameDialog.showModal());
  el.openInstructionBtn?.addEventListener("click", openInstruction);
  el.closeInstructionBtn?.addEventListener("click", () => el.instructionDialog.close());
  el.botRunBtn?.addEventListener("click", runBotOnce);
  el.selectInviteTopBtn?.addEventListener("click", selectTopInviteCandidates);
  el.clearInviteBtn?.addEventListener("click", () => {
    selectedInviteIds.clear();
    renderInvitePanel(getFilteredClients());
  });
  el.createInvitesBtn?.addEventListener("click", createInviteTasks);

  el.clientForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(el.clientForm));
    const client = {
      id: `CL-${String(state.clients.length + 1).padStart(5, "0")}`,
      udsId: "",
      registeredAt: new Date().toLocaleString("ru-RU"),
      name: data.name.trim(),
      phone: data.phone.trim(),
      email: "",
      telegram: data.telegram.trim(),
      telegramChatId: data.telegramChatId.trim(),
      instagram: data.instagram.trim(),
      source: data.source,
      status: "Интересовался",
      interest: "Запрос на игру",
      nextGameId: "",
      lastContactAt: new Date().toISOString(),
      lastGameAt: "",
      visits: 0,
      lastPurchaseAt: "",
      udsPoints: 0,
      udsPaid: 0,
      udsStatus: "",
      referrer: "",
      birthday: "",
      tags: "",
      comment: "",
      outreachStatus: "Не писали",
      outreachSentAt: "",
      replyStatus: "Нет ответа",
      lastReply: "",
      nextFollowUpAt: "",
      followUpNote: "",
      instagramStatus: data.instagram.trim() ? "Не писали" : "",
      instagramSource: data.source === "Instagram" ? "Direct" : "",
      instagramLastMessageAt: "",
      instagramReplyStatus: "Нет ответа",
      instagramLastReply: "",
      instagramNextFollowUpAt: "",
      instagramFollowUpNote: "",
    };
    state.clients.unshift(client);
    selectedClientId = client.id;
    addTask(client.id, bestChannel(client), "Первичный ответ", "Прислать ближайшие даты игр", "");
    saveState();
    el.clientForm.reset();
    el.clientDialog.close();
    render();
  });

  el.gameForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(el.gameForm));
    const tableCount = clampTableCount(Number(data.tables || 3));
    state.games.push({
      id: `GAME-${String(state.games.length + 1).padStart(4, "0")}`,
      date: data.date,
      time: data.time,
      format: "Кэшфлоу",
      place: data.place.trim() || "Указать место",
      minPerTable: 5,
      maxPerTable: 7,
      tables: buildTables(tableCount),
      capacity: tableCount * 7,
      status: "Запланирована",
      comment: "",
    });
    state.games.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    saveState();
    el.gameForm.reset();
    el.gameDialog.close();
    render();
  });
}

function renderFilterSelects() {
  el.statusFilterSelect.innerHTML = STATUSES.map((status) => (
    `<option value="${escapeAttribute(status)}" ${status === activeStatus ? "selected" : ""}>${escapeHtml(status)}</option>`
  )).join("");
  el.segmentFilterSelect.value = activeSegment;
}

function render() {
  const clients = getFilteredClients();
  if (!clients.some((client) => client.id === selectedClientId)) {
    selectedClientId = clients[0]?.id ?? state.clients[0]?.id ?? "";
  }
  renderKpis();
  renderInvitePanel(clients);
  renderClients(clients);
  renderClientDetail();
  renderGames();
  renderTasks();
}

function getFilteredClients() {
  const query = el.searchInput.value.trim().toLowerCase();
  return state.clients.filter((client) => {
    const matchesQuery = !query || [
      client.name,
      client.phone,
      client.email,
      client.telegram,
      client.telegramChatId,
      client.instagram,
      client.udsId,
      client.externalSiteName,
      Array.isArray(client.siteAliases) ? client.siteAliases.join(" ") : "",
    ].some((value) => String(value ?? "").toLowerCase().includes(query));

    const matchesStatus = activeStatus === "Все" || client.status === activeStatus;
    const matchesSegment = (
      activeSegment === "all" ||
      (activeSegment === "withPhone" && client.phone) ||
      (activeSegment === "paid" && Number(client.udsPaid) > 0) ||
      (activeSegment === "recentVisitors" && isRecentVisitor(client)) ||
      (activeSegment === "visitedLastMonth" && visitedWithinDays(client, 30)) ||
      (activeSegment === "visitedLastHalfYear" && visitedWithinDays(client, 183)) ||
      (activeSegment === "telegramReady" && client.telegramChatId) ||
      (activeSegment === "telegramPhoneFound" && getTelegramPhoneCheck(client).status === "Найден") ||
      (activeSegment === "telegramPhoneMissing" && getTelegramPhoneCheck(client).status === "Не найден") ||
      (activeSegment === "telegramPhoneUnchecked" && client.phone && getTelegramPhoneCheck(client).status === "Не проверяли") ||
      (activeSegment === "telegramUsernameOnly" && client.telegram && !client.telegramChatId) ||
      (activeSegment === "instagramExists" && client.instagram) ||
      (activeSegment === "instagramNotMessaged" && client.instagram && getInstagramComm(client).status === "Не писали") ||
      (activeSegment === "instagramMessaged" && getInstagramComm(client).status === "Сообщение отправлено") ||
      (activeSegment === "instagramReplied" && getInstagramComm(client).replyStatus === "Ответил") ||
      (activeSegment === "instagramDue" && isInstagramFollowUpDue(client)) ||
      (activeSegment === "messageSent" && getClientComm(client).outreachStatus === "Сообщение отправлено") ||
      (activeSegment === "replied" && getClientComm(client).replyStatus === "Ответил") ||
      (activeSegment === "followupDue" && isFollowUpDue(client)) ||
      (activeSegment === "notBooked" && !hasActiveBooking(client.id)) ||
      (activeSegment === "noContact" && !client.telegram && !client.instagram)
    );

    return matchesQuery && matchesStatus && matchesSegment;
  });
}

function renderKpis() {
  const booked = state.bookings.filter((booking) => booking.status === "Записан" || booking.status === "Подтвердил").length;
  const attended = state.bookings.filter((booking) => booking.attended === true).length;
  const noShow = state.bookings.filter((booking) => booking.status === "Не пришел").length;
  const openTasks = state.tasks.filter((task) => task.status !== "Готово").length;
  const telegramReady = state.clients.filter((client) => client.telegramChatId).length;
  const telegramPhoneFound = state.clients.filter((client) => getTelegramPhoneCheck(client).status === "Найден").length;
  const telegramPhoneUnchecked = state.clients.filter((client) => client.phone && getTelegramPhoneCheck(client).status === "Не проверяли").length;
  const messageSent = state.clients.filter((client) => getClientComm(client).outreachStatus === "Сообщение отправлено").length;
  const followupDue = state.clients.filter(isFollowUpDue).length;
  const instagramCount = state.clients.filter((client) => client.instagram).length;
  const instagramDue = state.clients.filter(isInstagramFollowUpDue).length;
  const kpis = [
    ["Клиентов", state.clients.length],
    ["Записаны", booked],
    ["Пришли", attended],
    ["Задачи бота", openTasks],
    ["Телефоны", state.clients.filter((client) => client.phone).length],
    ["Telegram ready", telegramReady],
    ["TG по номеру", telegramPhoneFound],
    ["TG не проверен", telegramPhoneUnchecked],
    ["Instagram", instagramCount],
    ["IG сегодня", instagramDue],
    ["Написали", messageSent],
    ["Написать сегодня", followupDue],
    ["Платили UDS", state.clients.filter((client) => Number(client.udsPaid) > 0).length],
    ["Не пришли", noShow],
  ];
  el.kpiGrid.innerHTML = kpis.map(([label, value]) => (
    `<div class="kpi"><span class="meta">${label}</span><strong>${value}</strong></div>`
  )).join("");
}

function renderClients(clients) {
  el.clientCount.textContent = `${clients.length} из ${state.clients.length}`;
  el.clientList.innerHTML = clients.slice(0, 250).map((client) => `
    <button class="client-row ${client.id === selectedClientId ? "active" : ""}" data-client-id="${client.id}">
      <span>
        <strong>${escapeHtml(client.name)}</strong>
        <span class="meta">${escapeHtml(client.phone || client.telegram || client.instagram || client.source || "без контакта")}</span>
      </span>
      <span class="status-pill ${statusClass(client.status)}">${escapeHtml(client.status)}</span>
    </button>
  `).join("");

  el.clientList.querySelectorAll("[data-client-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedClientId = button.dataset.clientId;
      render();
    });
  });
}

function renderInvitePanel(filteredClients) {
  const games = state.games.filter((game) => isBookableGame(game) && seatsLeft(game.id) > 0);
  const previousGameId = el.inviteGameSelect?.value;
  if (el.inviteGameSelect) {
    el.inviteGameSelect.innerHTML = games.length
      ? games.map((game) => `<option value="${game.id}" ${previousGameId === game.id ? "selected" : ""}>${formatGame(game)} · мест ${seatsLeft(game.id)}</option>`).join("")
      : '<option value="">Нет игр с местами</option>';
  }

  const candidates = getInviteCandidates(filteredClients);
  for (const id of [...selectedInviteIds]) {
    if (!candidates.some((client) => client.id === id)) selectedInviteIds.delete(id);
  }

  if (el.inviteSummary) {
    const readyCount = candidates.filter((client) => client.telegramChatId).length;
    el.inviteSummary.textContent = `${candidates.length} гостей в выборке · ${readyCount} готовы к Telegram · выбрано ${selectedInviteIds.size}`;
  }

  if (!el.inviteList) return;
  el.inviteList.innerHTML = candidates.slice(0, 40).map((client) => {
    const disabled = !client.telegramChatId;
    const checked = selectedInviteIds.has(client.id) && !disabled;
    return `
      <label class="invite-row ${disabled ? "disabled" : ""}">
        <input type="checkbox" data-invite-id="${client.id}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} />
        <span>
          <strong>${escapeHtml(client.name)}</strong>
          <span class="meta">${escapeHtml(client.telegram || client.phone || client.source || "без контакта")} · ${escapeHtml(inviteReason(client))}</span>
        </span>
        <span class="status-pill ${disabled ? "warn" : "hot"}">${disabled ? "Нет chat_id" : "Telegram ready"}</span>
      </label>
    `;
  }).join("") || '<div class="empty-state">В этой выборке нет гостей для приглашения</div>';

  el.inviteList.querySelectorAll("[data-invite-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedInviteIds.add(checkbox.dataset.inviteId);
      else selectedInviteIds.delete(checkbox.dataset.inviteId);
      renderInvitePanel(getFilteredClients());
    });
  });
}

function renderClientDetail() {
  const client = state.clients.find((item) => item.id === selectedClientId);
  if (!client) {
    el.clientDetail.className = "empty-state";
    el.clientDetail.textContent = "Выберите клиента из списка";
    return;
  }

  const availableTables = getAvailableTableOptions(client.id);
  const clientBookings = state.bookings.filter((booking) => booking.clientId === client.id);
  const comm = getClientComm(client);
  const instagram = getInstagramComm(client);
  const phoneCheck = getTelegramPhoneCheck(client);
  const botLink = buildBotLink(client);
  el.clientDetail.className = "detail";
  el.clientDetail.innerHTML = `
    <div class="detail-title">
      <div>
        <h3>${escapeHtml(client.name)}</h3>
        <p class="meta">${escapeHtml(client.id)} · ${escapeHtml(client.source || "источник не указан")}</p>
      </div>
      <select id="clientStatusSelect" aria-label="Статус клиента">
        ${STATUSES.filter((status) => status !== "Все").map((status) => (
          `<option ${client.status === status ? "selected" : ""}>${status}</option>`
        )).join("")}
      </select>
    </div>

    <div class="fields-grid">
      ${field("Телефон", client.phone || "Нет")}
      ${field("Telegram", client.telegram || "Нет")}
      ${field("Telegram chat_id", client.telegramChatId || "Нет")}
      ${field("Instagram", client.instagram || "Нет")}
      ${field("Статус Instagram", instagramStatusLabel(client))}
      ${field("Email", client.email || "Нет")}
      ${field("Статус Telegram", telegramStatusLabel(client))}
      ${field("Telegram по номеру", phoneCheckLabel(client))}
      ${field("TG user_id", phoneCheck.userId || "Нет")}
      ${field("TG username", phoneCheck.username || "Нет")}
      ${field("Проверка TG", formatDateTime(phoneCheck.checkedAt) || "Нет")}
      ${field("Оплачено UDS", money(client.udsPaid))}
      ${field("Баллы UDS", client.udsPoints || 0)}
      ${field("Посещений игр", client.visits || 0)}
      ${field("Внешний источник", formatExternalSources(client))}
      ${field("Имя на сайте", client.externalSiteName || "Нет")}
    </div>

    <div class="comm-box instagram-box">
      <div class="comm-head">
        <div>
          <h4>Instagram</h4>
          <p class="meta">${escapeHtml(instagramStatusLabel(client))}</p>
        </div>
        <button id="markInstagramSentBtn" class="secondary-button">Отметить: написали в Instagram</button>
      </div>

      <div class="comm-grid">
        <label>
          <span class="meta">Instagram username</span>
          <input id="instagramInput" value="${escapeAttribute(client.instagram || "")}" placeholder="@username" />
        </label>
        <label>
          <span class="meta">Источник Instagram</span>
          <select id="instagramSourceSelect">
            ${["", "Direct", "Комментарий", "Story", "Реклама", "Вручную"].map((source) => (
              `<option value="${escapeAttribute(source)}" ${instagram.source === source ? "selected" : ""}>${source || "Не указан"}</option>`
            )).join("")}
          </select>
        </label>
      </div>

      <div class="comm-grid">
        <label>
          <span class="meta">Статус Instagram</span>
          <select id="instagramStatusSelect">
            ${["Не писали", "Сообщение отправлено", "Ждет ответа", "Не писать"].map((status) => (
              `<option ${instagram.status === status ? "selected" : ""}>${status}</option>`
            )).join("")}
          </select>
        </label>
        <label>
          <span class="meta">Ответ в Instagram</span>
          <select id="instagramReplyStatusSelect">
            ${["Нет ответа", "Ответил", "Отказ", "Перенести", "Записать позже"].map((status) => (
              `<option ${instagram.replyStatus === status ? "selected" : ""}>${status}</option>`
            )).join("")}
          </select>
        </label>
      </div>

      <label>
        <span class="meta">Что ответил в Instagram / что важно помнить</span>
        <textarea id="instagramLastReplyInput" rows="3" placeholder="Например: ответил в Direct, попросил написать на следующей неделе">${escapeHtml(instagram.lastReply)}</textarea>
      </label>

      <div class="comm-grid">
        <label>
          <span class="meta">Следующий контакт Instagram</span>
          <input id="instagramNextFollowUpInput" type="date" value="${escapeAttribute(instagram.nextFollowUpAt)}" />
        </label>
        <label>
          <span class="meta">Заметка к Instagram-контакту</span>
          <input id="instagramFollowUpNoteInput" value="${escapeAttribute(instagram.followUpNote)}" placeholder="Что написать в Instagram в следующий раз" />
        </label>
      </div>

      <div class="small-actions">
        <button id="saveInstagramBtn" class="primary-button">Сохранить Instagram</button>
      </div>
    </div>

    <div class="inline-form">
      <input id="telegramChatInput" value="${escapeAttribute(client.telegramChatId || "")}" placeholder="Telegram chat_id" />
      <button id="saveTelegramChatBtn" class="secondary-button">Сохранить chat_id</button>
    </div>

    <div class="comm-box">
      <div class="comm-head">
        <div>
          <h4>Коммуникация</h4>
          <p class="meta">${escapeHtml(telegramStatusLabel(client))}</p>
        </div>
        <button id="copyBotLinkBtn" class="secondary-button">Скопировать ссылку на бота</button>
      </div>

      <label>
        <span class="meta">Персональная ссылка</span>
        <input id="botLinkInput" value="${escapeAttribute(botLink)}" readonly />
      </label>

      <div class="comm-grid">
        <label>
          <span class="meta">Статус сообщения</span>
          <select id="outreachStatusSelect">
            ${["Не писали", "Сообщение отправлено", "Не писать", "Ждет ответа"].map((status) => (
              `<option ${comm.outreachStatus === status ? "selected" : ""}>${status}</option>`
            )).join("")}
          </select>
        </label>
        <label>
          <span class="meta">Ответ клиента</span>
          <select id="replyStatusSelect">
            ${["Нет ответа", "Ответил", "Отказ", "Перенести", "Записать позже"].map((status) => (
              `<option ${comm.replyStatus === status ? "selected" : ""}>${status}</option>`
            )).join("")}
          </select>
        </label>
      </div>

      <label>
        <span class="meta">Что ответил / что важно помнить</span>
        <textarea id="lastReplyInput" rows="3" placeholder="Например: сможет через неделю, написать в понедельник">${escapeHtml(comm.lastReply)}</textarea>
      </label>

      <div class="comm-grid">
        <label>
          <span class="meta">Следующий контакт</span>
          <input id="nextFollowUpInput" type="date" value="${escapeAttribute(comm.nextFollowUpAt)}" />
        </label>
        <label>
          <span class="meta">Заметка к следующему контакту</span>
          <input id="followUpNoteInput" value="${escapeAttribute(comm.followUpNote)}" placeholder="Что написать в следующий раз" />
        </label>
      </div>

      <div class="small-actions">
        <button id="markMessageSentBtn" class="secondary-button">Отметить: отправили</button>
        <button id="saveCommBtn" class="primary-button">Сохранить коммуникацию</button>
      </div>
    </div>

    <div class="inline-form">
      <select id="bookingTableSelect">
        <option value="">Выбрать стол для записи</option>
        ${availableTables.map(({ game, table, left, count }) => (
          `<option value="${game.id}|${table.id}">${formatGame(game)} · ${escapeHtml(table.name)} · ${count}/${table.max}, мест ${left}</option>`
        )).join("")}
      </select>
      <button id="bookClientBtn" class="primary-button">Записать</button>
    </div>

    <div class="actions-grid">
      <button data-action="contact" class="secondary-button">Контакт был</button>
      <button data-action="repeat" class="secondary-button">Позвать повторно</button>
      <button data-action="noShow" class="secondary-button">Не пришел</button>
    </div>

    <div>
      <p class="meta">История записей</p>
      <div class="table-list">
        ${clientBookings.length ? clientBookings.map((booking) => bookingRow(booking)).join("") : '<div class="empty-state">Записей пока нет</div>'}
      </div>
    </div>
  `;

  document.querySelector("#clientStatusSelect").addEventListener("change", (event) => {
    client.status = event.target.value;
    saveState();
    render();
  });

  document.querySelector("#saveTelegramChatBtn").addEventListener("click", () => {
    client.telegramChatId = document.querySelector("#telegramChatInput").value.trim();
    saveState();
    render();
  });

  document.querySelector("#markInstagramSentBtn").addEventListener("click", () => {
    client.instagramStatus = "Сообщение отправлено";
    client.instagramLastMessageAt = new Date().toISOString();
    client.lastContactAt = new Date().toISOString();
    document.querySelector("#instagramStatusSelect").value = "Сообщение отправлено";
    saveInstagramFields(client);
  });

  document.querySelector("#saveInstagramBtn").addEventListener("click", () => {
    saveInstagramFields(client);
  });

  document.querySelector("#copyBotLinkBtn").addEventListener("click", async () => {
    await copyText(botLink);
    setSync("Ссылка на бота скопирована");
  });

  document.querySelector("#markMessageSentBtn").addEventListener("click", () => {
    client.outreachStatus = "Сообщение отправлено";
    client.outreachSentAt = new Date().toISOString();
    client.lastContactAt = new Date().toISOString();
    saveCommunicationFields(client);
  });

  document.querySelector("#saveCommBtn").addEventListener("click", () => {
    saveCommunicationFields(client);
  });

  document.querySelector("#bookClientBtn").addEventListener("click", () => {
    const value = document.querySelector("#bookingTableSelect").value;
    if (!value) return;
    const [gameId, tableId] = value.split("|");
    bookClient(client.id, gameId, tableId);
  });

  el.clientDetail.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => runClientAction(client, button.dataset.action));
  });

  el.clientDetail.querySelectorAll("[data-attend]").forEach((button) => {
    button.addEventListener("click", () => markAttendance(button.dataset.attend, true));
  });
  el.clientDetail.querySelectorAll("[data-noshow]").forEach((button) => {
    button.addEventListener("click", () => markAttendance(button.dataset.noshow, false));
  });
}

function renderGames() {
  el.gamesList.innerHTML = state.games.map((game) => {
    const booked = state.bookings.filter((booking) => booking.gameId === game.id && booking.status !== "Отменил").length;
    const arrived = state.bookings.filter((booking) => booking.gameId === game.id && booking.attended === true).length;
    const capacity = gameCapacity(game);
    const sourceLabel = game.externalSource ? ` · сайт: ${escapeHtml(game.externalGameIds?.join(", ") || game.externalDayText || game.externalSource)}` : "";
    return `
      <div class="game-row">
        <div>
          <strong>${formatGame(game)}</strong>
          <p class="meta">${escapeHtml(game.place)} · ${booked}/${capacity} записано · ${arrived} пришли${sourceLabel}</p>
          <div class="table-chips">
            ${gameTables(game).map((table) => {
              const count = tableBookingCount(game.id, table.id);
              const externalLabel = table.externalGameId ? ` · ${escapeHtml(table.externalGameId)}` : "";
              return `<span class="table-chip ${tableStatusClass(count, table)}">${escapeHtml(table.name)}: ${count}/${table.max}${externalLabel}</span>`;
            }).join("")}
          </div>
        </div>
        <span class="status-pill ${game.status === "Проведена" ? "hot" : seatsLeft(game.id) ? "hot" : "warn"}">${escapeHtml(game.status || `${seatsLeft(game.id)} мест`)}</span>
      </div>
    `;
  }).join("");
}

function renderTasks() {
  const tasks = [...state.tasks].sort((a, b) => String(a.when).localeCompare(String(b.when))).slice(0, 12);
  el.tasksList.innerHTML = tasks.length ? tasks.map((task) => {
    const client = state.clients.find((item) => item.id === task.clientId);
    return `
      <div class="task-row">
        <div>
          <strong>${escapeHtml(task.type)}</strong>
          <p class="meta">${escapeHtml(client?.name || "Клиент")} · ${escapeHtml(task.channel)} · ${escapeHtml(task.template)}</p>
          ${task.comment ? `<p class="meta">${escapeHtml(task.comment)}</p>` : ""}
        </div>
        <div class="small-actions">
          <span class="status-pill ${task.status === "Готово" ? "hot" : ""}">${escapeHtml(task.status)}</span>
          <button class="secondary-button" data-task-done="${task.id}">Готово</button>
        </div>
      </div>
    `;
  }).join("") : '<div class="empty-state">Очередь задач пуста</div>';

  el.tasksList.querySelectorAll("[data-task-done]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = state.tasks.find((item) => item.id === button.dataset.taskDone);
      if (task) task.status = "Готово";
      saveState();
      render();
    });
  });
}

function getInviteCandidates(clients) {
  return [...clients]
    .filter((client) => !hasActiveBooking(client.id))
    .sort((a, b) => {
      const readyDiff = Number(Boolean(b.telegramChatId)) - Number(Boolean(a.telegramChatId));
      if (readyDiff) return readyDiff;
      return recentScore(b) - recentScore(a);
    });
}

function selectTopInviteCandidates() {
  selectedInviteIds.clear();
  getInviteCandidates(getFilteredClients())
    .filter((client) => client.telegramChatId)
    .slice(0, 15)
    .forEach((client) => selectedInviteIds.add(client.id));
  renderInvitePanel(getFilteredClients());
}

function createInviteTasks() {
  const gameId = el.inviteGameSelect?.value;
  const game = state.games.find((item) => item.id === gameId);
  if (!game) {
    alert("Сначала выберите игру для приглашения");
    return;
  }

  const managerName = el.managerNameInput?.value.trim() || "Менеджер";
  const clients = [...selectedInviteIds]
    .map((id) => state.clients.find((client) => client.id === id))
    .filter(Boolean)
    .filter((client) => client.telegramChatId);

  if (!clients.length) {
    alert("Отметьте гостей с Telegram chat_id");
    return;
  }

  let created = 0;
  for (const client of clients) {
    const exists = state.tasks.some((task) => (
      task.clientId === client.id &&
      task.gameId === game.id &&
      task.type === "Приглашение на игру" &&
      task.status === "К отправке"
    ));
    if (exists) continue;
    addTask(
      client.id,
      "Telegram",
      "Приглашение на игру",
      `Пригласить на ближайшую игру · ${managerName}`,
      game.id,
      new Date().toISOString(),
    );
    client.lastContactAt = new Date().toISOString();
    client.status = client.status === "Новый из базы" ? "Интересовался" : client.status;
    created += 1;
  }

  selectedInviteIds.clear();
  saveState();
  render();
  setSync(`Создано приглашений: ${created}`);
}

function bookClient(clientId, gameId, tableId) {
  const client = state.clients.find((item) => item.id === clientId);
  const game = state.games.find((item) => item.id === gameId);
  const table = gameTables(game).find((item) => item.id === tableId);
  if (!client || !game || !table || tableSeatsLeft(gameId, tableId) <= 0) return;
  if (hasActiveBookingOnDate(clientId, game.date)) {
    alert("Этот клиент уже записан на эту дату. Один человек не может занимать два места или два стола в один день.");
    return;
  }
  const booking = {
    id: `B-${String(state.bookings.length + 1).padStart(5, "0")}`,
    clientId,
    gameId,
    tableId,
    status: "Записан",
    attended: null,
    createdAt: new Date().toISOString(),
  };
  state.bookings.push(booking);
  client.status = "Записан";
  client.nextGameId = gameId;
  client.lastContactAt = new Date().toISOString();
  addTask(clientId, bestChannel(client), "Напоминание 24ч", "Напомнить о записи и месте", gameId, hoursBefore(game, 24));
  addTask(clientId, bestChannel(client), "Напоминание 3ч", "Короткое подтверждение прихода", gameId, hoursBefore(game, 3));
  saveState();
  render();
}

function markAttendance(bookingId, attended) {
  const booking = state.bookings.find((item) => item.id === bookingId);
  if (!booking) return;
  const client = state.clients.find((item) => item.id === booking.clientId);
  const game = state.games.find((item) => item.id === booking.gameId);
  booking.attended = attended;
  booking.status = attended ? "Пришел" : "Не пришел";
  if (client) {
    client.status = attended ? (client.visits > 0 ? "Повторный игрок" : "Пришел впервые") : "Не пришел";
    client.visits = attended ? Number(client.visits || 0) + 1 : Number(client.visits || 0);
    client.lastGameAt = game ? `${game.date} ${game.time}` : client.lastGameAt;
    client.nextGameId = "";
    addTask(
      client.id,
      bestChannel(client),
      attended ? "Повторный визит" : "Не пришел",
      attended ? "Пригласить на следующую игру" : "Предложить новую дату без давления",
      "",
      addDays(new Date(), attended ? 10 : 1).toISOString(),
    );
  }
  saveState();
  render();
}

function runClientAction(client, action) {
  if (action === "contact") {
    client.lastContactAt = new Date().toISOString();
    client.status = client.status === "Новый из базы" ? "Интересовался" : client.status;
    addTask(client.id, bestChannel(client), "Первичный ответ", "Прислать ближайшие даты игр", "");
  }
  if (action === "repeat") {
    addTask(client.id, bestChannel(client), "Повторный визит", "Пригласить на следующую игру", "");
    client.status = client.visits > 0 ? "Повторный игрок" : "Интересовался";
  }
  if (action === "noShow") {
    client.status = "Не пришел";
    addTask(client.id, bestChannel(client), "Не пришел", "Предложить новую дату без давления", "");
  }
  saveState();
  render();
}

function addTask(clientId, channel, type, template, gameId = "", when = new Date().toISOString()) {
  state.tasks.push({
    id: `T-${String(state.tasks.length + 1).padStart(5, "0")}`,
    clientId,
    channel,
    type,
    when,
    status: "К отправке",
    template,
    gameId,
    lastAttemptAt: "",
    comment: "",
  });
}

function bookingRow(booking) {
  const game = state.games.find((item) => item.id === booking.gameId);
  const table = gameTables(game).find((item) => item.id === booking.tableId);
  const result = booking.resultPlace ? ` · ${booking.resultPlace} место` : "";
  const source = booking.externalGameId ? ` · сайт ${escapeHtml(booking.externalGameId)}` : "";
  return `
    <div class="game-row">
      <div>
        <strong>${game ? formatGame(game) : booking.gameId}</strong>
        <p class="meta">${escapeHtml(table?.name || "Стол не указан")} · ${escapeHtml(booking.status)}${result}${source}</p>
      </div>
      <div class="small-actions">
        <button class="secondary-button" data-attend="${booking.id}">Пришел</button>
        <button class="secondary-button" data-noshow="${booking.id}">Не пришел</button>
      </div>
    </div>
  `;
}

async function runBotOnce() {
  setSync("Проверяю задачи бота...");
  const response = await fetch(`${API_BASE}/api/bot/run-once`, { method: "POST", credentials: "include" });
  const result = await response.json();
  await loadState();
  render();
  setSync(`Бот: отправлено ${result.sent}, пропущено ${result.skipped}, ошибок ${result.failed}`);
}

async function openInstruction() {
  el.instructionDialog.showModal();
  el.instructionContent.textContent = "Загружаю инструкцию...";
  try {
    const response = await fetch(`${API_BASE}/MANAGER_DAILY_INSTRUCTION.md`, { credentials: "include" });
    if (!response.ok) throw new Error("Не удалось загрузить инструкцию");
    const markdown = await response.text();
    el.instructionContent.innerHTML = renderInstructionMarkdown(markdown);
  } catch (error) {
    el.instructionContent.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

function renderInstructionMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let listType = "";
  let inCode = false;
  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = "";
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push("</code></pre>");
        inCode = false;
      } else {
        closeList();
        html.push("<pre><code>");
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    if (line.startsWith("### ")) {
      closeList();
      html.push(`<h4>${escapeHtml(line.slice(4))}</h4>`);
      continue;
    }

    if (line.startsWith("## ")) {
      closeList();
      html.push(`<h3>${escapeHtml(line.slice(3))}</h3>`);
      continue;
    }

    if (line.startsWith("# ")) {
      closeList();
      html.push(`<h2>${escapeHtml(line.slice(2))}</h2>`);
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${escapeHtml(line.replace(/^\d+\.\s/, ""))}</li>`);
      continue;
    }

    if (line.startsWith("- ")) {
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${escapeHtml(line.slice(2))}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${escapeHtml(line)}</p>`);
  }

  closeList();
  if (inCode) html.push("</code></pre>");
  return html.join("");
}

function field(label, value) {
  return `<div class="field"><span>${label}</span><strong>${escapeHtml(String(value ?? ""))}</strong></div>`;
}

function seatsLeft(gameId) {
  const game = state.games.find((item) => item.id === gameId);
  if (!game) return 0;
  return gameTables(game).reduce((sum, table) => sum + tableSeatsLeft(gameId, table.id), 0);
}

function tableSeatsLeft(gameId, tableId) {
  const game = state.games.find((item) => item.id === gameId);
  const table = gameTables(game).find((item) => item.id === tableId);
  if (!table) return 0;
  return Math.max(0, Number(table.max || 7) - tableBookingCount(gameId, tableId));
}

function tableBookingCount(gameId, tableId) {
  return state.bookings.filter((booking) => (
    booking.gameId === gameId &&
    booking.tableId === tableId &&
    booking.status !== "Отменил"
  )).length;
}

function gameTables(game) {
  if (!game) return [];
  if (Array.isArray(game.tables) && game.tables.length) return game.tables;
  const count = Math.max(1, Math.ceil(Number(game.capacity || 14) / 7));
  return buildTables(count);
}

function gameCapacity(game) {
  return gameTables(game).reduce((sum, table) => sum + Number(table.max || 7), 0);
}

function buildTables(count) {
  return Array.from({ length: clampTableCount(count) }, (_, index) => ({
    id: `TABLE-${String(index + 1).padStart(2, "0")}`,
    name: `Стол ${index + 1}`,
    min: 5,
    max: 7,
  }));
}

function clampTableCount(count) {
  return Math.min(7, Math.max(3, Number.isFinite(count) ? Math.round(count) : 3));
}

function getAvailableTableOptions(clientId = "") {
  return state.games
    .filter(isBookableGame)
    .filter((game) => !clientId || !hasActiveBookingOnDate(clientId, game.date))
    .flatMap((game) => gameTables(game).map((table) => ({
      game,
      table,
      count: tableBookingCount(game.id, table.id),
      left: tableSeatsLeft(game.id, table.id),
    })))
    .filter((item) => item.left > 0);
}

function hasActiveBookingOnDate(clientId, gameDate) {
  return state.bookings.some((booking) => {
    if (booking.clientId !== clientId || !["Записан", "Подтвердил"].includes(booking.status)) return false;
    const game = state.games.find((item) => item.id === booking.gameId);
    return game?.date === gameDate;
  });
}

function tableStatusClass(count, table) {
  if (count >= Number(table.max || 7)) return "full";
  if (count >= Number(table.min || 5)) return "ok";
  return "low";
}

function hasActiveBooking(clientId) {
  return state.bookings.some((booking) => (
    booking.clientId === clientId &&
    ["Записан", "Подтвердил"].includes(booking.status)
  ));
}

function isBookableGame(game) {
  return game && game.status !== "Отменена" && game.status !== "Проведена";
}

function isRecentVisitor(client) {
  return visitedWithinDays(client, 45);
}

function visitedWithinDays(client, daysLimit) {
  if (Number(client.visits || 0) <= 0) return false;
  if (!client.lastGameAt) return false;
  const lastGameDate = new Date(String(client.lastGameAt).replace(" ", "T"));
  if (Number.isNaN(lastGameDate.getTime())) return false;
  const days = (Date.now() - lastGameDate.getTime()) / 86400000;
  return days >= 0 && days <= daysLimit;
}

function recentScore(client) {
  if (!client.lastGameAt) return Number(client.visits || 0);
  const time = new Date(String(client.lastGameAt).replace(" ", "T")).getTime();
  return Number.isNaN(time) ? Number(client.visits || 0) : time;
}

function inviteReason(client) {
  if (isRecentVisitor(client)) return "недавно был на игре";
  if (Number(client.visits || 0) > 0) return "уже был на игре";
  if (Number(client.udsPaid || 0) > 0) return "платил в UDS";
  return client.status || "кандидат";
}

function getClientComm(client) {
  return {
    outreachStatus: client.outreachStatus || "Не писали",
    outreachSentAt: client.outreachSentAt || "",
    replyStatus: client.replyStatus || "Нет ответа",
    lastReply: client.lastReply || "",
    nextFollowUpAt: client.nextFollowUpAt || "",
    followUpNote: client.followUpNote || "",
  };
}

function getInstagramComm(client) {
  return {
    status: client.instagramStatus || "Не писали",
    source: client.instagramSource || "",
    lastMessageAt: client.instagramLastMessageAt || "",
    replyStatus: client.instagramReplyStatus || "Нет ответа",
    lastReply: client.instagramLastReply || "",
    nextFollowUpAt: client.instagramNextFollowUpAt || "",
    followUpNote: client.instagramFollowUpNote || "",
  };
}

function saveCommunicationFields(client) {
  client.outreachStatus = document.querySelector("#outreachStatusSelect").value;
  client.replyStatus = document.querySelector("#replyStatusSelect").value;
  client.lastReply = document.querySelector("#lastReplyInput").value.trim();
  client.nextFollowUpAt = document.querySelector("#nextFollowUpInput").value;
  client.followUpNote = document.querySelector("#followUpNoteInput").value.trim();
  client.lastContactAt = new Date().toISOString();
  saveState();
  render();
}

function saveInstagramFields(client) {
  client.instagram = normalizeUsername(document.querySelector("#instagramInput").value.trim());
  client.instagramSource = document.querySelector("#instagramSourceSelect").value;
  client.instagramStatus = document.querySelector("#instagramStatusSelect").value;
  client.instagramReplyStatus = document.querySelector("#instagramReplyStatusSelect").value;
  client.instagramLastReply = document.querySelector("#instagramLastReplyInput").value.trim();
  client.instagramNextFollowUpAt = document.querySelector("#instagramNextFollowUpInput").value;
  client.instagramFollowUpNote = document.querySelector("#instagramFollowUpNoteInput").value.trim();
  client.lastContactAt = new Date().toISOString();
  if (client.instagramStatus === "Сообщение отправлено" && !client.instagramLastMessageAt) {
    client.instagramLastMessageAt = new Date().toISOString();
  }
  saveState();
  render();
}

function isFollowUpDue(client) {
  const date = getClientComm(client).nextFollowUpAt;
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const followUpDate = new Date(`${date}T00:00:00`);
  return followUpDate <= today;
}

function isInstagramFollowUpDue(client) {
  const date = getInstagramComm(client).nextFollowUpAt;
  if (!client.instagram || !date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const followUpDate = new Date(`${date}T00:00:00`);
  return followUpDate <= today;
}

function instagramStatusLabel(client) {
  if (!client.instagram) return "Instagram не указан";
  const comm = getInstagramComm(client);
  if (comm.replyStatus === "Ответил") return `Ответил${comm.source ? ` · ${comm.source}` : ""}`;
  if (comm.status === "Сообщение отправлено") return `Написали${comm.source ? ` · ${comm.source}` : ""}`;
  if (comm.status === "Не писать") return "Не писать";
  if (isInstagramFollowUpDue(client)) return "Нужно написать сегодня";
  return comm.status || "Не писали";
}

function telegramStatusLabel(client) {
  if (client.telegramChatId) return "Telegram привязан";
  const phoneCheck = getTelegramPhoneCheck(client);
  if (phoneCheck.status === "Найден") return `Telegram найден по номеру${phoneCheck.username ? ` ${phoneCheck.username}` : ""}`;
  if (client.telegram) return `Есть username ${client.telegram}, нет chat_id`;
  if (client.phone) return "Есть телефон, Telegram не привязан";
  return "Telegram не привязан";
}

function getTelegramPhoneCheck(client) {
  return {
    status: client.telegramPhoneStatus || "Не проверяли",
    userId: client.telegramPhoneUserId || "",
    username: client.telegramPhoneUsername || "",
    firstName: client.telegramPhoneFirstName || "",
    lastName: client.telegramPhoneLastName || "",
    checkedAt: client.telegramPhoneCheckedAt || "",
  };
}

function phoneCheckLabel(client) {
  const check = getTelegramPhoneCheck(client);
  if (!client.phone) return "Нет телефона";
  if (check.status === "Найден") return check.username ? `Найден: ${check.username}` : "Найден";
  if (check.status === "Не найден") return "Не найден";
  return "Не проверяли";
}

function buildBotLink(client) {
  return `https://t.me/${BOT_USERNAME}?start=${encodeURIComponent(client.id)}`;
}

function formatExternalSources(client) {
  const sources = Array.isArray(client.externalSources) ? client.externalSources : [];
  if (!sources.length && !client.externalSource) return "Нет";
  return [...new Set([client.externalSource, ...sources].filter(Boolean))].join(", ");
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt("Скопируйте ссылку", text);
  }
}

function bestChannel(client) {
  if (client.telegramChatId) return "Telegram";
  if (client.telegram) return "Telegram";
  if (client.instagram) return "Instagram";
  if (client.phone) return "Телефон";
  return client.source || "Ручной контакт";
}

function normalizeUsername(value) {
  if (!value) return "";
  if (value.startsWith("@") || value.startsWith("http://") || value.startsWith("https://")) return value;
  return `@${value}`;
}

function formatGame(game) {
  const date = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(new Date(`${game.date}T00:00:00`));
  return `${date}, ${game.time}`;
}

function money(value) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function hoursBefore(game, hours) {
  const date = new Date(`${game.date}T${game.time}:00`);
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function statusClass(status) {
  if (["Записан", "Пришел впервые", "Повторный игрок"].includes(status)) return "hot";
  if (["Не пришел", "Спящий", "Ошибка", "Нет chat_id"].includes(status)) return "warn";
  return "";
}

function exportState() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cashflow-crm-export-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
