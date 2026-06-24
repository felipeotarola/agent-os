#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertFixtures as assertCronToolPolicyFixtures } from './cron-tool-policy-preflight.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.split('=');
  return [key, value];
}));

const repo = resolve(args.get('--repo') || repoRoot);
const runFixtures = args.get('--fixtures') !== 'false';
const pushExitCode = args.has('--push-exit-code') ? Number(args.get('--push-exit-code')) : undefined;
const pushStderr = args.get('--push-stderr');

function git(args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function parseBranchStatus(statusLine = '') {
  const ahead = Number(statusLine.match(/\[ahead (\d+)/)?.[1] || 0);
  const behind = Number(statusLine.match(/behind (\d+)/)?.[1] || 0);
  const diverged = ahead > 0 && behind > 0;
  return { ahead, behind, diverged };
}

export function classifyReadiness(input) {
  const dirty = input.dirtyFiles > 0;
  const branch = parseBranchStatus(input.branchStatus);
  const pushBlocked = input.pushExitCode !== undefined && input.pushExitCode !== 0;

  if (dirty) {
    return {
      status: 'needs-local-work',
      localReady: false,
      publishReady: false,
      blocker: null,
      reason: 'worktree has uncommitted changes'
    };
  }

  if (branch.diverged || branch.behind > 0) {
    return {
      status: 'needs-sync',
      localReady: false,
      publishReady: false,
      blocker: 'upstream-sync',
      reason: 'branch is behind or diverged from upstream'
    };
  }

  if (pushBlocked) {
    return {
      status: 'local-ready-push-blocked',
      localReady: true,
      publishReady: false,
      blocker: 'git-push',
      reason: 'local commit is ready, but publish failed externally'
    };
  }

  if (branch.ahead > 0) {
    return {
      status: 'local-ready-needs-push',
      localReady: true,
      publishReady: true,
      blocker: null,
      reason: 'local commit is ahead of upstream and ready to publish'
    };
  }

  return {
    status: 'synced',
    localReady: true,
    publishReady: false,
    blocker: null,
    reason: 'branch is already synced with upstream'
  };
}

function currentRepoInput() {
  const status = git(['status', '--branch', '--short']);
  const [branchStatus = '', ...files] = status.split(/\r?\n/).filter(Boolean);
  return {
    repo,
    branchStatus,
    dirtyFiles: files.length,
    pushExitCode,
    pushStderr
  };
}

function assertFixtures() {
  const fixtures = [
    {
      id: 'clean-ahead-push-blocked',
      input: { branchStatus: '## main...origin/main [ahead 1]', dirtyFiles: 0, pushExitCode: 128 },
      expected: { status: 'local-ready-push-blocked', localReady: true, publishReady: false, blocker: 'git-push' }
    },
    {
      id: 'dirty-worktree',
      input: { branchStatus: '## main...origin/main', dirtyFiles: 2 },
      expected: { status: 'needs-local-work', localReady: false, publishReady: false, blocker: null }
    },
    {
      id: 'clean-ahead',
      input: { branchStatus: '## main...origin/main [ahead 1]', dirtyFiles: 0 },
      expected: { status: 'local-ready-needs-push', localReady: true, publishReady: true, blocker: null }
    },
    {
      id: 'synced',
      input: { branchStatus: '## main...origin/main', dirtyFiles: 0 },
      expected: { status: 'synced', localReady: true, publishReady: false, blocker: null }
    },
    {
      id: 'behind',
      input: { branchStatus: '## main...origin/main [behind 1]', dirtyFiles: 0 },
      expected: { status: 'needs-sync', localReady: false, publishReady: false, blocker: 'upstream-sync' }
    }
  ];

  const results = fixtures.map((fixture) => {
    const actual = classifyReadiness(fixture.input);
    const passed = Object.entries(fixture.expected).every(([key, value]) => actual[key] === value);
    return { id: fixture.id, passed, expected: fixture.expected, actual };
  });

  return {
    suite: 'self-improvement-readiness-v0',
    cases: results.length,
    failed: results.filter((result) => !result.passed).map((result) => result.id),
    results
  };
}

function assertAutonomyLanes() {
  const required = [
    {
      id: 'operating-model-doc',
      path: resolve(repo, 'docs', 'AUTONOMOUS_SELF_EVOLUTION.md'),
      patterns: [/Lane 1: Research-only/, /Lane 2: Prioritize/, /Lane 3: Implement/]
    },
    {
      id: 'research-lane-script',
      path: resolve(repo, 'scripts', 'self-evolution-research-lane.mjs'),
      patterns: [/lane: 'research-only'/, /chooseCandidate/, /ready-small/]
    },
    {
      id: 'package-research-command',
      path: resolve(repo, 'package.json'),
      patterns: [/"self-evolution:research": "node scripts\/self-evolution-research-lane\.mjs"/]
    },
    {
      id: 'agent-eval-mandate-case',
      path: resolve(repo, 'evals', 'agent-behavior-v0.json'),
      patterns: [/"autonomous-self-evolution-mandate"/, /"research lane"/, /"implementation lane"/]
    },
    {
      id: 'cron-tool-policy-preflight',
      path: resolve(repo, 'scripts', 'cron-tool-policy-preflight.mjs'),
      patterns: [/cron-tool-policy-preflight-v0/, /toolsAllow/, /missingRequiredToolFamilies/]
    }
  ];

  const results = required.map((item) => {
    const text = existsSync(item.path) ? readFileSync(item.path, 'utf8') : '';
    const passed = text.length > 0 && item.patterns.every((pattern) => pattern.test(text));
    return {
      id: item.id,
      passed,
      path: item.path,
      missingPatterns: item.patterns.filter((pattern) => !pattern.test(text)).map((pattern) => pattern.source)
    };
  });

  return {
    suite: 'autonomous-self-evolution-lanes-v0',
    cases: results.length,
    failed: results.filter((result) => !result.passed).map((result) => result.id),
    results
  };
}

function assertCronToolPolicy() {
  return assertCronToolPolicyFixtures();
}

const report = {
  generatedAt: new Date().toISOString(),
  repo,
  current: classifyReadiness(currentRepoInput()),
  fixtures: runFixtures ? assertFixtures() : undefined,
  autonomyLanes: runFixtures ? assertAutonomyLanes() : undefined,
  cronToolPolicy: runFixtures ? assertCronToolPolicy() : undefined
};

console.log(JSON.stringify(report, null, 2));

if (
  report.fixtures?.failed.length > 0 ||
  report.autonomyLanes?.failed.length > 0 ||
  report.cronToolPolicy?.failed.length > 0
) process.exit(1);
