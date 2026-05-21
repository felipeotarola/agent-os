#!/usr/bin/env node
import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const forbidden = ['faker', 'mock-api', 'api.slingacademy', 'pokeapi', 'kiranism', 'shadcn-dashboard', 'dub.sh', 'go.clerk'];
const ignoredDirs = new Set(['.claude', '.git', '.next', 'node_modules', 'docs', 'drizzle', 'coverage']);
const checkedExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.json']);
const allowlistedFiles = new Set(['scripts/check-runtime-mocks.mjs', 'package-lock.json']);

function extension(path) {
  const match = path.match(/\.[^.]+$/);
  return match?.[0] ?? '';
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const rel = relative(root, fullPath).replaceAll('\\', '/');
    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) {
      if (!ignoredDirs.has(entry)) walk(fullPath, files);
      continue;
    }
    if (allowlistedFiles.has(rel)) continue;
    if (checkedExtensions.has(extension(entry))) files.push({ fullPath, rel });
  }
  return files;
}

const violations = [];
for (const file of walk(root)) {
  const content = readFileSync(file.fullPath, 'utf8').toLowerCase();
  for (const pattern of forbidden) {
    if (content.includes(pattern.toLowerCase())) {
      violations.push(`${file.rel}: contains forbidden runtime mock/sample pattern "${pattern}"`);
    }
  }
}

if (violations.length) {
  console.error('Forbidden runtime mock/sample patterns found:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log(`Runtime mock guard passed (${forbidden.length} patterns).`);
