import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CredentialVaultError,
  createCredentialVault
} from '../src/server/credential-vault.mjs';

const testName = 'AGENT_OS_TEST_TOKEN';
const legacyTestName = 'AGENT_OS_LEGACY_TEST_TOKEN';
const initialValue = '  test-value-one  ';
const rotatedValue = ' test-value-two ';

async function expectVaultStatus(operation, status) {
  await assert.rejects(operation, (error) => {
    assert(error instanceof CredentialVaultError);
    assert.equal(error.status, status);
    return true;
  });
}

async function assertPrivateFile(filePath) {
  if (process.platform === 'win32') return;
  const fileStat = await fs.stat(filePath);
  assert.equal(fileStat.mode & 0o777, 0o600);
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

async function main() {
  const secretsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-os-credentials-test-'));
  const previousSecretsDir = process.env.AGENT_OS_SECRETS_DIR;
  const previousFingerprintKey = process.env.AGENT_OS_VAULT_FINGERPRINT_KEY;
  let vault;
  try {
    process.env.AGENT_OS_SECRETS_DIR = secretsDir;
    delete process.env.AGENT_OS_VAULT_FINGERPRINT_KEY;
    vault = createCredentialVault();
  } finally {
    restoreEnvironment('AGENT_OS_SECRETS_DIR', previousSecretsDir);
    restoreEnvironment('AGENT_OS_VAULT_FINGERPRINT_KEY', previousFingerprintKey);
  }
  assert.equal(vault.secretsDir, secretsDir);

  try {
    const created = await vault.createSecret({
      name: testName,
      project: 'Project One',
      description: 'Temporary contract test',
      value: initialValue
    });
    assert.equal(created.secret.project, 'Project One');
    assert.equal('value' in created.secret, false);
    assert.equal('path' in created.secret, false);
    assert.equal(JSON.stringify(created).includes(initialValue), false);
    assert.match(created.secret.fingerprint, /^[0-9a-f]{12}$/);
    const initialFingerprint = created.secret.fingerprint;
    assert.equal(await fs.readFile(path.join(secretsDir, testName), 'utf8'), initialValue);

    await expectVaultStatus(
      vault.createSecret({
        name: testName,
        project: 'Overwrite attempt',
        description: 'Must not replace the original',
        value: 'replacement-that-must-not-be-written'
      }),
      409
    );
    assert.equal(await fs.readFile(path.join(secretsDir, testName), 'utf8'), initialValue);

    const listed = await vault.listSecrets();
    assert.equal(listed.secrets.length, 1);
    assert.equal(listed.secrets[0].project, 'Project One');
    assert.equal('value' in listed.secrets[0], false);
    assert.equal(JSON.stringify(listed).includes(initialValue), false);

    const metadataUpdate = await vault.updateSecret(testName, {
      project: 'Project Two',
      description: 'Metadata-only update'
    });
    assert.equal(metadataUpdate.secret.project, 'Project Two');
    assert.equal(metadataUpdate.secret.fingerprint, initialFingerprint);
    assert.equal('value' in metadataUpdate.secret, false);
    assert.equal(await fs.readFile(path.join(secretsDir, testName), 'utf8'), initialValue);

    const rotated = await vault.updateSecret(testName, { value: rotatedValue });
    assert.equal(rotated.secret.project, 'Project Two');
    assert.notEqual(rotated.secret.fingerprint, initialFingerprint);
    assert.equal('value' in rotated.secret, false);
    assert.equal(await fs.readFile(path.join(secretsDir, testName), 'utf8'), rotatedValue);

    await expectVaultStatus(vault.updateSecret(testName, { value: '   ' }), 400);
    await expectVaultStatus(vault.updateSecret('../NOT_ALLOWED', { project: 'Nope' }), 400);

    await Promise.all([
      assertPrivateFile(path.join(secretsDir, testName)),
      assertPrivateFile(path.join(secretsDir, `${testName}.meta.json`)),
      assertPrivateFile(path.join(secretsDir, '.vault-fingerprint.key'))
    ]);

    const metadataBeforeDelete = await fs.readFile(
      path.join(secretsDir, `${testName}.meta.json`),
      'utf8'
    );
    const deleted = await vault.deleteSecret(testName);
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.quarantined, true);
    assert.equal(typeof deleted.quarantineId, 'string');

    const quarantineDir = path.join(secretsDir, '.trash', deleted.quarantineId);
    assert.equal(await fs.readFile(path.join(quarantineDir, testName), 'utf8'), rotatedValue);
    assert.equal(
      await fs.readFile(path.join(quarantineDir, `${testName}.meta.json`), 'utf8'),
      metadataBeforeDelete
    );
    const manifest = JSON.parse(await fs.readFile(path.join(quarantineDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.format, 'agent-os.credential-quarantine.v1');
    assert.equal(manifest.name, testName);
    await Promise.all([
      assertPrivateFile(path.join(quarantineDir, testName)),
      assertPrivateFile(path.join(quarantineDir, `${testName}.meta.json`)),
      assertPrivateFile(path.join(quarantineDir, 'manifest.json'))
    ]);
    await assert.rejects(fs.stat(path.join(secretsDir, testName)), { code: 'ENOENT' });

    const idempotentDelete = await vault.deleteSecret(testName);
    assert.equal(idempotentDelete.deleted, true);
    assert.equal(idempotentDelete.quarantined, false);
    assert.equal(idempotentDelete.quarantineId, null);

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
    const migratedLegacy = await vault.updateSecret(legacyTestName, {
      project: 'Legacy Project'
    });
    assert.equal(migratedLegacy.secret.project, 'Legacy Project');
    assert.equal(await fs.readFile(path.join(secretsDir, legacyTestName), 'utf8'), legacyValue);
    const deletedLegacy = await vault.deleteSecret(legacyTestName);
    assert.equal(deletedLegacy.quarantined, true);

    const finalList = await vault.listSecrets();
    assert.equal(finalList.secrets.length, 0);

    console.log(
      'Credentials contract: standalone create-only vault, edit, rotate, opaque values, legacy migration, private modes, and recoverable quarantine passed.'
    );
  } finally {
    await fs.rm(secretsDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
