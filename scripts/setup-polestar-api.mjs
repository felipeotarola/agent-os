#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const openclawHome = process.env.OPENCLAW_HOME || '/root/.openclaw';
const privateDir = resolve(openclawHome, 'state', 'agent-os', 'polestar');
const apiDir = resolve(process.env.POLESTAR_API_DIR || resolve(privateDir, 'unofficial-polestar-api'));
const venvDir = resolve(process.env.POLESTAR_VENV_DIR || resolve(privateDir, 'polestar-api-venv'));
const repoUrl = process.env.POLESTAR_API_REPO || 'https://github.com/kildahldev/unofficial-polestar-api.git';

function run(command, args, options = {}) {
  console.log(`> ${[command, ...args].join(' ')}`);
  execFileSync(command, args, {
    cwd: options.cwd || repoRoot,
    stdio: 'inherit',
    env: process.env
  });
}

mkdirSync(privateDir, { recursive: true });

if (existsSync(resolve(apiDir, '.git'))) {
  run('git', ['pull', '--ff-only'], { cwd: apiDir });
} else {
  run('git', ['clone', '--depth=1', repoUrl, apiDir]);
}

if (!existsSync(resolve(venvDir, 'bin/python'))) {
  run('python3', ['-m', 'venv', venvDir]);
}

const python = resolve(venvDir, 'bin/python');
run(python, ['-m', 'pip', 'install', '--upgrade', 'pip']);
run(python, ['-m', 'pip', 'install', '-e', apiDir]);

console.log('');
console.log('Polestar-klienten är installerad privat.');
console.log(`Runtime-filer ligger utanför repot: ${privateDir}`);
console.log('Lägg credentials i Agent OS secrets eller agent-os/.env.local:');
console.log('POLESTAR_EMAIL=...');
console.log('POLESTAR_PASSWORD=...');
console.log('POLESTAR_VIN=... # valfritt om kontot har flera bilar');
console.log('');
console.log('Testa sedan: npm run car:polestar:brief');
