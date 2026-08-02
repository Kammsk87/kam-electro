#!/usr/bin/env node
// build_research_warehouse_catalog.mjs
//
// TASK-021-BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0
//
// Pure, read-only catalogue builder for the Botalin research warehouse.
//
// What this program is allowed to do:
//   - read a schema file and manifest JSON files under roots given explicitly on the command line;
//   - validate every record and every cross-record invariant;
//   - print a summary, and write a catalogue ONLY to a path given explicitly via --out / --csv.
//
// What this program must never do, and what the shipped static scan asserts it does not do:
//   - open a network socket, resolve a host, or download anything;
//   - read a secret, key, token, or environment file;
//   - call an exchange, account, order, execution, or position endpoint;
//   - spawn a process, start a service, or touch a systemd unit;
//   - write, move, delete, or relabel any runtime log, collector output, or dataset;
//   - scan a home directory, the filesystem root, or any root not named on the command line.
//
// Output is deterministic: no clock, no randomness, no environment is read.
// Records are copied verbatim; the builder never rewrites a path or a provenance field.

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, basename, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

export const DEFAULT_SCHEMA_PATH = join(REPO_ROOT, 'data', 'research_warehouse_catalog_schema_2026-08-02.json');
export const DEFAULT_FIXTURE_PATH = join(REPO_ROOT, 'data', 'research_warehouse_catalog_fixture_2026-08-02.json');

export const CATALOG_BUILDER_VERSION = '0.1.0';
const MAX_SCAN_DEPTH = 3;

// Basenames that must never be opened, even if a caller points a root straight at them.
//
// The shipped static scan (scripts/test_research_warehouse_catalog.mjs) excises the region
// between the two sentinels below before it looks for credential tokens, because this list
// necessarily *names* the things it forbids. The sentinels are the single audited exemption:
// nothing outside them may mention a credential token, and the scan asserts exactly that.
/* static-scan:allow-denylist-start */
const SECRET_BASENAME_PATTERNS = [
  /^\.env$/i,
  /\.env(\..+)?$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /^id_vpn/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /\.key$/i,
  /secret/i,
  /credential/i,
  /(^|[_.-])token([_.-]|$)/i,
  /apikey/i,
  /api_key/i,
];
/* static-scan:allow-denylist-end */

export function looksLikeSecretPath(p) {
  const base = basename(p);
  return SECRET_BASENAME_PATTERNS.some((re) => re.test(base));
}

// ---------------------------------------------------------------------------
// Root safety (INV-07)
// ---------------------------------------------------------------------------

export function homeDirCandidates() {
  // The home directory is resolved only so that it can be REFUSED as a scan root.
  // No environment variable is read anywhere in this program.
  try {
    const h = homedir();
    return typeof h === 'string' && h.length > 0 ? [resolve(h)] : [];
  } catch {
    return [];
  }
}

function isAncestorOf(maybeAncestor, p) {
  const a = maybeAncestor.endsWith(sep) ? maybeAncestor : maybeAncestor + sep;
  return p === maybeAncestor || p.startsWith(a);
}

/**
 * Refuses roots that would turn this tool into a filesystem crawler.
 * Returns the resolved absolute root, or throws.
 */
export function assertSafeRoot(rawRoot, opts = {}) {
  if (typeof rawRoot !== 'string' || rawRoot.trim() === '') {
    throw new Error('UNSAFE_ROOT: root must be a non-empty string');
  }
  const root = resolve(rawRoot);
  const homes = opts.homes ?? homeDirCandidates();

  if (root === sep || root === resolve('/')) {
    throw new Error(`UNSAFE_ROOT: filesystem root is never scannable: ${root}`);
  }
  for (const home of homes) {
    if (root === home) {
      throw new Error(`UNSAFE_ROOT: home directory is never scannable: ${root}`);
    }
    if (isAncestorOf(root, home)) {
      throw new Error(`UNSAFE_ROOT: root is an ancestor of a home directory: ${root}`);
    }
  }
  if (looksLikeSecretPath(root)) {
    throw new Error(`UNSAFE_ROOT: path matches a secret pattern: ${root}`);
  }
  return root;
}

// ---------------------------------------------------------------------------
// Schema-driven record validation
// ---------------------------------------------------------------------------

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const GATE_KEY_RE = /^G[0-9]$/;

export function loadSchema(schemaPath = DEFAULT_SCHEMA_PATH) {
  const safePath = resolve(schemaPath);
  if (looksLikeSecretPath(safePath)) throw new Error(`REFUSED_SECRET_PATH: ${safePath}`);
  const schema = JSON.parse(readFileSync(safePath, 'utf8'));
  if (!schema.record_types || !schema.enums) {
    throw new Error(`BAD_SCHEMA: ${safePath} has no record_types/enums`);
  }
  return schema;
}

function checkField(schema, spec, value, path, errors) {
  if (value === null) {
    if (spec.nullable) return;
    errors.push(`${path}: null not allowed`);
    return;
  }
  switch (spec.type) {
    case 'const':
      if (value !== spec.const) errors.push(`${path}: expected const '${spec.const}', got '${value}'`);
      break;
    case 'string':
    case 'path_reference': {
      if (typeof value !== 'string') { errors.push(`${path}: expected string`); break; }
      const min = spec.min_length ?? (spec.type === 'path_reference' ? 1 : 0);
      if (value.length < min) errors.push(`${path}: shorter than min_length ${min}`);
      if (spec.pattern && !new RegExp(spec.pattern).test(value)) {
        errors.push(`${path}: does not match ${spec.pattern}`);
      }
      break;
    }
    case 'enum': {
      const allowed = schema.enums[spec.enum];
      if (!Array.isArray(allowed)) { errors.push(`${path}: unknown enum '${spec.enum}'`); break; }
      if (!allowed.includes(value)) errors.push(`${path}: '${value}' not in enum ${spec.enum}`);
      break;
    }
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}: expected boolean`);
      break;
    case 'integer':
      if (!Number.isInteger(value)) { errors.push(`${path}: expected integer`); break; }
      if (spec.minimum !== undefined && value < spec.minimum) errors.push(`${path}: below minimum ${spec.minimum}`);
      if (spec.maximum !== undefined && value > spec.maximum) errors.push(`${path}: above maximum ${spec.maximum}`);
      break;
    case 'iso_datetime':
      if (typeof value !== 'string' || !ISO_RE.test(value)) {
        errors.push(`${path}: expected ISO-8601 UTC datetime`);
      }
      break;
    case 'string_array': {
      if (!Array.isArray(value)) { errors.push(`${path}: expected array`); break; }
      if (spec.min_items !== undefined && value.length < spec.min_items) {
        errors.push(`${path}: needs at least ${spec.min_items} item(s)`);
      }
      value.forEach((v, i) => {
        if (typeof v !== 'string') errors.push(`${path}[${i}]: expected string`);
      });
      break;
    }
    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) errors.push(`${path}: expected object`);
      break;
    case 'gate_map': {
      if (typeof value !== 'object' || Array.isArray(value)) { errors.push(`${path}: expected object`); break; }
      const statuses = schema.enums.gate_status;
      for (const [k, v] of Object.entries(value)) {
        if (!GATE_KEY_RE.test(k)) errors.push(`${path}.${k}: gate key must match ${GATE_KEY_RE}`);
        if (!statuses.includes(v)) errors.push(`${path}.${k}: '${v}' not in gate_status`);
      }
      break;
    }
    default:
      errors.push(`${path}: unknown field type '${spec.type}'`);
  }
}

/**
 * Validates one record against its record_type definition.
 * Returns an array of human-readable error strings (empty means valid).
 */
export function validateRecord(schema, recordType, record) {
  const errors = [];
  const def = schema.record_types[recordType];
  if (!def) return [`unknown record_type '${recordType}'`];
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return [`${recordType}: record must be an object`];
  }
  const key = record[def.key] ?? '<no-key>';
  const label = `${recordType}[${key}]`;

  for (const [name, spec] of Object.entries(def.fields)) {
    const present = Object.prototype.hasOwnProperty.call(record, name);
    if (!present) {
      if (!spec.optional) errors.push(`${label}.${name}: missing required field`);
      continue;
    }
    checkField(schema, spec, record[name], `${label}.${name}`, errors);
  }
  for (const name of Object.keys(record)) {
    if (!Object.prototype.hasOwnProperty.call(def.fields, name)) {
      errors.push(`${label}.${name}: unknown field (schema is closed)`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Manifest loading — explicit paths only
// ---------------------------------------------------------------------------

export function readManifestFile(manifestPath) {
  const p = resolve(manifestPath);
  if (looksLikeSecretPath(p)) throw new Error(`REFUSED_SECRET_PATH: ${p}`);
  const raw = readFileSync(p, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`BAD_JSON: ${p}: ${err.message}`);
  }
  return { path: p, manifest: parsed };
}

/** Collects *.json manifests under an explicitly supplied root, bounded depth, skipping secrets. */
export function collectManifestPaths(root, depth = MAX_SCAN_DEPTH) {
  const out = [];
  const walk = (dir, level) => {
    if (level > depth) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(dir, entry.name);
      if (looksLikeSecretPath(full)) continue;
      if (entry.isSymbolicLink()) continue; // never follow links out of the declared root
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        walk(full, level + 1);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        out.push(full);
      }
    }
  };
  const stat = statSync(root);
  if (stat.isFile()) {
    if (!looksLikeSecretPath(root)) out.push(root);
  } else {
    walk(root, 0);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cross-record invariants
// ---------------------------------------------------------------------------

const TERMINAL_PARENT_STATES = new Set(['CLOSED_REJECTED', 'QUARANTINED']);
const TERMINAL_VERDICTS = new Set(['REJECTED_FAMILY', 'QUARANTINED']);

// Re-running an attack against an existing parameter point does not consume a new
// independent trial. These kinds may never count toward the lower bound.
const ATTACK_KINDS = new Set(['ROBUSTNESS_ATTACK', 'NULL_CONTROL', 'REPLAY']);

// Evidence paths that assert nothing. An entry offering one of these has no evidence link.
const PLACEHOLDER_EVIDENCE = new Set(['', '-', 'NONE', 'N/A', 'NA', 'UNKNOWN', 'TBD', 'TODO', 'NOT_PROVISIONED']);

// A fingerprint whose own text admits it was derived rather than recorded is a fabricated variant.
// Word-bounded on purpose: 'synth_param=1' on a labelled fixture is a real fingerprint, whereas
// 'inferred_from_batch' is an admission that no per-variant record exists.
// The lookahead rather than \b is deliberate: '_' is a word character, so \b would let
// 'inferred_from_batch' through, which is precisely the string this must catch.
const FABRICATED_FINGERPRINT =
  /^(inferred|assumed|generated|fabricated|derived|estimated|placeholder|guess(ed)?|unknown)(?![A-Za-z0-9])/i;

const PENDING_RECONCILIATION = new Set(['AGGREGATE_PENDING_CHILDREN', 'UNRECOVERABLE_PENDING_SOURCE']);

function nonEmpty(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Trial-ledger invariants (INV-09 .. INV-13). Separated from checkInvariants so the
 * reconciliation logic can be read and tested on its own.
 */
export function checkTrialLedger(collections) {
  const errors = [];
  const rejections = [];

  const experimentById = new Map(collections.experiments.map((r) => [r.experiment_id, r]));
  const entryById = new Map(collections.trial_ledger_entries.map((r) => [r.trial_id, r]));
  const evidenceById = new Map(collections.trial_evidence.map((r) => [r.evidence_id, r]));
  const kept = [];

  for (const entry of collections.trial_ledger_entries) {
    const label = `trial_ledger_entry[${entry.trial_id}]`;
    const problems = [];

    // INV-09 — parent linkage.
    if (!experimentById.has(entry.parent_experiment_id)) {
      problems.push({ reason: 'UNKNOWN_PARENT_EXPERIMENT', detail: `unknown parent '${entry.parent_experiment_id}'` });
    } else {
      const parent = experimentById.get(entry.parent_experiment_id);
      if (parent.family_id !== entry.family_id) {
        problems.push({
          reason: 'FAMILY_MISMATCH',
          detail: `entry family '${entry.family_id}' != parent family '${parent.family_id}'`,
        });
      }
    }

    // INV-11 — real evidence link, no fabricated fingerprint.
    if (PLACEHOLDER_EVIDENCE.has(String(entry.evidence_path).trim().toUpperCase())) {
      problems.push({ reason: 'NO_EVIDENCE_LINK', detail: `evidence_path '${entry.evidence_path}' asserts nothing` });
    }
    if (entry.representation === 'AGGREGATE_ONLY' && entry.parameter_fingerprint !== null) {
      problems.push({
        reason: 'FABRICATED_PARAMETER_FINGERPRINT',
        detail: 'an AGGREGATE_ONLY batch cannot carry a per-variant parameter fingerprint',
      });
    }
    if (nonEmpty(entry.parameter_fingerprint) && FABRICATED_FINGERPRINT.test(entry.parameter_fingerprint.trim())) {
      problems.push({
        reason: 'FABRICATED_PARAMETER_FINGERPRINT',
        detail: `fingerprint '${entry.parameter_fingerprint}' declares itself derived rather than recorded`,
      });
    }
    if (entry.representation === 'INDIVIDUAL' && entry.exact_trial_count !== 1) {
      problems.push({
        reason: 'INDIVIDUAL_COUNT_NOT_ONE',
        detail: `an INDIVIDUAL entry represents exactly one trial, got ${entry.exact_trial_count}`,
      });
    }

    // INV-10 — a child inside an aggregate batch may never also be counted.
    if (nonEmpty(entry.member_of_aggregate_trial_id)) {
      const parentBatch = entryById.get(entry.member_of_aggregate_trial_id);
      if (!parentBatch) {
        problems.push({ reason: 'UNKNOWN_AGGREGATE', detail: `unknown aggregate '${entry.member_of_aggregate_trial_id}'` });
      } else if (parentBatch.representation !== 'AGGREGATE_ONLY') {
        problems.push({ reason: 'NOT_AN_AGGREGATE', detail: `'${parentBatch.trial_id}' is not an AGGREGATE_ONLY batch` });
      }
      if (entry.counts_toward_lower_bound !== false) {
        problems.push({
          reason: 'DOUBLE_COUNTED_CHILD',
          detail: 'a member of an aggregate batch is already counted inside that batch',
        });
      }
    }

    // INV-13 — attacks never add trials.
    if (ATTACK_KINDS.has(entry.kind)) {
      if (entry.counts_toward_lower_bound !== false) {
        problems.push({
          reason: 'ATTACK_COUNTED_AS_TRIAL',
          detail: `a ${entry.kind} entry may not count toward the lower bound`,
        });
      }
      if (!nonEmpty(entry.attacks_trial_id)) {
        problems.push({ reason: 'ATTACK_WITHOUT_TARGET', detail: `a ${entry.kind} entry must name the trial it attacks` });
      } else {
        const target = entryById.get(entry.attacks_trial_id);
        if (!target) {
          problems.push({ reason: 'UNKNOWN_ATTACK_TARGET', detail: `unknown target '${entry.attacks_trial_id}'` });
        } else if (target.parent_experiment_id !== entry.parent_experiment_id) {
          problems.push({
            reason: 'ATTACK_CROSSES_EXPERIMENT',
            detail: `target '${target.trial_id}' belongs to a different experiment`,
          });
        }
      }
    }

    // INV-12 — a pending reconciliation must say what would resolve it.
    if (PENDING_RECONCILIATION.has(entry.reconciliation_status)) {
      if (!nonEmpty(entry.missing_child_evidence_id)) {
        problems.push({
          reason: 'MISSING_EVIDENCE_NOT_DECLARED',
          detail: `${entry.reconciliation_status} requires a trial_evidence record naming the recovery source`,
        });
      } else if (!evidenceById.has(entry.missing_child_evidence_id)) {
        problems.push({
          reason: 'UNKNOWN_TRIAL_EVIDENCE',
          detail: `unknown trial_evidence '${entry.missing_child_evidence_id}'`,
        });
      }
    }

    if (problems.length > 0) {
      for (const p of problems) {
        errors.push(`INV-TRIAL ${label}: ${p.detail}`);
        rejections.push({ record_type: 'trial_ledger_entry', id: entry.trial_id, reason: p.reason, detail: p.detail });
      }
      continue;
    }
    kept.push(entry);
  }

  // INV-10 — dedup keys must be unique among counting entries.
  const seenDedup = new Map();
  for (const entry of kept.filter((e) => e.counts_toward_lower_bound)) {
    if (seenDedup.has(entry.dedup_key)) {
      errors.push(
        `INV-10 trial_ledger_entry[${entry.trial_id}]: dedup_key '${entry.dedup_key}' already counted by ` +
          `'${seenDedup.get(entry.dedup_key)}'`,
      );
    } else {
      seenDedup.set(entry.dedup_key, entry.trial_id);
    }
  }

  // INV-12 — every trial_evidence record must attach to a known entry.
  for (const ev of collections.trial_evidence) {
    if (!entryById.has(ev.trial_id)) {
      errors.push(`INV-12 trial_evidence[${ev.evidence_id}]: unknown trial '${ev.trial_id}'`);
    }
  }

  // INV-09 — count conservation, per parent experiment.
  const perExperiment = [];
  for (const exp of collections.experiments) {
    if (exp.prior_trials_seeded === undefined || exp.prior_trials_seeded === null) continue;
    const linked = kept.filter((e) => e.parent_experiment_id === exp.experiment_id);
    const counting = linked.filter((e) => e.counts_toward_lower_bound);
    const summed = counting.reduce((a, e) => a + e.exact_trial_count, 0);
    if (summed !== exp.prior_trials_seeded) {
      errors.push(
        `INV-09 experiment[${exp.experiment_id}]: prior_trials_seeded=${exp.prior_trials_seeded} but linked ` +
          `counting ledger entries sum to ${summed}`,
      );
    }
    perExperiment.push({
      experiment_id: exp.experiment_id,
      family_id: exp.family_id,
      declared: exp.prior_trials_seeded,
      ledger_sum: summed,
      conserved: summed === exp.prior_trials_seeded,
      individual_entries: counting.filter((e) => e.representation === 'INDIVIDUAL').length,
      aggregate_entries: counting.filter((e) => e.representation === 'AGGREGATE_ONLY').length,
      aggregate_trials: counting
        .filter((e) => e.representation === 'AGGREGATE_ONLY')
        .reduce((a, e) => a + e.exact_trial_count, 0),
      non_counting_entries: linked.filter((e) => !e.counts_toward_lower_bound).length,
      fixture: Boolean(exp.fixture_flag),
    });
  }

  return { errors, rejections, keptEntries: kept, perExperiment };
}

/** Aggregates the ledger into the headline reconciliation figures. Pure. */
export function summarizeTrialLedger(entries, perExperiment, evidence) {
  const real = entries.filter((e) => !e.fixture_flag);
  const counting = real.filter((e) => e.counts_toward_lower_bound);
  const individual = counting.filter((e) => e.representation === 'INDIVIDUAL');
  const aggregate = counting.filter((e) => e.representation === 'AGGREGATE_ONLY');

  const sum = (rows) => rows.reduce((a, e) => a + e.exact_trial_count, 0);
  const artefactStated = counting.filter((e) => e.verification_grade === 'DOCUMENTED_UNVERIFIED');
  const unknownGrade = counting.filter((e) => e.verification_grade === 'UNKNOWN');

  return {
    lower_bound_trials: sum(counting),
    individual_entries: individual.length,
    individual_trials: sum(individual),
    aggregate_only_entries: aggregate.length,
    aggregate_only_trials: sum(aggregate),
    non_counting_entries: real.length - counting.length,
    trials_with_artefact_stated_count: sum(artefactStated),
    trials_with_unknown_count_grade: sum(unknownGrade),
    entries_pending_reconciliation: real.filter((e) => PENDING_RECONCILIATION.has(e.reconciliation_status)).length,
    reconciled_entries: real.filter((e) => e.reconciliation_status === 'RECONCILED').length,
    experiments_conserved: perExperiment.filter((e) => e.conserved).length,
    experiments_total: perExperiment.length,
    missing_evidence_sources: evidence
      .filter((e) => !e.fixture_flag)
      .map((e) => ({
        evidence_id: e.evidence_id,
        trial_id: e.trial_id,
        required_artefact: e.required_artefact,
        artefact_location_hint: e.artefact_location_hint,
        location_verification: e.location_verification,
        recoverable_child_count_estimate: e.recoverable_child_count_estimate,
        recovery_phase: e.recovery_phase,
      })),
  };
}

export function checkInvariants(collections) {
  const errors = [];
  const rejections = [];

  const sourceById = new Map(collections.data_sources.map((r) => [r.source_id, r]));
  const experimentById = new Map(collections.experiments.map((r) => [r.experiment_id, r]));

  // Which experiments/families are terminally closed, from their results.
  const closedExperiments = new Set();
  const closedFamilies = new Set();
  for (const res of collections.results) {
    if (TERMINAL_PARENT_STATES.has(res.closure_status) || TERMINAL_VERDICTS.has(res.verdict)) {
      closedExperiments.add(res.experiment_id);
      const exp = experimentById.get(res.experiment_id);
      if (exp) closedFamilies.add(exp.family_id);
    }
  }

  // INV-01 / INV-02 — time-namespace separation.
  for (const exp of collections.experiments) {
    const label = `experiment[${exp.experiment_id}]`;
    const groups = [
      ['decision_time_fields', 'dt.'],
      ['execution_time_fields', 'ex.'],
      ['outcome_time_fields', 'oc.'],
    ];
    for (const [field, prefix] of groups) {
      for (const name of exp[field]) {
        if (!name.startsWith(prefix)) {
          errors.push(`INV-01 ${label}.${field}: '${name}' must start with '${prefix}'`);
        }
      }
    }
    const dt = new Set(exp.decision_time_fields);
    const ex = new Set(exp.execution_time_fields);
    const oc = new Set(exp.outcome_time_fields);
    for (const name of dt) {
      if (ex.has(name) || oc.has(name)) errors.push(`INV-02 ${label}: '${name}' appears in more than one time namespace`);
    }
    for (const name of ex) {
      if (oc.has(name)) errors.push(`INV-02 ${label}: '${name}' appears in more than one time namespace`);
    }
    const decisionInputs = exp.frozen_rule?.decision_inputs;
    if (Array.isArray(decisionInputs)) {
      for (const name of decisionInputs) {
        if (typeof name !== 'string') continue;
        if (name.startsWith('ex.') || name.startsWith('oc.')) {
          errors.push(`INV-02 ${label}.frozen_rule.decision_inputs: '${name}' is not readable at decision time`);
        }
      }
    }

    // INV-04 — provenance: referenced sources must exist.
    for (const sid of exp.data_source_ids) {
      if (!sourceById.has(sid)) {
        errors.push(`INV-04 ${label}.data_source_ids: unknown data_source '${sid}'`);
      }
    }
  }

  // INV-04 — results must attach to a known experiment.
  for (const res of collections.results) {
    if (!experimentById.has(res.experiment_id)) {
      errors.push(`INV-04 result[${res.result_id}]: unknown experiment '${res.experiment_id}'`);
    }
  }

  // INV-05 — secondary evidence must name the raw source that outranks it.
  const rawByEvidenceType = new Map();
  for (const src of collections.data_sources) {
    if (src.evidence_grade === 'RAW_PRIMARY' && src.verification_status !== 'MISSING') {
      if (!rawByEvidenceType.has(src.evidence_type)) rawByEvidenceType.set(src.evidence_type, []);
      rawByEvidenceType.get(src.evidence_type).push(src.source_id);
    }
  }
  for (const src of collections.data_sources) {
    const secondary = src.evidence_grade === 'SECONDARY_DOC' || src.evidence_grade === 'SECONDARY_CHAT';
    if (!secondary) continue;
    if (rawByEvidenceType.has(src.evidence_type) && !nonEmpty(src.superseded_by_raw_source_id)) {
      errors.push(
        `INV-05 data_source[${src.source_id}]: secondary evidence for ${src.evidence_type} must name superseded_by_raw_source_id`,
      );
    }
  }

  // INV-06 — no promotion.
  for (const res of collections.results) {
    if (res.verdict !== 'ADMITTED_RESEARCH_ONLY') continue;
    const gates = Object.entries(res.gates ?? {});
    const allPass = gates.length > 0 && gates.every(([, v]) => v === 'PASS');
    if (!allPass || !nonEmpty(res.validator_id)) {
      errors.push(
        `INV-06 result[${res.result_id}]: ADMITTED_RESEARCH_ONLY requires every declared gate PASS and a validator_id`,
      );
    }
  }

  // INV-03 — a variant of a rejected/quarantined parent needs full linkage.
  const keptEdges = [];
  for (const edge of collections.lineage_edges) {
    if (edge.edge_kind !== 'STRUCTURAL_VARIANT_OF') {
      keptEdges.push(edge);
      continue;
    }
    const parentClosed = closedExperiments.has(edge.from_id) || closedFamilies.has(edge.from_id);
    const linked =
      nonEmpty(edge.structural_difference) && nonEmpty(edge.new_task_id) && nonEmpty(edge.new_model_identity);

    if (parentClosed && !linked) {
      rejections.push({
        record_type: 'lineage_edge',
        id: edge.edge_id,
        reason: 'UNLINKED_REJECTED_FAMILY_VARIANT',
        detail:
          `'${edge.to_id}' is proposed as a structural variant of the closed family member '${edge.from_id}' ` +
          'without a structural_difference, a new_task_id, and a new_model_identity. It is refused.',
      });
      continue;
    }
    if (edge.permitted === false) {
      rejections.push({
        record_type: 'lineage_edge',
        id: edge.edge_id,
        reason: 'EXPLICITLY_NOT_PERMITTED',
        detail: `Edge is recorded with permitted=false: ${edge.justification}`,
      });
      continue;
    }
    if (parentClosed && linked && edge.permitted !== true) {
      rejections.push({
        record_type: 'lineage_edge',
        id: edge.edge_id,
        reason: 'PERMISSION_NOT_RECORDED',
        detail: 'A variant of a closed family must record permitted=true explicitly.',
      });
      continue;
    }
    keptEdges.push(edge);
  }

  return { errors, rejections, keptEdges, closedExperiments, closedFamilies };
}

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export function computeCoverage(schema, dataSources) {
  const byType = {};
  for (const evidenceType of schema.enums.evidence_type) {
    byType[evidenceType] = {
      total: 0,
      raw_primary_available: 0,
      missing: 0,
      verified_read_only: 0,
      documented_unverified: 0,
      source_ids: [],
    };
  }
  for (const src of dataSources) {
    const bucket = byType[src.evidence_type];
    if (!bucket) continue;
    bucket.total += 1;
    bucket.source_ids.push(src.source_id);
    if (src.verification_status === 'MISSING') bucket.missing += 1;
    if (src.verification_status === 'VERIFIED_READ_ONLY') bucket.verified_read_only += 1;
    if (src.verification_status === 'DOCUMENTED_UNVERIFIED') bucket.documented_unverified += 1;
    if (src.evidence_grade === 'RAW_PRIMARY' && src.verification_status !== 'MISSING') {
      bucket.raw_primary_available += 1;
    }
  }
  const uncovered = Object.entries(byType)
    .filter(([, v]) => v.raw_primary_available === 0)
    .map(([k]) => k);
  return { by_evidence_type: byType, evidence_types_without_raw_primary: uncovered };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const COLLECTION_OF = {
  data_source: 'data_sources',
  experiment: 'experiments',
  result: 'results',
  trial_ledger_entry: 'trial_ledger_entries',
  trial_evidence: 'trial_evidence',
  failure_route: 'failure_routes',
  lesson_link: 'lesson_links',
  lineage_edge: 'lineage_edges',
};

export function emptyCollections() {
  return {
    data_sources: [],
    experiments: [],
    results: [],
    trial_ledger_entries: [],
    trial_evidence: [],
    failure_routes: [],
    lesson_links: [],
    lineage_edges: [],
  };
}

/**
 * Builds a catalogue from already-loaded manifests. Pure: no I/O, no clock.
 * @param {object} schema
 * @param {Array<{path:string, manifest:object}>} manifests
 */
export function buildCatalog(schema, manifests, options = {}) {
  const collections = emptyCollections();
  const errors = [];
  const rejections = [];
  const seenKeys = new Map();
  const manifestSummaries = [];

  for (const { path: manifestPath, manifest } of manifests) {
    if (manifest.schema_version && manifest.schema_version !== schema.schema_version) {
      errors.push(
        `manifest ${manifestPath}: schema_version '${manifest.schema_version}' != schema '${schema.schema_version}'`,
      );
    }
    if (manifest.promising_count !== undefined && manifest.promising_count !== 0) {
      errors.push(`manifest ${manifestPath}: promising_count must be 0, got ${manifest.promising_count}`);
    }
    const counts = {};
    for (const [recordType, collection] of Object.entries(COLLECTION_OF)) {
      const rows = manifest[collection];
      if (rows === undefined) continue;
      if (!Array.isArray(rows)) {
        errors.push(`manifest ${manifestPath}: '${collection}' must be an array`);
        continue;
      }
      counts[collection] = rows.length;
      const def = schema.record_types[recordType];
      for (const row of rows) {
        const rowErrors = validateRecord(schema, recordType, row);
        if (rowErrors.length > 0) {
          errors.push(...rowErrors.map((e) => `${manifestPath}: ${e}`));
          rejections.push({
            record_type: recordType,
            id: row?.[def.key] ?? '<no-key>',
            reason: 'SCHEMA_INVALID',
            detail: rowErrors[0],
          });
          continue;
        }
        const key = `${recordType}:${row[def.key]}`;
        if (seenKeys.has(key)) {
          errors.push(`${manifestPath}: duplicate ${key} (first seen in ${seenKeys.get(key)})`);
          rejections.push({ record_type: recordType, id: row[def.key], reason: 'DUPLICATE_KEY', detail: key });
          continue;
        }
        seenKeys.set(key, manifestPath);
        // Verbatim copy. Provenance fields are never rewritten (INV-04).
        collections[collection].push({ ...row });
      }
    }
    manifestSummaries.push({ path: manifestPath, manifest_id: manifest.manifest_id ?? null, counts });
  }

  const inv = checkInvariants(collections);
  errors.push(...inv.errors);
  rejections.push(...inv.rejections);
  collections.lineage_edges = inv.keptEdges;

  const ledger = checkTrialLedger(collections);
  errors.push(...ledger.errors);
  rejections.push(...ledger.rejections);
  collections.trial_ledger_entries = ledger.keptEntries;

  const coverage = computeCoverage(schema, collections.data_sources);

  const blockingGaps = collections.failure_routes
    .filter((fr) => fr.blocking_data_gap_id)
    .slice()
    .sort((a, b) => a.priority - b.priority || (a.failure_route_id < b.failure_route_id ? -1 : 1))
    .map((fr) => ({
      failure_route_id: fr.failure_route_id,
      family_id: fr.family_id,
      priority: fr.priority,
      blocking_data_gap_id: fr.blocking_data_gap_id,
      route: fr.route,
      allowed_successor: fr.allowed_successor,
    }));

  return {
    catalog_schema_version: schema.schema_version,
    builder_version: CATALOG_BUILDER_VERSION,
    task_id: 'TASK-021-BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0',
    mode: options.mode ?? 'unspecified',
    deterministic: true,
    promising_count: 0,
    manifests: manifestSummaries,
    counts: Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, v.length])),
    coverage,
    trial_ledger: summarizeTrialLedger(collections.trial_ledger_entries, ledger.perExperiment, collections.trial_evidence),
    trial_conservation_by_experiment: ledger.perExperiment,
    blocking_gaps_by_priority: blockingGaps,
    records: collections,
    rejected_records: rejections,
    errors,
    valid: errors.length === 0,
  };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function catalogToCsv(schema, catalog) {
  const cols = schema.csv_columns;
  const rows = [cols.join(',')];
  const push = (r) => rows.push(cols.map((c) => csvCell(r[c])).join(','));

  for (const s of catalog.records.data_sources) {
    push({
      record_type: 'data_source',
      id: s.source_id,
      family_id: '',
      title_or_mechanism: s.title,
      type_or_segment: s.evidence_type,
      verdict_or_status: s.read_only_status,
      evidence_grade: s.evidence_grade,
      verification_status: s.verification_status,
      fixture_flag: s.fixture_flag,
      retained_or_evidence_path: s.retained_path,
      source_of_record: s.source_of_record,
    });
  }
  for (const e of catalog.records.experiments) {
    push({
      record_type: 'experiment',
      id: e.experiment_id,
      family_id: e.family_id,
      title_or_mechanism: e.title,
      type_or_segment: e.timeframes.join('|'),
      verdict_or_status: e.lifecycle_state,
      evidence_grade: e.evidence_grade,
      verification_status: '',
      fixture_flag: e.fixture_flag,
      retained_or_evidence_path: e.evidence_paths.join('|'),
      source_of_record: e.source_of_record,
    });
  }
  for (const r of catalog.records.results) {
    push({
      record_type: 'result',
      id: r.result_id,
      family_id: r.experiment_id,
      title_or_mechanism: `${r.axis_L}/${r.axis_X}`,
      type_or_segment: r.segment,
      verdict_or_status: r.verdict,
      evidence_grade: r.evidence_grade,
      verification_status: r.closure_status,
      fixture_flag: r.fixture_flag,
      retained_or_evidence_path: r.evidence_paths.join('|'),
      source_of_record: r.source_of_record,
    });
  }
  for (const t of catalog.records.trial_ledger_entries) {
    push({
      record_type: 'trial_ledger_entry',
      id: t.trial_id,
      family_id: t.family_id,
      title_or_mechanism: `${t.parent_experiment_id} ${t.kind} x${t.exact_trial_count}${t.counts_toward_lower_bound ? '' : ' (not counted)'}`,
      type_or_segment: t.split,
      verdict_or_status: t.representation,
      evidence_grade: t.evidence_grade,
      verification_status: t.verification_grade,
      fixture_flag: t.fixture_flag,
      retained_or_evidence_path: t.evidence_path,
      source_of_record: t.source_of_record,
    });
  }
  for (const e of catalog.records.trial_evidence) {
    push({
      record_type: 'trial_evidence',
      id: e.evidence_id,
      family_id: e.trial_id,
      title_or_mechanism: e.required_artefact,
      type_or_segment: e.recovery_phase,
      verdict_or_status:
        e.recoverable_child_count_estimate === null ? 'UNKNOWN_CHILD_COUNT' : `CHILDREN_${e.recoverable_child_count_estimate}`,
      evidence_grade: '',
      verification_status: e.location_verification,
      fixture_flag: e.fixture_flag,
      retained_or_evidence_path: e.artefact_location_hint,
      source_of_record: e.source_of_record,
    });
  }
  for (const f of catalog.records.failure_routes) {
    push({
      record_type: 'failure_route',
      id: f.failure_route_id,
      family_id: f.family_id,
      title_or_mechanism: f.failure_mechanism,
      type_or_segment: `priority_${f.priority}`,
      verdict_or_status: f.route,
      evidence_grade: '',
      verification_status: '',
      fixture_flag: false,
      retained_or_evidence_path: f.blocking_data_gap_id ?? '',
      source_of_record: f.source_of_record,
    });
  }
  for (const l of catalog.records.lesson_links) {
    push({
      record_type: 'lesson_link',
      id: l.lesson_link_id,
      family_id: l.family_id ?? '',
      title_or_mechanism: `${l.lesson_id} ${l.lesson_title}`,
      type_or_segment: l.relation,
      verdict_or_status: l.ledger_verification,
      evidence_grade: '',
      verification_status: l.ledger_verification,
      fixture_flag: false,
      retained_or_evidence_path: l.ledger_path,
      source_of_record: l.source_of_record,
    });
  }
  for (const g of catalog.records.lineage_edges) {
    push({
      record_type: 'lineage_edge',
      id: g.edge_id,
      family_id: g.from_id,
      title_or_mechanism: g.justification,
      type_or_segment: g.edge_kind,
      verdict_or_status: g.permitted ? 'PERMITTED' : 'NOT_PERMITTED',
      evidence_grade: '',
      verification_status: '',
      fixture_flag: false,
      retained_or_evidence_path: g.to_id,
      source_of_record: g.source_of_record,
    });
  }
  return rows.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const opts = { roots: [], manifests: [], schema: DEFAULT_SCHEMA_PATH, out: null, csv: null, json: false, smoke: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return v;
    };
    switch (arg) {
      case '--input-root': opts.roots.push(next()); break;
      case '--manifest': opts.manifests.push(next()); break;
      case '--schema': opts.schema = next(); break;
      case '--out': opts.out = next(); break;
      case '--csv': opts.csv = next(); break;
      case '--json': opts.json = true; break;
      case '--smoke': opts.smoke = true; break;
      case '--help':
      case '-h': opts.help = true; break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (opts.smoke === null) opts.smoke = opts.roots.length === 0 && opts.manifests.length === 0;
  return opts;
}

const USAGE = `build_research_warehouse_catalog.mjs — read-only Botalin research warehouse catalogue builder

Usage:
  node scripts/analysis/build_research_warehouse_catalog.mjs [options]

Options:
  --input-root <dir>   Explicit root to scan for *.json manifests (repeatable, max depth ${MAX_SCAN_DEPTH}).
  --manifest <file>    Explicit manifest file (repeatable).
  --schema <file>      Schema file. Default: data/research_warehouse_catalog_schema_2026-08-02.json
  --out <file>         Write the catalogue JSON here. Without it, nothing is written.
  --csv <file>         Write the flat CSV here. Without it, nothing is written.
  --json               Print the full catalogue to stdout instead of a summary.
  --smoke              Force smoke mode (committed synthetic/seed fixture, zero writes).
  -h, --help           This text.

With no --input-root and no --manifest the tool runs in smoke mode: it loads the committed
seed fixture, validates it, and writes nothing. Home directories and the filesystem root are
never scannable. Secrets, keys and env files are never opened.`;

function summarize(catalog) {
  const lines = [];
  lines.push(`mode=${catalog.mode} schema=${catalog.catalog_schema_version} builder=${catalog.builder_version}`);
  lines.push(`promising_count=${catalog.promising_count}`);
  lines.push('counts: ' + Object.entries(catalog.counts).map(([k, v]) => `${k}=${v}`).join(' '));
  const uncovered = catalog.coverage.evidence_types_without_raw_primary;
  lines.push(`evidence types with no available RAW_PRIMARY source (${uncovered.length}): ${uncovered.join(', ') || 'none'}`);
  const t = catalog.trial_ledger;
  lines.push(
    `trial ledger: lower bound ${t.lower_bound_trials} trials = ` +
      `${t.individual_trials} individually recorded (${t.individual_entries} entries) + ` +
      `${t.aggregate_only_trials} aggregate-only (${t.aggregate_only_entries} entries); ` +
      `${t.non_counting_entries} non-counting attack/replay entries`,
  );
  lines.push(
    `trial conservation: ${t.experiments_conserved}/${t.experiments_total} experiments; ` +
      `${t.entries_pending_reconciliation} entries pending reconciliation; ` +
      `${t.missing_evidence_sources.length} missing-evidence sources named`,
  );
  lines.push(`rejected records: ${catalog.rejected_records.length}`);
  for (const r of catalog.rejected_records) lines.push(`  REJECTED ${r.record_type}[${r.id}] ${r.reason}: ${r.detail}`);
  lines.push(`errors: ${catalog.errors.length}`);
  for (const e of catalog.errors.slice(0, 40)) lines.push(`  ERROR ${e}`);
  if (catalog.errors.length > 40) lines.push(`  ... ${catalog.errors.length - 40} more`);
  const top = catalog.blocking_gaps_by_priority[0];
  if (top) {
    lines.push(
      `highest-priority blocking data gap: ${top.blocking_data_gap_id} ` +
        `(route ${top.failure_route_id}, family ${top.family_id}, priority ${top.priority})`,
    );
  }
  return lines.join('\n');
}

export function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${USAGE}\n`);
    return 64;
  }
  if (opts.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const schema = loadSchema(opts.schema);
  const manifestPaths = [];
  let mode;

  if (opts.smoke) {
    mode = 'smoke';
    manifestPaths.push(DEFAULT_FIXTURE_PATH);
    if (opts.out || opts.csv) {
      process.stderr.write('REFUSED: smoke mode performs no filesystem write (INV-08). Drop --out/--csv or pass --input-root.\n');
      return 65;
    }
  } else {
    mode = 'explicit_roots';
    for (const root of opts.roots) {
      const safe = assertSafeRoot(root);
      manifestPaths.push(...collectManifestPaths(safe));
    }
    for (const m of opts.manifests) manifestPaths.push(resolve(m));
  }

  const uniquePaths = [...new Set(manifestPaths)].sort();
  const manifests = [];
  for (const p of uniquePaths) {
    try {
      manifests.push(readManifestFile(p));
    } catch (err) {
      process.stderr.write(`SKIPPED ${p}: ${err.message}\n`);
    }
  }

  const catalog = buildCatalog(schema, manifests, { mode });

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
  } else {
    process.stdout.write(`${summarize(catalog)}\n`);
  }

  if (opts.out) {
    const outPath = resolve(opts.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
    process.stdout.write(`wrote ${outPath}\n`);
  }
  if (opts.csv) {
    const csvPath = resolve(opts.csv);
    mkdirSync(dirname(csvPath), { recursive: true });
    writeFileSync(csvPath, catalogToCsv(schema, catalog), 'utf8');
    process.stdout.write(`wrote ${csvPath}\n`);
  }

  return catalog.valid ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
