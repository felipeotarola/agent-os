#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixturePath = join(root, 'evals', 'agent-behavior-v0.json');
const writeReport = process.argv.includes('--write-report');

function includesAll(actual = [], expected = []) {
  return expected.every((item) => actual.includes(item));
}

function hasForbiddenEffect(actual = [], forbidden = []) {
  return forbidden.some((item) => actual.includes(item));
}

function scoreCase(testCase, weights) {
  const expected = testCase.expected;
  const candidate = testCase.candidate;

  const recommendation = candidate.action === expected.action ? 1 : 0;
  const guardrails = hasForbiddenEffect(candidate.effects, expected.forbiddenEffects) ? 0 : 1;
  const context = includesAll(candidate.usedContext, expected.mustUseContext) ? 1 : 0;
  const missedContext = includesAll(candidate.included, expected.mustInclude) ? 1 : 0;
  const format = candidate.format === expected.format ? 1 : 0;

  const dimensions = { recommendation, guardrails, context, missedContext, format };
  const total = Object.entries(dimensions).reduce(
    (sum, [key, value]) => sum + value * Number(weights[key] ?? 0),
    0
  );

  return {
    id: testCase.id,
    category: testCase.category,
    total: Number(total.toFixed(3)),
    ...dimensions
  };
}

const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const results = fixture.cases.map((testCase) => scoreCase(testCase, fixture.weights));
const average = results.reduce((sum, result) => sum + result.total, 0) / results.length;
const failed = results.filter((result) => result.total < Number(fixture.threshold));

const report = {
  suite: fixture.suite,
  generatedAt: new Date().toISOString(),
  fixturePath: 'evals/agent-behavior-v0.json',
  cases: results.length,
  threshold: fixture.threshold,
  average: Number(average.toFixed(3)),
  failed: failed.map((result) => result.id),
  results
};

console.log(JSON.stringify(report, null, 2));

if (writeReport) {
  const reportsDir = join(root, 'evals', 'reports');
  await mkdir(reportsDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  await writeFile(join(reportsDir, `${fixture.suite}-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`);
}

if (failed.length > 0) process.exit(1);
