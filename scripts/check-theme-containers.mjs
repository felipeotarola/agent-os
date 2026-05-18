#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['src/app/dashboard', 'src/features'];
const ignoredPathParts = [
  '/node_modules/',
  '/.next/',
  // shadcn/ui primitives are allowed to encode their own semantic variants
  // (`destructive`, spinner overlays, etc.). Product/dashboard code should not.
  '/src/components/ui/'
];

const fileExtensions = new Set(['.ts', '.tsx']);
const hardCodedClass = /\b(?:text-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-?\d*|bg-(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d|border-(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d|from-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d|via-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d|to-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d|shadow-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d)\S*/g;

// Hard-coded raw colors in inline styles are almost always a theme escape hatch.
// Keep chart/canvas exceptions local and explicit with this marker on the same line:
// theme-guard-ignore-line -- chart/canvas color
const rawColor = /(?:#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\blab\()/;
const rawColorContext = /(?:style=|style:\s*\{|className=|Color|color|background|border|shadow|chart|primary|foreground|muted)/i;

const allowedClassTokens = new Set([
  // Semantic theme-safe classes that may look like colors but are tokens.
  'text-primary',
  'text-primary-foreground',
  'text-muted-foreground',
  'text-card-foreground',
  'text-popover-foreground',
  'text-destructive',
  'bg-primary',
  'bg-primary-foreground',
  'bg-muted',
  'bg-card',
  'bg-background',
  'bg-popover',
  'bg-destructive',
  'border-border',
  'border-input',
  'border-primary',
  'border-destructive',
  'shadow-primary/20'
]);

function walk(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else if ([...fileExtensions].some((extension) => path.endsWith(extension))) files.push(path);
  }
  return files;
}

const files = roots.flatMap(walk).filter((file) => !ignoredPathParts.some((part) => `/${file}`.includes(part)));

let failed = false;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const tokenMatches = [...text.matchAll(hardCodedClass)]
    .map((match) => match[0])
    .filter((token) => !allowedClassTokens.has(token));

  const lineMatches = text
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => rawColorContext.test(line) && rawColor.test(line) && !line.includes('theme-guard-ignore-line'));

  if (tokenMatches.length > 0 || lineMatches.length > 0) {
    failed = true;
    console.error(`\nTheme design guard failed in ${file}:`);
    for (const token of [...new Set(tokenMatches)].sort()) console.error(`  hard-coded class: ${token}`);
    for (const { line, number } of lineMatches.slice(0, 12)) {
      console.error(`  raw color line ${number}: ${line.trim()}`);
    }
    if (lineMatches.length > 12) console.error(`  ...and ${lineMatches.length - 12} more raw color lines`);
  }
}

if (failed) {
  console.error(`\nUse theme tokens/components instead:
  text-foreground, text-card-foreground, text-muted-foreground, text-primary, text-destructive
  bg-card, bg-muted, bg-background, bg-primary, bg-destructive
  border-border, border-input, border-primary, border-destructive

If a raw color is genuinely for a chart/canvas, add a same-line comment:
  // theme-guard-ignore-line -- chart/canvas color
or
  /* theme-guard-ignore-line -- chart/canvas color */`);
  process.exit(1);
}

console.log(`Theme design guard passed (${files.length} files scanned).`);
