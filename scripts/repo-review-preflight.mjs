#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.split('=');
  return [key, value];
}));

const repo = resolve(args.get('--repo') || process.cwd());
const pattern = args.get('--pattern') || '.';
const runFixtures = args.get('--fixtures') !== 'false';

function commandExists(command) {
  const result = spawnSync('command', ['-v', command], { shell: true, encoding: 'utf8' });
  return result.status === 0;
}

function classifySearch(input) {
  if (!existsSync(input.repo)) {
    return {
      status: 'repo-unavailable',
      repoReady: false,
      searchReady: false,
      blocker: 'repo-path',
      reason: 'repo path does not exist'
    };
  }

  if (!statSync(input.repo).isDirectory()) {
    return {
      status: 'repo-unavailable',
      repoReady: false,
      searchReady: false,
      blocker: 'repo-path',
      reason: 'repo path is not a directory'
    };
  }

  const hasRg = input.hasRg ?? commandExists('rg');
  if (hasRg) {
    const result = spawnSync('rg', ['--count-matches', '--', input.pattern, input.repo], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    });

    if (result.status === 0) {
      return {
        status: 'search-ok',
        repoReady: true,
        searchReady: true,
        blocker: null,
        reason: 'rg found matching evidence'
      };
    }

    if (result.status === 1) {
      return {
        status: 'search-no-match',
        repoReady: true,
        searchReady: true,
        blocker: null,
        reason: 'rg completed with no matches'
      };
    }

    return {
      status: 'search-degraded',
      repoReady: true,
      searchReady: false,
      blocker: 'repo-search',
      reason: (result.stderr || 'rg exited unexpectedly').trim()
    };
  }

  const gitResult = spawnSync('git', ['-C', input.repo, 'grep', '-n', '--', input.pattern], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });

  if (gitResult.status === 0) {
    return {
      status: 'search-ok',
      repoReady: true,
      searchReady: true,
      blocker: null,
      reason: 'git grep fallback found matching evidence'
    };
  }

  if (gitResult.status === 1) {
    return {
      status: 'search-no-match',
      repoReady: true,
      searchReady: true,
      blocker: null,
      reason: 'git grep fallback completed with no matches'
    };
  }

  return {
    status: 'search-degraded',
    repoReady: true,
    searchReady: false,
    blocker: 'repo-search',
    reason: (gitResult.stderr || 'git grep fallback exited unexpectedly').trim()
  };
}

function assertFixtures() {
  const noMatchSentinel = ['__AGENT_OS', 'PREFLIGHT', 'NO_MATCH', String(Date.now()), '__'].join('_');
  const fixtures = [
    {
      id: 'missing-repo',
      input: { repo: resolve('/tmp/agent-os-repo-review-preflight-missing'), pattern, hasRg: true },
      expected: { status: 'repo-unavailable', repoReady: false, searchReady: false, blocker: 'repo-path' }
    },
    {
      id: 'no-match-is-not-failure',
      input: { repo, pattern: noMatchSentinel, hasRg: true },
      expected: { status: 'search-no-match', repoReady: true, searchReady: true, blocker: null }
    },
    {
      id: 'known-match',
      input: { repo, pattern: 'Agent OS', hasRg: true },
      expected: { status: 'search-ok', repoReady: true, searchReady: true, blocker: null }
    }
  ];

  const results = fixtures.map((fixture) => {
    const actual = classifySearch(fixture.input);
    const passed = Object.entries(fixture.expected).every(([key, value]) => actual[key] === value);
    return { id: fixture.id, passed, expected: fixture.expected, actual };
  });

  return {
    suite: 'repo-review-preflight-v0',
    cases: results.length,
    failed: results.filter((result) => !result.passed).map((result) => result.id),
    results
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  repo,
  pattern,
  current: classifySearch({ repo, pattern }),
  fixtures: runFixtures ? assertFixtures() : undefined,
  gitStatus: existsSync(resolve(repo, '.git'))
    ? execFileSync('git', ['-C', repo, 'status', '--branch', '--short'], { encoding: 'utf8' }).trim()
    : undefined
};

console.log(JSON.stringify(report, null, 2));

if (report.fixtures?.failed.length > 0) process.exit(1);
