#!/usr/bin/env node
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const repoRoot = process.cwd();
const scanRoots = ['remotion/agentos-sladdis-qaa'];
const checkedExtensions = new Set(['.md', '.mdx', '.ts', '.tsx', '.js', '.jsx']);
const ignoredDirs = new Set(['node_modules', 'out', '.remotion', '.next', '.git']);

function extension(path) {
  const match = path.match(/\.[^.]+$/);
  return match?.[0] ?? '';
}

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      if (!ignoredDirs.has(entry)) walk(fullPath, files);
      continue;
    }
    if (checkedExtensions.has(extension(entry))) files.push(fullPath);
  }

  return files;
}

function isContrastLine(line) {
  return [
    /\bnot just\b/i,
    /\bnot a\b/i,
    /\bmore than\b/i,
    /\bwithout QAA\b/i,
    /\binstead of\b/i,
    /\bside-chat\b/i,
    /\bonly be\b/i,
    /\bcan say\b/i,
    /\bdo not frame\b/i,
    /\bmust not\b/i,
    /\bnever\b/i
  ].some((pattern) => pattern.test(line));
}

export function validateQaaPositioning(text, source = '<fixture>') {
  const issues = [];
  const lines = String(text ?? '').split(/\r?\n/);

  lines.forEach((line, index) => {
    const location = `${source}:${index + 1}`;

    if (/\bAgent OS\b/i.test(line)) {
      issues.push({
        location,
        code: 'agent-os-routing',
        message: 'QAA-facing copy should not route the product story through Agent OS.'
      });
    }

    if (/\bold AI testing\b/i.test(line)) {
      issues.push({
        location,
        code: 'old-ai-testing-enemy',
        message: 'Do not frame "old AI testing" as the enemy; center the coworker/workbench loop.'
      });
    }

    const sentences = line.split(/(?<=[.!?])\s+/);
    const hasQaaMemoryFrame = sentences.some((sentence) => {
      return (
        (/\bQAA\b.*\b(is|as|becomes|serves as|acts as)\b.*\b(Sladdis'?s?|agent'?s?)?\s*(memory|brain)\b/i.test(sentence) ||
          /\bQAA\b.*\b(memory|brain)\b.*\bfor\b.*\b(Sladdis|agent)\b/i.test(sentence)) &&
        !isContrastLine(sentence)
      );
    });

    if (hasQaaMemoryFrame) {
      issues.push({
        location,
        code: 'qaa-as-agent-memory',
        message: 'QAA is the workspace/system of record, not Sladdis memory or brain.'
      });
    }

    if (/\bQAA\b.*\b(chatbot|dashboard|recorder)\b/i.test(line) && !isContrastLine(line)) {
      issues.push({
        location,
        code: 'generic-product-frame',
        message: 'QAA should not be positioned as a generic chatbot, dashboard, or recorder.'
      });
    }
  });

  return issues;
}

function assertFixtures() {
  const fixtures = [
    {
      id: 'accept-coworker-workbench-positioning',
      input:
        'QAA owns the QA workflow. Sladdis performs the work through safe, scoped APIs. QAA is not just a dashboard; it is the workspace and system of record.',
      expectedCodes: []
    },
    {
      id: 'accept-chatbot-as-contrast',
      input: 'Without QAA, Sladdis would only be a chatbot reporting "I checked it".',
      expectedCodes: []
    },
    {
      id: 'reject-agent-os-routing',
      input: 'Sladdis routes QAA work through Agent OS before writing results.',
      expectedCodes: ['agent-os-routing']
    },
    {
      id: 'reject-memory-brain-frame',
      input: 'QAA is Sladdis memory and brain for QA.',
      expectedCodes: ['qaa-as-agent-memory']
    },
    {
      id: 'reject-generic-dashboard-frame',
      input: 'QAA is a dashboard that records QA notes.',
      expectedCodes: ['generic-product-frame']
    },
    {
      id: 'reject-old-ai-testing-enemy',
      input: 'QAA beats old AI testing with a nicer UI.',
      expectedCodes: ['old-ai-testing-enemy']
    }
  ];

  const failed = [];
  for (const fixture of fixtures) {
    const actualCodes = validateQaaPositioning(fixture.input)
      .map((issue) => issue.code)
      .sort();
    const expectedCodes = [...fixture.expectedCodes].sort();
    if (JSON.stringify(actualCodes) !== JSON.stringify(expectedCodes)) {
      failed.push({ id: fixture.id, expectedCodes, actualCodes });
    }
  }

  return failed;
}

const fixtureFailures = assertFixtures();
const files = scanRoots.flatMap((root) => walk(resolve(repoRoot, root)));
const scanIssues = files.flatMap((file) => {
  const rel = relative(repoRoot, file).replaceAll('\\', '/');
  return validateQaaPositioning(readFileSync(file, 'utf8'), rel);
});

if (fixtureFailures.length || scanIssues.length) {
  if (fixtureFailures.length) {
    console.error('QAA positioning guard fixture failures:');
    for (const failure of fixtureFailures) {
      console.error(`- ${failure.id}: expected ${failure.expectedCodes.join(', ') || '(none)'}, got ${failure.actualCodes.join(', ') || '(none)'}`);
    }
  }

  if (scanIssues.length) {
    console.error('QAA positioning guard violations:');
    for (const issue of scanIssues) console.error(`- ${issue.location} ${issue.code}: ${issue.message}`);
  }

  process.exit(1);
}

console.log(`QAA positioning guard passed (${files.length} files, ${scanRoots.join(', ')}).`);
