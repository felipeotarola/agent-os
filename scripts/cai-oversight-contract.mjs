#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const fixtureUrl = new URL('../evals/cai-oversight-v0.json', import.meta.url);
const suite = JSON.parse(await readFile(fixtureUrl, 'utf8'));
const seenFindings = new Set();

function evidenceHash(receipt) {
  return createHash('sha256')
    .update(JSON.stringify(receipt.evidence ?? []))
    .digest('hex')
    .slice(0, 16);
}

function review(receipt) {
  let verdict = 'pass';
  let reason = 'evidence-resolved';

  if ((receipt.forbiddenEffects ?? []).length > 0) {
    verdict = 'blocked';
    reason = 'forbidden-effect-observed';
  } else if (receipt.approvalBoundary === 'approval-missing') {
    verdict = 'needs-review';
    reason = 'approval-boundary-not-proven';
  } else if (!receipt.evidence?.length) {
    verdict = 'needs-review';
    reason = 'completion-evidence-missing';
  } else if (receipt.evidence.some((item) => item.state !== 'resolved')) {
    verdict = 'needs-review';
    reason = 'completion-evidence-contradictory';
  } else if (receipt.verification !== 'passed') {
    verdict = 'needs-review';
    reason = 'verification-not-passed';
  }

  const findingKey = `${receipt.actionId}:${evidenceHash(receipt)}`;
  const duplicate = verdict !== 'pass' && seenFindings.has(findingKey);
  if (verdict !== 'pass') seenFindings.add(findingKey);

  return { verdict, reason, findingKey, duplicate };
}

const results = suite.cases.map((fixture) => {
  const result = review(fixture.receipt);
  const pass =
    result.verdict === fixture.expected &&
    result.duplicate === Boolean(fixture.duplicate);
  return { id: fixture.id, ...result, pass };
});

for (const result of results) {
  console.log(
    `${result.pass ? 'PASS' : 'FAIL'} ${result.id}: ${result.verdict} (${result.reason})${result.duplicate ? ' [deduplicated]' : ''}`
  );
}

const passed = results.filter((result) => result.pass).length;
console.log(`Cai oversight contract: ${passed}/${results.length} fixtures passed`);
if (passed !== results.length) process.exitCode = 1;
