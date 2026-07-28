#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseRetentionArgs,
  runRetention
} from './retain-openclaw-backups.mjs';
import {
  PRODUCTION_RECOVERY_LIMITATIONS,
  SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS
} from './openclaw-backup-schema.mjs';
import {
  computeRemoteObjectRootSha256,
  expectedBlobPathname
} from './upload-openclaw-backup.mjs';

const FIXED_NOW = new Date('2026-08-20T12:00:00.000Z');
const HOST_ID = 'retention-contract-host';

function sha256(contents) {
  return createHash('sha256')
    .update(contents)
    .digest('hex');
}

function setCompletedAt(setId) {
  const compact = setId.slice(0, 16);
  return [
    compact.slice(0, 4),
    '-',
    compact.slice(4, 6),
    '-',
    compact.slice(6, 8),
    'T',
    compact.slice(9, 11),
    ':',
    compact.slice(11, 13),
    ':',
    compact.slice(13, 15),
    '.000Z'
  ].join('');
}

function productionSummary(setId) {
  const artifacts = SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS.map(
    (descriptor, index) => ({
      id: descriptor.id,
      endpointPath: descriptor.endpointPath,
      archivePath:
        `external/agent-os-production/auth-control-plane/${descriptor.archiveName}`,
      httpStatus: descriptor.allowedStatuses[0],
      unrestorableValueCount: 0,
      bytes: 1,
      sha256: String(index + 1).repeat(64)
    })
  );
  return {
    schema: 'openclaw-agent-os-production-capture/v2',
    included: true,
    captureId: setId,
    projectRefSha256: 'a'.repeat(64),
    publicDump: {
      archivePath: 'external/agent-os-production/public.dump',
      bytes: 1,
      sha256: 'b'.repeat(64),
      format: 'pg-custom',
      pgMajor: 17,
      schemas: ['public'],
      tocSha256: 'c'.repeat(64),
      tocEntries: 1
    },
    auth: {
      archivePath: 'external/agent-os-production/auth.json',
      bytes: 1,
      sha256: 'd'.repeat(64),
      tableCount: 1,
      userCount: 1,
      dataIncluded: true,
      providerConfigIncluded: false
    },
    authControlPlane: {
      schema:
        'openclaw-supabase-auth-control-plane-capture/v1',
      consistency: 'canonical-before-after',
      artifactCount: artifacts.length,
      unrestorableValueCount: 0,
      totalBytes: artifacts.length,
      rootSha256: 'e'.repeat(64),
      artifacts
    },
    media: {
      inventoryPath:
        'external/agent-os-production/media-inventory.json',
      inventoryBytes: 1,
      inventorySha256: 'f'.repeat(64),
      rowCount: 1,
      uniqueObjectCount: 1,
      totalBytes: 1,
      objectRootSha256: '1'.repeat(64)
    },
    recoveryCapabilities: {
      supabasePublicData: true,
      supabaseAuthData: true,
      vercelMediaObjects: true,
      supabaseAuthControlPlaneMetadata: true,
      supabaseAuthProviderConfig: false,
      supabaseControlPlane: false,
      fullProductionRecovery: false
    },
    recoveryLimitations: [...PRODUCTION_RECOVERY_LIMITATIONS]
  };
}

async function createSealedSet(
  setsRoot,
  setId,
  {
    productionRecovery = true,
    recipientFingerprint = 'A'.repeat(40)
  } = {}
) {
  const setPath = join(setsRoot, setId);
  await mkdir(setPath, { mode: 0o700 });
  const chunkName = 'openclaw-backup.part-00000.gpg';
  const chunk = Buffer.from(`encrypted-chunk:${setId}`);
  const encryptedManifest = Buffer.from(
    `encrypted-manifest:${setId}`
  );
  const manifest = {
    schema: 'openclaw-backup-manifest/v1',
    setId,
    completedAt: setCompletedAt(setId),
    archive: 'tar',
    compression: 'zstd',
    encryption: 'openpgp-public-recipient',
    recipientFingerprint,
    signerFingerprint: 'B'.repeat(40),
    consistencyProof: {
      mode: 'best-effort',
      writersChecked: 1,
      writersStoppedBefore: false,
      writersStoppedAfter: null,
      protectedEntriesChecked: 0,
      protectedTreeStable: null
    },
    payloadBytesEstimate: 1024,
    chunkBytes: 64 * 1024 * 1024,
    totalBytes: chunk.length,
    chunks: [
      {
        name: chunkName,
        bytes: chunk.length,
        sha256: sha256(chunk)
      }
    ],
    encryptedManifest: {
      name: 'manifest.json.gpg',
      bytes: encryptedManifest.length,
      sha256: sha256(encryptedManifest)
    }
  };
  if (productionRecovery) {
    manifest.schema = 'openclaw-backup-manifest/v2';
    manifest.payloadClass = 'core+browser';
    manifest.consistencyProof = {
      mode: 'quiesced',
      writersChecked: 1,
      writersStoppedBefore: true,
      writersStoppedAfter: true,
      protectedEntriesChecked: 1,
      protectedTreeStable: true
    };
    manifest.payloadManifest = {
      schema: 'openclaw-backup-path-manifest/v1',
      archivePath: 'backup-meta/path-manifest.json',
      bytes: 1,
      sha256: '2'.repeat(64),
      entries: 2,
      contentBytes: 1,
      hostPolicy: 'openclaw-host-recovery/v1'
    };
    manifest.payloadComponents = {
      agentOsProduction: productionSummary(setId)
    };
  }
  await writeFile(join(setPath, chunkName), chunk, {
    mode: 0o600
  });
  await writeFile(
    join(setPath, 'manifest.json.gpg'),
    encryptedManifest,
    { mode: 0o600 }
  );
  await writeFile(
    join(setPath, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 }
  );
  for (const name of [
    chunkName,
    'manifest.json.gpg',
    'manifest.json'
  ]) {
    await chmod(join(setPath, name), 0o400);
  }
  await chmod(setPath, 0o500);
  return { setPath, manifest };
}

async function createEvidence(
  stateRoot,
  set,
  runId,
  {
    tamperProbe = false,
    checkedAt = new Date(
      FIXED_NOW.getTime() - 60 * 60 * 1000
    ).toISOString()
  } = {}
) {
  const runPath = join(stateRoot, 'runs', runId);
  await mkdir(runPath, { mode: 0o700 });
  const completedAtMs =
    Date.parse(set.manifest.completedAt) + 10 * 60 * 1000;
  const completedAt = new Date(completedAtMs).toISOString();
  const manifestObjects = [
    ...set.manifest.chunks,
    set.manifest.encryptedManifest
  ];
  const objects = manifestObjects.map((object, index) => ({
    filename: object.name,
    sha256: object.sha256,
    sizeBytes: object.bytes,
    etag: `fixture-etag-${index}`,
    pathname: expectedBlobPathname(HOST_ID, {
      filename: object.name,
      setId: set.manifest.setId,
      sha256: object.sha256,
      sizeBytes: object.bytes
    })
  }));
  const marker = objects.at(-1).pathname;
  const objectRootSha256 =
    computeRemoteObjectRootSha256(objects);
  const receipt = {
    schema: 'openclaw-backup-upload-result/v2',
    ok: true,
    completedAt,
    completedAtEpoch: Math.floor(completedAtMs / 1000),
    setId: set.manifest.setId,
    payloadClass:
      set.manifest.payloadClass ?? 'core',
    payloadManifestEntries:
      set.manifest.payloadManifest?.entries ?? null,
    productionData:
      set.manifest.payloadComponents?.agentOsProduction ?? null,
    uploadedFiles: objects.length,
    uploadedBytes:
      set.manifest.totalBytes +
      set.manifest.encryptedManifest.bytes,
    objects,
    objectRootSha256,
    completionMarker: marker
  };
  const probe = {
    schema: 'openclaw-backup-remote-probe/v2',
    ok: true,
    checkedAt,
    hostId: HOST_ID,
    setId: set.manifest.setId,
    objectCount: objects.length,
    totalBytes: receipt.uploadedBytes,
    objectRootSha256: tamperProbe
      ? '0'.repeat(64)
      : objectRootSha256,
    completionMarker: marker
  };
  await writeFile(
    join(runPath, 'upload-receipt.json'),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { mode: 0o600 }
  );
  await writeFile(
    join(runPath, 'remote-probe.json'),
    `${JSON.stringify(probe, null, 2)}\n`,
    { mode: 0o600 }
  );
  await writeFile(
    join(runPath, 'completed-set-path'),
    `${set.setPath}\n`,
    { mode: 0o600 }
  );
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function testRetentionContract(testRoot) {
  const setsRoot = join(testRoot, 'sets');
  const stateRoot = join(testRoot, 'state');
  await mkdir(setsRoot, { mode: 0o700 });
  await mkdir(join(stateRoot, 'runs'), {
    recursive: true,
    mode: 0o700
  });
  await chmod(stateRoot, 0o700);
  await chmod(join(stateRoot, 'runs'), 0o700);

  const identifiers = {
    eligibleOne:
      '20260701T010000Z-0000000000000001',
    invalidEvidence:
      '20260702T010000Z-0000000000000002',
    eligibleTwo:
      '20260703T010000Z-0000000000000003',
    corrupted:
      '20260704T010000Z-0000000000000004',
    unsealed:
      '20260705T010000Z-0000000000000005',
    staleEvidence:
      '20260706T010000Z-0000000000000006',
    recentNotNewest:
      '20260815T010000Z-0000000000000007',
    newestTwoOne:
      '20260816T010000Z-0000000000000008',
    newestTwoTwo:
      '20260817T010000Z-0000000000000009',
    newerNonFullOne:
      '20260818T010000Z-000000000000000a',
    newerNonFullTwo:
      '20260819T010000Z-000000000000000b',
    newerDifferentCohort:
      '20260820T010000Z-000000000000000c'
  };
  const sets = {};
  for (const [key, setId] of Object.entries(identifiers)) {
    sets[key] = await createSealedSet(
      setsRoot,
      setId,
      {
        productionRecovery:
          !key.startsWith('newerNonFull'),
        recipientFingerprint:
          key === 'newerDifferentCohort'
            ? 'C'.repeat(40)
            : 'A'.repeat(40)
      }
    );
  }
  const corruptedChunk = join(
    sets.corrupted.setPath,
    'openclaw-backup.part-00000.gpg'
  );
  await chmod(corruptedChunk, 0o600);
  await writeFile(corruptedChunk, 'tampered-ciphertext');
  await chmod(corruptedChunk, 0o400);
  await chmod(sets.unsealed.setPath, 0o700);

  await createEvidence(
    stateRoot,
    sets.eligibleOne,
    '20260820T100001Z'
  );
  await createEvidence(
    stateRoot,
    sets.invalidEvidence,
    '20260820T100002Z',
    { tamperProbe: true }
  );
  await createEvidence(
    stateRoot,
    sets.eligibleTwo,
    '20260820T100003Z'
  );
  await createEvidence(
    stateRoot,
    sets.staleEvidence,
    '20260820T100003Z-stale',
    {
      checkedAt: new Date(
        FIXED_NOW.getTime() - 48 * 60 * 60 * 1000
      ).toISOString()
    }
  );
  await createEvidence(
    stateRoot,
    sets.recentNotNewest,
    '20260820T100004Z'
  );
  await createEvidence(
    stateRoot,
    sets.newestTwoOne,
    '20260820T100005Z'
  );
  await createEvidence(
    stateRoot,
    sets.newestTwoTwo,
    '20260820T100006Z'
  );

  const incompletePath = join(
    setsRoot,
    '.20260820T010000Z-0000000000000008.partial'
  );
  await mkdir(incompletePath, { mode: 0o700 });

  const parsed = parseRetentionArgs(
    ['--sets-root', setsRoot, '--json'],
    {}
  );
  assert.equal(parsed.execute, false);
  assert.equal(parsed.json, true);

  const dryRun = await runRetention({
    setsRoot,
    stateRoot,
    now: FIXED_NOW
  });
  assert.equal(dryRun.mode, 'dry_run');
  assert.equal(dryRun.deletedSets, 0);
  assert.equal(
    dryRun.policy.minimumRetainedSetsPerKeyCohort,
    2
  );
  assert.equal(dryRun.policy.minimumAgeDays, 7);
  assert.deepEqual(
    dryRun.selected.map((item) => item.setId).sort(),
    [
      identifiers.eligibleOne,
      identifiers.eligibleTwo
    ].sort()
  );
  assert.equal(
    await pathExists(sets.eligibleOne.setPath),
    true,
    'dry-run must not delete a selected set'
  );
  assert.equal(dryRun.inventory.incompleteSets, 1);
  assert.equal(dryRun.inventory.unverifiedSets, 2);
  assert.equal(dryRun.inventory.productionRecoverySets, 8);
  assert.equal(dryRun.inventory.nonProductionRecoverySets, 2);
  assert.ok(
    dryRun.retained.some(
      (item) =>
        item.setId === identifiers.invalidEvidence &&
        item.reason ===
          'missing_or_invalid_remote_evidence'
    ),
    'a probe mismatch must protect the set'
  );
  assert.ok(
    dryRun.retained.some(
      (item) =>
        item.setId === identifiers.staleEvidence &&
        item.reason ===
          'missing_or_invalid_remote_evidence'
    ),
    'stale probe evidence must protect the set'
  );
  assert.ok(
    dryRun.retained.some(
      (item) =>
        item.setId === identifiers.recentNotNewest &&
        item.reason === 'younger_than_minimum_age'
    ),
    'the seven-day floor must protect a non-newest set'
  );
  for (const newest of [
    identifiers.newestTwoOne,
    identifiers.newestTwoTwo
  ]) {
    assert.ok(
      dryRun.retained.some(
        (item) =>
          item.setId === newest &&
          item.reason ===
            'newest_key_cohort_minimum'
      ),
      'the two-newest floor must protect both newest sets'
    );
  }
  assert.ok(
    dryRun.retained.some(
      (item) =>
        item.setId === identifiers.newerDifferentCohort &&
        item.reason === 'newest_key_cohort_minimum'
    ),
    'a new recovery-key cohort must have its own retention floor'
  );
  for (const nonFull of [
    identifiers.newerNonFullOne,
    identifiers.newerNonFullTwo
  ]) {
    assert.ok(
      dryRun.retained.some(
        (item) =>
          item.setId === nonFull &&
          item.reason ===
            'outside_production_recovery_class'
      ),
      'newer non-full sets must not displace full recovery sets'
    );
  }

  await assert.rejects(
    runRetention({
      setsRoot,
      stateRoot,
      execute: true,
      now: FIXED_NOW
    }),
    /requires both backup locks/
  );

  const activeState = join(
    stateRoot,
    'maintenance-active.json'
  );
  await writeFile(activeState, 'RUN_ID=fixture\n', {
    mode: 0o600
  });
  await assert.rejects(
    runRetention({
      setsRoot,
      stateRoot,
      execute: true,
      lockConfirmed: true,
      now: FIXED_NOW
    }),
    /Maintenance is active/
  );
  assert.equal(
    await pathExists(sets.eligibleOne.setPath),
    true,
    'active maintenance must block deletion'
  );
  await unlink(activeState);

  const unsafeLink = join(setsRoot, 'unsafe-link');
  await symlink(sets.eligibleOne.setPath, unsafeLink);
  const unsafePlan = await runRetention({
    setsRoot,
    stateRoot,
    now: FIXED_NOW
  });
  assert.deepEqual(unsafePlan.executionBlocked, [
    'unsafe_set_root_entry'
  ]);
  await assert.rejects(
    runRetention({
      setsRoot,
      stateRoot,
      execute: true,
      lockConfirmed: true,
      now: FIXED_NOW
    }),
    /blocked by protected state/
  );
  await unlink(unsafeLink);

  await assert.rejects(
    runRetention({
      setsRoot,
      stateRoot,
      execute: true,
      lockConfirmed: true,
      now: FIXED_NOW,
      clock: () => FIXED_NOW.getTime(),
      remoteProbeRunner: async ({ runPath }) =>
        JSON.parse(
          await readFile(
            join(runPath, 'remote-probe.json'),
            'utf8'
          )
        )
    }),
    /not fresh/
  );
  assert.equal(
    await pathExists(sets.eligibleOne.setPath),
    true,
    'a stale deletion-time probe must preserve every local set'
  );

  const executed = await runRetention({
    setsRoot,
    stateRoot,
    execute: true,
    lockConfirmed: true,
    now: FIXED_NOW,
    clock: () => FIXED_NOW.getTime(),
    remoteProbeRunner: async ({ runPath }) => {
      const probe = JSON.parse(
        await readFile(join(runPath, 'remote-probe.json'), 'utf8')
      );
      return {
        ...probe,
        checkedAt: FIXED_NOW.toISOString()
      };
    }
  });
  assert.equal(executed.mode, 'execute');
  assert.equal(executed.deletedSets, 2);
  assert.ok(executed.reclaimedBytes > 0);
  assert.equal(
    await pathExists(sets.eligibleOne.setPath),
    false
  );
  assert.equal(
    await pathExists(sets.eligibleTwo.setPath),
    false
  );
  assert.equal(
    await pathExists(sets.invalidEvidence.setPath),
    true
  );
  assert.equal(await pathExists(sets.corrupted.setPath), true);
  assert.equal(await pathExists(sets.unsealed.setPath), true);
  assert.equal(
    await pathExists(sets.staleEvidence.setPath),
    true
  );
  assert.equal(await pathExists(incompletePath), true);
  assert.equal(
    await pathExists(sets.newestTwoOne.setPath),
    true
  );
  assert.equal(
    await pathExists(sets.newestTwoTwo.setPath),
    true
  );
  assert.equal(
    await pathExists(sets.newerNonFullOne.setPath),
    true
  );
  assert.equal(
    await pathExists(sets.newerNonFullTwo.setPath),
    true
  );
  assert.equal(
    await pathExists(sets.newerDifferentCohort.setPath),
    true
  );

  const serialized = JSON.stringify(executed);
  assert.equal(
    serialized.includes(testRoot),
    false,
    'JSON results must not expose local paths'
  );
  assert.equal(
    serialized.includes(HOST_ID),
    false,
    'JSON results must not expose remote host identifiers'
  );
  assert.equal(
    serialized.includes(
      sets.eligibleOne.manifest.encryptedManifest.sha256
    ),
    false,
    'JSON results must not expose object hashes'
  );
}

async function main() {
  const testRoot = await mkdtemp(
    join(tmpdir(), 'openclaw-retention-contract-')
  );
  try {
    await chmod(testRoot, 0o700);
    await testRetentionContract(testRoot);
    process.stdout.write(
      'openclaw_backup_retention_contract_ok\n'
    );
  } finally {
    await rm(testRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `openclaw_backup_retention_contract_error: ${error.message}\n`
  );
  process.exitCode = 1;
});
