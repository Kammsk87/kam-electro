(function () {
  var api = window.KamCableCalc;
  var config = api.CONFIG;
  var state = {
    step: 0,
    preset: "two",
    housing: "newBuild",
    area: 55,
    rooms: 2,
    ceiling: 2.7,
    sockets: 24,
    switches: 10,
    lights: 12,
    kitchenSockets: 6,
    bathSockets: 2,
    appliances: Object.assign({}, config.presets.two.appliances)
  };
  var resultSeen = false;
  var STORAGE_KEY = "kam-cable-calc-v1";

  var steps = [
    { id: "preset", title: "Квартира" },
    { id: "size", title: "Размеры" },
    { id: "points", title: "Точки" },
    { id: "loads", title: "Приборы" },
    { id: "result", title: "Результат" }
  ];

  function $(selector) {
    return document.querySelector(selector);
  }

  function applyPreset(id) {
    var preset = config.presets[id];
    state.preset = id;
    state.area = preset.area;
    state.rooms = preset.rooms;
    state.ceiling = preset.ceiling;
    state.sockets = preset.sockets;
    state.switches = preset.switches;
    state.lights = preset.lights;
    state.kitchenSockets = preset.kitchenSockets;
    state.bathSockets = preset.bathSockets;
    state.appliances = Object.assign({}, preset.appliances);
  }

  function readNumbers() {
    ["area", "rooms", "ceiling", "sockets", "switches", "lights", "kitchenSockets", "bathSockets"].forEach(function (key) {
      var field = document.querySelector("[data-field='" + key + "']");
      if (field) state[key] = Number(field.value);
    });
    var housing = document.querySelector("input[name='housing']:checked");
    if (housing) state.housing = housing.value;
    Object.keys(config.appliances).forEach(function (key) {
      var box = document.querySelector("[data-appliance='" + key + "']");
      if (box) state.appliances[key] = box.checked;
    });
  }

  function reach(goal) {
    var id = window.METRIKA_COUNTER_ID;
    if (id && typeof window.ym === "function" && goal !== "lead_form_submit") {
      window.ym(id, "reachGoal", goal);
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {}
  }

  function loadState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object") return false;
      state.step = Math.min(steps.length - 1, Math.max(0, Number(saved.step) || 0));
      state.preset = saved.preset || state.preset;
      state.housing = saved.housing === "secondary" ? "secondary" : "newBuild";
      ["area", "rooms", "ceiling", "sockets", "switches", "lights", "kitchenSockets", "bathSockets"].forEach(function (key) {
        if (saved[key] != null) state[key] = Number(saved[key]);
      });
      if (saved.appliances) state.appliances = Object.assign({}, config.presets.two.appliances, saved.appliances);
      return true;
    } catch (error) {
      return false;
    }
  }

  function shopText(items) {
    return items.map(function (item) {
      return item.title + " — " + item.qty + (item.detail ? " (" + item.detail + ")" : "");
    }).join("\n");
  }

  function resultText(result, items) {
    var housing = result.input.housing === "secondary" ? "вторичка" : "новостройка";
    return [
      "Оценка для мастера КАМ Электро, Екатеринбург. Это не проект и не список, по которому стоит закупаться без проверки.",
      "Площадь " + result.input.area + " м², потолок " + result.input.ceiling + " м, " + housing + ".",
      "Кабель с запасом " + formatM(result.totals.withReserve) + " м, в бухтах " + result.totals.coil + " м. Щит около " + result.totals.modules + " модулей.",
      "",
      "Список для закупки:",
      shopText(items)
    ].join("\n");
  }

  function formatM(value) {
    return String(value).replace(".", ",");
  }

  function formatSection(value) {
    return String(value).replace(".", ",");
  }

  function render() {
    var root = $("#calc-app");
    var progress = steps.map(function (step, index) {
      var cls = index === state.step ? "is-current" : index < state.step ? "is-done" : "";
      return "<li class=\"" + cls + "\"><span>" + (index + 1) + "</span>" + step.title + "</li>";
    }).join("");
    root.innerHTML = "<ol class=\"calc-progress\">" + progress + "</ol>" + stepBody() + navButtons();
    saveState();
    bind();
    if (state.step === steps.length - 1) {
      var top = document.querySelector(".calc-result-top");
      if (top) top.scrollIntoView({ block: "start" });
    }
  }

  function stepBody() {
    if (state.step === 0) return presetStep();
    if (state.step === 1) return sizeStep();
    if (state.step === 2) return pointsStep();
    if (state.step === 3) return loadsStep();
    return resultStep();
  }

  function presetStep() {
    var cards = Object.keys(config.presets).map(function (id) {
      var preset = config.presets[id];
      var pressed = id === state.preset ? "true" : "false";
      return "<button type=\"button\" class=\"category-card" + (id === state.preset ? " is-selected" : "") + "\" data-preset=\"" + id + "\" aria-pressed=\"" + pressed + "\"><strong>" + preset.label + "</strong><span>" + preset.area + " м², " + preset.rooms + " комн.</span></button>";
    }).join("");
    return "<fieldset class=\"calc-card\"><legend>Тип квартиры</legend><div class=\"preset-grid\">" + cards + "</div><div class=\"housing-row\"><label><input type=\"radio\" name=\"housing\" value=\"newBuild\"" + (state.housing === "newBuild" ? " checked" : "") + "> Новостройка</label><label><input type=\"radio\" name=\"housing\" value=\"secondary\"" + (state.housing === "secondary" ? " checked" : "") + "> Вторичка</label></div><p class=\"search-hint\">Пресет заполняет поля. Дальше их можно изменить. Только квартира, одна фаза 220 В.</p></fieldset>";
  }

  function numberField(key, label, value, step, min, max) {
    return "<label>" + label + "<input data-field=\"" + key + "\" type=\"number\" inputmode=\"decimal\" min=\"" + min + "\" max=\"" + max + "\" step=\"" + step + "\" value=\"" + value + "\"></label>";
  }

  function sizeStep() {
    return "<fieldset class=\"calc-card\"><legend>Размеры</legend><div class=\"calc-fields\">" +
      numberField("area", "Площадь, м²", state.area, "1", "12", "200") +
      numberField("rooms", "Комнаты", state.rooms, "1", "1", "6") +
      numberField("ceiling", "Высота потолка, м", state.ceiling, "0.1", "2.2", "4") +
      "</div></fieldset>";
  }

  function pointsStep() {
    return "<fieldset class=\"calc-card\"><legend>Точки</legend><div class=\"calc-fields\">" +
      numberField("sockets", "Розетки, всего", state.sockets, "1", "0", "80") +
      numberField("kitchenSockets", "Из них кухня", state.kitchenSockets, "1", "0", "30") +
      numberField("bathSockets", "Из них санузел", state.bathSockets, "1", "0", "12") +
      numberField("switches", "Выключатели", state.switches, "1", "0", "40") +
      numberField("lights", "Светильники", state.lights, "1", "1", "40") +
      "</div><p class=\"search-hint\">Кухня и санузел пойдут отдельными линиями.</p></fieldset>";
  }

  function loadsStep() {
    var boxes = Object.keys(config.appliances).map(function (key) {
      var item = config.appliances[key];
      return "<label class=\"appliance\"><input data-appliance=\"" + key + "\" type=\"checkbox\"" + (state.appliances[key] ? " checked" : "") + "> " + item.label + "</label>";
    }).join("");
    return "<fieldset class=\"calc-card\"><legend>Мощные приборы</legend><div class=\"appliance-list\">" + boxes + "</div><p class=\"search-hint\">Каждый включённый прибор получает отдельную линию. Мощность и сечение заданы в calc.js.</p></fieldset>";
  }

  function deviceCount(result) {
    return result.lines.length + 1;
  }

  function resultStep() {
    readNumbers();
    var result = api.calculate(state);
    var items = api.shoppingList(result);
    if (!resultSeen) {
      resultSeen = true;
      reach("calc_result");
    }
    var shop = items.map(function (item) {
      var detail = item.detail ? "<span>" + item.detail + "</span>" : "";
      return "<li><strong>" + item.title + "</strong><span>" + item.qty + "</span>" + detail + "</li>";
    }).join("");
    var plainLines = result.lines.map(function (item) {
      return "<li>" + item.name + " — кабель " + formatSection(item.section) + " мм²</li>";
    }).join("");
    var notes = result.notes.map(function (note) { return "<li>" + note + "</li>"; }).join("");
    var text = resultText(result, items);
    window.__kamCalcText = text;
    window.__kamShopText = "Список для закупки\n" + shopText(items);
    return "<div class=\"calc-card calc-result\">" +
      "<div class=\"calc-result-top\">" +
      "<p class=\"calc-total\">Кабель с запасом <strong>" + formatM(result.totals.withReserve) + " м</strong>. Аппаратов защиты <strong>" + deviceCount(result) + "</strong>, щит на <strong>" + result.totals.modules + " модулей</strong>.</p>" +
      "<p class=\"calc-disclaimer\">Это оценка, точный проект сделает мастер.</p>" +
      "<p class=\"calc-hint\">Скопируем расчёт — вставьте его в чат.</p>" +
      "<div class=\"calc-actions\">" +
      "<button type=\"button\" class=\"button primary\" id=\"calc-telegram\" data-goal=\"calc_telegram\">Скопировать расчёт и открыть Telegram</button>" +
      "<a class=\"button ghost\" href=\"tel:+79120507100\">Позвонить</a>" +
      "</div>" +
      "<label class=\"calc-text-label\" for=\"calc-text\">Текст для чата</label>" +
      "<textarea id=\"calc-text\" class=\"calc-text\" readonly rows=\"6\">" + escapeText(text) + "</textarea>" +
      "<p id=\"calc-copy-note\" class=\"search-hint\" role=\"status\"></p>" +
      "</div>" +
      "<h2>Список для закупки</h2>" +
      "<ul class=\"calc-list\">" + shop + "</ul>" +
      "<button type=\"button\" class=\"button ghost\" id=\"calc-copy-list\" data-goal=\"calc_copy_list\">Скопировать список</button>" +
      "<h2>Линии простыми словами</h2>" +
      "<ul class=\"calc-list calc-plain\">" + plainLines + "</ul>" +
      "<details class=\"calc-how\"><summary>Как считали</summary><ul class=\"calc-notes\">" + notes + "</ul></details>" +
      "</div>";
  }

  function escapeText(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  }

  function navButtons() {
    if (state.step === steps.length - 1) {
      return "<div class=\"calc-nav\"><button type=\"button\" class=\"button ghost\" data-calc-back>Назад к приборам</button></div>";
    }
    var back = state.step > 0 ? "<button type=\"button\" class=\"button ghost\" data-calc-back>Назад</button>" : "";
    var next = "<button type=\"button\" class=\"button primary\" data-calc-next>Дальше</button>";
    return "<div class=\"calc-nav" + (back ? "" : " is-single") + "\">" + back + next + "</div>";
  }

  function bind() {
    document.querySelectorAll("[data-preset]").forEach(function (button) {
      button.addEventListener("click", function () {
        applyPreset(button.getAttribute("data-preset"));
        render();
      });
    });
    var next = $("[data-calc-next]");
    if (next) next.addEventListener("click", function () { readNumbers(); state.step += 1; render(); });
    var back = $("[data-calc-back]");
    if (back) back.addEventListener("click", function () { readNumbers(); state.step -= 1; render(); });
    var listCopy = $("#calc-copy-list");
    if (listCopy) listCopy.addEventListener("click", function () { copyText(window.__kamShopText, false, "Список скопирован."); });
    var telegram = $("#calc-telegram");
    if (telegram) telegram.addEventListener("click", function (event) {
      event.preventDefault();
      copyText(window.__kamCalcText, true, "Расчёт скопирован. Вставьте его в чат: сообщение само не уходит.");
    });
  }

  function copyText(text, openTelegram, success) {
    var note = $("#calc-copy-note");
    function done(message) {
      if (note) note.textContent = message;
      if (openTelegram) window.open("https://t.me/kam_ekb", "_blank", "noopener");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text || "").then(function () {
        done(success);
      }).catch(function () {
        done("Не удалось скопировать автоматически. Выделите текст в поле выше.");
      });
    } else {
      done("Автокопирование недоступно. Выделите текст в поле выше.");
    }
  }

  function start() {
    if (!loadState()) applyPreset("two");
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
