import { createRequire } from "module";
import assert from "assert";

const require = createRequire(import.meta.url);
const { CONFIG, calculate } = require("../kalkulyator-kabelya/calc.js");

function inputFromPreset(id, housing) {
  const preset = CONFIG.presets[id];
  return {
    housing: housing || "newBuild",
    area: preset.area,
    rooms: preset.rooms,
    ceiling: preset.ceiling,
    sockets: preset.sockets,
    switches: preset.switches,
    lights: preset.lights,
    kitchenSockets: preset.kitchenSockets,
    bathSockets: preset.bathSockets,
    appliances: preset.appliances
  };
}

function total(id, housing) {
  return calculate(inputFromPreset(id, housing)).totals.withReserve;
}

const two = calculate(inputFromPreset("two", "secondary"));
assert.ok(two.totals.withReserve >= 150 && two.totals.withReserve <= 250, `2к вне 150–250 м: ${two.totals.withReserve}`);
assert.ok(two.input.area >= 50 && two.input.area <= 60);
assert.ok(total("studio") < total("one"));
assert.ok(total("one") < total("two"));
assert.ok(total("two") < total("three"));
assert.ok(total("two", "newBuild") < total("two", "secondary"));

for (const id of Object.keys(CONFIG.presets)) {
  const result = calculate(inputFromPreset(id));
  assert.ok(result.lines.length > 0, id);
  for (const line of result.lines) {
    assert.ok(CONFIG.sections.includes(line.section), line.name);
    assert.ok(line.ib <= line.in + 0.05, `${line.name} Ib ${line.ib} > In ${line.in}`);
    assert.ok(line.in <= line.iz, `${line.name} In ${line.in} > Iz ${line.iz}`);
    assert.ok(!line.exceeds, line.name);
  }
  for (const cable of result.cables) {
    assert.ok(cable.coil === 0 || cable.coil % CONFIG.coilStepM === 0);
    assert.ok(cable.coil >= cable.withReserve - 0.05);
    assert.ok(cable.withReserve >= cable.raw);
  }
  const text = JSON.stringify(result);
  assert.ok(!/(^|[^а-яё])руб([^а-яё]|$)|цена|стоимость|прайс/i.test(text));
}

console.log(JSON.stringify({
  twoArea: two.input.area,
  reserve: two.input.reserve,
  totals: two.totals,
  cables: two.cables,
  lines: two.lines.map((line) => ({
    name: line.name,
    section: line.section,
    in: line.in,
    device: line.device,
    rcdMa: line.rcdMa,
    lengthM: line.lengthM
  }))
}, null, 2));
