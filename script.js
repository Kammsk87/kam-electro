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

function syncTabState() {
  const hash = window.location.hash;
  const file = pageFile();
  document.querySelectorAll(".tabbar a, .desktop-nav a").forEach((link) => {
    link.removeAttribute("aria-current");
  });

  let tab = null;
  if (hash === "#contact") {
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

function rememberTaskFromService(anchor) {
  const href = anchor.getAttribute("href") || "";
  const toContact = href === "/#contact" || href === "#contact" || href.endsWith("/#contact");
  if (!toContact || !SERVICE_PAGES.has(pageFile())) {
    return;
  }
  const heading = document.querySelector("h1");
  const text = heading ? heading.textContent.trim() : "";
  if (text) {
    window.sessionStorage.setItem(TASK_KEY, text);
  }
}

function initSelectedTask() {
  const box = document.querySelector("[data-selected-task]");
  const output = document.querySelector("[data-selected-task-text]");
  const copyButton = document.querySelector("[data-copy-task]");
  const clearButton = document.querySelector("[data-clear-task]");
  const note = document.querySelector("[data-copy-note]");
  if (!box || !output) {
    return;
  }

  const saved = window.sessionStorage.getItem(TASK_KEY) || "";
  if (saved) {
    output.textContent = saved;
    box.hidden = false;
  }

  copyButton?.addEventListener("click", async () => {
    const text = output.textContent.trim();
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      if (note) {
        note.textContent = "Текст задачи скопирован. Вставьте его в Telegram сами: чат не заполняется автоматически.";
      }
    } catch (error) {
      if (note) {
        note.textContent = "Автокопирование недоступно. Выделите текст задачи выше и скопируйте его вручную.";
      }
    }
  });

  clearButton?.addEventListener("click", () => {
    window.sessionStorage.removeItem(TASK_KEY);
    output.textContent = "";
    box.hidden = true;
    if (note) {
      note.textContent = "";
    }
  });
}

function initLeadForm() {
  const form = document.querySelector("#lead-form");
  const note = document.querySelector("[data-form-note]");
  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (note) {
      note.classList.remove("success");
      note.classList.add("error");
      note.textContent = "Заявка не отправлена. У сайта нет приёмника формы, поэтому сообщение никуда не ушло. Напишите в Telegram или позвоните.";
    }
  });
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
initSelectedTask();
initLeadForm();
openDetailsForHash();
syncTabState();
window.addEventListener("hashchange", () => {
  openDetailsForHash();
  syncTabState();
});
