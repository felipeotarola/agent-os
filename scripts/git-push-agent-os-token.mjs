#!/usr/bin/env node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const OPENCLAW_HOME = process.env.OPENCLAW_HOME || '/root/.openclaw';
const secretsDir = process.env.AGENT_OS_SECRETS_DIR || join(OPENCLAW_HOME, 'secrets', 'agent-os');
const tokenNames = ['GITHUB_TOKEN', 'GH_TOKEN', 'AGENT_OS_GITHUB_TOKEN'];

function hasTokenFile(name) {
  return existsSync(join(secretsDir, name));
}

const tokenName = tokenNames.find((name) => process.env[name] || hasTokenFile(name));

if (!tokenName) {
  console.error(`Missing GitHub token. Add one of ${tokenNames.join(', ')} in Agent OS Settings.`);
  process.exit(1);
}

const tempDir = await mkdtemp(join(tmpdir(), 'agent-os-git-askpass-'));
const askpassPath = join(tempDir, 'askpass.sh');
const secretPath = join(secretsDir, tokenName);

const askpass = `#!/bin/sh
case "$1" in
  *Username*) printf '%s\\n' 'x-access-token' ;;
  *Password*)
    if [ -n "\${${tokenName}:-}" ]; then
      printf '%s' "\${${tokenName}}"
    else
      tr -d '\\n' < '${secretPath.replaceAll("'", "'\\''")}'
    fi
    ;;
  *) printf '\\n' ;;
esac
`;

await writeFile(askpassPath, askpass, { mode: 0o700 });

const gitArgs = ['-c', 'credential.helper=', 'push', ...process.argv.slice(2)];
const child = spawn('git', gitArgs, {
  stdio: 'inherit',
  env: {
    ...process.env,
    GIT_ASKPASS: askpassPath,
    GIT_TERMINAL_PROMPT: '0'
  }
});

child.on('exit', async (code, signal) => {
  await rm(tempDir, { recursive: true, force: true });
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
