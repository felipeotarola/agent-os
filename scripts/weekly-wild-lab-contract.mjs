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

const frictionRoot = mkdtempSync(join(tmpdir(), 'weekly-wild-lab-friction-'));
mkdirSync(join(frictionRoot, 'memory'));
writeFileSync(join(frictionRoot, 'LESSONS.md'), '# Lessons\n');
writeFileSync(join(frictionRoot, 'memory', '2026-08-22.md'), [
  '# 2026-08-22',
  '- The stale session was selected again after reindexing.',
  '- Repeated friction: an old provenance id was routed under the current date.'
].join('\n'));

const frictionOutput = execFileSync(process.execPath, [
  resolve('scripts/weekly-wild-lab.mjs'),
  `--workspace-root=${frictionRoot}`,
  '--days=7'
], { cwd: resolve('.'), encoding: 'utf8' });

assert.match(frictionOutput, /Repeated friction: 2/);
assert.match(frictionOutput, /Title: Repeated-friction containment/);
assert.doesNotMatch(frictionOutput, /Title: No high-signal experiment/);

console.log('weekly wild lab contract: 7 assertions passed');
