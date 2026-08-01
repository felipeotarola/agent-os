import assert from 'node:assert/strict';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testName = 'AGENT_OS_TEST_TOKEN';
const legacyTestName = 'AGENT_OS_LEGACY_TEST_TOKEN';
const authToken = 'agent-os-credential-contract-token';
const initialValue = '  test-value-one  ';
const rotatedValue = ' test-value-two ';

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function availablePort() {
  const server = createServer();
  server.unref();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  const { port } = address;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function request(baseUrl, pathname, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${authToken}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers
    }
  });
  const payload = await response.json();
  return { response, payload };
}

async function waitForBridge(child, baseUrl, stderr) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`Bridge exited before the contract test started.\n${stderr.value}`);
    }
    try {
      const { response } = await request(baseUrl, '/secrets');
      if (response.ok) return;
    } catch {
      // The bridge is still starting.
    }
    await delay(100);
  }
  throw new Error(`Bridge did not become ready.\n${stderr.value}`);
}

async function main() {
  const secretsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-os-credentials-test-'));
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const stderr = { value: '' };
  const child = spawn(process.execPath, [path.join(repoRoot, 'bridge', 'server.mjs')], {
    cwd: repoRoot,
    env: {
      ...process.env,
      BRIDGE_PORT: String(port),
      BRIDGE_HOST: '127.0.0.1',
      AGENT_OS_BRIDGE_TOKEN: authToken,
      BRIDGE_DATABASE_URL: 'postgres://test:test@127.0.0.1:1/test',
      OPENCLAW_CLI_PATH: path.join(repoRoot, 'package.json'),
      AGENT_OS_SECRETS_DIR: secretsDir
    },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    if (stderr.value.length < 4000) stderr.value += chunk;
  });

  try {
    await waitForBridge(child, baseUrl, stderr);

    const created = await request(baseUrl, '/secrets', {
      method: 'POST',
      body: JSON.stringify({
        name: testName,
        project: 'Project One',
        description: 'Temporary contract test',
        value: initialValue
      })
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.secret.project, 'Project One');
    assert.equal('value' in created.payload.secret, false);
    const initialFingerprint = created.payload.secret.fingerprint;
    assert.equal(await fs.readFile(path.join(secretsDir, testName), 'utf8'), initialValue);

    const duplicate = await request(baseUrl, '/secrets', {
      method: 'POST',
      body: JSON.stringify({
        name: testName,
        project: 'Overwrite attempt',
        description: 'Must not replace the original',
        value: 'replacement-that-must-not-be-written'
      })
    });
    assert.equal(duplicate.response.status, 409);
    assert.equal(await fs.readFile(path.join(secretsDir, testName), 'utf8'), initialValue);

    const listed = await request(baseUrl, '/secrets');
    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload.secrets.length, 1);
    assert.equal(listed.payload.secrets[0].project, 'Project One');
    assert.equal('value' in listed.payload.secrets[0], false);

    const metadataUpdate = await request(baseUrl, `/secrets/${testName}`, {
      method: 'PATCH',
      body: JSON.stringify({
        project: 'Project Two',
        description: 'Metadata-only update'
      })
    });
    assert.equal(metadataUpdate.response.status, 200);
    assert.equal(metadataUpdate.payload.secret.project, 'Project Two');
    assert.equal(metadataUpdate.payload.secret.fingerprint, initialFingerprint);
    assert.equal('value' in metadataUpdate.payload.secret, false);
    assert.equal(await fs.readFile(path.join(secretsDir, testName), 'utf8'), initialValue);

    const rotated = await request(baseUrl, `/secrets/${testName}`, {
      method: 'PATCH',
      body: JSON.stringify({ value: rotatedValue })
    });
    assert.equal(rotated.response.status, 200);
    assert.equal(rotated.payload.secret.project, 'Project Two');
    assert.notEqual(rotated.payload.secret.fingerprint, initialFingerprint);
    assert.equal('value' in rotated.payload.secret, false);
    assert.equal(await fs.readFile(path.join(secretsDir, testName), 'utf8'), rotatedValue);

    const blankReplacement = await request(baseUrl, `/secrets/${testName}`, {
      method: 'PATCH',
      body: JSON.stringify({ value: '   ' })
    });
    assert.equal(blankReplacement.response.status, 400);

    if (process.platform !== 'win32') {
      const secretStat = await fs.stat(path.join(secretsDir, testName));
      const metadataStat = await fs.stat(path.join(secretsDir, `${testName}.meta.json`));
      assert.equal(secretStat.mode & 0o777, 0o600);
      assert.equal(metadataStat.mode & 0o777, 0o600);
    }

    const deleted = await request(baseUrl, `/secrets/${testName}`, { method: 'DELETE' });
    assert.equal(deleted.response.status, 200);

    const legacyValue = 'legacy-value';
    await fs.writeFile(path.join(secretsDir, legacyTestName), `${legacyValue}\n`, { mode: 0o600 });
    await fs.writeFile(
      path.join(secretsDir, `${legacyTestName}.meta.json`),
      JSON.stringify({
        name: legacyTestName,
        description: 'Legacy newline format',
        bytes: Buffer.byteLength(legacyValue, 'utf8'),
        updatedAt: new Date(0).toISOString()
      }),
      { mode: 0o600 }
    );
    const migratedLegacy = await request(baseUrl, `/secrets/${legacyTestName}`, {
      method: 'PATCH',
      body: JSON.stringify({ project: 'Legacy Project' })
    });
    assert.equal(migratedLegacy.response.status, 200);
    assert.equal(await fs.readFile(path.join(secretsDir, legacyTestName), 'utf8'), legacyValue);
    await request(baseUrl, `/secrets/${legacyTestName}`, { method: 'DELETE' });

    const finalList = await request(baseUrl, '/secrets');
    assert.equal(finalList.payload.secrets.length, 0);

    console.log(
      'Credentials contract: create-only, edit, rotate, opaque values, legacy migration, redact, and delete passed.'
    );
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), delay(2000)]);
    }
    await fs.rm(secretsDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
