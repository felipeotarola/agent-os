#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const files = [
  'src/app/dashboard/overview/page.tsx',
  'src/app/dashboard/action-center/page.tsx',
  'src/app/dashboard/knowledge/page.tsx'
];

const forbidden = /\b(?:text-(?:white|slate|cyan|violet|emerald|amber|rose|blue|pink|zinc)-?\d*|bg-(?:slate|cyan|violet|emerald|amber|rose|blue|pink|zinc)-\d|border-(?:slate|cyan|violet|emerald|amber|rose|blue|pink|zinc)-\d)\S*/g;
const allowed = new Set([
  // Semantic dots/graphs are allowed only when they are not carrying text contrast.
  'bg-primary',
  'bg-muted-foreground'
]);

let failed = false;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const matches = [...text.matchAll(forbidden)].map((match) => match[0]).filter((token) => !allowed.has(token));
  if (matches.length > 0) {
    failed = true;
    console.error(`Theme container guard failed in ${file}:`);
    for (const token of [...new Set(matches)].sort()) console.error(`  ${token}`);
  }
}

if (failed) {
  console.error('\nUse theme tokens instead: text-foreground, text-card-foreground, text-muted-foreground, text-primary, bg-card, bg-muted, border-border.');
  process.exit(1);
}

console.log('Theme container guard passed.');
