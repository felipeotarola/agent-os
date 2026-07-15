import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseControlPlaneArgs, resolveBridgeToken, runMemoryControlPlane } from './run-memory-control-plane.mjs';

assert.deepEqual(parseControlPlaneArgs([]), { limit: 5, minScore: 35, signalsPerSession: 8, dryRun: false, backfill: false });
assert.equal(parseControlPlaneArgs(['--dry-run', '--limit', '3']).dryRun, true);
assert.equal(parseControlPlaneArgs(['--backfill']).backfill, true);
assert.throws(() => parseControlPlaneArgs(['--dry-run', '--backfill']), /cannot be combined/);
assert.throws(() => parseControlPlaneArgs(['--limit', '11']), /<= 10/);
assert.equal(resolveBridgeToken({}), '');
assert.equal(resolveBridgeToken({ AGENT_OS_BRIDGE_TOKEN: ' managed-secret ' }), 'managed-secret');

const root = mkdtempSync(path.join(tmpdir(), 'agent-os-memory-runner-'));
try {
  const stateFile = path.join(root, 'watermark.json');
  const env = { AGENT_OS_BRIDGE_TOKEN: 'test-secret', AGENT_OS_BRIDGE_URL: 'http://bridge', AGENT_OS_MEMORY_CONTROL_PLANE_STATE_FILE: stateFile };
  let calls = 0;
  const first = await runMemoryControlPlane({ env, now: () => new Date('2026-07-15T08:00:00Z'), fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); } });
  assert.equal(first.initializedWatermark, true);
  assert.equal(calls, 0);
  assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).since, '2026-07-15T08:00:00.000Z');

  let authorization = '';
  let requestPayload;
  const output = await runMemoryControlPlane({
    argv: [], env, now: () => new Date('2026-07-15T09:00:00Z'),
    fetchImpl: async (_url, options) => {
      authorization = options.headers.authorization;
      requestPayload = JSON.parse(options.body);
      return { ok: true, json: async () => ({ selected: [{}], imported: [{ signals: [{ route: 'task', reviewRequired: false }] }], preview: [] }) };
    }
  });
  assert.equal(requestPayload.since, '2026-07-15T08:00:00.000Z');
  assert.equal(authorization, 'Bearer test-secret');
  assert.equal(JSON.stringify(output).includes('test-secret'), false);
  assert.deepEqual(output.routes, { task: 1 });
  assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).since, '2026-07-15T09:00:00.000Z');

  await assert.rejects(() => runMemoryControlPlane({ env, now: () => new Date('2026-07-15T10:00:00Z'), fetchImpl: async () => ({ ok: false, status: 500 }) }), /failed/);
  assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).since, '2026-07-15T09:00:00.000Z');

  await runMemoryControlPlane({ argv: ['--dry-run'], env, now: () => new Date('2026-07-15T11:00:00Z'), fetchImpl: async () => ({ ok: true, json: async () => ({ selected: [], imported: [], preview: [] }) }) });
  assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).since, '2026-07-15T09:00:00.000Z');

  let backfillPayload;
  await runMemoryControlPlane({ argv: ['--backfill'], env, now: () => new Date('2026-07-15T12:00:00Z'), fetchImpl: async (_url, options) => { backfillPayload = JSON.parse(options.body); return { ok: true, json: async () => ({ selected: [], imported: [], preview: [] }) }; } });
  assert.equal(backfillPayload.backfill, true);
  assert.equal('since' in backfillPayload, false);
  console.log('memory-control-plane runner contract: 18/18');
} finally {
  rmSync(root, { recursive: true, force: true });
}
