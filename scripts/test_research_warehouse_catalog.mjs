#!/usr/bin/env node
// test_research_warehouse_catalog.mjs
//
// TASK-021-BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0
//
// Deterministic test suite for the research warehouse foundation. It also carries the two
// ship-blocking audits the task requires:
//
//   STATIC SCAN     - proves the shipped programs contain no network, credential, exchange,
//                     process, service, or unguarded runtime-write path.
//   LESSONS CHECKER - proves every terminally-failed family carries a lesson link and that
//                     every lesson this task declares relevant is present in the catalogue.
//
// Run:  node scripts/test_research_warehouse_catalog.mjs
// Exit: 0 all passed, 1 otherwise.

import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';

import {
  loadSchema,
  validateRecord,
  buildCatalog,
  checkInvariants,
  checkTrialLedger,
  checkLawCatalogue,
  summarizeTrialLedger,
  computeCoverage,
  catalogToCsv,
  assertSafeRoot,
  looksLikeSecretPath,
  collectManifestPaths,
  readManifestFile,
  emptyCollections,
  parseArgs as buildParseArgs,
  main as buildMain,
  DEFAULT_FIXTURE_PATH,
  DEFAULT_SCHEMA_PATH,
} from './analysis/build_research_warehouse_catalog.mjs';

import {
  runQuery,
  loadCatalog,
  parseArgs as queryParseArgs,
} from './analysis/query_research_warehouse_catalog.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const BUILDER_PATH = join(HERE, 'analysis', 'build_research_warehouse_catalog.mjs');
const QUERY_PATH = join(HERE, 'analysis', 'query_research_warehouse_catalog.mjs');
const TEST_PATH = join(HERE, 'test_research_warehouse_catalog.mjs');
const DATA_DIR = join(REPO_ROOT, 'data');

// The lessons TASK-021 declares relevant. The checker requires all of them to be linked.
const REQUIRED_LESSONS = [
  'LESSON-003',
  'LESSON-005',
  'LESSON-011',
  'LESSON-013',
  'LESSON-016',
  'LESSON-017',
  'LESSON-019',
  'LESSON-021',
];

// ---------------------------------------------------------------------------
// Audited scan-exempt region
//
// The static scan necessarily names the tokens it forbids, and some negative tests need
// literals that the scan would otherwise flag. All of that lives between the two sentinels
// below, which scannableSource() excises before scanning. Nothing outside the sentinels — in
// any scanned file — may contain any of these tokens. This is the single audited exemption.
// ---------------------------------------------------------------------------

/* static-scan:allow-denylist-start */
const FORBIDDEN_TOKENS = {
  network: [
    'fetch(', 'XMLHttpRequest', 'WebSocket', 'http.request', 'https.request',
    'net.connect', 'net.Socket', 'tls.connect', 'dns.', 'dgram',
    'axios', 'node-fetch', 'undici', 'got(',
  ],
  process_service: [
    'child_process', 'spawnSync', 'spawn(', 'execSync', 'execFile', 'exec(',
    'systemctl', 'sudo ', 'pm2 ', 'docker ', 'process.kill', 'process.binding',
    'eval(', 'new Function(',
  ],
  credential: [
    'process.env', 'apiKey', 'api_key', 'apikey', 'Authorization', 'Bearer ',
    'createHmac', 'privateKey', 'PRIVATE KEY', 'id_rsa', '.pem', 'accessToken',
    'client_secret', 'passphrase',
  ],
  exchange_account: [
    'api.bybit', 'api.binance', 'api.hyperliquid', 'okx.com', 'bybit.com', 'binance.com',
    '/v5/order', '/v5/position', '/api/v3/order', '/fapi/', 'createOrder', 'cancelOrder',
    'placeOrder', 'reduceOnly', 'set_leverage', 'walletBalance', '/account',
  ],
  runtime_state: ['/opt/botalin', '/etc/botalin', 'RESET_TS', 'coordinator', 'approval'],
  filesystem_mutation: [
    'appendFileSync', 'appendFile(', 'rmSync', 'rmdirSync', 'unlinkSync', 'renameSync',
    'truncateSync', 'createWriteStream', 'chmodSync', 'chownSync', 'copyFileSync',
    'symlinkSync', 'utimesSync', 'writeSync(',
  ],
};

const NONZERO_PROMISING_COUNT = /promising_count\s*[:=]\s*[1-9]/;

// Negative-test literals.
const SECRET_PATH_SAMPLES = ['/a/.env', '/a/prod.env', '/a/id_rsa', '/a/x.pem', '/a/x.key', '/a/my_secret.json', '/a/api_key.json'];
const SECRET_ROOT_SAMPLES = ['botalin.env', 'id_rsa'];
const SECRET_MANIFEST_SAMPLE = '/tmp/botalin.env';
const NONZERO_PROMISING_COUNT_SAMPLE = 1;
/* static-scan:allow-denylist-end */

// ---------------------------------------------------------------------------
// Tiny harness
// ---------------------------------------------------------------------------

const results = [];
let currentSection = 'general';

function section(name) {
  currentSection = name;
}

function test(name, fn) {
  try {
    fn();
    results.push({ section: currentSection, name, ok: true });
  } catch (err) {
    results.push({ section: currentSection, name, ok: false, error: err.message });
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function assertThrows(fn, matcher, message) {
  let threw = false;
  let actual = '';
  try {
    fn();
  } catch (err) {
    threw = true;
    actual = err.message;
  }
  assert(threw, `${message}: expected a throw, got none`);
  if (matcher) assert(actual.includes(matcher), `${message}: expected message containing '${matcher}', got '${actual}'`);
}

function captureStdout(fn) {
  const original = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  let out = '';
  process.stdout.write = (chunk) => { out += chunk; return true; };
  process.stderr.write = (chunk) => { out += chunk; return true; };
  try {
    const value = fn();
    return { value, out };
  } finally {
    process.stdout.write = original;
    process.stderr.write = originalErr;
  }
}

function snapshotTree(dir) {
  const entries = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      const st = statSync(full);
      entries.push(`${full}:${st.size}:${st.mtimeMs}`);
    }
  };
  walk(dir);
  return entries.join('\n');
}

// ---------------------------------------------------------------------------
// Fixtures for the negative cases
// ---------------------------------------------------------------------------

const schema = loadSchema(DEFAULT_SCHEMA_PATH);
const seed = readManifestFile(DEFAULT_FIXTURE_PATH);

function baseExperiment(overrides = {}) {
  return {
    record_type: 'experiment',
    experiment_id: 'EXP.TEST_BASE',
    family_id: 'FAM.TEST',
    title: 'Test experiment',
    model_family: 'TEST',
    mechanism_tags: ['test'],
    data_source_ids: ['FIXTURE.SYNTH.BARS'],
    timeframes: ['1h'],
    universe: ['SYNTHUSDT'],
    frozen_rule: { frozen: true, entry: 'x', exit: 'y', decision_inputs: ['dt.a'] },
    decision_time_fields: ['dt.a'],
    execution_time_fields: ['ex.b'],
    outcome_time_fields: ['oc.c'],
    costs: { fees: true, spread: true, slippage: true, funding: true },
    lifecycle_state: 'DISCOVERY',
    commit_id: null,
    branch: null,
    evidence_paths: [],
    evidence_grade: 'SYNTHETIC_FIXTURE',
    fixture_flag: true,
    source_of_record: 'test fixture',
    ...overrides,
  };
}

function baseSource(overrides = {}) {
  return {
    record_type: 'data_source',
    source_id: 'FIXTURE.SYNTH.BARS',
    title: 'Synthetic bars',
    evidence_type: 'BARS',
    owner_system: 'test',
    host_scope: 'SYNTHETIC',
    retained_path: 'SYNTHETIC:in_manifest',
    path_kind: 'NOT_APPLICABLE',
    run_id: null,
    time_span_start: null,
    time_span_end: null,
    symbols: ['SYNTHUSDT'],
    timeframes: ['1h'],
    schema_fingerprint: 'synthetic',
    write_ownership: 'WAREHOUSE_SYNTHETIC',
    read_only_status: 'READ_ONLY',
    verification_status: 'VERIFIED_READ_ONLY',
    evidence_grade: 'SYNTHETIC_FIXTURE',
    fixture_flag: true,
    source_of_record: 'test fixture',
    ...overrides,
  };
}

function baseResult(overrides = {}) {
  return {
    record_type: 'result',
    result_id: 'RES.TEST',
    experiment_id: 'EXP.TEST_BASE',
    segment: 'TRAIN',
    axis_L: 'L0',
    axis_X: 'X0',
    gates: { G0: 'PASS' },
    verdict: 'HYPOTHESIS_ONLY',
    metrics_net_of_cost: {},
    n_events: 1,
    n_symbols: 1,
    n_blocks: 1,
    validator_id: null,
    validator_run_hash: null,
    overlap_status: 'NOT_MEASURED',
    closure_status: 'OPEN',
    observed_at: null,
    evidence_paths: [],
    evidence_grade: 'SYNTHETIC_FIXTURE',
    fixture_flag: true,
    source_of_record: 'test fixture',
    ...overrides,
  };
}

function collectionsFrom({ sources = [], experiments = [], results: res = [], edges = [], trials = [], evidence = [] }) {
  const c = emptyCollections();
  c.data_sources = sources;
  c.experiments = experiments;
  c.results = res;
  c.lineage_edges = edges;
  c.trial_ledger_entries = trials;
  c.trial_evidence = evidence;
  return c;
}

function baseTrial(overrides = {}) {
  return {
    record_type: 'trial_ledger_entry',
    trial_id: 'TL.TEST',
    parent_experiment_id: 'EXP.TEST_BASE',
    family_id: 'FAM.TEST',
    mechanism_tags: ['test'],
    kind: 'HYPOTHESIS',
    representation: 'INDIVIDUAL',
    exact_trial_count: 1,
    dedup_key: 'test|base|1',
    counts_toward_lower_bound: true,
    member_of_aggregate_trial_id: null,
    attacks_trial_id: null,
    evidence_path: 'BOTALIN_STRATEGY_STATUS_INVENTORY_2026-07-29.md#1',
    verification_grade: 'DOCUMENTED_UNVERIFIED',
    evidence_grade: 'SECONDARY_DOC',
    parameter_fingerprint: null,
    split: 'TRAIN',
    cost_model_applied: true,
    verdict: null,
    failure_route: null,
    reconciliation_status: 'RECONCILED',
    missing_child_evidence_id: null,
    fixture_flag: false,
    source_of_record: 'test fixture',
    ...overrides,
  };
}

function baseTrialEvidence(overrides = {}) {
  return {
    record_type: 'trial_evidence',
    evidence_id: 'TE.TEST',
    trial_id: 'TL.TEST',
    required_artefact: 'the per-variant rows behind this batch',
    artefact_location_hint: '/opt/example/output/',
    location_verification: 'MISSING',
    recoverable_child_count_estimate: null,
    recovery_phase: 'GO-WAREHOUSE-0B-RECONCILE',
    blocking_reason: 'the child rows were never mirrored into this repository',
    fixture_flag: false,
    source_of_record: 'test fixture',
    ...overrides,
  };
}

/** Builds a one-experiment world whose declared count matches the supplied trials. */
function ledgerWorld(trials, { declared, evidence = [] } = {}) {
  const counting = trials.filter((t) => t.counts_toward_lower_bound);
  const sum = counting.reduce((a, t) => a + t.exact_trial_count, 0);
  return collectionsFrom({
    sources: [baseSource()],
    experiments: [baseExperiment({ prior_trials_seeded: declared ?? sum })],
    trials,
    evidence,
  });
}

// ---------------------------------------------------------------------------
// 1. Schema validation
// ---------------------------------------------------------------------------

section('schema validation');

test('a well-formed experiment validates', () => {
  assert(validateRecord(schema, 'experiment', baseExperiment()).length === 0, 'expected no errors');
});

test('a missing required field is reported', () => {
  const rec = baseExperiment();
  delete rec.lifecycle_state;
  const errs = validateRecord(schema, 'experiment', rec);
  assert(errs.some((e) => e.includes('lifecycle_state') && e.includes('missing')), `got ${JSON.stringify(errs)}`);
});

test('the schema is closed: an unknown field is rejected', () => {
  const errs = validateRecord(schema, 'experiment', baseExperiment({ sneaky_extra: 1 }));
  assert(errs.some((e) => e.includes('sneaky_extra') && e.includes('unknown field')), `got ${JSON.stringify(errs)}`);
});

test('an out-of-enum value is rejected', () => {
  const errs = validateRecord(schema, 'result', baseResult({ verdict: 'PROFITABLE' }));
  assert(errs.some((e) => e.includes('not in enum verdict')), `got ${JSON.stringify(errs)}`);
});

test('there is no verdict meaning profitable or live-ready', () => {
  const banned = ['PROFITABLE', 'LIVE_READY', 'PROVEN', 'APPROVED', 'PROMOTED'];
  for (const b of banned) assert(!schema.enums.verdict.includes(b), `verdict enum must not contain ${b}`);
});

test('an id violating the key pattern is rejected', () => {
  const errs = validateRecord(schema, 'experiment', baseExperiment({ experiment_id: 'lower case id' }));
  assert(errs.some((e) => e.includes('does not match')), `got ${JSON.stringify(errs)}`);
});

test('a malformed timestamp is rejected', () => {
  const errs = validateRecord(schema, 'result', baseResult({ observed_at: '2026-08-02' }));
  assert(errs.some((e) => e.includes('ISO-8601')), `got ${JSON.stringify(errs)}`);
});

test('a null in a non-nullable field is rejected', () => {
  const errs = validateRecord(schema, 'experiment', baseExperiment({ title: null }));
  assert(errs.some((e) => e.includes('null not allowed')), `got ${JSON.stringify(errs)}`);
});

test('a bad gate status is rejected', () => {
  const errs = validateRecord(schema, 'result', baseResult({ gates: { G0: 'MAYBE' } }));
  assert(errs.some((e) => e.includes('not in gate_status')), `got ${JSON.stringify(errs)}`);
});

test('a lesson_id not matching LESSON-NNN is rejected', () => {
  const link = {
    record_type: 'lesson_link',
    lesson_link_id: 'LL.TEST',
    lesson_id: 'LESSON-3',
    lesson_title: 'x y z',
    experiment_id: null,
    family_id: null,
    relation: 'CREATED_BY',
    ledger_path: '/x/y.md',
    ledger_verification: 'UNKNOWN',
    source_of_record: 'test fixture',
  };
  assert(validateRecord(schema, 'lesson_link', link).some((e) => e.includes('does not match')), 'expected pattern error');
});

test('the committed seed fixture validates with zero errors', () => {
  const catalog = buildCatalog(schema, [seed], { mode: 'test' });
  assert(catalog.errors.length === 0, `seed has errors: ${JSON.stringify(catalog.errors.slice(0, 5))}`);
  assert(catalog.valid === true, 'seed catalog must be valid');
});

test('a manifest declaring promising_count != 0 is an error', () => {
  const bad = {
    path: 'synthetic',
    manifest: { schema_version: schema.schema_version, promising_count: NONZERO_PROMISING_COUNT_SAMPLE },
  };
  const catalog = buildCatalog(schema, [bad], { mode: 'test' });
  assert(catalog.errors.some((e) => e.includes('promising_count must be 0')), 'expected promising_count error');
});

test('the built catalogue always reports promising_count = 0', () => {
  const catalog = buildCatalog(schema, [seed], { mode: 'test' });
  assert(catalog.promising_count === 0, 'promising_count must be 0');
});

// ---------------------------------------------------------------------------
// 2. Provenance preservation
// ---------------------------------------------------------------------------

section('provenance preservation');

test('retained_path and source_of_record survive the build verbatim', () => {
  const catalog = buildCatalog(schema, [seed], { mode: 'test' });
  for (const original of seed.manifest.data_sources) {
    const built = catalog.records.data_sources.find((s) => s.source_id === original.source_id);
    assert(built, `source ${original.source_id} missing from catalogue`);
    assert(built.retained_path === original.retained_path, `retained_path rewritten for ${original.source_id}`);
    assert(built.source_of_record === original.source_of_record, `source_of_record rewritten for ${original.source_id}`);
    assert(built.schema_fingerprint === original.schema_fingerprint, `fingerprint rewritten for ${original.source_id}`);
  }
});

test('evidence_paths survive the build verbatim', () => {
  const catalog = buildCatalog(schema, [seed], { mode: 'test' });
  for (const original of seed.manifest.results) {
    const built = catalog.records.results.find((r) => r.result_id === original.result_id);
    assert(built, `result ${original.result_id} missing`);
    assert(
      JSON.stringify(built.evidence_paths) === JSON.stringify(original.evidence_paths),
      `evidence_paths rewritten for ${original.result_id}`,
    );
  }
});

test('an experiment referencing an unknown data source is an INV-04 error', () => {
  const c = collectionsFrom({
    sources: [baseSource()],
    experiments: [baseExperiment({ data_source_ids: ['NO.SUCH.SOURCE'] })],
  });
  const { errors } = checkInvariants(c);
  assert(errors.some((e) => e.startsWith('INV-04') && e.includes('NO.SUCH.SOURCE')), `got ${JSON.stringify(errors)}`);
});

test('a result referencing an unknown experiment is an INV-04 error', () => {
  const c = collectionsFrom({ sources: [baseSource()], results: [baseResult({ experiment_id: 'EXP.GHOST' })] });
  const { errors } = checkInvariants(c);
  assert(errors.some((e) => e.startsWith('INV-04') && e.includes('EXP.GHOST')), `got ${JSON.stringify(errors)}`);
});

test('secondary evidence must name the raw source that outranks it (INV-05)', () => {
  const raw = baseSource({
    source_id: 'RAW.NEWS',
    evidence_type: 'NEWS',
    evidence_grade: 'RAW_PRIMARY',
    verification_status: 'VERIFIED_READ_ONLY',
  });
  const secondary = baseSource({
    source_id: 'DOC.NEWS.SUMMARY',
    evidence_type: 'NEWS',
    evidence_grade: 'SECONDARY_DOC',
  });
  const { errors } = checkInvariants(collectionsFrom({ sources: [raw, secondary] }));
  assert(errors.some((e) => e.startsWith('INV-05')), `expected INV-05, got ${JSON.stringify(errors)}`);

  const fixed = { ...secondary, superseded_by_raw_source_id: 'RAW.NEWS' };
  const after = checkInvariants(collectionsFrom({ sources: [raw, fixed] }));
  assert(!after.errors.some((e) => e.startsWith('INV-05')), 'INV-05 should clear once the raw source is named');
});

test('duplicate record keys are rejected, not silently merged', () => {
  const m = {
    path: 'synthetic',
    manifest: {
      schema_version: schema.schema_version,
      data_sources: [baseSource(), baseSource({ title: 'A different title, same id' })],
    },
  };
  const catalog = buildCatalog(schema, [m], { mode: 'test' });
  assert(catalog.errors.some((e) => e.includes('duplicate')), 'expected duplicate key error');
  assert(catalog.records.data_sources.length === 1, 'only the first record may survive');
  assert(catalog.records.data_sources[0].title === 'Synthetic bars', 'first record must win');
});

// ---------------------------------------------------------------------------
// 3. Decision / execution / outcome separation
// ---------------------------------------------------------------------------

section('decision/outcome separation');

test('a decision field without the dt. prefix is an INV-01 error', () => {
  const c = collectionsFrom({
    sources: [baseSource()],
    experiments: [baseExperiment({ decision_time_fields: ['close_price'] })],
  });
  const { errors } = checkInvariants(c);
  assert(errors.some((e) => e.startsWith('INV-01') && e.includes('close_price')), `got ${JSON.stringify(errors)}`);
});

test('an outcome field placed in the decision list is an INV-01 error', () => {
  const c = collectionsFrom({
    sources: [baseSource()],
    experiments: [baseExperiment({ decision_time_fields: ['oc.net_pnl'] })],
  });
  const { errors } = checkInvariants(c);
  assert(errors.some((e) => e.startsWith('INV-01') && e.includes('oc.net_pnl')), `got ${JSON.stringify(errors)}`);
});

test('the same field in two namespaces is an INV-02 error', () => {
  const c = collectionsFrom({
    sources: [baseSource()],
    experiments: [baseExperiment({ decision_time_fields: ['dt.a'], execution_time_fields: ['dt.a'] })],
  });
  const { errors } = checkInvariants(c);
  assert(errors.some((e) => e.startsWith('INV-02')), `got ${JSON.stringify(errors)}`);
});

test('an outcome field used as a decision input is an INV-02 error', () => {
  const c = collectionsFrom({
    sources: [baseSource()],
    experiments: [
      baseExperiment({ frozen_rule: { frozen: true, decision_inputs: ['dt.a', 'oc.net_pnl'] } }),
    ],
  });
  const { errors } = checkInvariants(c);
  assert(
    errors.some((e) => e.startsWith('INV-02') && e.includes('oc.net_pnl') && e.includes('decision_inputs')),
    `got ${JSON.stringify(errors)}`,
  );
});

test('an execution field used as a decision input is an INV-02 error', () => {
  const c = collectionsFrom({
    sources: [baseSource()],
    experiments: [baseExperiment({ frozen_rule: { frozen: true, decision_inputs: ['ex.fill_price'] } })],
  });
  const { errors } = checkInvariants(c);
  assert(errors.some((e) => e.startsWith('INV-02') && e.includes('ex.fill_price')), `got ${JSON.stringify(errors)}`);
});

test('every experiment in the seed keeps its namespaces disjoint', () => {
  const catalog = buildCatalog(schema, [seed], { mode: 'test' });
  assert(!catalog.errors.some((e) => e.startsWith('INV-01') || e.startsWith('INV-02')), 'seed must be namespace-clean');
});

// ---------------------------------------------------------------------------
// 4. Refusal of unlinked rejected-family variants
// ---------------------------------------------------------------------------

section('rejected-family lineage');

function rejectedParentCollections(edgeOverrides = {}) {
  const parent = baseExperiment({ experiment_id: 'EXP.DEAD', family_id: 'FAM.DEAD' });
  const parentResult = baseResult({
    result_id: 'RES.DEAD',
    experiment_id: 'EXP.DEAD',
    verdict: 'REJECTED_FAMILY',
    closure_status: 'CLOSED_REJECTED',
  });
  const edge = {
    record_type: 'lineage_edge',
    edge_id: 'LE.RETRY',
    from_id: 'EXP.DEAD',
    to_id: 'EXP.DEAD_V2',
    edge_kind: 'STRUCTURAL_VARIANT_OF',
    structural_difference: null,
    new_task_id: null,
    new_model_identity: null,
    permitted: true,
    justification: 'a retry of the same rule',
    source_of_record: 'test fixture',
    ...edgeOverrides,
  };
  return collectionsFrom({ sources: [baseSource()], experiments: [parent], results: [parentResult], edges: [edge] });
}

test('a variant of a rejected family with no linkage is refused', () => {
  const { rejections, keptEdges } = checkInvariants(rejectedParentCollections());
  assert(rejections.some((r) => r.reason === 'UNLINKED_REJECTED_FAMILY_VARIANT'), 'expected refusal');
  assert(keptEdges.length === 0, 'the refused edge must not enter the catalogue');
});

test('partial linkage is still refused', () => {
  for (const partial of [
    { structural_difference: 'timeframe changed from 1h to 4h' },
    { structural_difference: 'timeframe changed', new_task_id: 'TASK-999' },
    { new_task_id: 'TASK-999', new_model_identity: 'M2' },
  ]) {
    const { rejections } = checkInvariants(rejectedParentCollections(partial));
    assert(
      rejections.some((r) => r.reason === 'UNLINKED_REJECTED_FAMILY_VARIANT'),
      `partial linkage ${JSON.stringify(partial)} must still be refused`,
    );
  }
});

test('an empty-string linkage field does not count as linkage', () => {
  const { rejections } = checkInvariants(
    rejectedParentCollections({ structural_difference: '   ', new_task_id: '', new_model_identity: 'M2' }),
  );
  assert(rejections.some((r) => r.reason === 'UNLINKED_REJECTED_FAMILY_VARIANT'), 'blank fields must not satisfy INV-03');
});

test('full linkage plus permitted=true is admitted', () => {
  const { rejections, keptEdges } = checkInvariants(
    rejectedParentCollections({
      structural_difference: 'timeframe 1h -> 4h and universe majors -> alts',
      new_task_id: 'TASK-AH-007-PRICE-ACTION-BASELINE-ATLAS-V0',
      new_model_identity: 'DEAD_V2_4H_ALT',
      permitted: true,
    }),
  );
  assert(rejections.length === 0, `expected admission, got ${JSON.stringify(rejections)}`);
  assert(keptEdges.length === 1, 'the linked edge must survive');
});

test('a quarantined parent is treated like a rejected one', () => {
  const c = rejectedParentCollections();
  c.results[0].verdict = 'QUARANTINED';
  c.results[0].closure_status = 'QUARANTINED';
  const { rejections } = checkInvariants(c);
  assert(rejections.some((r) => r.reason === 'UNLINKED_REJECTED_FAMILY_VARIANT'), 'quarantine must gate variants too');
});

test('an edge marked permitted=false never enters the catalogue', () => {
  const c = collectionsFrom({
    sources: [baseSource()],
    experiments: [baseExperiment({ experiment_id: 'EXP.LIVE', family_id: 'FAM.LIVE' })],
    edges: [
      {
        record_type: 'lineage_edge',
        edge_id: 'LE.NO',
        from_id: 'EXP.LIVE',
        to_id: 'EXP.LIVE_V2',
        edge_kind: 'STRUCTURAL_VARIANT_OF',
        structural_difference: 'something',
        new_task_id: 'TASK-1',
        new_model_identity: 'M',
        permitted: false,
        justification: 'operator refused this variant',
        source_of_record: 'test fixture',
      },
    ],
  });
  const { rejections, keptEdges } = checkInvariants(c);
  assert(rejections.some((r) => r.reason === 'EXPLICITLY_NOT_PERMITTED'), 'expected refusal');
  assert(keptEdges.length === 0, 'refused edge must be dropped');
});

test('the seed refuses its recorded unlinked FADE revival', () => {
  const catalog = buildCatalog(schema, [seed], { mode: 'test' });
  const refused = catalog.rejected_records.find((r) => r.id === 'LE.FADE_UNLINKED_REVIVAL_BLOCKED');
  assert(refused, 'the deliberately-unlinked FADE revival edge must be refused');
  assert(refused.reason === 'UNLINKED_REJECTED_FAMILY_VARIANT', `unexpected reason ${refused.reason}`);
  assert(
    !catalog.records.lineage_edges.some((e) => e.edge_id === 'LE.FADE_UNLINKED_REVIVAL_BLOCKED'),
    'refused edge must not appear in the catalogue records',
  );
});

test('no promotion: ADMITTED_RESEARCH_ONLY without full gates and a validator is an INV-06 error', () => {
  const c = collectionsFrom({
    sources: [baseSource()],
    experiments: [baseExperiment()],
    results: [baseResult({ verdict: 'ADMITTED_RESEARCH_ONLY', gates: { G0: 'PASS', G1: 'NOT_RUN' } })],
  });
  const { errors } = checkInvariants(c);
  assert(errors.some((e) => e.startsWith('INV-06')), `got ${JSON.stringify(errors)}`);
});

test('no promotion: all gates PASS but no validator is still an INV-06 error', () => {
  const gates = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`G${i}`, 'PASS']));
  const c = collectionsFrom({
    sources: [baseSource()],
    experiments: [baseExperiment()],
    results: [baseResult({ verdict: 'ADMITTED_RESEARCH_ONLY', gates, validator_id: null })],
  });
  const { errors } = checkInvariants(c);
  assert(errors.some((e) => e.startsWith('INV-06')), 'the independent validator is mandatory');
});

test('the seed contains no admitted sleeve', () => {
  const catalog = buildCatalog(schema, [seed], { mode: 'test' });
  const admitted = catalog.records.results.filter((r) => r.verdict === 'ADMITTED_RESEARCH_ONLY');
  assert(admitted.length === 0, `no strategy may be admitted, found ${admitted.length}`);
});

// ---------------------------------------------------------------------------
// 5. Explicit-root-only scanning
// ---------------------------------------------------------------------------

section('explicit-root-only scanning');

test('the filesystem root is refused', () => {
  assertThrows(() => assertSafeRoot('/'), 'UNSAFE_ROOT', 'filesystem root');
});

test('the home directory is refused', () => {
  assertThrows(() => assertSafeRoot(homedir()), 'UNSAFE_ROOT', 'home directory');
});

test('an ancestor of the home directory is refused', () => {
  assertThrows(() => assertSafeRoot(dirname(homedir())), 'UNSAFE_ROOT', 'home ancestor');
});

test('a relative path that resolves to home is refused', () => {
  const relative = join(homedir(), 'x', '..');
  assertThrows(() => assertSafeRoot(relative), 'UNSAFE_ROOT', 'normalised home');
});

test('an empty root is refused', () => {
  assertThrows(() => assertSafeRoot(''), 'UNSAFE_ROOT', 'empty root');
});

test('a secret-looking root is refused', () => {
  for (const name of SECRET_ROOT_SAMPLES) {
    assertThrows(() => assertSafeRoot(join(tmpdir(), name)), 'UNSAFE_ROOT', `secret root ${name}`);
  }
});

test('an ordinary explicit directory is accepted', () => {
  assert(assertSafeRoot(DATA_DIR) === resolve(DATA_DIR), 'the data directory must be scannable when named explicitly');
});

test('secret basenames are recognised', () => {
  for (const p of SECRET_PATH_SAMPLES) {
    assert(looksLikeSecretPath(p), `${p} should be flagged`);
  }
  for (const p of ['/a/catalog.json', '/a/data_source.json']) {
    assert(!looksLikeSecretPath(p), `${p} should not be flagged`);
  }
});

test('scanning an explicit root never returns a secret file', () => {
  const found = collectManifestPaths(DATA_DIR);
  assert(found.length > 0, 'expected to find the committed manifests');
  for (const p of found) assert(!looksLikeSecretPath(p), `scan returned a secret-looking path: ${p}`);
  for (const p of found) assert(p.endsWith('.json'), `scan returned a non-json path: ${p}`);
});

test('reading a secret-looking manifest is refused outright', () => {
  assertThrows(() => readManifestFile(SECRET_MANIFEST_SAMPLE), 'REFUSED_SECRET_PATH', 'secret manifest');
});

test('the builder defaults to smoke mode only when no root is named', () => {
  assert(buildParseArgs([]).smoke === true, 'no args means smoke');
  assert(buildParseArgs(['--input-root', DATA_DIR]).smoke === false, 'an explicit root leaves smoke mode');
  assert(buildParseArgs(['--manifest', DEFAULT_FIXTURE_PATH]).smoke === false, 'an explicit manifest leaves smoke mode');
});

test('an unknown argument is rejected rather than ignored', () => {
  assertThrows(() => buildParseArgs(['--scan-everything']), 'Unknown argument', 'builder');
  assertThrows(() => queryParseArgs(['data', '--wat']), 'Unknown argument', 'query');
});

// ---------------------------------------------------------------------------
// 6. Smoke-mode non-mutation
// ---------------------------------------------------------------------------

section('smoke-mode non-mutation');

test('smoke mode leaves the data directory byte-identical', () => {
  const before = snapshotTree(DATA_DIR);
  const { value } = captureStdout(() => buildMain([]));
  const after = snapshotTree(DATA_DIR);
  assert(value === 0, `smoke run should exit 0, got ${value}`);
  assert(before === after, 'smoke mode mutated the data directory');
});

test('smoke mode refuses --out instead of writing', () => {
  const target = join(tmpdir(), 'botalin-warehouse-smoke-should-not-exist.json');
  const { value, out } = captureStdout(() => buildMain(['--smoke', '--out', target]));
  assert(value === 65, `expected refusal exit 65, got ${value}`);
  assert(out.includes('INV-08'), 'the refusal must cite INV-08');
  assert(!existsSync(target), 'smoke mode must not have created the output file');
});

test('smoke mode refuses --csv instead of writing', () => {
  const target = join(tmpdir(), 'botalin-warehouse-smoke-should-not-exist.csv');
  const { value } = captureStdout(() => buildMain(['--smoke', '--csv', target]));
  assert(value === 65, `expected refusal exit 65, got ${value}`);
  assert(!existsSync(target), 'smoke mode must not have created the csv');
});

test('the smoke summary reports the refused revival and the top blocking gap', () => {
  const { out } = captureStdout(() => buildMain([]));
  assert(out.includes('promising_count=0'), 'summary must state promising_count=0');
  assert(out.includes('UNLINKED_REJECTED_FAMILY_VARIANT'), 'summary must surface the refused variant');
  assert(out.includes('highest-priority blocking data gap'), 'summary must name the blocking gap');
});

test('the query CLI never writes: a full query sweep leaves the data directory identical', () => {
  const before = snapshotTree(DATA_DIR);
  const catalog = loadCatalog({ manifests: [], schema: DEFAULT_SCHEMA_PATH });
  for (const cmd of ['data', 'mechanism', 'why-rejected', 'variants', 'blocking-gap', 'lessons', 'summary']) {
    runQuery(catalog, cmd, {});
  }
  assert(snapshotTree(DATA_DIR) === before, 'a query mutated the data directory');
});

// ---------------------------------------------------------------------------
// 7. Determinism
// ---------------------------------------------------------------------------

section('determinism');

test('two builds of the same input are byte-identical', () => {
  const a = JSON.stringify(buildCatalog(schema, [seed], { mode: 'test' }));
  const b = JSON.stringify(buildCatalog(schema, [seed], { mode: 'test' }));
  assert(a === b, 'the builder is not deterministic');
});

test('the catalogue carries no timestamp field', () => {
  const catalog = buildCatalog(schema, [seed], { mode: 'test' });
  const json = JSON.stringify(catalog);
  for (const banned of ['"generated_at"', '"built_at"', '"run_ts"']) {
    assert(!json.includes(banned), `catalogue must not embed ${banned}; it would break reproducibility`);
  }
  assert(catalog.deterministic === true, 'the catalogue must declare determinism');
});

test('the CSV rendering is stable and escapes correctly', () => {
  const catalog = buildCatalog(schema, [seed], { mode: 'test' });
  const csv1 = catalogToCsv(schema, catalog);
  const csv2 = catalogToCsv(schema, catalog);
  assert(csv1 === csv2, 'csv rendering is not deterministic');
  const header = csv1.split('\n')[0];
  assert(header === schema.csv_columns.join(','), 'csv header must match the schema column list');
  const rowCount = csv1.trim().split('\n').length - 1;
  const expected = Object.values(catalog.counts).reduce((a, b) => a + b, 0);
  assert(rowCount === expected, `csv rows ${rowCount} != record count ${expected}`);
  for (const line of csv1.trim().split('\n')) {
    const quotes = (line.match(/"/g) ?? []).length;
    assert(quotes % 2 === 0, `unbalanced quoting in csv line: ${line.slice(0, 60)}`);
  }
});

// ---------------------------------------------------------------------------
// 8. Coverage and query behaviour
// ---------------------------------------------------------------------------

section('coverage and queries');

const seedCatalog = buildCatalog(schema, [seed], { mode: 'test' });

test('coverage counts every evidence type in the schema', () => {
  const coverage = computeCoverage(schema, seedCatalog.records.data_sources);
  for (const t of schema.enums.evidence_type) {
    assert(coverage.by_evidence_type[t], `evidence type ${t} missing from coverage`);
  }
});

test('coverage reports evidence types with no available raw primary source', () => {
  const coverage = computeCoverage(schema, seedCatalog.records.data_sources);
  assert(Array.isArray(coverage.evidence_types_without_raw_primary), 'expected a gap list');
  assert(coverage.evidence_types_without_raw_primary.includes('NEWS'), 'NEWS has no available raw source and must be listed');
});

test('a MISSING source is never counted as coverage', () => {
  const coverage = computeCoverage(schema, seedCatalog.records.data_sources);
  assert(coverage.by_evidence_type.NEWS.raw_primary_available === 0, 'a MISSING gap must not count as available');
  assert(coverage.by_evidence_type.NEWS.missing >= 1, 'the NEWS gap must be recorded as missing');
});

test('query "data" answers source/timeframe/symbol/time-span questions', () => {
  const byType = runQuery(seedCatalog, 'data', { evidenceType: 'ORDERBOOK' });
  assert(byType.length > 0, 'expected order-book sources');
  assert(byType.every((s) => s.evidence_type === 'ORDERBOOK'), 'filter leaked other evidence types');

  const bySymbol = runQuery(seedCatalog, 'data', { symbol: 'BTCUSDT' });
  assert(bySymbol.some((s) => s.source_id === 'EDGE.AMEL.EVENTS'), 'symbol filter should find the AMEL event stream');

  const byTimeframe = runQuery(seedCatalog, 'data', { timeframe: '4h' });
  assert(byTimeframe.length > 0, 'expected 4h sources');

  const bySpan = runQuery(seedCatalog, 'data', { from: '2026-07-26T00:00:00Z', to: '2026-07-27T00:00:00Z' });
  assert(bySpan.some((s) => s.source_id === 'EDGE.AMEL.EVENTS'), 'time-span filter should find the AMEL run');

  const outOfSpan = runQuery(seedCatalog, 'data', { from: '2020-01-01T00:00:00Z', to: '2020-01-02T00:00:00Z' });
  assert(!outOfSpan.some((s) => s.source_id === 'EDGE.AMEL.EVENTS'), 'a disjoint span must exclude the AMEL run');
});

test('query "data" hides MISSING gaps unless they are asked for', () => {
  const withoutGaps = runQuery(seedCatalog, 'data', {});
  const withGaps = runQuery(seedCatalog, 'data', { includeGaps: true });
  assert(withGaps.length > withoutGaps.length, 'expected --include-gaps to widen the result');
  assert(!withoutGaps.some((s) => s.verification_status === 'MISSING'), 'a MISSING source must not be reported as data that exists');
});

test('query "data" always reports verification status and write ownership', () => {
  for (const s of runQuery(seedCatalog, 'data', {})) {
    assert(typeof s.verification_status === 'string', `missing verification_status for ${s.source_id}`);
    assert(typeof s.write_ownership === 'string', `missing write_ownership for ${s.source_id}`);
    assert(typeof s.read_only_status === 'string', `missing read_only_status for ${s.source_id}`);
  }
});

test('query "mechanism" returns gates and verdicts for a mechanism', () => {
  const hits = runQuery(seedCatalog, 'mechanism', { tag: 'volatility_state_transition' });
  assert(hits.length >= 2, `expected both volatility formulations, got ${hits.length}`);
  const fourHour = hits.find((h) => h.experiment_id === 'EXP.HTF_VOL_COMPRESSION_4H_ALT');
  assert(fourHour, 'expected the 4h alt experiment');
  assert(fourHour.results.length > 0, 'expected recorded results');
  assert(fourHour.results[0].failed_gates.includes('G0'), 'the 4h variant must show its failed data-health gate');
  assert(fourHour.results[0].verdict === 'NEEDS_MORE_LOGGING', 'unexpected verdict');
});

test('query "why-rejected" distinguishes a dead signal from a data inadequacy', () => {
  const rows = runQuery(seedCatalog, 'why-rejected', {});
  const fade = rows.find((r) => r.family_id === 'FAM.FADE_TOKENIZED');
  assert(fade && fade.route === 'REJECTED_FAMILY', 'FADE must be recorded as a rejected family');
  assert(fade.data_inadequate === false, 'FADE failed on signal, not on data');
  assert(fade.allowed_successor === null, 'a rejected family has no permitted successor');

  const carry = rows.find((r) => r.family_id === 'FAM.CARRY');
  assert(carry && carry.data_inadequate === true, 'carry must be recorded as data-inadequate');
  assert(carry.route === 'DATA_REQUEST', 'carry route must be DATA_REQUEST');
});

test('query "variants" separates permitted, refused and quarantined', () => {
  const v = runQuery(seedCatalog, 'variants', {});
  assert(v.permitted.some((p) => p.variant === 'EXP.HTF_VOL_COMPRESSION_4H_ALT'), 'the linked 4h variant must be permitted');
  assert(v.refused.some((r) => r.edge_id === 'LE.FADE_UNLINKED_REVIVAL_BLOCKED'), 'the unlinked FADE revival must be listed as refused');
  assert(!v.permitted.some((p) => p.variant.includes('FADE')), 'no FADE variant may ever be listed as permitted');
  assert(v.quarantined.some((q) => q.experiment_id === 'EXP.FAILED_BREAKOUT_REVERSAL_US_HOURS'), 'expected the quarantined family');
  assert(v.permitted.every((p) => p.structural_difference && p.new_task_id && p.new_model_identity), 'a permitted variant must carry full linkage');
});

test('query "blocking-gap" names the gap blocking the highest-priority next test', () => {
  const gaps = runQuery(seedCatalog, 'blocking-gap', { top: 1 });
  assert(gaps.length === 1, 'expected one top gap');
  assert(gaps[0].priority === 1, 'the top gap must be priority 1');
  // The identity of the top gap is data, not contract: it moves as sources are verified.
  // What must hold is that it points at a real catalogued source and says what would close it.
  const sources = new Set(seedCatalog.records.data_sources.map((s) => s.source_id));
  assert(sources.has(gaps[0].blocking_data_gap_id), `top gap names an unknown source: ${gaps[0].blocking_data_gap_id}`);
  assert(typeof gaps[0].gap_requirement === 'string' && gaps[0].gap_requirement.length > 3,
    'the gap must state what would close it');
  assert(gaps[0].allowed_successor, 'a priority-1 gap must name its successor task');
});

test('verifying a source can re-prioritise what blocks the programme', () => {
  // Carry was priority 2 and blocked on a dispersion archive that carries only settlement
  // timestamps. EDGE.DATA.HL_CASCADE was then verified as a 60s live funding series with our
  // own poll timestamp, so the causal blocker no longer applies and Carry moved to the front.
  const carry = seedCatalog.records.failure_routes.find((f) => f.failure_route_id === 'FR.CARRY_CUSTODY');
  assert(carry.priority === 1, 'carry is now the top-priority route');
  assert(carry.blocking_data_gap_id === 'EDGE.DATA.HL_CASCADE', 'and it points at the verified source');
  const hl = seedCatalog.records.data_sources.find((s) => s.source_id === 'EDGE.DATA.HL_CASCADE');
  assert(hl && hl.verification_status === 'VERIFIED_READ_ONLY', 'hl_cascade must be verified, not assumed');
  assert(hl.known_gaps.some((g) => g.includes('SPOT')), 'the remaining hedge-leg gap must still be recorded');

  // The old constraint stays true, and stays scoped to the dataset it was measured on.
  const dc = seedCatalog.records.data_constraints[0];
  assert(dc.scope_source_ids.length === 1 && dc.scope_source_ids[0] === 'EDGE.DATA.DISPERSION',
    'the settlement-timestamp constraint must not have widened to all funding archives');
});

test('blocking gaps are ordered by priority', () => {
  const gaps = runQuery(seedCatalog, 'blocking-gap', { top: 20 });
  for (let i = 1; i < gaps.length; i += 1) {
    assert(gaps[i - 1].priority <= gaps[i].priority, 'blocking gaps must be sorted by priority');
  }
});

test('query "summary" reports the unverified server inventory honestly', () => {
  const s = runQuery(seedCatalog, 'summary', {});
  assert(s.promising_count === 0, 'promising_count must be 0');
  assert(s.unverified_sources.length > 0, 'the seed must admit which sources were never physically verified');
  assert(s.missing_sources.includes('GAP.OI_LIQ.FINE_GRAIN'), 'the fine-grained OI gap must be reported missing');
});

// ---------------------------------------------------------------------------
// 8b. Trial ledger reconciliation
// ---------------------------------------------------------------------------

section('trial ledger');

test('a well-formed ledger entry and evidence record validate', () => {
  assert(validateRecord(schema, 'trial_ledger_entry', baseTrial()).length === 0, 'entry should validate');
  assert(validateRecord(schema, 'trial_evidence', baseTrialEvidence()).length === 0, 'evidence should validate');
});

test('count conservation holds when the ledger sums to the declared count', () => {
  const world = ledgerWorld([
    baseTrial({ trial_id: 'TL.A', dedup_key: 'a' }),
    baseTrial({ trial_id: 'TL.B', dedup_key: 'b' }),
  ], { declared: 2 });
  const { errors } = checkTrialLedger(world);
  assert(!errors.some((e) => e.startsWith('INV-09')), `got ${JSON.stringify(errors)}`);
});

test('count conservation fails when the ledger does not sum to the declared count', () => {
  const world = ledgerWorld([baseTrial({ trial_id: 'TL.A', dedup_key: 'a' })], { declared: 7 });
  const { errors } = checkTrialLedger(world);
  assert(
    errors.some((e) => e.startsWith('INV-09') && e.includes('prior_trials_seeded=7') && e.includes('sum to 1')),
    `got ${JSON.stringify(errors)}`,
  );
});

test('an aggregate batch of N conserves as N, not as one entry', () => {
  const world = ledgerWorld([
    baseTrial({ trial_id: 'TL.BATCH', dedup_key: 'batch', representation: 'AGGREGATE_ONLY', exact_trial_count: 930,
      reconciliation_status: 'AGGREGATE_PENDING_CHILDREN', missing_child_evidence_id: 'TE.TEST' }),
  ], { declared: 930, evidence: [baseTrialEvidence({ trial_id: 'TL.BATCH', recoverable_child_count_estimate: 930 })] });
  const { errors, perExperiment } = checkTrialLedger(world);
  assert(errors.length === 0, `got ${JSON.stringify(errors)}`);
  assert(perExperiment[0].ledger_sum === 930, 'an aggregate batch must contribute its full count');
  assert(perExperiment[0].individual_entries === 0, 'a batch is not an individual entry');
});

test('a ledger entry must name an existing parent experiment', () => {
  const world = ledgerWorld([baseTrial({ parent_experiment_id: 'EXP.GHOST' })], { declared: 0 });
  const { rejections } = checkTrialLedger(world);
  assert(rejections.some((r) => r.reason === 'UNKNOWN_PARENT_EXPERIMENT'), `got ${JSON.stringify(rejections)}`);
});

test('a ledger entry whose family contradicts its parent is rejected', () => {
  const world = ledgerWorld([baseTrial({ family_id: 'FAM.OTHER' })], { declared: 0 });
  const { rejections } = checkTrialLedger(world);
  assert(rejections.some((r) => r.reason === 'FAMILY_MISMATCH'), `got ${JSON.stringify(rejections)}`);
});

test('a child of an aggregate batch may not also be counted', () => {
  const world = ledgerWorld([
    baseTrial({ trial_id: 'TL.BATCH', dedup_key: 'batch', representation: 'AGGREGATE_ONLY', exact_trial_count: 5,
      reconciliation_status: 'AGGREGATE_PENDING_CHILDREN', missing_child_evidence_id: 'TE.TEST' }),
    baseTrial({ trial_id: 'TL.CHILD', dedup_key: 'child', member_of_aggregate_trial_id: 'TL.BATCH',
      counts_toward_lower_bound: true }),
  ], { declared: 5, evidence: [baseTrialEvidence({ trial_id: 'TL.BATCH' })] });
  const { rejections } = checkTrialLedger(world);
  assert(rejections.some((r) => r.reason === 'DOUBLE_COUNTED_CHILD'), `got ${JSON.stringify(rejections)}`);
});

test('a recovered child of an aggregate batch is admitted when it is non-counting', () => {
  const world = ledgerWorld([
    baseTrial({ trial_id: 'TL.BATCH', dedup_key: 'batch', representation: 'AGGREGATE_ONLY', exact_trial_count: 5,
      reconciliation_status: 'AGGREGATE_PENDING_CHILDREN', missing_child_evidence_id: 'TE.TEST' }),
    baseTrial({ trial_id: 'TL.CHILD', dedup_key: 'child', member_of_aggregate_trial_id: 'TL.BATCH',
      counts_toward_lower_bound: false }),
  ], { declared: 5, evidence: [baseTrialEvidence({ trial_id: 'TL.BATCH' })] });
  const { rejections, errors } = checkTrialLedger(world);
  assert(rejections.length === 0 && errors.length === 0, `got ${JSON.stringify([errors, rejections])}`);
});

test('a member of a non-aggregate entry is rejected', () => {
  const world = ledgerWorld([
    baseTrial({ trial_id: 'TL.A', dedup_key: 'a' }),
    baseTrial({ trial_id: 'TL.CHILD', dedup_key: 'child', member_of_aggregate_trial_id: 'TL.A',
      counts_toward_lower_bound: false }),
  ], { declared: 1 });
  const { rejections } = checkTrialLedger(world);
  assert(rejections.some((r) => r.reason === 'NOT_AN_AGGREGATE'), `got ${JSON.stringify(rejections)}`);
});

test('two counting entries may not share a dedup key', () => {
  const world = ledgerWorld([
    baseTrial({ trial_id: 'TL.A', dedup_key: 'same' }),
    baseTrial({ trial_id: 'TL.B', dedup_key: 'same' }),
  ], { declared: 2 });
  const { errors } = checkTrialLedger(world);
  assert(errors.some((e) => e.startsWith('INV-10') && e.includes('already counted')), `got ${JSON.stringify(errors)}`);
});

test('an entry with no evidence link is refused', () => {
  for (const placeholder of ['', 'NONE', 'UNKNOWN', 'TBD', 'n/a']) {
    const world = ledgerWorld([baseTrial({ evidence_path: placeholder })], { declared: 1 });
    const { rejections } = checkTrialLedger(world);
    assert(
      rejections.some((r) => r.reason === 'NO_EVIDENCE_LINK'),
      `placeholder '${placeholder}' should be refused`,
    );
  }
});

test('an aggregate batch may not carry a per-variant parameter fingerprint', () => {
  const world = ledgerWorld([
    baseTrial({ representation: 'AGGREGATE_ONLY', exact_trial_count: 930, parameter_fingerprint: 'z=3.0;tf=1h',
      reconciliation_status: 'AGGREGATE_PENDING_CHILDREN', missing_child_evidence_id: 'TE.TEST' }),
  ], { declared: 930, evidence: [baseTrialEvidence()] });
  const { rejections } = checkTrialLedger(world);
  assert(
    rejections.some((r) => r.reason === 'FABRICATED_PARAMETER_FINGERPRINT'),
    'inventing a fingerprint for a batch of 930 is exactly the fabrication this forbids',
  );
});

test('a fingerprint that declares itself derived is refused', () => {
  for (const fp of ['inferred_from_batch', 'assumed z=3', 'generated-grid', 'estimated tf', 'guessed']) {
    const world = ledgerWorld([baseTrial({ parameter_fingerprint: fp })], { declared: 1 });
    const { rejections } = checkTrialLedger(world);
    assert(rejections.some((r) => r.reason === 'FABRICATED_PARAMETER_FINGERPRINT'), `'${fp}' should be refused`);
  }
});

test('a genuine recorded fingerprint is accepted', () => {
  for (const fp of ['tf=1h;z=(close-SMA20)/ATR', 'wallets=3', 'window=208d', 'synth_param=1']) {
    const world = ledgerWorld([baseTrial({ parameter_fingerprint: fp })], { declared: 1 });
    const { rejections } = checkTrialLedger(world);
    assert(rejections.length === 0, `'${fp}' should be accepted, got ${JSON.stringify(rejections)}`);
  }
});

test('an INDIVIDUAL entry represents exactly one trial', () => {
  const world = ledgerWorld([baseTrial({ representation: 'INDIVIDUAL', exact_trial_count: 116 })], { declared: 116 });
  const { rejections } = checkTrialLedger(world);
  assert(
    rejections.some((r) => r.reason === 'INDIVIDUAL_COUNT_NOT_ONE'),
    'claiming 116 individual variants in one row would invent 115 records',
  );
});

test('a robustness attack never counts as a trial', () => {
  const world = ledgerWorld([
    baseTrial({ trial_id: 'TL.A', dedup_key: 'a' }),
    baseTrial({ trial_id: 'TL.ATK', dedup_key: 'atk', kind: 'ROBUSTNESS_ATTACK', attacks_trial_id: 'TL.A',
      counts_toward_lower_bound: true }),
  ], { declared: 1 });
  const { rejections } = checkTrialLedger(world);
  assert(rejections.some((r) => r.reason === 'ATTACK_COUNTED_AS_TRIAL'), `got ${JSON.stringify(rejections)}`);
});

test('null controls and replays are also barred from counting', () => {
  for (const kind of ['NULL_CONTROL', 'REPLAY']) {
    const world = ledgerWorld([
      baseTrial({ trial_id: 'TL.A', dedup_key: 'a' }),
      baseTrial({ trial_id: 'TL.X', dedup_key: 'x', kind, attacks_trial_id: 'TL.A', counts_toward_lower_bound: true }),
    ], { declared: 1 });
    const { rejections } = checkTrialLedger(world);
    assert(rejections.some((r) => r.reason === 'ATTACK_COUNTED_AS_TRIAL'), `${kind} must not count`);
  }
});

test('an attack must name the trial it attacks, and that trial must exist', () => {
  const missingTarget = ledgerWorld([
    baseTrial({ trial_id: 'TL.ATK', dedup_key: 'atk', kind: 'NULL_CONTROL', counts_toward_lower_bound: false }),
  ], { declared: 0 });
  assert(
    checkTrialLedger(missingTarget).rejections.some((r) => r.reason === 'ATTACK_WITHOUT_TARGET'),
    'an unattached attack is meaningless',
  );

  const ghostTarget = ledgerWorld([
    baseTrial({ trial_id: 'TL.ATK', dedup_key: 'atk', kind: 'NULL_CONTROL', attacks_trial_id: 'TL.GHOST',
      counts_toward_lower_bound: false }),
  ], { declared: 0 });
  assert(
    checkTrialLedger(ghostTarget).rejections.some((r) => r.reason === 'UNKNOWN_ATTACK_TARGET'),
    'an attack on a nonexistent trial is rejected',
  );
});

test('a pending reconciliation must name an existing trial_evidence record', () => {
  const undeclared = ledgerWorld([
    baseTrial({ representation: 'AGGREGATE_ONLY', exact_trial_count: 4,
      reconciliation_status: 'AGGREGATE_PENDING_CHILDREN', missing_child_evidence_id: null }),
  ], { declared: 4 });
  assert(
    checkTrialLedger(undeclared).rejections.some((r) => r.reason === 'MISSING_EVIDENCE_NOT_DECLARED'),
    'an aggregate that hides its missing children is refused',
  );

  const ghost = ledgerWorld([
    baseTrial({ representation: 'AGGREGATE_ONLY', exact_trial_count: 4,
      reconciliation_status: 'UNRECOVERABLE_PENDING_SOURCE', missing_child_evidence_id: 'TE.GHOST' }),
  ], { declared: 4 });
  assert(
    checkTrialLedger(ghost).rejections.some((r) => r.reason === 'UNKNOWN_TRIAL_EVIDENCE'),
    'a dangling evidence reference is refused',
  );
});

test('an unknown child count is preserved as unknown, never as zero', () => {
  const unknown = seedCatalog.records.trial_evidence.filter((e) => e.recoverable_child_count_estimate === null);
  assert(unknown.length > 0, 'the seed must record at least one unknown child count');
  for (const e of seedCatalog.records.trial_evidence) {
    assert(
      e.recoverable_child_count_estimate === null || e.recoverable_child_count_estimate > 0,
      `${e.evidence_id}: an unrecoverable gap must be null, never 0 trials`,
    );
  }
});

test('every seed ledger entry conserves against its parent', () => {
  assert(seedCatalog.errors.length === 0, `seed has errors: ${JSON.stringify(seedCatalog.errors.slice(0, 5))}`);
  for (const row of seedCatalog.trial_conservation_by_experiment) {
    assert(row.conserved, `${row.experiment_id}: declared ${row.declared} vs ledger ${row.ledger_sum}`);
  }
});

test('the seed reconciles the 930 AMEL combinations as aggregates under their own experiment', () => {
  const amel = seedCatalog.records.trial_ledger_entries.filter(
    (t) => t.parent_experiment_id === 'EXP.AMEL_SECOND_ORDER_COMBINATIONS' && t.counts_toward_lower_bound,
  );
  assert(amel.length === 2, `expected two batches, got ${amel.length}`);
  assert(amel.every((t) => t.representation === 'AGGREGATE_ONLY'), 'the 930 must stay aggregate-only');
  assert(amel.reduce((a, t) => a + t.exact_trial_count, 0) === 930, 'the batches must sum to 930');
  assert(amel.every((t) => t.parameter_fingerprint === null), 'no per-combination fingerprint may be invented');
  assert(amel.every((t) => t.missing_child_evidence_id), 'each batch must name the artefact that would recover its children');

  const wick = seedCatalog.records.experiments.find((e) => e.experiment_id === 'EXP.WICK_RECLAIM_SWEEP');
  assert(wick.prior_trials_seeded === 1, 'the 930 must no longer be attributed to the wick-reclaim experiment');
});

test('the seed reconciles the 116 overfit-lab variants as aggregates that sum correctly', () => {
  const lab = seedCatalog.records.trial_ledger_entries.filter(
    (t) => t.parent_experiment_id === 'EXP.OVERFIT_LAB_SINGLE_STRATEGIES' && t.counts_toward_lower_bound,
  );
  assert(lab.reduce((a, t) => a + t.exact_trial_count, 0) === 116, 'the batches must sum to 116');
  assert(lab.every((t) => t.representation === 'AGGREGATE_ONLY'), 'the 116 must stay aggregate-only');
  const attack = seedCatalog.records.trial_ledger_entries.find((t) => t.trial_id === 'TL.OVERFIT.ATTACK_SUITE');
  assert(attack && attack.counts_toward_lower_bound === false, 'the attack suite must not inflate the count');
});

test('the 930 and 116 are the only aggregate batches, and they dominate the total', () => {
  const s = seedCatalog.trial_ledger;
  assert(s.aggregate_only_entries === 4, `expected 4 aggregate entries, got ${s.aggregate_only_entries}`);
  assert(s.aggregate_only_trials === 1046, `expected 1046 aggregate trials, got ${s.aggregate_only_trials}`);
  assert(s.individual_trials === 20, `expected 20 individual trials, got ${s.individual_trials}`);
  assert(s.lower_bound_trials === 1066, `expected 1066 lower-bound trials, got ${s.lower_bound_trials}`);
  assert(
    s.individual_trials + s.aggregate_only_trials === s.lower_bound_trials,
    'individual plus aggregate must equal the lower bound',
  );
});

test('every counted trial traces to a local artefact', () => {
  const counting = seedCatalog.records.trial_ledger_entries.filter((t) => t.counts_toward_lower_bound && !t.fixture_flag);
  for (const t of counting) {
    assert(t.evidence_path.endsWith('.md') || t.evidence_path.includes('.md#'), `${t.trial_id}: evidence must be a local document`);
    assert(t.verification_grade === 'DOCUMENTED_UNVERIFIED', `${t.trial_id}: unexpected grade ${t.verification_grade}`);
  }
  assert(
    seedCatalog.trial_ledger.trials_with_unknown_count_grade === 0,
    'no counted trial may rest on an unknown-grade count',
  );
});

test('the ledger summary is a pure function of its inputs', () => {
  const a = JSON.stringify(summarizeTrialLedger(
    seedCatalog.records.trial_ledger_entries,
    seedCatalog.trial_conservation_by_experiment,
    seedCatalog.records.trial_evidence,
  ));
  const b = JSON.stringify(summarizeTrialLedger(
    seedCatalog.records.trial_ledger_entries,
    seedCatalog.trial_conservation_by_experiment,
    seedCatalog.records.trial_evidence,
  ));
  assert(a === b, 'the ledger summary is not deterministic');
});

test('query "trials" separates individual rows from aggregate-only batches', () => {
  const individual = runQuery(seedCatalog, 'trials', { representation: 'INDIVIDUAL' });
  const aggregate = runQuery(seedCatalog, 'trials', { representation: 'AGGREGATE_ONLY' });
  assert(individual.every((t) => t.exact_trial_count === 1), 'individual rows represent one trial each');
  assert(aggregate.some((t) => t.exact_trial_count === 745), 'the 745-duplicate batch must be visible');
  assert(aggregate.every((t) => t.parameter_fingerprint === null), 'no aggregate may expose a per-variant fingerprint');
});

test('query "trials" hides non-counting attacks unless asked for', () => {
  const counting = runQuery(seedCatalog, 'trials', {});
  const all = runQuery(seedCatalog, 'trials', { includeNonCounting: true });
  assert(all.length > counting.length, 'expected --include-non-counting to widen the result');
  assert(counting.every((t) => t.counts_toward_lower_bound), 'the default view must show only counted trials');
  assert(all.some((t) => t.kind === 'ROBUSTNESS_ATTACK'), 'attacks must be inspectable when asked for');
});

test('query "trial-summary" reports the lower bound and the reconciliation coverage', () => {
  const s = runQuery(seedCatalog, 'trial-summary', {});
  assert(s.lower_bound_trials === 1066, `unexpected lower bound ${s.lower_bound_trials}`);
  assert(s.individual_entries === 20 && s.aggregate_only_entries === 4, 'unexpected entry split');
  assert(s.conservation_violations.length === 0, 'the seed must have no conservation violation');
  assert(s.missing_evidence_sources.length === 15, `expected 15 missing-evidence sources, got ${s.missing_evidence_sources.length}`);
  assert(s.independent_experiments === 16, `expected 16 independent experiments, got ${s.independent_experiments}`);
});

test('query "trial-summary" names every missing-evidence recovery source', () => {
  const s = runQuery(seedCatalog, 'trial-summary', {});
  for (const e of s.missing_evidence_sources) {
    assert(e.required_artefact.length > 8, `${e.evidence_id}: must say what artefact is needed`);
    assert(e.artefact_location_hint.length > 0, `${e.evidence_id}: must give a location hint`);
    assert(e.recovery_phase.startsWith('GO-'), `${e.evidence_id}: must name the operator GO phase that unlocks it`);
  }
});

test('query "trial-lineage" links parent, trials, outcome and lessons', () => {
  const rows = runQuery(seedCatalog, 'trial-lineage', { experiment: 'EXP.OVERFIT_LAB_SINGLE_STRATEGIES' });
  assert(rows.length === 1, 'expected one experiment');
  const row = rows[0];
  assert(row.declared_prior_trials_seeded === 116, 'expected the declared count');
  assert(row.trials.length === 3, `expected two batches plus the attack suite, got ${row.trials.length}`);
  assert(row.outcomes.some((o) => o.verdict === 'REJECTED_FAMILY'), 'expected the rejected outcome');
  assert(row.lessons.some((l) => l.lesson_id === 'LESSON-019'), 'expected the multiplicity lesson');
  assert(row.trials.some((t) => t.missing_evidence?.recoverable_child_count_estimate === 15), 'expected the 15 recoverable children');
});

test('query "trial-lineage" exposes the attack chain without counting it', () => {
  const rows = runQuery(seedCatalog, 'trial-lineage', { experiment: 'EXP.HTF_MA_DISTANCE_REVERSION' });
  const trials = rows[0].trials;
  const attacks = trials.filter((t) => t.attacks_trial_id);
  assert(attacks.length === 2, `expected two remove-best attacks, got ${attacks.length}`);
  assert(attacks.every((t) => !t.counts_toward_lower_bound), 'attacks must not count');
  assert(attacks.every((t) => t.attacks_trial_id === 'TL.HTF_MA.TF_1H'), 'attacks must name their target');
  assert(rows[0].declared_prior_trials_seeded === 2, 'only the two timeframe formulations count');
});

// ---------------------------------------------------------------------------
// 8c. Market law catalogue
// ---------------------------------------------------------------------------

section('market law catalogue');

function baseLaw(overrides = {}) {
  return {
    record_type: 'market_law',
    law_id: 'LAW.TEST',
    subtype: 'empirical_market_law',
    title: 'A test empirical law',
    statement: 'Under the stated condition the measured effect is negative and reproduces on both sides.',
    condition: 'a precisely stated condition',
    horizon: '60s',
    effect: { bps: -1 },
    n: 1000,
    t_stat: -4.2,
    ci_low: -1.5,
    ci_high: -0.5,
    segment: 'TRAIN',
    data_source_ids: ['FIXTURE.SYNTH.BARS'],
    transform_version: 'test:v1',
    null_test: { status: 'NOT_RUN', reason: 'test fixture' },
    oos: { status: 'NOT_RUN', reason: 'test fixture' },
    remove_best: { status: 'NOT_RUN', reason: 'test fixture' },
    mechanism_claim: 'A stated mechanism long enough to satisfy the schema minimum length.',
    exploitability_class: 'EXECUTION_POLICY',
    temporal_stability: 'unknown, single sample',
    status: 'observed',
    review_criterion: 'replicate across twenty symbols',
    tested_variants: [{ variant: 'a', result: 'b' }],
    task_id: 'TASK-TEST',
    evidence_paths: [],
    fixture_flag: true,
    source_of_record: 'test fixture',
    ...overrides,
  };
}

const IDENTITY_OVERRIDES = {
  subtype: 'mechanical_identity', status: 'proven',
  n: null, t_stat: null, ci_low: null, ci_high: null,
  null_test: null, oos: null, remove_best: null,
};

function lawWorld(laws = [], constraints = []) {
  const c = collectionsFrom({ sources: [baseSource()] });
  c.market_laws = laws;
  c.data_constraints = constraints;
  return c;
}

test('a well-formed empirical law and identity both validate against the schema', () => {
  assert(validateRecord(schema, 'market_law', baseLaw()).length === 0, 'empirical law should validate');
  assert(validateRecord(schema, 'market_law', baseLaw(IDENTITY_OVERRIDES)).length === 0, 'identity should validate');
});

test('a mechanical identity may not carry a sample size or a t-statistic', () => {
  for (const field of ['n', 't_stat', 'ci_low', 'ci_high']) {
    const law = baseLaw({ ...IDENTITY_OVERRIDES, [field]: 42 });
    const { rejections } = checkLawCatalogue(lawWorld([law]));
    assert(rejections.some((r) => r.reason === 'IDENTITY_CARRIES_MEASUREMENT'),
      `an identity carrying ${field} must be refused: testing arithmetic for significance is a category error`);
  }
});

test('a mechanical identity may not carry the statistical checks', () => {
  for (const field of ['null_test', 'oos', 'remove_best']) {
    const law = baseLaw({ ...IDENTITY_OVERRIDES, [field]: { status: 'PASS' } });
    const { rejections } = checkLawCatalogue(lawWorld([law]));
    assert(rejections.some((r) => r.reason === 'IDENTITY_CARRIES_MEASUREMENT'), `${field} must be null on an identity`);
  }
});

test('a mechanical identity must be proven, and an empirical law never may be', () => {
  const badIdentity = baseLaw({ ...IDENTITY_OVERRIDES, status: 'observed' });
  assert(checkLawCatalogue(lawWorld([badIdentity])).rejections.some((r) => r.reason === 'IDENTITY_BAD_STATUS'),
    'an identity is proven, not observed');
  const badEmpirical = baseLaw({ status: 'proven' });
  assert(checkLawCatalogue(lawWorld([badEmpirical])).rejections.some((r) => r.reason === 'EMPIRICAL_CLAIMS_PROOF'),
    'an empirical law may never claim proof');
});

test('an empirical law must carry precision', () => {
  for (const field of ['n', 't_stat', 'ci_low', 'ci_high']) {
    const law = baseLaw({ [field]: null });
    assert(checkLawCatalogue(lawWorld([law])).rejections.some((r) => r.reason === 'EMPIRICAL_MISSING_PRECISION'),
      `${field} is required on an empirical law`);
  }
});

test('an empirical law must declare every check, even as NOT_RUN', () => {
  for (const field of ['null_test', 'oos', 'remove_best']) {
    const law = baseLaw({ [field]: null });
    assert(checkLawCatalogue(lawWorld([law])).rejections.some((r) => r.reason === 'CHECK_NOT_DECLARED'),
      `${field} must be declared explicitly`);
  }
});

test('replicated status is earned: every check must be PASS', () => {
  const notRun = baseLaw({ status: 'replicated' });
  assert(checkLawCatalogue(lawWorld([notRun])).rejections.some((r) => r.reason === 'REPLICATED_WITHOUT_CHECKS'),
    'replication cannot be asserted while checks are NOT_RUN');

  const oneFail = baseLaw({
    status: 'replicated',
    null_test: { status: 'PASS' }, oos: { status: 'PASS' }, remove_best: { status: 'FAIL' },
  });
  assert(checkLawCatalogue(lawWorld([oneFail])).rejections.some((r) => r.reason === 'REPLICATED_WITHOUT_CHECKS'),
    'one failing check blocks replication');

  const allPass = baseLaw({
    status: 'replicated',
    null_test: { status: 'PASS' }, oos: { status: 'PASS' }, remove_best: { status: 'PASS' },
  });
  assert(checkLawCatalogue(lawWorld([allPass])).rejections.length === 0, 'all three PASS admits replication');
});

test('a law must cite existing sources and record its tested variants', () => {
  assert(checkLawCatalogue(lawWorld([baseLaw({ data_source_ids: ['NO.SUCH'] })])).rejections
    .some((r) => r.reason === 'UNKNOWN_DATA_SOURCE'), 'unknown source refused');
  assert(checkLawCatalogue(lawWorld([baseLaw({ tested_variants: [] })])).rejections
    .some((r) => r.reason === 'NO_TESTED_VARIANTS'), 'negative variants must be recorded');
});

test('a data constraint is scoped to named existing sources', () => {
  const c = {
    record_type: 'data_constraint', constraint_id: 'DC.TEST', title: 'A test constraint',
    statement: 'A statement long enough to satisfy the schema minimum length requirement.',
    constraint_kind: 'CAUSALITY', scope_source_ids: ['NO.SUCH'], scope_note: 'scoped to one dataset',
    evidence: ['some evidence'], consequence: 'blocks something', status: 'confirmed',
    review_criterion: 'a new source with publication_ts', task_id: 'TASK-TEST',
    evidence_paths: [], fixture_flag: true, source_of_record: 'test fixture',
  };
  assert(validateRecord(schema, 'data_constraint', c).length === 0, 'constraint should validate');
  assert(checkLawCatalogue(lawWorld([], [c])).rejections.some((r) => r.reason === 'UNKNOWN_SCOPE_SOURCE'),
    'a constraint may not name a source that does not exist');
});

test('the seed laws are correctly typed and none overclaims its status', () => {
  const laws = seedCatalog.records.market_laws;
  assert(laws.length === 5, `expected five seed laws, got ${laws.length}`);
  const identity = laws.filter((l) => l.subtype === 'mechanical_identity');
  const empirical = laws.filter((l) => l.subtype === 'empirical_market_law');
  assert(identity.length === 1 && identity[0].law_id === 'LAW.BOOK.LEVEL_SIZE_IDENTITY', 'one identity');
  assert(identity[0].n === null && identity[0].t_stat === null, 'the identity carries no measurement');
  assert(empirical.length === 4, `expected four empirical laws, got ${empirical.length}`);

  for (const l of empirical) {
    assert(l.status !== 'proven', `${l.law_id} may never claim proof`);
    assert(l.status !== 'replicated',
      `${l.law_id}: every seed law rests on a single archive, so none may claim replication yet`);
    for (const check of ['null_test', 'oos', 'remove_best']) {
      assert(['PASS', 'FAIL', 'NOT_RUN'].includes(l[check].status),
        `${l.law_id}.${check} must declare an explicit status`);
    }
    assert(l.n !== null && l.ci_low !== null, `${l.law_id} must carry precision`);
  }

  // The guard law is the only one whose checks all pass, and it still holds status observed.
  const guard = laws.find((l) => l.law_id === 'LAW.EXEC.FLOW_DEPTH_AGREEMENT_PREDICTS_ADVERSE');
  assert(guard, 'the guard law must be present');
  assert(['null_test', 'oos', 'remove_best'].every((c) => guard[c].status === 'PASS'), 'its three checks pass');
  assert(guard.status === 'observed',
    'all checks passing does not make it replicated: the producing task gated DATA_INADEQUATE on sample span');
  assert(guard.review_criterion.includes('non-overlapping'), 'promotion requires a second independent archive span');

  assert(seedCatalog.records.data_constraints.length === 1, 'one constraint');
  const dc = seedCatalog.records.data_constraints[0];
  assert(dc.scope_source_ids.length === 1 && dc.scope_source_ids[0] === 'EDGE.DATA.DISPERSION',
    'the funding constraint is scoped to one dataset, not to all funding archives');
  assert(dc.status === 'confirmed', 'the constraint is confirmed');
});

test('the catalogue summary separates identities from empirical laws', () => {
  const s = seedCatalog.law_catalogue;
  assert(s.identities === 1 && s.empirical === 4, `unexpected split ${JSON.stringify(s)}`);
  assert(s.constraints === 1 && s.constraints_confirmed === 1, 'constraint counts');
  assert(s.by_status.proven === 1 && s.by_status.observed === 4, 'status breakdown');
  assert(s.by_status.replicated === undefined, 'nothing in the seed claims replication');
});

test('query "laws" hides precision on an identity and shows it on an empirical law', () => {
  const identity = runQuery(seedCatalog, 'laws', { subtype: 'mechanical_identity' });
  assert(identity.length === 1 && identity[0].n === null, 'an identity reports no n');
  const empirical = runQuery(seedCatalog, 'laws', { subtype: 'empirical_market_law' });
  assert(empirical.every((l) => l.n !== null && l.ci !== null), 'empirical laws report n and a confidence interval');
  assert(empirical.every((l) => l.checks.null_test !== null), 'empirical laws report their check status');
});

test('query "constraints" reports scope and the review criterion', () => {
  const c = runQuery(seedCatalog, 'constraints', {});
  assert(c.length === 1, 'one constraint');
  assert(c[0].scope_source_ids.includes('EDGE.DATA.DISPERSION'), 'scope named');
  assert(c[0].review_criterion.includes('publication_ts'), 'the review criterion names what would lift it');
  assert(runQuery(seedCatalog, 'constraints', { source: 'EDGE.DATA.OB' }).length === 0, 'scope filter works');
});

// ---------------------------------------------------------------------------
// 9. Static scan
// ---------------------------------------------------------------------------

section('static scan');

const SCANNED_FILES = [BUILDER_PATH, QUERY_PATH, TEST_PATH];

const ALLOWED_MODULES = new Set([
  'node:fs',
  'node:path',
  'node:url',
  'node:os',
  './build_research_warehouse_catalog.mjs',
  './analysis/build_research_warehouse_catalog.mjs',
  './analysis/query_research_warehouse_catalog.mjs',
]);

/** Removes comments and the audited denylist region so prose cannot mask or fake a finding. */
function scannableSource(file) {
  let src = readFileSync(file, 'utf8');
  src = src.replace(
    /\/\* static-scan:allow-denylist-start \*\/[\s\S]*?\/\* static-scan:allow-denylist-end \*\//g,
    '/* excised */',
  );
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.replace(/^\s*\/\/.*$/gm, ' ');
  return src;
}

test('every import is on the allowlist: no network, process, or os-exec module', () => {
  for (const file of SCANNED_FILES) {
    const src = scannableSource(file);
    const specifiers = [...src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const dynamic = [...src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    const requires = [...src.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    for (const mod of [...specifiers, ...dynamic, ...requires]) {
      assert(ALLOWED_MODULES.has(mod), `${file}: forbidden module import '${mod}'`);
    }
  }
});

function scanFor(category) {
  for (const file of SCANNED_FILES) {
    const src = scannableSource(file);
    for (const token of FORBIDDEN_TOKENS[category]) {
      assert(!src.includes(token), `${file}: forbidden ${category} token '${token}'`);
    }
  }
}

test('no network call surface appears anywhere', () => scanFor('network'));

test('no process, service, or shell surface appears anywhere', () => scanFor('process_service'));

test('no environment or credential surface appears outside the audited denylist', () => scanFor('credential'));

test('no exchange, account, order, execution, or position endpoint appears', () => scanFor('exchange_account'));

test('no runtime state of the trading stack is referenced in code', () => scanFor('runtime_state'));

test('no destructive or in-place filesystem call exists in any shipped program', () => scanFor('filesystem_mutation'));

test('promising_count is never set to a nonzero value', () => {
  for (const file of SCANNED_FILES) {
    const src = scannableSource(file);
    assert(!NONZERO_PROMISING_COUNT.test(src), `${file}: assigns a nonzero promising_count`);
  }
  const fixtureSrc = readFileSync(DEFAULT_FIXTURE_PATH, 'utf8');
  assert(!NONZERO_PROMISING_COUNT.test(fixtureSrc), 'the seed fixture assigns a nonzero promising_count');
});

test('the only writes in the builder are the two explicit --out/--csv paths', () => {
  const src = scannableSource(BUILDER_PATH);
  const writes = (src.match(/writeFileSync\(/g) ?? []).length;
  const mkdirs = (src.match(/mkdirSync\(/g) ?? []).length;
  assert(writes === 2, `expected exactly 2 writeFileSync calls (--out, --csv), found ${writes}`);
  assert(mkdirs === 2, `expected exactly 2 mkdirSync calls (--out, --csv), found ${mkdirs}`);
  assert(src.includes('if (opts.out)'), 'the JSON write must be guarded by an explicit --out');
  assert(src.includes('if (opts.csv)'), 'the CSV write must be guarded by an explicit --csv');
});

test('the query CLI contains no write call at all', () => {
  const src = scannableSource(QUERY_PATH);
  for (const token of ['writeFileSync', 'mkdirSync']) {
    assert(!src.includes(token), `${QUERY_PATH}: the query tool must never write (${token})`);
  }
});

test('only audited filesystem primitives are imported, and writes only by the builder', () => {
  const readOnlyFs = new Set(['readFileSync', 'readdirSync', 'statSync', 'existsSync']);
  const writeFs = new Set(['writeFileSync', 'mkdirSync']);
  for (const file of SCANNED_FILES) {
    const src = scannableSource(file);
    const match = src.match(/import\s*\{([^}]*)\}\s*from\s*['"]node:fs['"]/);
    if (!match) continue;
    const names = match[1].split(',').map((s) => s.trim()).filter(Boolean);
    for (const name of names) {
      assert(readOnlyFs.has(name) || writeFs.has(name), `${file}: unaudited node:fs import '${name}'`);
      if (writeFs.has(name)) {
        assert(file === BUILDER_PATH, `${file}: only the builder may import the write primitive '${name}'`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 10. Lessons checker
// ---------------------------------------------------------------------------

section('lessons checker');

test('every lesson id is well formed', () => {
  for (const l of seedCatalog.records.lesson_links) {
    assert(/^LESSON-\d{3}$/.test(l.lesson_id), `malformed lesson id '${l.lesson_id}'`);
  }
});

test('every lesson this task declares relevant is linked in the catalogue', () => {
  const present = new Set(seedCatalog.records.lesson_links.map((l) => l.lesson_id));
  const missing = REQUIRED_LESSONS.filter((id) => !present.has(id));
  assert(missing.length === 0, `TASK-021 declares these lessons relevant but they are unlinked: ${missing.join(', ')}`);
});

test('every terminally failed family carries at least one lesson link', () => {
  const linkedFamilies = new Set(seedCatalog.records.lesson_links.map((l) => l.family_id).filter(Boolean));
  const terminal = seedCatalog.records.failure_routes.filter(
    (fr) => fr.route === 'REJECTED_FAMILY' || fr.route === 'QUARANTINE' || fr.route === 'GUARD_ONLY',
  );
  assert(terminal.length > 0, 'expected terminal failure routes in the seed');
  const unlinked = terminal.map((fr) => fr.family_id).filter((fam) => !linkedFamilies.has(fam));
  assert(unlinked.length === 0, `terminal families without a lesson link: ${[...new Set(unlinked)].join(', ')}`);
});

test('every lesson link names its ledger and its verification state', () => {
  for (const l of seedCatalog.records.lesson_links) {
    assert(l.ledger_path.endsWith('BOTALIN_LESSONS_LEDGER.md'), `unexpected ledger path for ${l.lesson_link_id}`);
    assert(
      schema.enums.verification_status.includes(l.ledger_verification),
      `bad ledger_verification for ${l.lesson_link_id}`,
    );
  }
});

test('an unverified lesson title is never presented as verified', () => {
  const unverified = seedCatalog.records.lesson_links.filter((l) => l.ledger_verification !== 'VERIFIED_READ_ONLY');
  assert(unverified.length > 0, 'the seed must admit that the ledger was not read in this task');
  for (const l of unverified) {
    assert(l.ledger_verification === 'DOCUMENTED_UNVERIFIED', `unexpected state ${l.ledger_verification}`);
  }
});

test('each lesson link points at a known experiment or family', () => {
  const expIds = new Set(seedCatalog.records.experiments.map((e) => e.experiment_id));
  const famIds = new Set([
    ...seedCatalog.records.experiments.map((e) => e.family_id),
    ...seedCatalog.records.failure_routes.map((f) => f.family_id),
  ]);
  for (const l of seedCatalog.records.lesson_links) {
    const ok = (l.experiment_id && expIds.has(l.experiment_id)) || (l.family_id && famIds.has(l.family_id));
    assert(ok, `lesson link ${l.lesson_link_id} references nothing in the catalogue`);
  }
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const failed = results.filter((r) => !r.ok);
const bySection = new Map();
for (const r of results) {
  if (!bySection.has(r.section)) bySection.set(r.section, []);
  bySection.get(r.section).push(r);
}

const lines = [];
lines.push('TASK-021 research warehouse foundation — test suite');
lines.push('');
for (const [name, rows] of bySection) {
  const ok = rows.filter((r) => r.ok).length;
  lines.push(`## ${name}  (${ok}/${rows.length})`);
  for (const r of rows) {
    lines.push(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}`);
    if (!r.ok) lines.push(`       ${r.error}`);
  }
}
lines.push('');
lines.push(`total ${results.length}, passed ${results.length - failed.length}, failed ${failed.length}`);
process.stdout.write(`${lines.join('\n')}\n`);

process.exit(failed.length === 0 ? 0 : 1);
