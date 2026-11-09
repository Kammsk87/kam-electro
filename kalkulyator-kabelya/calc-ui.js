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

  function resultText(result) {
    var lines = [
      "Оценка кабеля и автоматов для квартиры, Екатеринбург. Это не проект.",
      "Площадь " + result.input.area + " м², потолок " + result.input.ceiling + " м, " + (result.input.housing === "secondary" ? "вторичка" : "новостройка") + ".",
      "Итого с запасом около " + formatM(result.totals.withReserve) + " м, в бухтах " + result.totals.coil + " м. Модулей щита ориентировочно " + result.totals.modules + "."
    ];
    result.cables.forEach(function (item) {
      lines.push("ВВГнг-LS 3×" + formatSection(item.section) + ": " + formatM(item.raw) + "–" + formatM(item.withReserve) + " м, бухта " + item.coil + " м");
    });
    result.lines.forEach(function (item) {
      var protection = item.device + " " + item.curve + item.in;
      if (item.rcdMa) protection += ", " + item.rcdMa + " мА";
      lines.push(item.name + ": 3×" + formatSection(item.section) + ", " + protection);
    });
    return lines.join("\n");
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
    bind();
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
      "</div><p class=\"search-hint\">Кухня и санузел считаются отдельными линиями с дифавтоматом 30 мА.</p></fieldset>";
  }

  function loadsStep() {
    var boxes = Object.keys(config.appliances).map(function (key) {
      var item = config.appliances[key];
      return "<label class=\"appliance\"><input data-appliance=\"" + key + "\" type=\"checkbox\"" + (state.appliances[key] ? " checked" : "") + "> " + item.label + "</label>";
    }).join("");
    return "<fieldset class=\"calc-card\"><legend>Мощные приборы</legend><div class=\"appliance-list\">" + boxes + "</div><p class=\"search-hint\">Каждый включённый прибор получает отдельную линию. Мощность и сечение заданы в calc.js.</p></fieldset>";
  }

  function resultStep() {
    readNumbers();
    var result = api.calculate(state);
    if (!resultSeen) {
      resultSeen = true;
      reach("calc_result");
    }
    var cables = result.cables.map(function (item) {
      return "<li><strong>ВВГнг-LS 3×" + formatSection(item.section) + "</strong><span>" + formatM(item.raw) + "–" + formatM(item.withReserve) + " м, бухта " + item.coil + " м</span></li>";
    }).join("");
    var lines = result.lines.map(function (item) {
      var extra = item.rcdMa ? ", УЗО " + item.rcdMa + " мА" : "";
      return "<li><strong>" + item.name + "</strong><span>3×" + formatSection(item.section) + " · " + item.device + " " + item.curve + item.in + extra + " · " + formatM(item.lengthM) + " м</span></li>";
    }).join("");
    var notes = result.notes.map(function (note) { return "<li>" + note + "</li>"; }).join("");
    window.__kamCalcText = resultText(result);
    return "<div class=\"calc-card calc-result\"><p class=\"calc-disclaimer\">Оценка объёма, не проект. Типовая рекомендация, мастер проверит на объекте.</p><p class=\"calc-total\">С запасом <strong>" + formatM(result.totals.withReserve) + " м</strong>, в бухтах <strong>" + result.totals.coil + " м</strong>. Ориентир щита: <strong>" + result.totals.modules + " модулей</strong>.</p><h2>Кабель по сечениям</h2><ul class=\"calc-list\">" + cables + "</ul><h2>Линии</h2><ul class=\"calc-list\">" + lines + "</ul><h2>Как считали</h2><ul class=\"calc-notes\">" + notes + "</ul></div>";
  }

  function navButtons() {
    var back = state.step > 0 ? "<button type=\"button\" class=\"button ghost\" data-calc-back>Назад</button>" : "<span></span>";
    var next = state.step < steps.length - 1 ? "<button type=\"button\" class=\"button primary\" data-calc-next>Дальше</button>" : "";
    var actions = state.step === steps.length - 1 ? "<div class=\"calc-actions\"><button type=\"button\" class=\"button primary\" id=\"calc-telegram\" data-goal=\"calc_telegram\">Скопировать расчёт и открыть Telegram</button><button type=\"button\" class=\"button ghost\" id=\"calc-copy\">Скопировать</button><a class=\"button ghost\" href=\"tel:+79120507100\">Позвонить</a><p id=\"calc-copy-note\" class=\"search-hint\" role=\"status\"></p></div>" : "";
    return "<div class=\"calc-nav\">" + back + next + "</div>" + actions;
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
    var copy = $("#calc-copy");
    if (copy) copy.addEventListener("click", function () { copyText(false); });
    var telegram = $("#calc-telegram");
    if (telegram) telegram.addEventListener("click", function (event) {
      event.preventDefault();
      copyText(true);
    });
  }

  function copyText(openTelegram) {
    var text = window.__kamCalcText || "";
    var note = $("#calc-copy-note");
    function done(message) {
      if (note) note.textContent = message;
      if (openTelegram) window.open("https://t.me/kam_ekb", "_blank", "noopener");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        done(openTelegram ? "Расчёт скопирован. Вставьте его в Telegram сами: чат не заполняется заранее." : "Расчёт скопирован.");
      }).catch(function () {
        done("Не удалось скопировать автоматически. Выделите текст результата вручную.");
      });
    } else {
      done("Автокопирование недоступно. Выделите текст результата вручную.");
    }
  }

  function start() {
    applyPreset("two");
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
