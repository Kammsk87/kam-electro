#!/usr/bin/env node
// cost_model.mjs
//
// The single source of truth for the round-trip cost floor.
//
// Why this module exists: the constant 11 was hardcoded independently in six engines with no
// derivation and no cited source, and it was wrong by roughly 5 bps for months. It was fees
// only, and it happened to sit at the MEDIAN realised fee rather than above it. Thirty-seven
// hypotheses were judged against it.
//
// The rule this module enforces is that a floor may not be a bare number. Every value it
// returns carries the schedule entry it came from and the measurement behind that entry, and
// `requireFloor` throws rather than returning a default when the schedule is missing.
//
// It does NOT retrofit the six existing engines. Their frozen constants stay as published so
// their results remain reproducible; this binds work from 2026-08-05 onward.
//
// Safety: no network, process, service, credential, exchange, account, order, execution or
// position path. Reads one explicitly supplied JSON file. Deterministic.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

export const DEFAULT_SCHEDULE_PATH = join(REPO_ROOT, 'data', 'botalin_fee_schedule_2026-08-05.json');

export function loadSchedule(path = DEFAULT_SCHEDULE_PATH) {
  const p = resolve(path);
  if (!existsSync(p)) throw new Error(`FEE_SCHEDULE_MISSING: ${p}`);
  const s = JSON.parse(readFileSync(p, 'utf8'));
  if (!Array.isArray(s.entries) || !s.entries.length) throw new Error('FEE_SCHEDULE_EMPTY');
  if (!s.derived_floor) throw new Error('FEE_SCHEDULE_NO_DERIVED_FLOOR');
  return s;
}

/**
 * The entry in force on a given date. Entries are appended, never rewritten, so a result
 * computed under an older schedule stays reproducible by asking for its own date.
 *
 * `asOf` is required. Defaulting it to the current date would make every call depend on when it
 * ran, and this module is used to judge historical measurements.
 */
export function entryAsOf(schedule, asOf) {
  if (typeof asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error('COST_MODEL_ASOF_REQUIRED: pass an explicit YYYY-MM-DD; defaulting to now would make the floor depend on when the code ran');
  }
  const candidates = schedule.entries
    .filter((e) => e.effective_from <= asOf)
    .filter((e) => e.effective_to === null || e.effective_to === undefined || e.effective_to >= asOf)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  if (!candidates.length) throw new Error(`NO_FEE_SCHEDULE_ENTRY_FOR ${asOf}`);
  return candidates[0];
}

/**
 * The floor, with its provenance attached. There is deliberately no way to obtain the number
 * alone: a caller that wants 16 must carry the reason it is 16.
 *
 * `legs` is 1 for a single-instrument round trip and 2 for anything that must trade a hedge.
 * `stress` returns the double-cost figure the acceptance criteria require alongside the base.
 */
export function requireFloor({ asOf, legs = 1, stress = false, schedulePath = DEFAULT_SCHEDULE_PATH } = {}) {
  const schedule = loadSchedule(schedulePath);
  const entry = entryAsOf(schedule, asOf);
  const d = schedule.derived_floor;
  if (legs !== 1 && legs !== 2) throw new Error(`COST_MODEL_BAD_LEGS: ${legs}`);
  const base = legs === 1 ? d.single_leg_roundtrip_bps : d.two_leg_roundtrip_bps;
  const bps = stress ? base * d.stress_multiplier : base;
  return {
    bps,
    legs,
    stress,
    as_of: asOf,
    fee_component_bps: d.fee_roundtrip_bps,
    fee_basis: d.fee_basis,
    execution_component_bps: d.execution_roundtrip_bps,
    execution_basis: d.execution_basis,
    execution_source: d.execution_source,
    schedule_id: schedule.schedule_id,
    schedule_version: schedule.schema_version,
    entry_tier: entry.tier,
    entry_effective_from: entry.effective_from,
    entry_basis: entry.basis,
    undetermined: entry.undetermined ?? [],
    superseded_bps: d.superseded_bps,
  };
}

/**
 * Where a floor sits in the realised distribution.
 *
 * The point of exposing this is that 16 bps is a CENTRAL figure, not a conservative one: the
 * measured median all-in is 16.0, the p75 is 19.2 and the p95 is 25.6. A task that needs a
 * conservative floor should say so and take the p75, and this makes the choice explicit rather
 * than leaving it in a constant nobody re-derives.
 */
export function floorPercentile(bps, schedulePath = DEFAULT_SCHEDULE_PATH) {
  const c = loadSchedule(schedulePath).conservatism_check;
  if (!c) return null;
  const marks = [
    ['median', c.median_all_in_bps],
    ['p75', c.p75_all_in_bps],
    ['p95', c.p95_all_in_bps],
  ];
  let position = 'below_median';
  for (const [name, v] of marks) if (bps >= v) position = name;
  return {
    bps,
    position,
    median_all_in_bps: c.median_all_in_bps,
    p75_all_in_bps: c.p75_all_in_bps,
    p95_all_in_bps: c.p95_all_in_bps,
    conservative: bps >= c.p75_all_in_bps,
  };
}

/** A one-line provenance string for a protocol table, so the floor is never quoted bare. */
export function floorCitation(floor) {
  return `${floor.bps} bps (${floor.legs}-leg${floor.stress ? ', double-cost stress' : ''}) `
    + `= ${floor.fee_component_bps} fee [${floor.fee_basis}] + ${floor.execution_component_bps} execution `
    + `[${floor.execution_basis}], schedule ${floor.schedule_id} v${floor.schedule_version} `
    + `entry ${floor.entry_tier} effective ${floor.entry_effective_from}`;
}
