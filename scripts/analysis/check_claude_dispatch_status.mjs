#!/usr/bin/env node
// TASK-023: read-only acceptance classifier for an explicit envelope/evidence pair.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PROTOCOL_VERSION } from './build_claude_dispatch_envelope.mjs';

export function readJson(path) { return JSON.parse(readFileSync(resolve(path), 'utf8')); }

export function classify(envelope, evidence) {
  const blocked = (reason) => ({ status: 'BLOCKED', reason, accepted: false });
  if (envelope.protocol_version !== PROTOCOL_VERSION || evidence.protocol_version !== PROTOCOL_VERSION) return blocked('PROTOCOL_VERSION_MISMATCH');
  const task = evidence.tasks?.find((item) => item.task_id === envelope.task_id);
  if (!task) return blocked('TASK_NOT_IN_EVIDENCE');
  if (task.task_commit !== envelope.task_commit || task.task_digest !== envelope.task_digest) return blocked('IMMUTABLE_TASK_MISMATCH');
  if (evidence.run === null || evidence.run === undefined) return { status: 'READY', reason: 'NO_RUN_EVIDENCE', accepted: false };
  const run = evidence.run;
  if (run.task_id !== envelope.task_id) return blocked('RUN_TASK_MISMATCH');
  if (run.started === true && run.completed !== true) return { status: 'RUNNING_UNVERIFIED', reason: 'RUN_NOT_COMPLETED', accepted: false };
  if (run.completed !== true) return blocked('RUN_STATE_INVALID');
  if (!run.result_path || !run.result_digest || !run.result_commit) return { status: 'COMPLETED_UNVERIFIED', reason: 'COMPLETION_EVIDENCE_MISSING', accepted: false };
  const changed = Array.isArray(run.changed_paths) ? run.changed_paths : [];
  if (changed.some((path) => !envelope.allowlisted_deliverables.includes(path))) return blocked('FORBIDDEN_CHANGED_PATH');
  if (!changed.includes(run.result_path)) return { status: 'COMPLETED_UNVERIFIED', reason: 'RESULT_NOT_IN_CHANGED_PATHS', accepted: false };
  const required = envelope.required_tests ?? [];
  if (!required.every((name) => run.tests?.[name] === 'PASS')) return { status: 'COMPLETED_UNVERIFIED', reason: 'DECLARED_TEST_MISSING_OR_FAILING', accepted: false };
  if (run.independent_validator !== true) return { status: 'COMPLETED_UNVERIFIED', reason: 'CODEX_REVIEW_REQUIRED', accepted: false };
  return { status: 'ACCEPTED', reason: 'ALL_LOCAL_EVIDENCE_PRESENT', accepted: true, result_commit: run.result_commit };
}

export function parseArgs(argv) {
  const out = { envelope: null, evidence: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = () => { const v = argv[++i]; if (!v) throw new Error(`MISSING_VALUE:${argv[i - 1]}`); return v; };
    if (argv[i] === '--envelope') out.envelope = value();
    else if (argv[i] === '--evidence') out.evidence = value();
    else if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--help') out.help = true;
    else throw new Error(`UNKNOWN_ARGUMENT:${argv[i]}`);
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.envelope || !args.evidence) {
    console.log('Usage: node scripts/analysis/check_claude_dispatch_status.mjs --envelope <json> --evidence <json> [--json]');
    return 64;
  }
  const result = classify(readJson(args.envelope), readJson(args.evidence));
  console.log(args.json ? JSON.stringify(result, null, 2) : `status=${result.status} reason=${result.reason}`);
  return result.status === 'BLOCKED' ? 65 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
