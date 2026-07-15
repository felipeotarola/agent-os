import assert from 'node:assert/strict';
import { parseControlPlaneArgs, resolveBridgeToken, runMemoryControlPlane } from './run-memory-control-plane.mjs';

assert.deepEqual(parseControlPlaneArgs([]), { limit: 5, minScore: 35, signalsPerSession: 8, dryRun: false });
assert.equal(parseControlPlaneArgs(['--dry-run', '--limit', '3']).dryRun, true);
assert.throws(() => parseControlPlaneArgs(['--limit', '11']), /<= 10/);
assert.equal(resolveBridgeToken({}), '');
assert.equal(resolveBridgeToken({ AGENT_OS_BRIDGE_TOKEN: ' managed-secret ' }), 'managed-secret');

let authorization = '';
const output = await runMemoryControlPlane({
  argv: ['--dry-run'],
  env: { AGENT_OS_BRIDGE_TOKEN: 'test-secret', AGENT_OS_BRIDGE_URL: 'http://bridge' },
  fetchImpl: async (_url, options) => {
    authorization = options.headers.authorization;
    return { ok: true, json: async () => ({ selected: [{}], imported: [], preview: [{ signals: [{ route: 'task', reviewRequired: false }] }] }) };
  }
});
assert.equal(authorization, 'Bearer test-secret');
assert.equal(JSON.stringify(output).includes('test-secret'), false);
assert.equal(output.dryRun, true);
assert.equal(output.routedSignals, 1);
assert.deepEqual(output.routes, { task: 1 });
console.log('memory-control-plane runner contract: 7/7');
