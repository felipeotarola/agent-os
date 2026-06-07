#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.split('=');
  return [key, value];
}));
const workspaceRoot = resolve(args.get('--workspace-root') || process.env.OPENCLAW_WORKSPACE_ROOT || resolve(repoRoot, '..'));
const days = Number(args.get('--days') || 7);

const SIGNALS = [
  {
    id: 'correction',
    label: 'Felipe corrections',
    patterns: [/\bFelipe (said|pointed out|corrected|clarified)\b/i, /\bcorrection\b/i]
  },
  {
    id: 'failure',
    label: 'Failed or degraded workflows',
    patterns: [/\bfailed\b/i, /\berror\b/i, /\bdegraded\b/i, /\bblocked\b/i, /\b403\b/i, /\bunavailable\b/i],
    ignore: [/\bno failed\b/i, /\bpassed\b.*\bfailed\b/i]
  },
  {
    id: 'friction',
    label: 'Repeated friction',
    patterns: [/\bfriction\b/i, /\brepeated\b/i, /\bstale\b/i, /\bmissed\b/i, /\bloose end/i]
  },
  {
    id: 'surprise',
    label: 'Useful surprises shipped',
    patterns: [/\bcreated\b/i, /\bimplemented\b/i, /\bverified\b/i, /\bcommit\b/i, /\bharness\b/i]
  },
  {
    id: 'blocker',
    label: 'Named blockers',
    patterns: [/\bblocked by\b/i, /\bnamed blocker\b/i, /\bpush.*403\b/i, /\bpermission .*denied\b/i]
  }
];

function readOptional(path) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function recentMemoryFiles() {
  const memoryDir = join(workspaceRoot, 'memory');
  if (!existsSync(memoryDir)) return [];

  return readdirSync(memoryDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort()
    .slice(-days)
    .map((name) => join(memoryDir, name));
}

function cleanLine(line) {
  return line
    .replace(/^[-*]\s*/, '')
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{12,}|sk-[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g, '[redacted-secret]')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function collectSignals(files) {
  const buckets = new Map(SIGNALS.map((signal) => [signal.id, { ...signal, hits: [] }]));

  for (const path of files) {
    const text = readOptional(path);
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const cleaned = cleanLine(line);
      if (!cleaned || cleaned.startsWith('#')) continue;

      for (const signal of SIGNALS) {
        if (!signal.patterns.some((pattern) => pattern.test(cleaned))) continue;
        if (signal.ignore?.some((pattern) => pattern.test(cleaned))) continue;
        const bucket = buckets.get(signal.id);
        if (bucket.hits.length < 8) {
          bucket.hits.push({ path, line: index + 1, text: cleaned });
        }
      }
    }
  }

  return [...buckets.values()];
}

function lessonsAddedThisWeek(lessonsText) {
  return lessonsText
    .split(/\r?\n/)
    .filter((line) => /^### 2026-/.test(line))
    .slice(-8)
    .map((line) => line.replace(/^###\s*/, '').trim());
}

function chooseExperiment(signals) {
  const failureCount = signals.find((signal) => signal.id === 'failure')?.hits.length || 0;
  const blockerCount = signals.find((signal) => signal.id === 'blocker')?.hits.length || 0;
  const correctionCount = signals.find((signal) => signal.id === 'correction')?.hits.length || 0;

  if (failureCount + blockerCount >= 3) {
    return {
      title: 'Cron-safe review preflight',
      why: 'Recent self-improvement loops hit brittle optional reads/searches and best-effort push blockers.',
      next: 'Before a cron reports failure, verify optional inputs are treated as unavailable evidence and git push is skipped unless the branch is actually ahead.',
      output: 'Add or run a small local scanner/checklist; update daily memory with the named blocker instead of failing the learning result.'
    };
  }

  if (correctionCount > 0) {
    return {
      title: 'Correction-to-lesson router',
      why: 'Felipe corrections are the strongest reward signal and should be promoted with a small, consistent path.',
      next: 'Scan recent memory for corrections, then route each one to daily memory, LESSONS.md, or an Agent OS task.',
      output: 'One concise durable note or task with the correction evidence.'
    };
  }

  return {
    title: 'No high-signal experiment',
    why: 'Recent memory did not show enough repeated friction for a new concrete experiment.',
    next: 'Stay silent unless another source adds evidence.',
    output: 'NO_REPLY'
  };
}

const files = recentMemoryFiles();
const lessonsText = readOptional(join(workspaceRoot, 'LESSONS.md'));
const signals = collectSignals(files);
const experiment = chooseExperiment(signals);

console.log(`# Weekly Wild Lab Scan`);
console.log('');
console.log(`Workspace: ${workspaceRoot}`);
console.log(`Memory files: ${files.length > 0 ? files.map((file) => file.replace(`${workspaceRoot}/`, '')).join(', ') : 'none found'}`);
console.log('');
console.log('## Signal Counts');
console.log('');
for (const signal of signals) {
  console.log(`- ${signal.label}: ${signal.hits.length}`);
}
console.log('');
console.log('## Representative Evidence');
console.log('');
for (const signal of signals.filter((candidate) => candidate.hits.length > 0)) {
  const hit = signal.hits[0];
  console.log(`- ${signal.label}: ${hit.text} (${hit.path.replace(`${workspaceRoot}/`, '')}:${hit.line})`);
}
console.log('');
console.log('## Recent Lessons');
console.log('');
const lessons = lessonsAddedThisWeek(lessonsText);
if (lessons.length === 0) {
  console.log('- none found');
} else {
  for (const lesson of lessons) console.log(`- ${lesson}`);
}
console.log('');
console.log('## Suggested Experiment');
console.log('');
console.log(`- Title: ${experiment.title}`);
console.log(`- Why: ${experiment.why}`);
console.log(`- Next: ${experiment.next}`);
console.log(`- Output: ${experiment.output}`);
