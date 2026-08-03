#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const version = process.argv.includes('--v1') ? 'v1' : 'v0';
const fixtureUrl = new URL(`../evals/cai-oversight-${version}.json`, import.meta.url);
const suite = JSON.parse(await readFile(fixtureUrl, 'utf8'));
const seenFindings = new Set();

function evidenceHash(receipt) {
  return createHash('sha256')
    .update(JSON.stringify(receipt.evidence ?? []))
    .digest('hex')
    .slice(0, 16);
}

function reviewV0(receipt) {
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

const secretPattern = /(?:api[_-]?key|password|secret|token)\s*[:=]/i;

function isConcreteEvidence(evidence) {
  return (
    evidence &&
    typeof evidence.ref === 'string' &&
    evidence.ref.length > 0 &&
    typeof evidence.observed === 'string' &&
    evidence.observed.length > 0 &&
    !secretPattern.test(evidence.observed)
  );
}

function v1PolicyIsSafe(policy = {}) {
  return (
    policy.mode === 'read-only' &&
    policy.secretAccess !== true &&
    (policy.automatedActions ?? []).length === 0 &&
    (policy.closures ?? []).length === 0 &&
    (policy.outboundMessages ?? []).length === 0
  );
}

function materialSignal(signal) {
  if (!signal.material || !isConcreteEvidence(signal.evidence)) return null;

  switch (signal.kind) {
    case 'active-goal':
      return signal.state === 'blocked' ? 'active-goal-blocked' : null;
    case 'agent-os-change':
      return signal.state === 'decision-required' && signal.known !== true
        ? 'agent-os-decision-required'
        : null;
    case 'cron-error':
      return signal.state === 'failing' && Number(signal.consecutiveFailures) >= 2
        ? 'cron-repeated-failure'
        : null;
    case 'agent-status':
      return ['failed', 'stale'].includes(signal.state) ? 'agent-unhealthy' : null;
    default:
      return null;
  }
}

function reviewV1(run) {
  if (!v1PolicyIsSafe(run.policy)) {
    return { status: 'held', reason: 'unsafe-or-non-read-only-policy', alerts: [] };
  }

  const alerts = [];
  for (const signal of run.signals ?? []) {
    const category = materialSignal(signal);
    if (!category) continue;

    const findingKey = `${signal.kind}:${signal.id}:${evidenceHash({ evidence: [signal.evidence] })}`;
    if (seenFindings.has(findingKey)) continue;
    seenFindings.add(findingKey);

    alerts.push({
      id: signal.id,
      category,
      evidence: { ref: signal.evidence.ref, observed: signal.evidence.observed },
    });
  }

  const hasMissingMaterialEvidence = (run.signals ?? []).some(
    (signal) => signal.material && !isConcreteEvidence(signal.evidence)
  );
  if (hasMissingMaterialEvidence && alerts.length === 0) {
    return { status: 'held', reason: 'material-signal-without-safe-concrete-evidence', alerts: [] };
  }

  return { status: alerts.length ? 'alert' : 'clear', reason: alerts.length ? 'material-evidence-found' : 'no-material-evidence', alerts };
}

const results = suite.cases.map((fixture) => {
  const result = version === 'v0' ? reviewV0(fixture.receipt) : reviewV1(fixture.run);
  if (version === 'v0') {
  const pass =
    result.verdict === fixture.expected &&
    result.duplicate === Boolean(fixture.duplicate);
    return { id: fixture.id, ...result, pass };
  }

  const pass =
    result.status === fixture.expected.status &&
    result.reason === fixture.expected.reason &&
    JSON.stringify(result.alerts) === JSON.stringify(fixture.expected.alerts);
  return { id: fixture.id, ...result, pass };
});

for (const result of results) {
  const value = version === 'v0' ? result.verdict : result.status;
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.id}: ${value} (${result.reason})${result.duplicate ? ' [deduplicated]' : ''}`);
}

const passed = results.filter((result) => result.pass).length;
console.log(`Cai oversight ${version.toUpperCase()} contract: ${passed}/${results.length} fixtures passed`);
if (passed !== results.length) process.exitCode = 1;
