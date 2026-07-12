#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

function parseBranchStatus(status = '') {
  return {
    ahead: Number(status.match(/\[ahead (\d+)/)?.[1] || 0),
    behind: Number(status.match(/behind (\d+)/)?.[1] || 0)
  };
}

export function classifyCronReview({ optionalInputs = [], branchStatus = '', pushExitCode }) {
  const unavailableEvidence = optionalInputs.filter((input) => !input.available).map((input) => input.path);
  const branch = parseBranchStatus(branchStatus);

  if (branch.behind > 0) {
    return { outcome: 'blocked', blocker: 'upstream-sync', shouldPush: false, unavailableEvidence };
  }

  if (pushExitCode !== undefined && pushExitCode !== 0) {
    return { outcome: 'local-ready-push-blocked', blocker: 'git-push', shouldPush: false, unavailableEvidence };
  }

  return {
    outcome: unavailableEvidence.length > 0 ? 'continue-with-partial-evidence' : 'ready',
    blocker: null,
    shouldPush: branch.ahead > 0,
    unavailableEvidence
  };
}

export function assertFixtures() {
  const fixtures = [
    {
      id: 'missing-optional-input-continues',
      input: { optionalInputs: [{ path: 'memory/today.md', available: false }], branchStatus: '## main...origin/main' },
      expected: { outcome: 'continue-with-partial-evidence', blocker: null, shouldPush: false }
    },
    {
      id: 'synced-branch-skips-push',
      input: { branchStatus: '## main...origin/main' },
      expected: { outcome: 'ready', blocker: null, shouldPush: false }
    },
    {
      id: 'ahead-branch-allows-push',
      input: { branchStatus: '## main...origin/main [ahead 1]' },
      expected: { outcome: 'ready', blocker: null, shouldPush: true }
    },
    {
      id: 'failed-push-preserves-local-result',
      input: { branchStatus: '## main...origin/main [ahead 1]', pushExitCode: 128 },
      expected: { outcome: 'local-ready-push-blocked', blocker: 'git-push', shouldPush: false }
    }
  ];

  return fixtures.map((fixture) => {
    const actual = classifyCronReview(fixture.input);
    const passed = Object.entries(fixture.expected).every(([key, value]) => actual[key] === value);
    if (!passed) throw new Error(`${fixture.id} failed: ${JSON.stringify(actual)}`);
    return { id: fixture.id, passed };
  });
}

function main() {
  const args = process.argv.slice(2);
  const repoArg = args.find((arg) => arg.startsWith('--repo='))?.slice('--repo='.length) || process.cwd();
  const optionalPaths = args.filter((arg) => arg.startsWith('--optional=')).map((arg) => resolve(arg.slice('--optional='.length)));
  const pushExitArg = args.find((arg) => arg.startsWith('--push-exit-code='));
  const branchStatus = execFileSync('git', ['status', '--branch', '--short'], { cwd: resolve(repoArg), encoding: 'utf8' }).split('\n')[0];
  const result = classifyCronReview({
    optionalInputs: optionalPaths.map((path) => ({ path, available: existsSync(path) })),
    branchStatus,
    pushExitCode: pushExitArg ? Number(pushExitArg.slice('--push-exit-code='.length)) : undefined
  });
  const fixtures = assertFixtures();
  console.log(JSON.stringify({ suite: 'cron-review-preflight-v0', result, fixtures }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
