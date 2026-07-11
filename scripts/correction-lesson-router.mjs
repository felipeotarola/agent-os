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
const format = args.get('--format') || 'markdown';

const ROUTES = [
  {
    id: 'brief-integration-over-standalone-status-crons',
    destination: 'LESSONS.md',
    status: 'covered',
    patterns: [/\bTibber\b/i, /\bPolestar\b/i, /\bstandalone\b.*\bcron\b/i, /\bregular daily briefs?\b/i],
    coverage: [
      { path: 'LESSONS.md', pattern: /Prefer brief integration over standalone status crons/i },
      { path: 'TOOLS.md', pattern: /Tibber.*brief|Polestar.*brief/is }
    ],
    summary: 'Low-urgency household/device status belongs in existing daily briefs before standalone alerts.'
  },
  {
    id: 'correction-routing-loop',
    destination: 'Agent OS task candidate',
    status: 'covered',
    patterns: [/\bcorrection-to-lesson-router-v0\b/i, /\bFelipe-correction signals?\b/i, /\bcorrection lesson router\b/i, /\bcorrection router\b/i, /\bconsistent routing\b/i],
    coverage: [{ path: 'docs/TASKS.md', pattern: /correction-to-lesson-router-v0/i }],
    summary: 'Felipe correction signals need one routing pass before adding duplicate lessons.'
  },
  {
    id: 'tool-call-approval-receipts-v0',
    destination: 'Agent OS task candidate',
    status: 'covered',
    patterns: [/\btool-call approval receipts?\b/i, /\bapproval receipts?\b/i],
    coverage: [
      { path: 'docs/TASKS.md', pattern: /tool-call-approval-receipts-v0/i },
      { path: 'docs/TOOL_CALL_APPROVAL_RECEIPTS.md', pattern: /agent-os\.tool-call-approval-receipt\.v0/i }
    ],
    summary: 'Approval-gated tool calls need exact local receipts before risky execution or resume.'
  },
  {
    id: 'optional-context-file-tolerance',
    destination: 'LESSONS.md',
    status: 'covered',
    patterns: [
      /\bmissing-current-memory-file\b/i,
      /\bmissing.*daily memory file\b/i,
      /\bmissing daily-memory-file\b/i,
      /\bcurrent daily memory file did not exist\b/i,
      /\boptional memory\/docs\b/i,
      /\bmissing or racing files\b/i
    ],
    coverage: [{ path: 'LESSONS.md', pattern: /Proactive learning loops must tolerate missing or racing files/i }],
    summary: 'Optional memory/doc reads should degrade or create the current daily note instead of failing proactive loops.'
  },
  {
    id: 'qaa-positioning-coworker-workbench',
    destination: 'LESSONS.md',
    status: 'covered',
    patterns: [/\b(QAA|Testbench|Sladdis)\b/i],
    coverage: [
      { path: 'LESSONS.md', pattern: /QAA positioning must not route through Agent OS/i },
      { path: 'LESSONS.md', pattern: /QAA\/Testbench story must center the coworker-workbench loop/i },
      { path: 'docs/TASKS.md', pattern: /felipe-correction-regression-guard/i }
    ],
    summary: 'QAA-facing story should center QAA/Testbench and Sladdis, not Agent OS.'
  }
];

function readOptional(path) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function cleanLine(line) {
  return line
    .replace(/^[-*]\s*/, '')
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{12,}|sk-[A-Za-z0-9_-]{12,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g, '[redacted-secret]')
    .replace(/[ \t]+/g, ' ')
    .trim();
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

function relativePath(path) {
  return path.replace(`${workspaceRoot}/`, '').replace(`${repoRoot}/`, '');
}

function isCorrectionLine(line) {
  if ([
    /\blessons:corrections\b/i,
    /\brouted recent correction signals?\b/i,
    /\bcorrection-like signals?\b/i,
    /^Reviewed\b/i,
    /^Saved one durable lesson\b/i
  ].some((pattern) => pattern.test(line))) {
    return false;
  }

  return [
    /\bFelipe (asked|said|pointed out|corrected|clarified|chose|prefers|wants)\b/i,
    /\bcorrection\b/i,
    /\bdurable rule\b/i,
    /\bpreference\b/i
  ].some((pattern) => pattern.test(line));
}

function routeFor(line) {
  for (const route of ROUTES) {
    if (route.patterns.some((pattern) => pattern.test(line))) return route;
  }

  return {
    id: 'needs-review',
    destination: 'daily memory only',
    status: 'review',
    coverage: [],
    summary: 'No matching durable lesson or task candidate found; keep as daily evidence until repeated.'
  };
}

function routeCovered(route) {
  if (!route.coverage?.length) return false;
  return route.coverage.every((check) => {
    const workspacePath = resolve(workspaceRoot, check.path);
    const repoPath = resolve(repoRoot, check.path);
    const text = readOptional(workspacePath) || readOptional(repoPath);
    return check.pattern.test(text);
  });
}

function collectCorrections() {
  const files = recentMemoryFiles();
  const seen = new Set();
  const corrections = [];

  for (const path of files) {
    const text = readOptional(path);
    for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
      const line = cleanLine(rawLine);
      if (!line || line.startsWith('#') || !isCorrectionLine(line)) continue;
      const key = `${relativePath(path)}:${line}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const route = routeFor(line);
      const covered = route.status === 'covered' && routeCovered(route);
      corrections.push({
        source: `${relativePath(path)}:${index + 1}`,
        routeId: route.id,
        destination: covered ? route.destination : 'review',
        status: covered ? 'covered' : route.status,
        summary: route.summary
      });
    }
  }

  return { files: files.map(relativePath), corrections };
}

function outputMarkdown(report) {
  console.log('# Correction-to-Lesson Router');
  console.log('');
  console.log(`Memory files: ${report.files.length > 0 ? report.files.join(', ') : 'none'}`);
  console.log(`Corrections found: ${report.corrections.length}`);
  console.log('');
  if (report.corrections.length === 0) {
    console.log('- No correction signals found.');
    return;
  }
  for (const item of report.corrections) {
    console.log(`- ${item.source} -> ${item.destination} (${item.status}): ${item.summary}`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  workspaceRoot,
  repoRoot,
  ...collectCorrections()
};

if (format === 'json') {
  console.log(JSON.stringify(report, null, 2));
} else {
  outputMarkdown(report);
}
