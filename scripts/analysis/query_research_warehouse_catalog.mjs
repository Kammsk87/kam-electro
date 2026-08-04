#!/usr/bin/env node
// query_research_warehouse_catalog.mjs
//
// TASK-021-BOTALIN-RESEARCH-WAREHOUSE-FOUNDATION-V0
//
// Read-only query CLI over the research warehouse catalogue.
//
// It answers, at minimum:
//   data          What data exists for a given source / evidence type / symbol / timeframe / time span?
//   mechanism     Which experiments tested a mechanism, and what were their gates and verdicts?
//   why-rejected  Why was a family rejected, or left data-inadequate?
//   variants      Which structural variants are still permitted, and which are quarantined or refused?
//   blocking-gap  Which data gap blocks the highest-priority next test?
//
// It never writes a file, opens a socket, spawns a process, or reads a secret.
// By default it builds the catalogue in memory from the committed seed fixture.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  loadSchema,
  buildCatalog,
  readManifestFile,
  looksLikeSecretPath,
  DEFAULT_FIXTURE_PATH,
  DEFAULT_SCHEMA_PATH,
} from './build_research_warehouse_catalog.mjs';

const COMMANDS = [
  'data',
  'mechanism',
  'why-rejected',
  'variants',
  'blocking-gap',
  'lessons',
  'summary',
  'trials',
  'trial-summary',
  'trial-lineage',
  'laws',
  'constraints',
  'closures',
];

const USAGE = `query_research_warehouse_catalog.mjs — read-only queries over the Botalin research warehouse catalogue

Usage:
  node scripts/analysis/query_research_warehouse_catalog.mjs <command> [options]

Commands:
  data           What data exists. Filters: --evidence-type --source --symbol --timeframe --from --to --include-gaps
  mechanism      Experiments testing a mechanism, with gates and verdicts. Filters: --tag --family --experiment
  why-rejected   Why a family was rejected or is data-inadequate. Filters: --family
  variants       Permitted structural variants versus quarantined/refused ones. Filters: --family
  blocking-gap   The data gap blocking the highest-priority next test. Filters: --top <n>
  lessons        Lesson links and their verification state. Filters: --lesson --family
  summary        Catalogue counts, coverage, and unindexed evidence types.
  trials         Individual and aggregate-only ledger entries. Filters: --experiment --family --kind
                 --representation INDIVIDUAL|AGGREGATE_ONLY --include-non-counting
  trial-summary  Lower-bound total, individual vs aggregate split, conservation, missing-evidence sources.
  trial-lineage  Parent experiment -> trials -> outcome -> lessons. Filters: --experiment --family --trial
  laws           Measured market laws. Filters: --subtype mechanical_identity|empirical_market_law
                 --status --exploitability
  constraints    Proven limits of a data source. Filters: --source --kind

Catalogue source:
  --catalog <file>   Read a catalogue JSON previously emitted by the builder.
  --manifest <file>  Build in memory from an explicit manifest (repeatable).
  --schema <file>    Schema file. Default: data/research_warehouse_catalog_schema_2026-08-02.json
  (with none of the above, the committed seed fixture is used)

Output:
  --json             Emit machine-readable JSON instead of text.
`;

export function parseArgs(argv) {
  const opts = { command: null, manifests: [], catalog: null, schema: DEFAULT_SCHEMA_PATH, json: false, filters: {} };
  if (argv.length === 0) return { ...opts, help: true };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      i += 1;
      return v;
    };
    if (!arg.startsWith('-') && opts.command === null) {
      if (!COMMANDS.includes(arg)) throw new Error(`Unknown command '${arg}'. Known: ${COMMANDS.join(', ')}`);
      opts.command = arg;
      continue;
    }
    switch (arg) {
      case '--catalog': opts.catalog = next(); break;
      case '--manifest': opts.manifests.push(next()); break;
      case '--schema': opts.schema = next(); break;
      case '--json': opts.json = true; break;
      case '--include-gaps': opts.filters.includeGaps = true; break;
      case '--evidence-type': opts.filters.evidenceType = next(); break;
      case '--source': opts.filters.source = next(); break;
      case '--symbol': opts.filters.symbol = next(); break;
      case '--timeframe': opts.filters.timeframe = next(); break;
      case '--from': opts.filters.from = next(); break;
      case '--to': opts.filters.to = next(); break;
      case '--tag': opts.filters.tag = next(); break;
      case '--family': opts.filters.family = next(); break;
      case '--experiment': opts.filters.experiment = next(); break;
      case '--lesson': opts.filters.lesson = next(); break;
      case '--kind': opts.filters.kind = next(); break;
      case '--representation': opts.filters.representation = next(); break;
      case '--trial': opts.filters.trial = next(); break;
      case '--subtype': opts.filters.subtype = next(); break;
      case '--status': opts.filters.status = next(); break;
      case '--exploitability': opts.filters.exploitability = next(); break;
      case '--include-non-counting': opts.filters.includeNonCounting = true; break;
      case '--top': opts.filters.top = Number.parseInt(next(), 10); break;
      case '-h':
      case '--help': opts.help = true; break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

export function loadCatalog(opts) {
  if (opts.catalog) {
    const p = resolve(opts.catalog);
    if (looksLikeSecretPath(p)) throw new Error(`REFUSED_SECRET_PATH: ${p}`);
    return JSON.parse(readFileSync(p, 'utf8'));
  }
  const schema = loadSchema(opts.schema);
  const paths = opts.manifests.length > 0 ? opts.manifests.map((m) => resolve(m)) : [DEFAULT_FIXTURE_PATH];
  const manifests = paths.map((p) => readManifestFile(p));
  return buildCatalog(schema, manifests, { mode: opts.manifests.length > 0 ? 'explicit_manifests' : 'smoke' });
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function overlapsSpan(source, from, to) {
  if (!from && !to) return true;
  // A source with an unknown span cannot be excluded; unknown is not "no".
  if (!source.time_span_start && !source.time_span_end) return true;
  const start = source.time_span_start ? Date.parse(source.time_span_start) : Number.NEGATIVE_INFINITY;
  const end = source.time_span_end ? Date.parse(source.time_span_end) : Number.POSITIVE_INFINITY;
  const qFrom = from ? Date.parse(from) : Number.NEGATIVE_INFINITY;
  const qTo = to ? Date.parse(to) : Number.POSITIVE_INFINITY;
  return start <= qTo && end >= qFrom;
}

function matchesList(list, needle) {
  if (!needle) return true;
  const n = needle.toUpperCase();
  return list.some((v) => String(v).toUpperCase() === n);
}

export function queryData(catalog, f = {}) {
  return catalog.records.data_sources
    .filter((s) => (f.evidenceType ? s.evidence_type === f.evidenceType.toUpperCase() : true))
    .filter((s) => (f.source ? s.source_id === f.source : true))
    .filter((s) => matchesList(s.symbols, f.symbol))
    .filter((s) => matchesList(s.timeframes, f.timeframe))
    .filter((s) => overlapsSpan(s, f.from, f.to))
    .filter((s) => (f.includeGaps ? true : s.verification_status !== 'MISSING'))
    .map((s) => ({
      source_id: s.source_id,
      evidence_type: s.evidence_type,
      retained_path: s.retained_path,
      run_id: s.run_id,
      time_span: [s.time_span_start, s.time_span_end],
      symbols: s.symbols,
      timeframes: s.timeframes,
      schema_fingerprint: s.schema_fingerprint,
      write_ownership: s.write_ownership,
      read_only_status: s.read_only_status,
      verification_status: s.verification_status,
      evidence_grade: s.evidence_grade,
      fixture_flag: s.fixture_flag,
      known_gaps: s.known_gaps ?? [],
    }));
}

export function queryMechanism(catalog, f = {}) {
  const tag = f.tag ? f.tag.toLowerCase() : null;
  const experiments = catalog.records.experiments.filter((e) => {
    if (f.experiment && e.experiment_id !== f.experiment) return false;
    if (f.family && e.family_id !== f.family) return false;
    if (tag) {
      const hay = [...e.mechanism_tags, e.model_family, e.title].join(' ').toLowerCase();
      if (!hay.includes(tag)) return false;
    }
    return true;
  });
  return experiments.map((e) => {
    const results = catalog.records.results.filter((r) => r.experiment_id === e.experiment_id);
    return {
      experiment_id: e.experiment_id,
      family_id: e.family_id,
      title: e.title,
      mechanism_tags: e.mechanism_tags,
      lifecycle_state: e.lifecycle_state,
      timeframes: e.timeframes,
      data_source_ids: e.data_source_ids,
      prior_trials_seeded: e.prior_trials_seeded ?? 0,
      results: results.map((r) => ({
        result_id: r.result_id,
        segment: r.segment,
        axis_L: r.axis_L,
        axis_X: r.axis_X,
        gates: r.gates,
        failed_gates: Object.entries(r.gates).filter(([, v]) => v === 'FAIL').map(([k]) => k),
        verdict: r.verdict,
        closure_status: r.closure_status,
        validator_id: r.validator_id,
        metrics_net_of_cost: r.metrics_net_of_cost,
        evidence_paths: r.evidence_paths,
      })),
    };
  });
}

export function queryWhyRejected(catalog, f = {}) {
  const experimentById = new Map(catalog.records.experiments.map((e) => [e.experiment_id, e]));
  return catalog.records.failure_routes
    .filter((fr) => (f.family ? fr.family_id === f.family : true))
    .slice()
    .sort((a, b) => a.priority - b.priority || (a.failure_route_id < b.failure_route_id ? -1 : 1))
    .map((fr) => {
      const results = catalog.records.results.filter((r) => r.experiment_id === fr.experiment_id);
      return {
        failure_route_id: fr.failure_route_id,
        family_id: fr.family_id,
        experiment_id: fr.experiment_id,
        route: fr.route,
        failure_mechanism: fr.failure_mechanism,
        priority: fr.priority,
        allowed_successor: fr.allowed_successor,
        blocking_data_gap_id: fr.blocking_data_gap_id,
        data_inadequate: fr.route === 'DATA_REQUEST' || results.some((r) => r.closure_status === 'BLOCKED_ON_DATA'),
        lifecycle_state: experimentById.get(fr.experiment_id)?.lifecycle_state ?? null,
        verdicts: results.map((r) => `${r.segment}:${r.verdict}`),
        source_of_record: fr.source_of_record,
      };
    });
}

export function queryVariants(catalog, f = {}) {
  const experimentById = new Map(catalog.records.experiments.map((e) => [e.experiment_id, e]));
  const inFamily = (id) => {
    if (!f.family) return true;
    const exp = experimentById.get(id);
    return exp ? exp.family_id === f.family : id === f.family;
  };

  const permitted = catalog.records.lineage_edges
    .filter((e) => e.edge_kind === 'STRUCTURAL_VARIANT_OF' && e.permitted === true)
    .filter((e) => inFamily(e.from_id) || inFamily(e.to_id))
    .map((e) => ({
      edge_id: e.edge_id,
      parent: e.from_id,
      variant: e.to_id,
      structural_difference: e.structural_difference,
      new_task_id: e.new_task_id,
      new_model_identity: e.new_model_identity,
      justification: e.justification,
    }));

  const refused = catalog.rejected_records
    .filter((r) => r.record_type === 'lineage_edge')
    .map((r) => ({ edge_id: r.id, reason: r.reason, detail: r.detail }));

  const quarantined = catalog.records.results
    .filter((r) => r.closure_status === 'QUARANTINED' || r.verdict === 'QUARANTINED')
    .filter((r) => inFamily(r.experiment_id))
    .map((r) => ({
      experiment_id: r.experiment_id,
      family_id: experimentById.get(r.experiment_id)?.family_id ?? null,
      result_id: r.result_id,
      verdict: r.verdict,
      closure_status: r.closure_status,
    }));

  const closedFamilies = [
    ...new Set(
      catalog.records.results
        .filter((r) => r.closure_status === 'CLOSED_REJECTED')
        .map((r) => experimentById.get(r.experiment_id)?.family_id)
        .filter(Boolean),
    ),
  ].filter((fam) => (f.family ? fam === f.family : true));

  return { permitted, refused, quarantined, closed_families: closedFamilies };
}

export function queryBlockingGap(catalog, f = {}) {
  const top = Number.isInteger(f.top) && f.top > 0 ? f.top : 3;
  const sourceById = new Map(catalog.records.data_sources.map((s) => [s.source_id, s]));
  return catalog.blocking_gaps_by_priority.slice(0, top).map((g) => {
    const gap = sourceById.get(g.blocking_data_gap_id);
    return {
      priority: g.priority,
      failure_route_id: g.failure_route_id,
      family_id: g.family_id,
      route: g.route,
      allowed_successor: g.allowed_successor,
      blocking_data_gap_id: g.blocking_data_gap_id,
      gap_title: gap?.title ?? null,
      gap_evidence_type: gap?.evidence_type ?? null,
      gap_verification_status: gap?.verification_status ?? null,
      gap_requirement: gap?.schema_fingerprint ?? null,
      gap_detail: gap?.known_gaps ?? [],
    };
  });
}

export function queryLessons(catalog, f = {}) {
  return catalog.records.lesson_links
    .filter((l) => (f.lesson ? l.lesson_id === f.lesson : true))
    .filter((l) => (f.family ? l.family_id === f.family : true))
    .map((l) => ({
      lesson_link_id: l.lesson_link_id,
      lesson_id: l.lesson_id,
      lesson_title: l.lesson_title,
      relation: l.relation,
      experiment_id: l.experiment_id,
      family_id: l.family_id,
      ledger_path: l.ledger_path,
      ledger_verification: l.ledger_verification,
    }));
}

export function queryTrials(catalog, f = {}) {
  return catalog.records.trial_ledger_entries
    .filter((t) => (f.experiment ? t.parent_experiment_id === f.experiment : true))
    .filter((t) => (f.family ? t.family_id === f.family : true))
    .filter((t) => (f.kind ? t.kind === f.kind.toUpperCase() : true))
    .filter((t) => (f.representation ? t.representation === f.representation.toUpperCase() : true))
    .filter((t) => (f.includeNonCounting ? true : t.counts_toward_lower_bound))
    .map((t) => ({
      trial_id: t.trial_id,
      parent_experiment_id: t.parent_experiment_id,
      family_id: t.family_id,
      kind: t.kind,
      representation: t.representation,
      exact_trial_count: t.exact_trial_count,
      counts_toward_lower_bound: t.counts_toward_lower_bound,
      dedup_key: t.dedup_key,
      parameter_fingerprint: t.parameter_fingerprint,
      split: t.split,
      cost_model_applied: t.cost_model_applied,
      verdict: t.verdict,
      failure_route: t.failure_route,
      reconciliation_status: t.reconciliation_status,
      missing_child_evidence_id: t.missing_child_evidence_id,
      member_of_aggregate_trial_id: t.member_of_aggregate_trial_id,
      attacks_trial_id: t.attacks_trial_id,
      evidence_path: t.evidence_path,
      verification_grade: t.verification_grade,
      fixture_flag: t.fixture_flag,
    }));
}

export function queryTrialSummary(catalog, f = {}) {
  const byExperiment = catalog.trial_conservation_by_experiment
    .filter((e) => (f.family ? e.family_id === f.family : true))
    .filter((e) => (f.experiment ? e.experiment_id === f.experiment : true));
  return {
    ...catalog.trial_ledger,
    independent_experiments: byExperiment.filter((e) => !e.fixture).length,
    by_experiment: byExperiment,
    conservation_violations: byExperiment.filter((e) => !e.conserved),
  };
}

export function queryTrialLineage(catalog, f = {}) {
  const entries = catalog.records.trial_ledger_entries;
  const evidenceById = new Map(catalog.records.trial_evidence.map((e) => [e.evidence_id, e]));
  const experiments = catalog.records.experiments
    .filter((e) => (f.experiment ? e.experiment_id === f.experiment : true))
    .filter((e) => (f.family ? e.family_id === f.family : true))
    .filter((e) => (f.trial ? entries.some((t) => t.trial_id === f.trial && t.parent_experiment_id === e.experiment_id) : true));

  return experiments.map((exp) => {
    const linked = entries
      .filter((t) => t.parent_experiment_id === exp.experiment_id)
      .filter((t) => (f.trial ? t.trial_id === f.trial : true));
    return {
      experiment_id: exp.experiment_id,
      family_id: exp.family_id,
      lifecycle_state: exp.lifecycle_state,
      declared_prior_trials_seeded: exp.prior_trials_seeded ?? null,
      trials: linked.map((t) => ({
        trial_id: t.trial_id,
        kind: t.kind,
        representation: t.representation,
        exact_trial_count: t.exact_trial_count,
        counts_toward_lower_bound: t.counts_toward_lower_bound,
        verdict: t.verdict,
        failure_route: t.failure_route,
        reconciliation_status: t.reconciliation_status,
        attacks_trial_id: t.attacks_trial_id,
        member_of_aggregate_trial_id: t.member_of_aggregate_trial_id,
        missing_evidence: t.missing_child_evidence_id
          ? {
              evidence_id: t.missing_child_evidence_id,
              required_artefact: evidenceById.get(t.missing_child_evidence_id)?.required_artefact ?? null,
              recoverable_child_count_estimate:
                evidenceById.get(t.missing_child_evidence_id)?.recoverable_child_count_estimate ?? null,
              recovery_phase: evidenceById.get(t.missing_child_evidence_id)?.recovery_phase ?? null,
            }
          : null,
      })),
      outcomes: catalog.records.results
        .filter((r) => r.experiment_id === exp.experiment_id)
        .map((r) => ({ result_id: r.result_id, segment: r.segment, verdict: r.verdict, closure_status: r.closure_status })),
      failure_routes: catalog.records.failure_routes
        .filter((fr) => fr.experiment_id === exp.experiment_id)
        .map((fr) => ({ failure_route_id: fr.failure_route_id, route: fr.route, allowed_successor: fr.allowed_successor })),
      lessons: catalog.records.lesson_links
        .filter((l) => l.experiment_id === exp.experiment_id || l.family_id === exp.family_id)
        .map((l) => ({ lesson_id: l.lesson_id, lesson_title: l.lesson_title, relation: l.relation })),
    };
  });
}

export function queryLaws(catalog, f = {}) {
  return (catalog.records.market_laws ?? [])
    .filter((l) => (f.subtype ? l.subtype === f.subtype : true))
    .filter((l) => (f.status ? l.status === f.status : true))
    .filter((l) => (f.exploitability ? l.exploitability_class === f.exploitability.toUpperCase() : true))
    .map((l) => ({
      law_id: l.law_id, subtype: l.subtype, status: l.status, title: l.title, statement: l.statement,
      condition: l.condition, horizon: l.horizon, effect: l.effect,
      n: l.n, t_stat: l.t_stat, ci: l.ci_low === null ? null : [l.ci_low, l.ci_high],
      checks: { null_test: l.null_test?.status ?? null, oos: l.oos?.status ?? null, remove_best: l.remove_best?.status ?? null },
      mechanism_claim: l.mechanism_claim, exploitability_class: l.exploitability_class,
      temporal_stability: l.temporal_stability, review_criterion: l.review_criterion,
      tested_variants: l.tested_variants.length, data_source_ids: l.data_source_ids, task_id: l.task_id,
    }));
}

export function queryConstraints(catalog, f = {}) {
  return (catalog.records.data_constraints ?? [])
    .filter((c) => (f.source ? c.scope_source_ids.includes(f.source) : true))
    .filter((c) => (f.kind ? c.constraint_kind === f.kind.toUpperCase() : true))
    .map((c) => ({
      constraint_id: c.constraint_id, kind: c.constraint_kind, status: c.status, title: c.title,
      statement: c.statement, scope_source_ids: c.scope_source_ids, scope_note: c.scope_note,
      evidence: c.evidence, consequence: c.consequence, review_criterion: c.review_criterion, task_id: c.task_id,
    }));
}

/**
 * The closure registry. Ordered so that measured closures come before underpowered ones:
 * conflating the two would convert "we could not tell" into "it does not work", which is the
 * single most likely way this registry becomes misleading.
 */
export function queryClosures(catalog, f = {}) {
  const rank = { CLOSED_MEASURED: 0, CLOSED_UNDERPOWERED: 1, DATA_BLOCKED: 2, GUARD_ONLY: 3, QUARANTINED: 4, REOPENED: 5 };
  return (catalog.records.closure_decisions ?? [])
    .filter((d) => (f.subject ? d.subject === f.subject : true))
    .filter((d) => (f.kind ? d.subject_kind === f.kind.toUpperCase() : true))
    .filter((d) => (f.disposition ? d.disposition === f.disposition.toUpperCase() : true))
    .slice()
    .sort((a, b) => (rank[a.disposition] ?? 9) - (rank[b.disposition] ?? 9)
      || (a.decision_id < b.decision_id ? -1 : 1))
    .map((d) => ({
      decision_id: d.decision_id, subject: d.subject, subject_kind: d.subject_kind,
      disposition: d.disposition, authority: d.authority,
      decisive_measurement: d.decisive_measurement, decisive_metric: d.decisive_metric ?? null,
      reopen_criterion: d.reopen_criterion, supersedes: d.supersedes ?? [],
      law_ids: d.law_ids ?? [], constraint_ids: d.constraint_ids ?? [],
      task_id: d.task_id, decided_at: d.decided_at, notes: d.notes ?? null,
    }));
}

export function querySummary(catalog) {
  return {
    schema_version: catalog.catalog_schema_version,
    mode: catalog.mode,
    promising_count: catalog.promising_count,
    counts: catalog.counts,
    evidence_types_without_raw_primary: catalog.coverage.evidence_types_without_raw_primary,
    missing_sources: catalog.records.data_sources
      .filter((s) => s.verification_status === 'MISSING')
      .map((s) => s.source_id),
    unverified_sources: catalog.records.data_sources
      .filter((s) => s.verification_status === 'DOCUMENTED_UNVERIFIED')
      .map((s) => s.source_id),
    rejected_records: catalog.rejected_records.length,
    errors: catalog.errors.length,
  };
}

// ---------------------------------------------------------------------------
// Text rendering
// ---------------------------------------------------------------------------

function renderText(command, payload) {
  const lines = [];
  const bullet = (s) => lines.push(`  ${s}`);

  switch (command) {
    case 'data':
      lines.push(`data sources matching filter: ${payload.length}`);
      for (const s of payload) {
        lines.push(`- ${s.source_id}  [${s.evidence_type}]  ${s.evidence_grade}/${s.verification_status}`);
        bullet(`path      ${s.retained_path}`);
        bullet(`span      ${s.time_span[0] ?? 'unknown'} .. ${s.time_span[1] ?? 'unknown'}`);
        bullet(`tf/sym    ${s.timeframes.join(',') || '-'} / ${s.symbols.join(',') || '-'}`);
        bullet(`ownership ${s.write_ownership}  read_only=${s.read_only_status}  fixture=${s.fixture_flag}`);
        for (const g of s.known_gaps) bullet(`gap       ${g}`);
      }
      break;
    case 'mechanism':
      lines.push(`experiments matching filter: ${payload.length}`);
      for (const e of payload) {
        lines.push(`- ${e.experiment_id}  (${e.family_id})  ${e.lifecycle_state}`);
        bullet(`title  ${e.title}`);
        bullet(`tags   ${e.mechanism_tags.join(', ')}`);
        bullet(`trials seeded on shared data: ${e.prior_trials_seeded}`);
        for (const r of e.results) {
          bullet(`result ${r.result_id} [${r.segment} ${r.axis_L}/${r.axis_X}] -> ${r.verdict} (${r.closure_status})`);
          bullet(`       failed gates: ${r.failed_gates.join(',') || 'none'}; validator: ${r.validator_id ?? 'NONE'}`);
        }
        if (e.results.length === 0) bullet('result none recorded');
      }
      break;
    case 'why-rejected':
      lines.push(`failure routes matching filter: ${payload.length}`);
      for (const fr of payload) {
        lines.push(`- ${fr.family_id}  route=${fr.route}  priority=${fr.priority}  data_inadequate=${fr.data_inadequate}`);
        bullet(`why       ${fr.failure_mechanism}`);
        bullet(`verdicts  ${fr.verdicts.join(', ') || 'none'}`);
        bullet(`successor ${fr.allowed_successor ?? 'NONE PERMITTED'}`);
        bullet(`blocked   ${fr.blocking_data_gap_id ?? '-'}`);
        bullet(`source    ${fr.source_of_record}`);
      }
      break;
    case 'variants':
      lines.push(`permitted structural variants: ${payload.permitted.length}`);
      for (const v of payload.permitted) {
        lines.push(`- ${v.parent} -> ${v.variant}`);
        bullet(`difference   ${v.structural_difference}`);
        bullet(`new task     ${v.new_task_id}`);
        bullet(`new model id ${v.new_model_identity}`);
      }
      lines.push(`refused variant proposals: ${payload.refused.length}`);
      for (const r of payload.refused) lines.push(`- ${r.edge_id}  ${r.reason}: ${r.detail}`);
      lines.push(`quarantined: ${payload.quarantined.length}`);
      for (const q of payload.quarantined) lines.push(`- ${q.experiment_id} (${q.family_id}) ${q.verdict}`);
      lines.push(`closed rejected families: ${payload.closed_families.join(', ') || 'none'}`);
      break;
    case 'blocking-gap':
      lines.push(`blocking data gaps, highest priority first: ${payload.length}`);
      for (const g of payload) {
        lines.push(`- priority ${g.priority}  ${g.family_id}  route=${g.route}`);
        bullet(`gap        ${g.blocking_data_gap_id} (${g.gap_evidence_type ?? '-'}, ${g.gap_verification_status ?? '-'})`);
        bullet(`title      ${g.gap_title ?? '-'}`);
        bullet(`requires   ${g.gap_requirement ?? '-'}`);
        for (const d of g.gap_detail) bullet(`detail     ${d}`);
        bullet(`successor  ${g.allowed_successor ?? 'NONE PERMITTED'}`);
      }
      break;
    case 'lessons':
      lines.push(`lesson links: ${payload.length}`);
      for (const l of payload) {
        lines.push(`- ${l.lesson_id} ${l.lesson_title}  [${l.relation}]  ${l.ledger_verification}`);
        bullet(`applies to ${l.experiment_id ?? l.family_id ?? '-'}`);
        bullet(`ledger     ${l.ledger_path}`);
      }
      break;
    case 'trials':
      lines.push(`ledger entries matching filter: ${payload.length}`);
      for (const t of payload) {
        const counted = t.counts_toward_lower_bound ? `counts x${t.exact_trial_count}` : 'NOT COUNTED';
        lines.push(`- ${t.trial_id}  [${t.kind} / ${t.representation}]  ${counted}`);
        bullet(`parent      ${t.parent_experiment_id} (${t.family_id})`);
        bullet(`split       ${t.split}  costs=${t.cost_model_applied}  verdict=${t.verdict ?? '-'}  route=${t.failure_route ?? '-'}`);
        bullet(`fingerprint ${t.parameter_fingerprint ?? 'none recorded'}`);
        bullet(`dedup       ${t.dedup_key}`);
        bullet(`evidence    ${t.evidence_path}  [${t.verification_grade}]`);
        bullet(`reconcile   ${t.reconciliation_status}${t.missing_child_evidence_id ? ` -> ${t.missing_child_evidence_id}` : ''}`);
        if (t.member_of_aggregate_trial_id) bullet(`inside      ${t.member_of_aggregate_trial_id}`);
        if (t.attacks_trial_id) bullet(`attacks     ${t.attacks_trial_id}`);
      }
      break;
    case 'trial-summary':
      lines.push(`lower-bound trials: ${payload.lower_bound_trials}`);
      lines.push(`  individually recorded : ${payload.individual_trials} trials in ${payload.individual_entries} entries`);
      lines.push(`  aggregate-only        : ${payload.aggregate_only_trials} trials in ${payload.aggregate_only_entries} entries`);
      lines.push(`  non-counting entries  : ${payload.non_counting_entries} (attacks, null controls, replays, diagnostics)`);
      lines.push(`independent experiments: ${payload.independent_experiments}`);
      lines.push(`count conservation: ${payload.experiments_conserved}/${payload.experiments_total} experiments`);
      lines.push(`trials whose count is stated in a local artefact: ${payload.trials_with_artefact_stated_count}`);
      lines.push(`reconciled entries: ${payload.reconciled_entries}   pending: ${payload.entries_pending_reconciliation}`);
      if (payload.conservation_violations.length > 0) {
        lines.push('CONSERVATION VIOLATIONS:');
        for (const v of payload.conservation_violations) {
          lines.push(`  ${v.experiment_id}: declared ${v.declared} vs ledger ${v.ledger_sum}`);
        }
      }
      lines.push(`missing-evidence sources: ${payload.missing_evidence_sources.length}`);
      for (const e of payload.missing_evidence_sources) {
        const n = e.recoverable_child_count_estimate === null ? 'unknown' : String(e.recoverable_child_count_estimate);
        lines.push(`- ${e.evidence_id}  children=${n}  phase=${e.recovery_phase}`);
        bullet(`needs    ${e.required_artefact}`);
        bullet(`location ${e.artefact_location_hint} [${e.location_verification}]`);
      }
      break;
    case 'trial-lineage':
      lines.push(`experiments matching filter: ${payload.length}`);
      for (const e of payload) {
        lines.push(`- ${e.experiment_id} (${e.family_id})  declared ${e.declared_prior_trials_seeded} prior trials`);
        for (const t of e.trials) {
          const c = t.counts_toward_lower_bound ? `x${t.exact_trial_count}` : 'not counted';
          bullet(`trial   ${t.trial_id} [${t.kind}/${t.representation}] ${c} -> ${t.verdict ?? '-'}`);
          if (t.attacks_trial_id) bullet(`        attacks ${t.attacks_trial_id}`);
          if (t.member_of_aggregate_trial_id) bullet(`        inside ${t.member_of_aggregate_trial_id}`);
          if (t.missing_evidence) {
            const n = t.missing_evidence.recoverable_child_count_estimate;
            bullet(`        missing evidence ${t.missing_evidence.evidence_id} (children=${n === null ? 'unknown' : n})`);
          }
        }
        for (const o of e.outcomes) bullet(`outcome ${o.result_id} [${o.segment}] ${o.verdict} (${o.closure_status})`);
        for (const fr of e.failure_routes) bullet(`route   ${fr.failure_route_id} ${fr.route} -> ${fr.allowed_successor ?? 'NONE'}`);
        for (const l of e.lessons) bullet(`lesson  ${l.lesson_id} ${l.lesson_title} [${l.relation}]`);
      }
      break;
    case 'laws':
      lines.push(`market laws: ${payload.length}`);
      for (const l of payload) {
        lines.push(`- ${l.law_id}  [${l.subtype}]  status=${l.status}`);
        bullet(`title      ${l.title}`);
        bullet(`condition  ${l.condition}`);
        bullet(`horizon    ${l.horizon}`);
        if (l.subtype === 'mechanical_identity') {
          bullet('precision  none — true by construction, not a measurement');
        } else {
          bullet(`precision  n=${l.n} t=${l.t_stat} ci=[${l.ci?.join(', ')}]`);
          bullet(`checks     null=${l.checks.null_test} oos=${l.checks.oos} remove_best=${l.checks.remove_best}`);
        }
        bullet(`mechanism  ${l.mechanism_claim}`);
        bullet(`exploit    ${l.exploitability_class}`);
        bullet(`stability  ${l.temporal_stability}`);
        bullet(`review     ${l.review_criterion}`);
        bullet(`variants   ${l.tested_variants} recorded (including negatives)`);
      }
      break;
    case 'constraints':
      lines.push(`data constraints: ${payload.length}`);
      for (const c of payload) {
        lines.push(`- ${c.constraint_id}  [${c.kind}]  status=${c.status}`);
        bullet(`statement   ${c.statement}`);
        bullet(`scope       ${c.scope_source_ids.join(', ')}`);
        bullet(`scope note  ${c.scope_note}`);
        for (const e of c.evidence) bullet(`evidence    ${e}`);
        bullet(`consequence ${c.consequence}`);
        bullet(`review      ${c.review_criterion}`);
      }
      break;
    case 'closures':
      lines.push(`closure decisions: ${payload.length}`);
      for (const d of payload) {
        lines.push(`- ${d.decision_id}  ${d.subject}  [${d.subject_kind}]  ${d.disposition}  by ${d.authority}`);
        bullet(`measured   ${d.decisive_measurement}`);
        if (d.decisive_metric) bullet(`metric     ${JSON.stringify(d.decisive_metric)}`);
        bullet(`reopen     ${d.reopen_criterion}`);
        if (d.supersedes.length) bullet(`supersedes ${d.supersedes.join(', ')}`);
        if (d.law_ids.length) bullet(`laws       ${d.law_ids.join(', ')}`);
        if (d.constraint_ids.length) bullet(`constraint ${d.constraint_ids.join(', ')}`);
        if (d.notes) bullet(`notes      ${d.notes}`);
      }
      break;
    case 'summary':
      lines.push(`schema ${payload.schema_version}  mode ${payload.mode}  promising_count ${payload.promising_count}`);
      lines.push('counts: ' + Object.entries(payload.counts).map(([k, v]) => `${k}=${v}`).join(' '));
      lines.push(`evidence types without an available RAW_PRIMARY source: ${payload.evidence_types_without_raw_primary.join(', ') || 'none'}`);
      lines.push(`sources MISSING (${payload.missing_sources.length}): ${payload.missing_sources.join(', ') || 'none'}`);
      lines.push(`sources DOCUMENTED_UNVERIFIED (${payload.unverified_sources.length}): ${payload.unverified_sources.join(', ') || 'none'}`);
      lines.push(`rejected records: ${payload.rejected_records}   errors: ${payload.errors}`);
      break;
    default:
      lines.push(JSON.stringify(payload, null, 2));
  }
  return lines.join('\n');
}

export function runQuery(catalog, command, filters) {
  switch (command) {
    case 'data': return queryData(catalog, filters);
    case 'mechanism': return queryMechanism(catalog, filters);
    case 'why-rejected': return queryWhyRejected(catalog, filters);
    case 'variants': return queryVariants(catalog, filters);
    case 'blocking-gap': return queryBlockingGap(catalog, filters);
    case 'lessons': return queryLessons(catalog, filters);
    case 'summary': return querySummary(catalog);
    case 'trials': return queryTrials(catalog, filters);
    case 'trial-summary': return queryTrialSummary(catalog, filters);
    case 'trial-lineage': return queryTrialLineage(catalog, filters);
    case 'laws': return queryLaws(catalog, filters);
    case 'constraints': return queryConstraints(catalog, filters);
    case 'closures': return queryClosures(catalog, filters);
    default: throw new Error(`Unknown command '${command}'`);
  }
}

export function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n\n${USAGE}\n`);
    return 64;
  }
  if (opts.help || !opts.command) {
    process.stdout.write(`${USAGE}\n`);
    return opts.help ? 0 : 64;
  }

  const catalog = loadCatalog(opts);
  const payload = runQuery(catalog, opts.command, opts.filters);

  process.stdout.write(
    opts.json ? `${JSON.stringify(payload, null, 2)}\n` : `${renderText(opts.command, payload)}\n`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
