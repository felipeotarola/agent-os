#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT || resolve(repoRoot, '..');
const date = new Date().toISOString().slice(0, 10);

function readOptional(path) {
  if (!existsSync(path)) {
    return { path, text: '', missing: true };
  }

  return { path, text: readFileSync(path, 'utf8'), missing: false };
}

function firstMatchingLine(text, patterns) {
  const lines = text.split(/\r?\n/);
  for (const pattern of patterns) {
    const line = lines.find((candidate) => pattern.test(candidate));
    if (line) {
      return line
        .replace(/^[-*]\s*/, '')
        .replace(/^(Current next step|Suggested next action|Action|Status):\s*/i, '')
        .trim();
    }
  }
  return null;
}

function firstBulletAfterHeading(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) {
    return null;
  }

  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) {
      return null;
    }
    if (/^-\s+/.test(line)) {
      return line.replace(/^-\s+/, '').trim();
    }
  }

  return null;
}

function latestDailyMemory() {
  const memoryDir = join(workspaceRoot, 'memory');
  if (!existsSync(memoryDir)) {
    return { path: memoryDir, text: '', missing: true };
  }

  const file = readdirSync(memoryDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort()
    .at(-1);

  return file ? readOptional(join(memoryDir, file)) : { path: memoryDir, text: '', missing: true };
}

function gitStatusSummary() {
  try {
    const status = execSync('git status --short', { cwd: repoRoot, encoding: 'utf8' }).trim();
    if (!status) {
      return 'Agent OS worktree is clean.';
    }

    const lines = status.split(/\r?\n/);
    return `Agent OS has ${lines.length} local worktree change${lines.length === 1 ? '' : 's'}: ${lines
      .slice(0, 4)
      .map((line) => line.trim())
      .join('; ')}${lines.length > 4 ? '; ...' : ''}`;
  } catch (error) {
    return `Agent OS git status unavailable: ${error.message}`;
  }
}

const lifeOs = readOptional(join(workspaceRoot, 'LIFE_OS.md'));
const proactive = readOptional(join(workspaceRoot, 'PROACTIVE.md'));
const heartbeat = readOptional(join(workspaceRoot, 'HEARTBEAT.md'));
const recentMemory = latestDailyMemory();

const currentNextStep = firstMatchingLine(lifeOs.text, [/Current next step:/i]);
const lifeBlocker = firstBulletAfterHeading(lifeOs.text, '## Blockers / Loose Ends');
const memorySignal = firstMatchingLine(recentMemory.text, [/^- .*Agent OS/i, /^- .*Agnes/i, /^- .*heartbeat/i]);
const safeAction = firstMatchingLine(proactive.text, [/^- Improve Agent OS code\/docs\/UI/i, /^- Update local markdown context/i]);

const unavailable = [lifeOs, proactive, heartbeat, recentMemory].filter((file) => file.missing).map((file) => file.path);

console.log(`# Daily Brief - ${date}`);
console.log('');
console.log('## Today');
console.log('');
console.log(`- ${currentNextStep || 'Keep Agent OS/Cai operational and reduce loose ends from local context.'}`);
console.log('');
console.log('## Active Signals');
console.log('');
console.log(`- ${gitStatusSummary()} Source: ${repoRoot}`);
if (lifeBlocker) {
  console.log(`- ${lifeBlocker} Source: ${lifeOs.path}`);
}
if (memorySignal) {
  console.log(`- ${memorySignal} Source: ${recentMemory.path}`);
}
if (unavailable.length > 0) {
  console.log(`- Some optional inputs were unavailable: ${unavailable.join(', ')}`);
}
console.log('');
console.log('## Suggested Next Action');
console.log('');
console.log(
  `- ${
    safeAction ||
    'Do one small safe/internal/reversible Agent OS or memory hygiene step, then verify it with a command or file evidence.'
  }`
);
console.log('');
console.log('## Evidence');
console.log('');
console.log(`- Local-only sources read: ${[lifeOs.path, proactive.path, heartbeat.path, recentMemory.path].join(', ')}`);
console.log('- Approval-gated sources intentionally not read: Gmail, Calendar, Slack/social notifications, device notifications, finance, secrets.');
