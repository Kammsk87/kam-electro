const metrikaCounterId = window.METRIKA_COUNTER_ID;

// Preserved goal name. Do not send it: GitHub Pages does not accept the form,
// and a hidden frame load event is not proof that a lead was received.
const LEAD_FORM_SUBMIT_GOAL = "lead_form_submit";

const SERVICE_PAGES = new Set([
  "elektromontazh.html",
  "elektromontazh-kvartiry-pod-klyuch.html",
  "elektromontazh-kottedzhey.html",
  "elektromontazh-promyshlennykh-pomeshcheniy.html",
  "sborka-elektroshchitov.html",
  "uslugi-elektrika-elektromontazhnye-raboty.html",
  "vru-avr-shu.html"
]);

const TASK_KEY = "kam-selected-task";

function reachGoal(goalName) {
  if (goalName === LEAD_FORM_SUBMIT_GOAL) {
    return;
  }
  if (metrikaCounterId && typeof window.ym === "function") {
    window.ym(metrikaCounterId, "reachGoal", goalName);
  }
}

function normalizeSearch(value) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function pageFile() {
  const file = window.location.pathname.split("/").pop();
  return file || "index.html";
}

function initSearch(root) {
  const input = root.querySelector("[data-search-input]");
  const list = root.querySelector("[data-search-list]");
  const empty = root.querySelector("[data-search-empty]");
  const back = root.querySelector("[data-search-back]");
  if (!input || !list) {
    return;
  }

  const items = Array.from(list.querySelectorAll("[data-keywords]"));
  const homeMode = root.getAttribute("data-search-mode") === "home";

  function visibleLinks() {
    return items
      .filter((item) => !item.hidden)
      .map((item) => item.querySelector("a"))
      .filter(Boolean);
  }

  function applyFilter(raw) {
    const query = normalizeSearch(raw);
    let count = 0;
    items.forEach((item) => {
      const haystack = normalizeSearch(`${item.dataset.keywords || ""} ${item.textContent || ""}`);
      const show = query === "" || haystack.includes(query);
      item.hidden = !show;
      if (show) {
        count += 1;
      }
    });
    if (empty) {
      empty.hidden = count !== 0;
    }
    input.setAttribute("aria-expanded", homeMode ? String(root.classList.contains("is-searching")) : "true");
    return count;
  }

  function openSearch() {
    if (!homeMode) {
      return;
    }
    root.classList.add("is-searching");
    input.setAttribute("aria-expanded", "true");
  }

  function closeSearch() {
    if (!homeMode) {
      return;
    }
    root.classList.remove("is-searching");
    input.setAttribute("aria-expanded", "false");
  }

  input.addEventListener("focus", () => {
    openSearch();
    applyFilter(input.value);
  });

  input.addEventListener("input", () => {
    openSearch();
    applyFilter(input.value);
  });

  input.addEventListener("keydown", (event) => {
    const links = visibleLinks();
    const activeIndex = links.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openSearch();
      const next = links[activeIndex + 1] || links[0];
      next?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (activeIndex <= 0) {
        input.focus();
      } else {
        links[activeIndex - 1].focus();
      }
    } else if (event.key === "Escape") {
      input.value = "";
      applyFilter("");
      closeSearch();
      input.focus();
    } else if (event.key === "Enter" && document.activeElement === input) {
      const first = links[0];
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  });

  list.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Escape") {
      return;
    }
    const links = visibleLinks();
    const activeIndex = links.indexOf(document.activeElement);
    if (event.key === "Escape") {
      input.focus();
      return;
    }
    if (activeIndex === -1) {
      return;
    }
    event.preventDefault();
    if (event.key === "ArrowDown") {
      (links[activeIndex + 1] || links[activeIndex]).focus();
    } else if (activeIndex === 0) {
      input.focus();
    } else {
      links[activeIndex - 1].focus();
    }
  });

  if (back) {
    back.addEventListener("click", (event) => {
      event.preventDefault();
      input.value = "";
      applyFilter("");
      closeSearch();
      input.focus();
    });
  }

  const params = new URLSearchParams(window.location.search);
  const initial = params.get("q");
  if (initial) {
    input.value = initial;
    openSearch();
    applyFilter(initial);
  } else {
    applyFilter("");
    if (!homeMode) {
      input.setAttribute("aria-expanded", "true");
    }
  }
}

function openDetailsForHash() {
  const id = window.location.hash.replace(/^#/, "");
  if (!id) {
    return;
  }
  const target = document.getElementById(id);
  if (!target) {
    return;
  }
  const details = target.closest("details");
  if (details) {
    details.open = true;
  }
}

function isCableCalculator() {
  return window.location.pathname.indexOf("/kalkulyator-kabelya") !== -1;
}

function syncTabState() {
  const hash = window.location.hash;
  const file = pageFile();
  document.querySelectorAll(".tabbar a, .desktop-nav a").forEach((link) => {
    link.removeAttribute("aria-current");
  });

  let tab = null;
  if (isCableCalculator()) {
    tab = "services";
  } else if (hash === "#contact" || hash === "#calc-contact") {
    tab = "contact";
  } else if (hash === "#works") {
    tab = "works";
  } else if (file === "index.html" || file === "") {
    tab = "home";
  } else if (SERVICE_PAGES.has(file)) {
    tab = "services";
  }

  if (!tab) {
    return;
  }
  document.querySelectorAll(`[data-tab="${tab}"]`).forEach((link) => {
    link.setAttribute("aria-current", "page");
  });
}

const GENERIC_CTA = new Set([
  "связь",
  "заявка",
  "оставить заявку",
  "перейти к заявке",
  "получить предварительный расчет",
  "написать"
]);

const OBJECT_BY_FILE = {
  "elektromontazh-kvartiry-pod-klyuch.html": "Квартира",
  "elektromontazh-kottedzhey.html": "Дом",
  "elektromontazh-promyshlennykh-pomeshcheniy.html": "Коммерция",
  "sborka-elektroshchitov.html": "Щит",
  "vru-avr-shu.html": "Щит",
  "elektromontazh.html": "",
  "uslugi-elektrika-elektromontazhnye-raboty.html": "",
  "voprosy-po-elektromontazhu.html": "",
  "stati.html": ""
};

const TELEGRAM_CHAT = "https://t.me/kam_ekb";
const WHATSAPP_CHAT = "https://wa.me/79120507100";

function rememberTaskFromService(anchor) {
  const href = anchor.getAttribute("href") || "";
  const toContact = href === "/#contact" || href === "#contact" || href.endsWith("/#contact");
  const file = pageFile();
  if (!toContact || file === "index.html" || file === "") {
    return;
  }
  const heading = document.querySelector("h1");
  const page = heading ? heading.textContent.replace(/\s+/g, " ").trim() : "";
  if (!page) {
    return;
  }
  const cta = (anchor.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
  try {
    window.sessionStorage.setItem(TASK_KEY, JSON.stringify({
      page: page.slice(0, 180),
      cta,
      file
    }));
  } catch (error) {
    // Storage can be blocked. The chat still opens without the page name.
  }
}

function readStoredTask() {
  let raw = "";
  try {
    raw = window.sessionStorage.getItem(TASK_KEY) || "";
  } catch (error) {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.page === "string") {
      return {
        page: parsed.page.trim(),
        cta: typeof parsed.cta === "string" ? parsed.cta.trim() : "",
        file: typeof parsed.file === "string" ? parsed.file : ""
      };
    }
  } catch (error) {
    // Older visits stored only the heading.
  }
  return { page: raw.trim(), cta: "", file: "" };
}

function objectFromPage(file, title) {
  if (Object.prototype.hasOwnProperty.call(OBJECT_BY_FILE, file)) {
    return OBJECT_BY_FILE[file];
  }
  const text = normalizeSearch(title || "");
  if (/щит|вру|авр|щу/.test(text)) {
    return "Щит";
  }
  if (/квартир/.test(text)) {
    return "Квартира";
  }
  if (/дом|коттедж|бан|котельн|гараж|мастерск/.test(text)) {
    return "Дом";
  }
  if (/коммерч|офис|склад|торгов|производ|цех|промышлен/.test(text)) {
    return "Коммерция";
  }
  return "";
}

function clipField(value, limit) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function specificCta(cta) {
  const clean = cta ? cta.replace(/\s+/g, " ").trim() : "";
  if (!clean || GENERIC_CTA.has(normalizeSearch(clean))) {
    return "";
  }
  return clean;
}

function leadMessage(source) {
  const form = document.querySelector("#lead-form");
  const data = new FormData(form);
  const lines = ["Здравствуйте! Заявка с сайта КАМ Электро."];
  if (source && source.page) {
    lines.push(`Страница: ${source.page}`);
  }
  const cta = source ? specificCta(source.cta) : "";
  if (cta) {
    lines.push(`Запрос: ${cta}`);
  }
  const object = clipField(data.get("object"), 40);
  const need = clipField(data.get("need"), 240);
  const place = clipField(data.get("place"), 240);
  const name = clipField(data.get("name"), 80);
  if (object) {
    lines.push(`Объект: ${object}`);
  }
  if (need) {
    lines.push(`Нужно: ${need}`);
  }
  if (place) {
    lines.push(`Где: ${place}`);
  }
  if (name) {
    lines.push(`Имя: ${name}`);
  }
  lines.push("Фото, план или проект приложу в чате.");
  return lines.join("\n");
}

function copyText(text) {
  const copiedNow = legacyCopy(text);
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text).then(() => true, () => copiedNow || legacyCopy(text));
  }
  return Promise.resolve(copiedNow);
}

function legacyCopy(text) {
  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.setAttribute("aria-hidden", "true");
  helper.style.position = "fixed";
  helper.style.top = "0";
  helper.style.left = "0";
  helper.style.width = "1px";
  helper.style.height = "1px";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  helper.focus();
  helper.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (error) {
    ok = false;
  }
  helper.remove();
  return ok;
}

function initLeadForm() {
  const form = document.querySelector("#lead-form");
  const preview = document.querySelector("#lead-preview");
  const telegram = document.querySelector("#lead-telegram");
  const whatsapp = document.querySelector("#lead-whatsapp");
  const hint = document.querySelector("#lead-hint");
  const sourceBox = document.querySelector("[data-lead-source]");
  if (!form || !telegram || !whatsapp) {
    return;
  }

  const source = readStoredTask();
  if (source && source.page && sourceBox) {
    const cta = specificCta(source.cta);
    sourceBox.hidden = false;
    sourceBox.textContent = cta
      ? `Заявка со страницы «${source.page}» — кнопка «${cta}».`
      : `Заявка со страницы «${source.page}».`;
    const object = objectFromPage(source.file, source.page);
    const selected = form.querySelector('input[name="object"]:checked');
    if (object && !selected) {
      form.querySelectorAll('input[name="object"]').forEach((input) => {
        input.checked = input.value === object;
      });
    }
  }

  // core.telegram.org/api/links documents t.me/<username>?text= as a draft.
  // Web and older apps often ignore it, so the same text is copied for paste.
  function refresh() {
    const text = leadMessage(source);
    if (preview) {
      preview.value = text;
    }
    const encoded = encodeURIComponent(text);
    whatsapp.href = `${WHATSAPP_CHAT}?text=${encoded}`;
    telegram.href = `${TELEGRAM_CHAT}?text=${encoded}`;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });
  form.addEventListener("input", refresh);
  form.addEventListener("change", refresh);
  whatsapp.addEventListener("click", refresh);
  telegram.addEventListener("click", () => {
    const text = leadMessage(source);
    telegram.href = `${TELEGRAM_CHAT}?text=${encodeURIComponent(text)}`;
    copyText(text).then((ok) => {
      if (!hint) {
        return;
      }
      hint.classList.toggle("success", ok);
      hint.classList.toggle("error", !ok);
      hint.textContent = ok
        ? "Текст скопирован, вставьте в чат."
        : "Не удалось скопировать само. Выделите текст в поле выше и вставьте его в чат.";
    });
  });
  refresh();
}

document.querySelectorAll("[data-goal]").forEach((element) => {
  element.addEventListener("click", () => {
    reachGoal(element.dataset.goal);
  });
});

document.addEventListener("click", (event) => {
  const anchor = event.target.closest("a");
  if (anchor) {
    rememberTaskFromService(anchor);
  }
});

document.querySelectorAll("[data-search]").forEach(initSearch);
initLeadForm();
openDetailsForHash();
syncTabState();
window.addEventListener("hashchange", () => {
  openDetailsForHash();
  syncTabState();
});
