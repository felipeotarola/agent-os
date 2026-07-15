#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const guard = new URL('./check-openclaw-runtime-contract.mjs', import.meta.url);
const fixtureDir = mkdtempSync(path.join(tmpdir(), 'agent-os-openclaw-contract-'));
const validCli = path.join(fixtureDir, 'openclaw.js');
const missingCli = path.join(fixtureDir, 'missing.js');
writeFileSync(validCli, '#!/usr/bin/env node\n');

function run(args, cliPath) {
  return spawnSync(process.execPath, [guard.pathname, ...args], {
    encoding: 'utf8',
    env: { ...process.env, OPENCLAW_CLI_PATH: cliPath }
  });
}

try {
  const staticWithoutCli = run([], missingCli);
  if (staticWithoutCli.status !== 0 || !staticWithoutCli.stdout.includes('(static mode)')) {
    throw new Error(`Static/no-CLI fixture failed:\n${staticWithoutCli.stderr}`);
  }

  const runtimeWithCli = run(['--runtime'], validCli);
  if (runtimeWithCli.status !== 0 || !runtimeWithCli.stdout.includes('(runtime mode)')) {
    throw new Error(`Runtime/valid-CLI fixture failed:\n${runtimeWithCli.stderr}`);
  }

  const runtimeWithoutCli = run(['--runtime'], missingCli);
  if (
    runtimeWithoutCli.status === 0 ||
    !runtimeWithoutCli.stderr.includes(`No OpenClaw CLI candidate exists: ${missingCli}`)
  ) {
    throw new Error('Runtime/invalid-explicit-CLI fixture did not fail with the expected error');
  }

  console.log('OpenClaw runtime contract fixtures passed (3/3).');
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}
