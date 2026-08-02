#!/usr/bin/env node
// Deterministic TASK-023 tests. No process, network, or Claude invocation.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnvelope, digest, main as buildMain, parseTaskId, validateTaskText } from './analysis/build_claude_dispatch_envelope.mjs';
import { classify } from './analysis/check_claude_dispatch_status.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TASK = resolve(ROOT, 'tasks/ready/TASK-023-BOTALIN-CLAUDE-CLI-DISPATCH-PROTOCOL-V0.md');
const FIXTURE = resolve(ROOT, 'data/claude_dispatch_protocol_fixture_2026-08-02.json');
const source = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const evidence = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const taskText = readFileSync(TASK, 'utf8');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed += 1; console.log(`ok ${name}`); }
  catch (error) { failed += 1; console.log(`FAIL ${name}: ${error.message}`); }
}
function equal(actual, expected, message = 'values differ') { if (actual !== expected) throw new Error(`${message}: ${actual} !== ${expected}`); }
function throws(fn, code) { try { fn(); } catch (error) { if (String(error.message).includes(code)) return; throw error; } throw new Error(`expected ${code}`); }

test('task id is stable', () => equal(parseTaskId(taskText), 'TASK-023'));
test('task has a bounded safety boundary', () => validateTaskText(taskText));
test('task requesting execution is refused', () => throws(() => validateTaskText(taskText.replace('No automatic retry', 'Must launch a live process')), 'TASK_EXECUTION_REQUEST_FORBIDDEN'));
test('task digest matches committed evidence', () => equal(digest(taskText), evidence.tasks[0].task_digest));
test('dry-run envelope is deterministic', () => {
  const a = buildEnvelope({ taskPath: TASK, evidence });
  const b = buildEnvelope({ taskPath: TASK, evidence });
  equal(JSON.stringify(a), JSON.stringify(b));
});
test('dry-run does not mutate source inputs', () => {
  const beforeTask = readFileSync(TASK, 'utf8');
  const beforeFixture = readFileSync(FIXTURE, 'utf8');
  buildEnvelope({ taskPath: TASK, evidence });
  equal(readFileSync(TASK, 'utf8'), beforeTask, 'task file mutated');
  equal(readFileSync(FIXTURE, 'utf8'), beforeFixture, 'fixture mutated');
});
test('direct CLI entrypoint returns ready output', () => {
  const originalLog = console.log;
  const lines = [];
  console.log = (line) => lines.push(String(line));
  try {
    equal(buildMain(['--task', TASK]), 0);
  } finally {
    console.log = originalLog;
  }
  if (!lines.join('\n').includes('status=READY task=TASK-023')) throw new Error('missing ready output');
});
test('dry-run never claims execution', () => {
  const e = buildEnvelope({ taskPath: TASK, evidence });
  equal(e.execution.mode, 'DRY_RUN_ONLY'); equal(e.execution.process_started, false); equal(e.execution.network_used, false);
});
test('unknown task is refused', () => throws(() => buildEnvelope({ taskPath: 'missing.md', taskText: '# TASK-999-X\n## Objective\n## Safety boundary\ndo not do things\n## Allowlisted deliverables\n`x`', evidence }), 'UNKNOWN_TASK'));
test('digest mismatch is refused', () => {
  const changed = { ...evidence, tasks: [{ ...evidence.tasks[0], task_digest: 'bad' }] };
  throws(() => buildEnvelope({ taskPath: TASK, evidence: changed }), 'TASK_DIGEST_MISMATCH');
});
test('dirty task is refused', () => {
  const changed = { ...evidence, tasks: [{ ...evidence.tasks[0], dirty: true }] };
  throws(() => buildEnvelope({ taskPath: TASK, evidence: changed }), 'TASK_NOT_IMMUTABLE');
});
test('new task starts READY', () => equal(classify(buildEnvelope({ taskPath: TASK, evidence }), evidence).status, 'READY'));
test('incomplete completion stays unverified', () => {
  const incomplete = { ...evidence, run: { task_id: evidence.tasks[0].task_id, completed: true } };
  equal(classify(buildEnvelope({ taskPath: TASK, evidence }), incomplete).status, 'COMPLETED_UNVERIFIED');
});
test('forbidden changed path blocks acceptance', () => {
  const run = { task_id: evidence.tasks[0].task_id, completed: true, result_path: 'tasks/results/TASK-023-BOTALIN-CLAUDE-CLI-DISPATCH-PROTOCOL-V0-RESULT.md', result_digest: 'x', result_commit: 'x', changed_paths: ['.env'], tests: {}, independent_validator: false };
  equal(classify(buildEnvelope({ taskPath: TASK, evidence }), { ...evidence, run }).status, 'BLOCKED');
});
test('only complete declared evidence is accepted', () => {
  const entry = evidence.tasks[0];
  const result = 'tasks/results/TASK-023-BOTALIN-CLAUDE-CLI-DISPATCH-PROTOCOL-V0-RESULT.md';
  const run = { task_id: entry.task_id, completed: true, result_path: result, result_digest: 'abc', result_commit: 'def', changed_paths: [...entry.allowlisted_deliverables], tests: Object.fromEntries(entry.required_tests.map((x) => [x, 'PASS'])), independent_validator: true };
  equal(classify(buildEnvelope({ taskPath: TASK, evidence }), { ...evidence, run }).status, 'ACCEPTED');
});
test('shipped programs never invoke Claude or a process module', () => {
  for (const file of ['scripts/analysis/build_claude_dispatch_envelope.mjs', 'scripts/analysis/check_claude_dispatch_status.mjs']) {
    const text = source(file);
    if (/child_process|spawn\(|exec\(|\.local\/bin\/claude/.test(text)) throw new Error(`forbidden invocation surface in ${file}`);
  }
});

console.log(`total ${passed + failed}, passed ${passed}, failed ${failed}`);
process.exitCode = failed === 0 ? 0 : 1;
