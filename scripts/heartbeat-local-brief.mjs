#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT || resolve(repoRoot, '..');
const statePath = resolve(workspaceRoot, 'memory', 'heartbeat-state.json');
const now = new Date();
const args = new Set(process.argv.slice(2));

function readState() {
  if (!existsSync(statePath)) return {};
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function hoursSince(isoString) {
  if (!isoString) return Infinity;
  const timestamp = Date.parse(isoString);
  if (!Number.isFinite(timestamp)) return Infinity;
  return (now.getTime() - timestamp) / 36e5;
}

function section(text, heading) {
  const pattern = new RegExp(`^## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## |$)`, 'm');
  return pattern.exec(text)?.[1].trim() || '';
}

function hash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function gitBranchSummary() {
  try {
    return execSync('git status --short --branch', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const brief = execFileSync(process.execPath, [resolve(repoRoot, 'scripts/local-daily-brief.mjs')], {
  cwd: repoRoot,
  encoding: 'utf8'
}).trim();

const activeSignals = section(brief, 'Active Signals');
const suggestedAction = section(brief, 'Suggested Next Action');
const evidence = section(brief, 'Evidence');
const branchSummary = gitBranchSummary();
const briefHash = hash(`${branchSummary}\n${activeSignals}\n${suggestedAction}`);
const state = readState();
const previous = state.localDailyBrief || {};

const degraded =
  /Agent OS has \d+ local worktree change/.test(activeSignals) ||
  /unavailable|failed|blocked|degraded/i.test(activeSignals) ||
  /^## .*ahead\s+\d+/m.test(branchSummary);
const decisionNeeded = /\b(decide|decision|Felipe needs|approval needed|ask Felipe)\b/i.test(suggestedAction);
const changedSinceLastSurface = previous.hash !== briefHash;
const quietPeriodElapsed = hoursSince(previous.lastSurfacedAt) >= 24;
const changedAfterQuietPeriod = changedSinceLastSurface && quietPeriodElapsed;
const force = args.has('--force') || process.env.HEARTBEAT_BRIEF_FORCE === '1';
const shouldSurface = force || ((degraded || decisionNeeded) && (changedSinceLastSurface || quietPeriodElapsed)) || changedAfterQuietPeriod;

function surfaceReason() {
  if (force) return 'forced';
  if (degraded) return 'degraded';
  if (decisionNeeded) return 'decision-needed';
  if (changedAfterQuietPeriod) return 'new-context-after-quiet-period';
  return 'quiet';
}

if (args.has('--write-state')) {
  state.localDailyBrief = {
    hash: briefHash,
    lastCheckedAt: now.toISOString(),
    lastSurfacedAt: shouldSurface ? now.toISOString() : previous.lastSurfacedAt || null,
    lastReason: shouldSurface ? surfaceReason() : 'quiet'
  };
  writeState(state);
}

if (!shouldSurface) {
  console.log('HEARTBEAT_OK');
  process.exit(0);
}

console.log(brief);
console.log('');
console.log('## Heartbeat Route');
console.log('');
console.log(`- Surface reason: ${surfaceReason()}`);
console.log(`- State file: ${statePath}`);
console.log(`- Evidence: ${evidence.replace(/\n/g, ' ')}`);
