#!/usr/bin/env node
// TASK-023: deterministic dry-run dispatch envelope builder.
// This program never launches Claude or a shell. It reads only explicit files.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROTOCOL_VERSION = '2026-08-02.v0';
export const DEFAULT_FIXTURE = 'data/claude_dispatch_protocol_fixture_2026-08-02.json';

const REQUIRED_TASK_SECTIONS = ['# TASK-', '## Objective', '## Safety boundary', '## Allowlisted deliverables'];
const FORBIDDEN_AUTOMATION = [/automatic retry/i, /task chaining/i, /automatic successor/i];
const FORBIDDEN_EXECUTION_REQUESTS = [/\bmust\s+(?:launch|start)\b/i, /\b(?:launch|start)\s+(?:a )?(?:live|paper)\b/i, /\bcreate\s+(?:an )?order\b/i];

export function digest(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), 'utf8'));
}

export function parseTaskId(taskText) {
  const match = taskText.match(/^#\s+(TASK-[A-Z0-9-]+)/m);
  if (!match) throw new Error('TASK_ID_MISSING');
  return match[1];
}

export function validateTaskText(taskText) {
  for (const section of REQUIRED_TASK_SECTIONS) {
    if (!taskText.includes(section)) throw new Error(`TASK_SECTION_MISSING:${section}`);
  }
  const safety = taskText.slice(taskText.indexOf('## Safety boundary'), taskText.indexOf('## Allowlisted deliverables'));
  if (!/do not/i.test(safety)) throw new Error('TASK_SAFETY_BOUNDARY_WEAK');
  for (const forbidden of FORBIDDEN_EXECUTION_REQUESTS) {
    if (forbidden.test(taskText)) throw new Error('TASK_EXECUTION_REQUEST_FORBIDDEN');
  }
  for (const forbidden of FORBIDDEN_AUTOMATION) {
    if (forbidden.test(safety) && !/No automatic retry|No automatic.*successor|must not launch/i.test(safety)) {
      throw new Error('TASK_AUTOMATION_NOT_BOUNDED');
    }
  }
}

function parseAllowlist(taskText) {
  const section = taskText.split('## Allowlisted deliverables')[1] ?? '';
  const paths = [...section.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  if (paths.length === 0) throw new Error('TASK_ALLOWLIST_MISSING');
  return paths;
}

export function validateEvidence(evidence, taskId, taskPath, taskDigest) {
  if (evidence.protocol_version !== PROTOCOL_VERSION) throw new Error('EVIDENCE_PROTOCOL_VERSION_MISMATCH');
  if (!Array.isArray(evidence.tasks)) throw new Error('EVIDENCE_TASKS_MISSING');
  const entry = evidence.tasks.find((item) => item.task_id === taskId);
  if (!entry) throw new Error(`UNKNOWN_TASK:${taskId}`);
  if (entry.task_path !== taskPath) throw new Error('TASK_PATH_MISMATCH');
  if (entry.branch !== evidence.current_branch) throw new Error('TASK_BRANCH_MISMATCH');
  if (entry.task_digest !== taskDigest) throw new Error('TASK_DIGEST_MISMATCH');
  if (entry.committed !== true || entry.dirty !== false) throw new Error('TASK_NOT_IMMUTABLE');
  if (!Array.isArray(entry.required_tests) || entry.required_tests.length === 0) throw new Error('TASK_TESTS_MISSING');
  if (!Array.isArray(entry.allowlisted_deliverables) || entry.allowlisted_deliverables.length === 0) throw new Error('TASK_EVIDENCE_ALLOWLIST_MISSING');
  return entry;
}

export function buildEnvelope({ taskPath, evidencePath = DEFAULT_FIXTURE, taskText = null, evidence = null }) {
  const resolvedTask = resolve(taskPath);
  if (!existsSync(resolvedTask) && taskText === null) throw new Error('TASK_FILE_MISSING');
  const text = taskText ?? readFileSync(resolvedTask, 'utf8');
  validateTaskText(text);
  const taskId = parseTaskId(text);
  const taskDigest = digest(text);
  const sourceEvidence = evidence ?? readJson(evidencePath);
  const repoRoot = resolve(sourceEvidence.repository_root);
  const relativeTask = resolvedTask.startsWith(repoRoot + '/') ? resolvedTask.slice(repoRoot.length + 1) : taskPath;
  const entry = validateEvidence(sourceEvidence, taskId, relativeTask, taskDigest);
  const allowlist = parseAllowlist(text);
  if (JSON.stringify(allowlist) !== JSON.stringify(entry.allowlisted_deliverables)) throw new Error('TASK_ALLOWLIST_MISMATCH');
  return {
    protocol_version: PROTOCOL_VERSION,
    envelope_kind: 'CLAUDE_TASK_DRY_RUN',
    task_id: taskId,
    branch: entry.branch,
    task_path: relativeTask,
    task_digest: taskDigest,
    task_commit: entry.task_commit,
    allowlisted_deliverables: allowlist,
    safety_profile: entry.safety_profile,
    required_tests: entry.required_tests,
    completion_evidence: entry.completion_evidence,
    successor_policy: 'OPERATOR_AND_CODEX_REVIEW_REQUIRED',
    execution: { mode: 'DRY_RUN_ONLY', cli_invoked: false, network_used: false, process_started: false },
    command_preview: `claude -p "Execute ${relativeTask} only; obey its safety boundary and commit only its allowlisted deliverables."`,
  };
}

export function parseArgs(argv) {
  const out = { task: null, evidence: DEFAULT_FIXTURE, output: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = () => { const v = argv[++i]; if (!v) throw new Error(`MISSING_VALUE:${argv[i - 1]}`); return v; };
    switch (argv[i]) {
      case '--task': out.task = value(); break;
      case '--evidence': out.evidence = value(); break;
      case '--out': out.output = value(); break;
      case '--json': out.json = true; break;
      case '--help': out.help = true; break;
      default: throw new Error(`UNKNOWN_ARGUMENT:${argv[i]}`);
    }
  }
  return out;
}

export function usage() {
  return 'Usage: node scripts/analysis/build_claude_dispatch_envelope.mjs --task <ready-task> [--evidence <json>] [--out <path>] [--json]';
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.task) { console.log(usage()); return 64; }
  const envelope = buildEnvelope({ taskPath: args.task, evidencePath: args.evidence });
  if (args.output) writeFileSync(resolve(args.output), `${JSON.stringify(envelope, null, 2)}\n`);
  console.log(args.json ? JSON.stringify(envelope, null, 2) : [
    `status=READY task=${envelope.task_id} branch=${envelope.branch}`,
    `digest=${envelope.task_digest}`,
    `mode=${envelope.execution.mode} process_started=false network_used=false`,
    `preview=${envelope.command_preview}`,
  ].join('\n'));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
