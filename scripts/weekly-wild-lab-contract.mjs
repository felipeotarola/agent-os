#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = mkdtempSync(join(tmpdir(), 'weekly-wild-lab-'));
mkdirSync(join(root, 'memory'));
writeFileSync(join(root, 'LESSONS.md'), '# Lessons\n');
writeFileSync(join(root, 'memory', '2026-07-19.md'), [
  '# 2026-07-19',
  '- Implemented cron preflight after failed pushes; four fixtures passed.',
  '- Gateway is healthy, but the parent thread is still broken on native tools.',
  '- Google authorization remains unavailable until Felipe reauthorizes it.'
].join('\n'));

const output = execFileSync(process.execPath, [
  resolve('scripts/weekly-wild-lab.mjs'),
  `--workspace-root=${root}`,
  '--days=7'
], { cwd: resolve('.'), encoding: 'utf8' });

assert.match(output, /Failed or degraded workflows: 2/);
assert.doesNotMatch(output, /Failed or degraded workflows: Implemented cron preflight/);
assert.match(output, /Failed or degraded workflows: Gateway is healthy, but the parent thread is still broken/);
assert.match(output, /Title: No high-signal experiment/);

console.log('weekly wild lab contract: 4 assertions passed');
