#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsPath = resolve(repoRoot, 'docs/TASKS.md');
const defaultOutputPath = resolve(repoRoot, 'data/private/life-os-task-candidates.json');

function parseArgs(argv) {
  const args = { output: defaultOutputPath, stdout: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--stdout') {
      args.stdout = true;
      continue;
    }
    if (arg === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('Missing value for --output');
      args.output = resolve(process.cwd(), value);
      index += 1;
      continue;
    }
    throw new Error(`Unexpected argument: ${arg}`);
  }
  return args;
}

function tableCellText(value) {
  return value.trim().replace(/^`|`$/g, '');
}

function parseLifeOsCandidates(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === '## Life OS task candidates');
  if (start === -1) throw new Error('Could not find Life OS task candidates section');

  const tableLines = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    if (/^\|/.test(line)) tableLines.push(line);
  }

  const rows = tableLines.filter((line) => !/^\|\s*-+/.test(line));
  if (rows.length < 2) throw new Error('Life OS task candidates table is empty');

  const headers = rows[0].split('|').slice(1, -1).map(tableCellText);
  return rows.slice(1).map((row) => {
    const values = row.split('|').slice(1, -1).map(tableCellText);
    const entry = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));

    return {
      id: entry.ID,
      title: entry.Title,
      description: [
        `Guardrail: ${entry.Guardrail}`,
        '',
        '## Evidence',
        '- `src:life-os-local-context` - Derived from `/root/.openclaw/workspace/LIFE_OS.md` via `docs/TASKS.md`.'
      ].join('\n'),
      status: 'backlog',
      priority: Number(entry.Priority),
      ownerAgentId: entry.Owner,
      source: entry.Source,
      dueAt: null
    };
  });
}

const args = parseArgs(process.argv.slice(2));
if (!existsSync(docsPath)) throw new Error(`Missing ${docsPath}`);

const tasks = parseLifeOsCandidates(readFileSync(docsPath, 'utf8'));
const payload = {
  generatedAt: new Date().toISOString(),
  source: 'agent-os/docs/TASKS.md#life-os-task-candidates',
  count: tasks.length,
  tasks
};

if (args.stdout) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  mkdirSync(dirname(args.output), { recursive: true });
  writeFileSync(args.output, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Exported ${tasks.length} Life OS task candidates to ${args.output}`);
}
