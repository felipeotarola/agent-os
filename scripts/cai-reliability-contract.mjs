#!/usr/bin/env node

/**
 * Deterministic contract for the Cai reliability control plane.
 *
 * This deliberately evaluates only normalized, non-secret observations. Live
 * cron inspection is performed by the OpenClaw job, not by this local suite.
 */

export function classifyJobHealth({ enabled = true, lastStatus = 'ok', consecutiveErrors = 0, overdue = false }) {
  if (!enabled) return { outcome: 'ignored-disabled', shouldAlert: false, reason: 'disabled' };
  if (consecutiveErrors > 0 || lastStatus === 'error') {
    return { outcome: 'alert', shouldAlert: true, reason: 'run-failed' };
  }
  if (overdue) return { outcome: 'alert', shouldAlert: true, reason: 'missed-schedule' };
  return { outcome: 'healthy-silent', shouldAlert: false, reason: null };
}

export function classifyIncident({ kind, hasFinalAnswer = false, hasCommentary = false }) {
  switch (kind) {
    case 'response-output':
      return hasFinalAnswer && !hasCommentary
        ? { outcome: 'accepted', publishUserAnswer: true, blocker: null }
        : { outcome: 'contained-error', publishUserAnswer: false, blocker: 'ambiguous-runtime-output' };
    case 'gog-keyring':
      return { outcome: 'blocked', publishUserAnswer: false, blocker: 'credential-storage' };
    case 'browser-session':
      return { outcome: 'blocked', publishUserAnswer: false, blocker: 'browser-session-unavailable' };
    default:
      return { outcome: 'blocked', publishUserAnswer: false, blocker: 'unknown-incident' };
  }
}

export function assertFixtures() {
  const fixtures = [
    {
      id: 'healthy-job-stays-silent',
      actual: classifyJobHealth({ enabled: true, lastStatus: 'ok' }),
      expected: { outcome: 'healthy-silent', shouldAlert: false }
    },
    {
      id: 'one-real-job-failure-alerts',
      actual: classifyJobHealth({ lastStatus: 'error', consecutiveErrors: 1 }),
      expected: { outcome: 'alert', shouldAlert: true, reason: 'run-failed' }
    },
    {
      id: 'missed-schedule-alerts',
      actual: classifyJobHealth({ overdue: true }),
      expected: { outcome: 'alert', shouldAlert: true, reason: 'missed-schedule' }
    },
    {
      id: 'disabled-job-does-not-alert',
      actual: classifyJobHealth({ enabled: false, lastStatus: 'error', consecutiveErrors: 9, overdue: true }),
      expected: { outcome: 'ignored-disabled', shouldAlert: false }
    },
    {
      id: 'commentary-never-becomes-user-answer',
      actual: classifyIncident({ kind: 'response-output', hasCommentary: true }),
      expected: { outcome: 'contained-error', publishUserAnswer: false, blocker: 'ambiguous-runtime-output' }
    },
    {
      id: 'final-answer-only-is-accepted',
      actual: classifyIncident({ kind: 'response-output', hasFinalAnswer: true }),
      expected: { outcome: 'accepted', publishUserAnswer: true, blocker: null }
    },
    {
      id: 'keyring-failure-stops-with-named-blocker',
      actual: classifyIncident({ kind: 'gog-keyring' }),
      expected: { outcome: 'blocked', publishUserAnswer: false, blocker: 'credential-storage' }
    },
    {
      id: 'browser-session-failure-does-not-ask-for-known-credentials',
      actual: classifyIncident({ kind: 'browser-session' }),
      expected: { outcome: 'blocked', publishUserAnswer: false, blocker: 'browser-session-unavailable' }
    }
  ];

  const results = fixtures.map((fixture) => ({
    id: fixture.id,
    passed: Object.entries(fixture.expected).every(([key, value]) => fixture.actual[key] === value)
  }));
  return { suite: 'cai-reliability-v1', cases: results.length, failed: results.filter((result) => !result.passed).map((result) => result.id), results };
}

const report = assertFixtures();
console.log(JSON.stringify(report, null, 2));
if (report.failed.length) process.exit(1);
