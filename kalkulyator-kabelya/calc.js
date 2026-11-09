/* Калькулятор объёма кабеля и автоматов для квартиры 220 В.
   Все коэффициенты собраны здесь: их можно поправить без правки формул.
   Это оценка для заявки, не проект и не замена расчёта на объекте. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.KamCableCalc = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var CONFIG = {
    voltage: 220,
    curve: "C",
    rcdMa: 30,
    coilStepM: 10,
    /* Доля стороны квартиры (sqrt(площади)) как средний горизонтальный участок от щита. */
    horizontalFactor: 0.62,
    /* Запас на подъёмы, повороты и обрезки. Вторичка обычно длиннее новостройки. */
    reserve: { newBuild: 1.12, secondary: 1.2 },
    hopM: { socket: 2.4, light: 2.8, switch: 1.6, dedicated: 0 },
    minDedicatedM: 6,
    maxSocketsPerLine: 8,
    maxLightsPerLine: 12,
    /* Расчётная мощность розеточной линии, а не сумма всех розеток. */
    socketLineDesignW: 3000,
    lightWm2: 12,
    lightPointW: 60,
    minBreaker: { light: 10, socket: 16 },
    /* Iz, А. ПУЭ 7, табл. 1.3.4, медь, ПВХ/резина, три одножильных в одной трубе.
       Это осторожный аналог скрытой прокладки 3-жильного кабеля. Открытая прокладка даёт больший ток. */
    iz: { "1.5": 17, "2.5": 25, "4": 35, "6": 42 },
    sections: [1.5, 2.5, 4, 6],
    breakers: [6, 10, 16, 20, 25, 32, 40, 50],
    modules: { mcb: 1, rcbo: 2, main2p: 2 },
    appliances: {
      hob: { label: "Плита / варочная", watts: 7000, section: 6, wet: false },
      oven: { label: "Духовка", watts: 3500, section: 2.5, wet: false },
      washer: { label: "Стиральная машина", watts: 2200, section: 2.5, wet: true },
      dishwasher: { label: "Посудомойка", watts: 2200, section: 2.5, wet: true },
      boiler: { label: "Бойлер", watts: 2000, section: 2.5, wet: true },
      ac: { label: "Кондиционер", watts: 2000, section: 2.5, wet: false },
      floor: { label: "Тёплый пол", watts: 1800, section: 2.5, wet: false }
    },
    presets: {
      studio: {
        label: "Студия",
        area: 28,
        rooms: 1,
        ceiling: 2.7,
        sockets: 12,
        switches: 4,
        lights: 6,
        kitchenSockets: 4,
        bathSockets: 2,
        appliances: { hob: true, oven: false, washer: true, dishwasher: false, boiler: false, ac: false, floor: false }
      },
      one: {
        label: "1к",
        area: 38,
        rooms: 1,
        ceiling: 2.7,
        sockets: 16,
        switches: 6,
        lights: 8,
        kitchenSockets: 6,
        bathSockets: 2,
        appliances: { hob: true, oven: true, washer: true, dishwasher: false, boiler: false, ac: false, floor: false }
      },
      two: {
        label: "2к",
        area: 55,
        rooms: 2,
        ceiling: 2.7,
        sockets: 24,
        switches: 10,
        lights: 12,
        kitchenSockets: 6,
        bathSockets: 2,
        appliances: { hob: true, oven: true, washer: true, dishwasher: false, boiler: false, ac: false, floor: false }
      },
      three: {
        label: "3к",
        area: 78,
        rooms: 3,
        ceiling: 2.7,
        sockets: 34,
        switches: 14,
        lights: 16,
        kitchenSockets: 8,
        bathSockets: 2,
        appliances: { hob: true, oven: true, washer: true, dishwasher: true, boiler: false, ac: false, floor: false }
      }
    }
  };

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function clampCount(value, fallback) {
    var number = Number(value);
    if (!isFinite(number)) return fallback;
    return Math.max(0, Math.round(number));
  }

  function amps(watts) {
    return watts / CONFIG.voltage;
  }

  function chooseProtection(watts, preferredSection, minBreaker) {
    var start = CONFIG.sections.indexOf(preferredSection);
    if (start < 0) start = 0;
    var current = amps(watts);
    for (var i = start; i < CONFIG.sections.length; i += 1) {
      var section = CONFIG.sections[i];
      var iz = CONFIG.iz[String(section)];
      var options = CONFIG.breakers.filter(function (rating) {
        return current <= rating + 1e-9 && rating <= iz + 1e-9 && rating >= minBreaker;
      });
      if (!options.length) {
        options = CONFIG.breakers.filter(function (rating) {
          return current <= rating + 1e-9 && rating <= iz + 1e-9;
        });
      }
      if (options.length) {
        return { section: section, ib: current, in: options[0], iz: iz };
      }
    }
    var last = CONFIG.sections[CONFIG.sections.length - 1];
    return {
      section: last,
      ib: current,
      in: CONFIG.breakers[CONFIG.breakers.length - 1],
      iz: CONFIG.iz[String(last)],
      exceeds: true
    };
  }

  function firstRun(area, ceiling, kind) {
    var horizontal = Math.sqrt(Math.max(area, 1)) * CONFIG.horizontalFactor;
    var vertical = ceiling;
    if (kind === "dedicated") vertical = ceiling * 0.5;
    return horizontal + vertical;
  }

  function chainedLength(area, ceiling, kind, points) {
    var count = Math.max(1, points);
    var hop = CONFIG.hopM[kind] || 0;
    return firstRun(area, ceiling, kind) + (count - 1) * hop;
  }

  function dedicatedLength(area, ceiling) {
    return Math.max(CONFIG.minDedicatedM, firstRun(area, ceiling, "dedicated"));
  }

  function splitEven(total, limit) {
    var count = Math.max(0, total);
    if (!count) return [];
    var lines = Math.ceil(count / limit);
    var base = Math.floor(count / lines);
    var extra = count % lines;
    var result = [];
    for (var i = 0; i < lines; i += 1) {
      result.push(base + (i < extra ? 1 : 0));
    }
    return result;
  }

  function line(name, role, points, lengthM, protection, rcd) {
    return {
      name: name,
      role: role,
      points: points,
      lengthM: round1(lengthM),
      section: protection.section,
      ib: round1(protection.ib),
      in: protection.in,
      iz: protection.iz,
      curve: CONFIG.curve,
      rcdMa: rcd ? CONFIG.rcdMa : 0,
      device: rcd ? "дифавтомат" : "автомат",
      modules: rcd ? CONFIG.modules.rcbo : CONFIG.modules.mcb,
      exceeds: Boolean(protection.exceeds)
    };
  }

  function calculate(input) {
    var area = Math.max(12, Number(input.area) || 0);
    var ceiling = Math.min(4, Math.max(2.2, Number(input.ceiling) || 2.7));
    var sockets = clampCount(input.sockets, 0);
    var switches = clampCount(input.switches, 0);
    var lights = clampCount(input.lights, 0);
    var kitchen = Math.min(sockets, clampCount(input.kitchenSockets, 0));
    var bath = Math.min(sockets - kitchen, clampCount(input.bathSockets, 0));
    var rooms = Math.max(0, sockets - kitchen - bath);
    var reserve = input.housing === "secondary" ? CONFIG.reserve.secondary : CONFIG.reserve.newBuild;
    var lines = [];

    var lightWatts = Math.max(area * CONFIG.lightWm2, Math.max(lights, 1) * CONFIG.lightPointW);
    var lightGroups = splitEven(Math.max(lights, 1), CONFIG.maxLightsPerLine);
    var switchLeft = switches;
    lightGroups.forEach(function (count, index) {
      var length = chainedLength(area, ceiling, "light", count);
      var switchesHere = Math.min(switchLeft, count);
      switchLeft -= switchesHere;
      length += switchesHere * CONFIG.hopM.switch;
      var share = lightWatts / lightGroups.length;
      lines.push(line(
        lightGroups.length > 1 ? "Освещение " + (index + 1) : "Освещение",
        "light",
        count,
        length,
        chooseProtection(share, 1.5, CONFIG.minBreaker.light),
        false
      ));
    });

    function addSocketGroup(title, count) {
      splitEven(count, CONFIG.maxSocketsPerLine).forEach(function (points, index, all) {
        var name = all.length > 1 ? title + " " + (index + 1) : title;
        lines.push(line(
          name,
          "socket",
          points,
          chainedLength(area, ceiling, "socket", points),
          chooseProtection(CONFIG.socketLineDesignW, 2.5, CONFIG.minBreaker.socket),
          true
        ));
      });
    }

    if (rooms) addSocketGroup("Розетки комнат", rooms);
    if (kitchen) addSocketGroup("Розетки кухни", kitchen);
    if (bath) addSocketGroup("Розетки санузла", bath);

    Object.keys(CONFIG.appliances).forEach(function (key) {
      if (!input.appliances || !input.appliances[key]) return;
      var item = CONFIG.appliances[key];
      lines.push(line(
        item.label,
        "dedicated",
        1,
        dedicatedLength(area, ceiling),
        chooseProtection(item.watts, item.section, 16),
        true
      ));
    });

    var bySection = {};
    CONFIG.sections.forEach(function (section) {
      bySection[section] = 0;
    });
    lines.forEach(function (item) {
      bySection[item.section] += item.lengthM;
    });

    var cables = CONFIG.sections.map(function (section) {
      var raw = round1(bySection[section]);
      var withReserve = round1(raw * reserve);
      var coil = raw === 0 ? 0 : Math.ceil(withReserve / CONFIG.coilStepM) * CONFIG.coilStepM;
      return { section: section, raw: raw, withReserve: withReserve, coil: coil };
    }).filter(function (item) { return item.raw > 0; });

    var rawTotal = round1(cables.reduce(function (sum, item) { return sum + item.raw; }, 0));
    var reserveTotal = round1(cables.reduce(function (sum, item) { return sum + item.withReserve; }, 0));
    var coilTotal = cables.reduce(function (sum, item) { return sum + item.coil; }, 0);
    var modules = CONFIG.modules.main2p + lines.reduce(function (sum, item) { return sum + item.modules; }, 0);

    return {
      input: {
        area: area,
        ceiling: ceiling,
        housing: input.housing === "secondary" ? "secondary" : "newBuild",
        reserve: reserve
      },
      lines: lines,
      cables: cables,
      totals: { raw: rawTotal, withReserve: reserveTotal, coil: coilTotal, modules: modules },
      notes: [
        "Ток линии Ib = мощность / " + CONFIG.voltage + " В. Для розеток взята расчётная мощность линии " + CONFIG.socketLineDesignW + " Вт, а не сумма всех розеток.",
        "Сечение выбрано так, чтобы Ib ≤ In ≤ Iz. Iz взят по ПУЭ 7, табл. 1.3.4, медь, три жилы в трубе.",
        "Длина линии: путь от щита sqrt(площади) × " + CONFIG.horizontalFactor + " плюс вертикаль по высоте потолка, затем короткие переходы между точками. Запас " + Math.round((reserve - 1) * 100) + "% и округление бухты до " + CONFIG.coilStepM + " м.",
        "Розеточные и отдельные силовые линии заложены как дифавтоматы " + CONFIG.rcdMa + " мА (ПУЭ 7.1 и СП 256: защита розеточных групп жилья). Освещение — автомат без отдельного УЗО. Вводной автомат сетевой организации в группы не входит, в модули добавлены только 2 модуля под двухполюсный ввод.",
        "Медь, кабель вида ВВГнг-LS, по правилу ПУЭ 7.1.34 для квартир."
      ]
    };
  }

  function shoppingList(result) {
    var cables = result.cables.map(function (item) {
      return {
        kind: "cable",
        title: "Кабель ВВГнг-LS 3×" + String(item.section).replace(".", ","),
        qty: item.coil + " м",
        detail: formatRange(item)
      };
    });
    var mcb = {};
    var rcbo = {};
    result.lines.forEach(function (item) {
      var bucket = item.rcdMa ? rcbo : mcb;
      var key = String(item.in);
      bucket[key] = (bucket[key] || 0) + 1;
    });
    function rows(bucket, title) {
      return Object.keys(bucket).sort(function (a, b) { return Number(a) - Number(b); }).map(function (rating) {
        return { kind: "device", title: title + " " + CONFIG.curve + rating, qty: bucket[rating] + " шт." };
      });
    }
    return cables.concat(rows(mcb, "Автомат")).concat(rows(rcbo, "Дифавтомат")).concat([
      { kind: "input", title: "Вводной автомат 2P", qty: "1 шт.", detail: "Номинал задаёт сетевая организация" },
      { kind: "panel", title: "Щит на " + result.totals.modules + " модулей", qty: "1 шт." }
    ]);
  }

  function formatRange(item) {
    return String(item.raw).replace(".", ",") + "–" + String(item.withReserve).replace(".", ",") + " м расчёт, бухта " + item.coil + " м";
  }

  return { CONFIG: CONFIG, calculate: calculate, shoppingList: shoppingList, round1: round1 };
});
