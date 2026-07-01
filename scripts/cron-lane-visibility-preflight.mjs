#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(repoRoot, '..');
const args = new Set(process.argv.slice(2));

function readOptional(path) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function parseJsonOptional(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function latestDailyMemoryDate(memoryDir) {
  if (!existsSync(memoryDir)) return null;
  const names = readdirSync(memoryDir)
    .map((name) => name.match(/^(\d{4}-\d{2}-\d{2})\.md$/)?.[1])
    .filter(Boolean)
    .sort();
  return names.at(-1) || null;
}

function extractLastScan(text) {
  return text.match(/^Last scan:\s*(.+)$/m)?.[1]?.trim() || null;
}

function hasLatestResult(row) {
  return Boolean(row.lastRunAt || row.latestCandidateOrAction);
}

export function classifyReportRows(rows) {
  return rows.map((row) => {
    if (!hasLatestResult(row)) {
      return {
        ...row,
        noiseOutcome: 'blocked',
        blocker: row.blocker || 'missing-latest-result'
      };
    }
    if (!row.verificationCommand) {
      return {
        ...row,
        noiseOutcome: 'blocked',
        blocker: row.blocker || 'missing-verification-command'
      };
    }
    return {
      ...row,
      blocker: row.blocker || null
    };
  });
}

function reportRows({ repo = repoRoot, workspace = workspaceRoot } = {}) {
  const heartbeat = parseJsonOptional(join(workspace, 'memory', 'heartbeat-state.json'), {});
  const radar = readOptional(join(repo, 'docs', 'AGENT_OS_RESEARCH_RADAR.md'));
  const tasks = readOptional(join(repo, 'docs', 'TASKS.md'));
  const latestMemory = latestDailyMemoryDate(join(workspace, 'memory'));
  const localBrief = heartbeat.localDailyBrief || {};

  return classifyReportRows([
    {
      cronId: 'cai-proactive-loop-v1',
      name: 'Cai Proactive Loop V1',
      laneType: 'heartbeat',
      lastRunAt: localBrief.lastCheckedAt || null,
      latestCandidateOrAction: localBrief.lastReason
        ? `brief:heartbeat wrote local state and returned ${localBrief.lastReason === 'quiet' ? 'HEARTBEAT_OK' : localBrief.lastReason}`
        : null,
      noiseOutcome: 'no-action',
      verificationCommand: 'npm run brief:heartbeat -- --write-state',
      blocker: null,
      source: 'memory/heartbeat-state.json'
    },
    {
      cronId: 'daily-learning-local',
      name: 'Daily Learning Loop',
      laneType: 'daily-learning',
      lastRunAt: latestMemory,
      latestCandidateOrAction: latestMemory ? `latest daily memory file: memory/${latestMemory}.md` : null,
      noiseOutcome: 'no-action',
      verificationCommand: 'find ../memory -maxdepth 1 -name "2026-*.md" | sort | tail -1',
      blocker: null,
      source: latestMemory ? `memory/${latestMemory}.md` : 'memory/'
    },
    {
      cronId: 'self-evolution-research',
      name: 'Self-Evolution Research Lane',
      laneType: 'research',
      lastRunAt: extractLastScan(radar),
      latestCandidateOrAction: /Cron lane visibility preflight/i.test(radar)
        ? 'selected Cron lane visibility preflight and recorded local spec evidence'
        : null,
      noiseOutcome: 'safe-action-done',
      verificationCommand: 'npm run self-evolution:research -- --format=json',
      blocker: null,
      source: 'docs/AGENT_OS_RESEARCH_RADAR.md'
    },
    {
      cronId: 'self-evolution-implementation',
      name: 'Self-Evolution Implementation Lane',
      laneType: 'implementation',
      lastRunAt: null,
      latestCandidateOrAction: /cron-lane-visibility-preflight-v0/.test(tasks)
        ? 'backlog task exists for cron-lane-visibility-preflight-v0'
        : null,
      noiseOutcome: 'safe-action-done',
      verificationCommand: 'npm run check:cron-lane-visibility',
      blocker: null,
      source: 'docs/TASKS.md'
    },
    {
      cronId: 'local-daily-brief',
      name: 'Local Daily Brief',
      laneType: 'briefing',
      lastRunAt: localBrief.lastCheckedAt || null,
      latestCandidateOrAction: localBrief.lastReason ? `latest local brief state reason: ${localBrief.lastReason}` : null,
      noiseOutcome: 'no-action',
      verificationCommand: 'npm run brief:local',
      blocker: null,
      source: 'memory/heartbeat-state.json'
    }
  ]);
}

export function assertFixtures() {
  const rows = reportRows();
  const missingLatest = classifyReportRows([
    {
      cronId: 'fixture-missing-latest-result',
      name: 'Fixture Missing Latest Result',
      laneType: 'heartbeat',
      lastRunAt: null,
      latestCandidateOrAction: null,
      noiseOutcome: 'no-action',
      verificationCommand: 'npm run brief:heartbeat -- --write-state',
      blocker: null,
      source: 'fixture'
    }
  ])[0];
  const missingVerification = classifyReportRows([
    {
      cronId: 'fixture-missing-verification',
      name: 'Fixture Missing Verification',
      laneType: 'research',
      lastRunAt: '2026-07-01',
      latestCandidateOrAction: 'selected fixture candidate',
      noiseOutcome: 'no-action',
      verificationCommand: null,
      blocker: null,
      source: 'fixture'
    }
  ])[0];

  const results = [
    {
      id: 'repo-report-covers-required-lanes',
      passed: ['heartbeat', 'daily-learning', 'research', 'implementation'].every((laneType) =>
        rows.some((row) => row.laneType === laneType)
      )
    },
    {
      id: 'repo-report-has-visible-evidence',
      passed: rows.every((row) => hasLatestResult(row) && row.verificationCommand && row.source)
    },
    {
      id: 'fixture-flags-missing-latest-result',
      passed: missingLatest.noiseOutcome === 'blocked' && missingLatest.blocker === 'missing-latest-result'
    },
    {
      id: 'fixture-flags-missing-verification-command',
      passed:
        missingVerification.noiseOutcome === 'blocked' &&
        missingVerification.blocker === 'missing-verification-command'
    }
  ];

  return {
    suite: 'cron-lane-visibility-preflight-v0',
    cases: results.length,
    failed: results.filter((result) => !result.passed).map((result) => result.id),
    results
  };
}

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    rows: reportRows(),
    fixtures: assertFixtures()
  };

  if (args.has('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const row of report.rows) {
      console.log(`${row.cronId}\t${row.laneType}\t${row.noiseOutcome}\t${row.latestCandidateOrAction}`);
    }
    console.log(
      `fixtures: ${report.fixtures.cases - report.fixtures.failed.length}/${report.fixtures.cases} passed`
    );
  }

  if (report.fixtures.failed.length > 0 || report.rows.some((row) => row.noiseOutcome === 'blocked')) {
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
