#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {
  captureSupabaseAuthControlPlane,
  databaseDockerArgs,
  exportAuthData,
  PINNED_POSTGRES_IMAGE,
  PINNED_SUPABASE_CA_FILE,
  verifySupabaseAuthControlPlaneCapture
} from './openclaw-backup-external.mjs';
import {
  PRODUCTION_CAPTURE_V2,
  PRODUCTION_RECOVERY_LIMITATIONS,
  SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS,
  validateProductionDataSummary
} from './openclaw-backup-schema.mjs';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CONFIGURED_RECOVERY_SCRIPT_DIRECTORY =
  process.env.OPENCLAW_BACKUP_TEST_RECOVERY_SCRIPTS?.trim() || '';
const RECOVERY_SCRIPT_DIRECTORY =
  CONFIGURED_RECOVERY_SCRIPT_DIRECTORY || SCRIPT_DIRECTORY;
const BACKUP_SCRIPT = resolve(SCRIPT_DIRECTORY, 'openclaw-backup.mjs');
const VERIFY_SCRIPT = resolve(
  RECOVERY_SCRIPT_DIRECTORY,
  'verify-openclaw-backup.mjs'
);
const UPLOAD_SCRIPT = resolve(
  SCRIPT_DIRECTORY,
  'upload-openclaw-backup.mjs'
);
const RECOVER_MANIFEST_SCRIPT = resolve(
  RECOVERY_SCRIPT_DIRECTORY,
  'recover-openclaw-backup-manifest.mjs'
);
const RESTORE_SCRIPT = resolve(
  RECOVERY_SCRIPT_DIRECTORY,
  'restore-openclaw-backup.mjs'
);

function sha256Text(value) {
  return createHash('sha256')
    .update(value, 'utf8')
    .digest('hex');
}

function jsonResponse(value, status = 200) {
  const body = JSON.stringify(value);
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body, 'utf8'))
    }
  });
}

function testSupabaseTlsClientContract() {
  const args = databaseDockerArgs(
    {
      poolerHost: 'aws-1-eu-west-2.pooler.supabase.com',
      username: 'postgres.fixture',
      database: 'postgres',
      caFile: PINNED_SUPABASE_CA_FILE
    },
    'psql',
    ['--no-psqlrc']
  );
  assert.equal(args[0], 'run');
  assert.ok(args.includes(PINNED_POSTGRES_IMAGE));
  assert.ok(
    args.includes(
      `type=bind,src=${PINNED_SUPABASE_CA_FILE},dst=/etc/ssl/certs/supabase-prod-ca-2021.crt,readonly`
    )
  );
  const shellContract = args.find(
    (argument) =>
      argument.includes('PGSSLMODE=') &&
      argument.includes('PGSSLROOTCERT=')
  );
  assert.match(shellContract, /PGSSLMODE=verify-full/);
  assert.match(
    shellContract,
    /PGSSLROOTCERT=\/etc\/ssl\/certs\/supabase-prod-ca-2021\.crt/
  );
  assert.doesNotMatch(shellContract, /PGSSLMODE=require(?:\s|;)/);
}

async function testSupabaseReadOnlyManagementContracts(
  secureTemporaryRoot
) {
  const testRoot = secureTemporaryRoot
    ? await mkdtemp(
        join(
          secureTemporaryRoot,
          'openclaw-control-plane-integration-'
        )
      )
    : null;
  const projectRef = 'abcdefghijklmnopqrst';
  const managementToken = `sbp_${'x'.repeat(64)}`;
  const configuration = { projectRef, managementToken };
  const setId = '20260728T010203Z-0123456789abcdef';
  const managementPrefix =
    `https://api.supabase.com/v1/projects/${projectRef}/`;
  const responseValues = new Map([
    [
      'config/auth',
      {
        site_url: 'https://fixture.invalid',
        encryptedFixture:
          'must-remain-in-encrypted-control-plane-artifact',
        smtp_pass: '********',
        external_fixture_secret: null
      }
    ],
    [
      'config/auth/signing-keys',
      {
        keys: [
          {
            id: 'fixture-public-key',
            public_jwk: { kty: 'OKP' }
          }
        ]
      }
    ],
    ['config/auth/signing-keys/legacy', null],
    [
      'config/auth/third-party-auth',
      [{ id: 'fixture-third-party-auth' }]
    ],
    [
      'config/auth/sso/providers',
      { items: [{ id: 'fixture-sso-provider' }] }
    ]
  ]);
  const schemaRows = [
    {
      table_name: 'identities',
      column_name: 'id',
      ordinal_position: 1,
      data_type: 'uuid',
      udt_name: 'uuid',
      is_nullable: 'NO',
      column_default: null
    },
    {
      table_name: 'users',
      column_name: 'id',
      ordinal_position: 1,
      data_type: 'uuid',
      udt_name: 'uuid',
      is_nullable: 'NO',
      column_default: null
    }
  ];
  const dataRows = [
    { table_name: 'identities', rows: [] },
    {
      table_name: 'users',
      rows: [{ id: 'fixture-user' }]
    }
  ];
  const calls = [];
  let failedEndpoint = '';
  let oversizedEndpoint = '';
  let mutateSecondControlPlaneSnapshot = false;
  let controlPlaneRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const headers = new Headers(init.headers);
    calls.push({
      url,
      method: init.method,
      redirect: init.redirect,
      authorization: headers.get('authorization'),
      body: init.body
    });
    if (failedEndpoint && url.endsWith(failedEndpoint)) {
      return new Response('must-never-reach-an-error-message', {
        status: 503,
        headers: { 'content-type': 'text/plain' }
      });
    }
    if (oversizedEndpoint && url.endsWith(oversizedEndpoint)) {
      return new Response('{}', {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': String(4 * 1024 * 1024 + 1)
        }
      });
    }
    if (url === `${managementPrefix}database/query/read-only`) {
      const query = JSON.parse(String(init.body)).query;
      return jsonResponse(
        query.includes('information_schema.columns')
          ? schemaRows
          : dataRows
      );
    }
    const descriptor =
      SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS.find(
        (candidate) =>
          url === `${managementPrefix}${candidate.endpointPath}`
      );
    assert.ok(
      descriptor,
      'only allowlisted Supabase Management API endpoints may be called'
    );
    controlPlaneRequests += 1;
    if (descriptor.id === 'legacy_signing_key') {
      return jsonResponse(null, 404);
    }
    const responseValue =
      mutateSecondControlPlaneSnapshot &&
      controlPlaneRequests >
        SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS.length &&
      descriptor.id === 'auth_config'
        ? { changed: true }
        : responseValues.get(descriptor.endpointPath);
    return jsonResponse(responseValue);
  };

  try {
    const auth = await exportAuthData(configuration);
    assert.equal(auth.tableCount, 2);
    assert.equal(auth.userCount, 1);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(
        call.url,
        `${managementPrefix}database/query/read-only`
      );
      assert.equal(call.method, 'POST');
      assert.equal(call.redirect, 'error');
      assert.equal(
        call.authorization,
        `Bearer ${managementToken}`
      );
      assert.match(
        JSON.parse(String(call.body)).query,
        /^SELECT\b/
      );
    }

    if (!testRoot) return;

    calls.length = 0;
    const metadataRoot = join(
      testRoot,
      'supabase-control-plane',
      'backup-meta'
    );
    await mkdir(metadataRoot, {
      recursive: true,
      mode: 0o700
    });
    const summary = await captureSupabaseAuthControlPlane({
      metadataRoot,
      captureId: setId,
      configuration
    });
    assert.equal(
      summary.artifactCount,
      SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS.length
    );
    assert.equal(calls.length, summary.artifactCount * 2);
    const expectedControlPlaneUrls =
      SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS.map(
        (descriptor) =>
          `${managementPrefix}${descriptor.endpointPath}`
      );
    assert.deepEqual(
      calls.map((call) => call.url),
      [
        ...expectedControlPlaneUrls,
        ...expectedControlPlaneUrls
      ]
    );
    for (const call of calls) {
      assert.equal(call.method, 'GET');
      assert.equal(call.redirect, 'error');
      assert.equal(call.body, undefined);
      assert.equal(
        call.authorization,
        `Bearer ${managementToken}`
      );
      const endpoint = new URL(call.url);
      assert.equal(endpoint.protocol, 'https:');
      assert.equal(endpoint.hostname, 'api.supabase.com');
    }
    assert.equal(
      summary.artifacts.find(
        (artifact) => artifact.id === 'legacy_signing_key'
      ).httpStatus,
      404
    );
    const publicSummaryText = JSON.stringify(summary);
    assert.equal(
      publicSummaryText.includes(
        'must-remain-in-encrypted-control-plane-artifact'
      ),
      false
    );
    assert.equal(
      publicSummaryText.includes(managementToken),
      false
    );
    const authConfigSummary = summary.artifacts.find(
      (artifact) => artifact.id === 'auth_config'
    );
    assert.equal(authConfigSummary.unrestorableValueCount, 2);
    const authConfigArtifact = JSON.parse(
      await readFile(
        join(metadataRoot, authConfigSummary.archivePath),
        'utf8'
      )
    );
    assert.equal(
      authConfigArtifact.response.encryptedFixture,
      'must-remain-in-encrypted-control-plane-artifact'
    );
    assert.equal(
      authConfigArtifact.response.smtp_pass,
      '********'
    );
    assert.deepEqual(authConfigArtifact.unrestorablePaths, [
      '/external_fixture_secret',
      '/smtp_pass'
    ]);

    const projectRefSha256 = sha256Text(projectRef);
    const fullSummary = {
      schema: PRODUCTION_CAPTURE_V2,
      included: true,
      captureId: setId,
      projectRefSha256,
      publicDump: {
        archivePath:
          'external/agent-os-production/public.dump',
        bytes: 1,
        sha256: 'a'.repeat(64),
        format: 'pg-custom',
        pgMajor: 17,
        schemas: ['public'],
        tocSha256: 'b'.repeat(64),
        tocEntries: 1
      },
      auth: {
        archivePath:
          'external/agent-os-production/auth.json',
        bytes: 1,
        sha256: 'c'.repeat(64),
        tableCount: 2,
        userCount: 1,
        dataIncluded: true,
        providerConfigIncluded: false
      },
      authControlPlane: summary,
      media: {
        inventoryPath:
          'external/agent-os-production/media-inventory.json',
        inventoryBytes: 1,
        inventorySha256: 'd'.repeat(64),
        rowCount: 0,
        uniqueObjectCount: 0,
        totalBytes: 0,
        objectRootSha256: 'e'.repeat(64)
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
    assert.doesNotThrow(() =>
      validateProductionDataSummary(fullSummary, setId)
    );
    assert.throws(
      () =>
        validateProductionDataSummary(
          {
            ...fullSummary,
            authControlPlane: undefined
          },
          setId
        ),
      /control-plane summary is invalid/
    );
    assert.throws(
      () =>
        validateProductionDataSummary(
          {
            ...fullSummary,
            response: {
              forbidden:
                'control-plane values must not enter the signed summary'
            }
          },
          setId
        ),
      /production data summary is invalid/
    );
    assert.throws(
      () =>
        validateProductionDataSummary(
          {
            ...fullSummary,
            recoveryCapabilities: {
              ...fullSummary.recoveryCapabilities,
              fullProductionRecovery: true
            }
          },
          setId
        ),
      /production data summary is invalid/
    );

    const verified =
      await verifySupabaseAuthControlPlaneCapture({
        metadataRoot,
        summary,
        expectedSetId: setId,
        projectRefSha256
      });
    assert.deepEqual(verified, {
      verified: true,
      artifacts: 5,
      bytes: summary.totalBytes,
      unrestorableValues: summary.unrestorableValueCount
    });
    for (const artifact of summary.artifacts) {
      const info = await lstat(
        join(metadataRoot, artifact.archivePath)
      );
      assert.equal(info.mode & 0o777, 0o600);
    }

    const tampered = summary.artifacts[0];
    await writeFile(
      join(metadataRoot, tampered.archivePath),
      '{}\n'
    );
    await assert.rejects(
      verifySupabaseAuthControlPlaneCapture({
        metadataRoot,
        summary,
        expectedSetId: setId,
        projectRefSha256
      }),
      /artifact integrity check failed/
    );

    calls.length = 0;
    failedEndpoint = '/config/auth/third-party-auth';
    const failureMetadataRoot = join(
      testRoot,
      'supabase-control-plane-failure',
      'backup-meta'
    );
    await mkdir(failureMetadataRoot, {
      recursive: true,
      mode: 0o700
    });
    let failure;
    try {
      await captureSupabaseAuthControlPlane({
        metadataRoot: failureMetadataRoot,
        captureId:
          '20260728T010204Z-0123456789abcdef',
        configuration
      });
    } catch (error) {
      failure = error;
    }
    assert.match(
      failure?.message || '',
      /control-plane capture failed/
    );
    assert.equal(
      failure.message.includes(
        'must-never-reach-an-error-message'
      ),
      false
    );
    assert.equal(
      failure.message.includes(managementToken),
      false
    );

    failedEndpoint = '';
    oversizedEndpoint = '/config/auth';
    const oversizedMetadataRoot = join(
      testRoot,
      'supabase-control-plane-oversized',
      'backup-meta'
    );
    await mkdir(oversizedMetadataRoot, {
      recursive: true,
      mode: 0o700
    });
    await assert.rejects(
      captureSupabaseAuthControlPlane({
        metadataRoot: oversizedMetadataRoot,
        captureId:
          '20260728T010205Z-0123456789abcdef',
        configuration
      }),
      /control-plane capture failed/
    );

    oversizedEndpoint = '';
    mutateSecondControlPlaneSnapshot = true;
    controlPlaneRequests = 0;
    const unstableMetadataRoot = join(
      testRoot,
      'supabase-control-plane-unstable',
      'backup-meta'
    );
    await mkdir(unstableMetadataRoot, {
      recursive: true,
      mode: 0o700
    });
    await assert.rejects(
      captureSupabaseAuthControlPlane({
        metadataRoot: unstableMetadataRoot,
        captureId:
          '20260728T010206Z-0123456789abcdef',
        configuration
      }),
      /metadata changed during production capture/
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (testRoot) {
      await rm(testRoot, { recursive: true, force: true });
    }
  }
}

async function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  if (options.input) child.stdin.end(options.input);
  else child.stdin.end();

  const code = await new Promise((resolvePromise, rejectPromise) => {
    child.once('error', rejectPromise);
    child.once('close', (exitCode) => resolvePromise(exitCode ?? 1));
  });
  if (code !== 0) {
    const detail = Buffer.concat(stderr).toString('utf8').trim();
    throw new Error(
      `${options.label || command} failed${detail ? `: ${detail}` : ''}`
    );
  }
  return {
    stdout: Buffer.concat(stdout),
    stderr: Buffer.concat(stderr)
  };
}

function environmentWithGpgHome(gpgHome) {
  return {
    ...process.env,
    GNUPGHOME: gpgHome,
    LC_ALL: 'C'
  };
}

async function createTestKey(gpgHome, userId, usage) {
  await run(
    'gpg',
    [
      '--batch',
      '--pinentry-mode',
      'loopback',
      '--passphrase',
      '',
      '--quick-generate-key',
      userId,
      'rsa2048',
      usage,
      '1d'
    ],
    {
      env: environmentWithGpgHome(gpgHome),
      label: `temporary ${usage} key generation`
    }
  );
  const listing = await run(
    'gpg',
    ['--batch', '--with-colons', '--list-keys', userId],
    {
      env: environmentWithGpgHome(gpgHome),
      label: `temporary ${usage} key listing`
    }
  );
  const fingerprint = listing.stdout
    .toString('utf8')
    .split('\n')
    .find((line) => line.startsWith('fpr:'))
    ?.split(':')[9];
  assert.match(
    fingerprint || '',
    /^(?:[0-9A-F]{40}|[0-9A-F]{64})$/,
    'temporary key must have an exact fingerprint'
  );

  return fingerprint;
}

async function copyPublicKey(fingerprint, sourceHome, destinationHome) {
  const publicKey = await run(
    'gpg',
    ['--batch', '--export', fingerprint],
    {
      env: environmentWithGpgHome(sourceHome),
      label: 'temporary public key export'
    }
  );
  await run('gpg', ['--batch', '--import'], {
    env: environmentWithGpgHome(destinationHome),
    input: publicKey.stdout,
    label: 'temporary public key import'
  });
}

async function createTestKeys(offlineHome, publicHome) {
  const recipient = await createTestKey(
    offlineHome,
    'OpenClaw Recovery Integration <recovery@example.invalid>',
    'encr'
  );
  await copyPublicKey(recipient, offlineHome, publicHome);
  const signer = await createTestKey(
    publicHome,
    'OpenClaw Signer Integration <signer@example.invalid>',
    'sign'
  );
  await copyPublicKey(signer, publicHome, offlineHome);
  return { recipient, signer };
}

async function main() {
  const allowedArguments = new Set(['--require-secure']);
  for (const argument of process.argv.slice(2)) {
    if (!allowedArguments.has(argument)) {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  const requireSecure = process.argv.includes('--require-secure');
  if (
    CONFIGURED_RECOVERY_SCRIPT_DIRECTORY &&
    resolve(CONFIGURED_RECOVERY_SCRIPT_DIRECTORY) !==
      CONFIGURED_RECOVERY_SCRIPT_DIRECTORY
  ) {
    throw new Error(
      'configured recovery script directory must be an absolute normalized path'
    );
  }
  for (const path of [
    VERIFY_SCRIPT,
    RECOVER_MANIFEST_SCRIPT,
    RESTORE_SCRIPT
  ]) {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error('configured recovery script closure is unsafe');
    }
  }
  const secureTemporaryRoot =
    process.env.OPENCLAW_BACKUP_TEST_SECURE_TMPDIR?.trim() || '';
  const ciphertextOutputRoot =
    process.env.OPENCLAW_BACKUP_TEST_CIPHERTEXT_ROOT?.trim() || '';

  testSupabaseTlsClientContract();
  await testSupabaseReadOnlyManagementContracts(
    secureTemporaryRoot || undefined
  );
  if (!secureTemporaryRoot) {
    if (requireSecure) {
      throw new Error(
        'secure E2E requires OPENCLAW_BACKUP_TEST_SECURE_TMPDIR on a private noswap tmpfs with all swap disabled'
      );
    }
    process.stdout.write(
      'openclaw_backup_integration_limited_ok secure_e2e=skipped\n'
    );
    return;
  }
  if (!ciphertextOutputRoot) {
    throw new Error(
      'secure E2E requires OPENCLAW_BACKUP_TEST_CIPHERTEXT_ROOT on a private disk-backed directory with at least the backup safety floor'
    );
  }
  if (resolve(ciphertextOutputRoot) !== ciphertextOutputRoot) {
    throw new Error(
      'secure E2E ciphertext root must be an absolute normalized path'
    );
  }
  const ciphertextRootInfo = await lstat(ciphertextOutputRoot);
  const expectedUid =
    typeof process.getuid === 'function' ? process.getuid() : -1;
  if (
    ciphertextRootInfo.isSymbolicLink() ||
    !ciphertextRootInfo.isDirectory() ||
    ciphertextRootInfo.uid !== expectedUid ||
    (ciphertextRootInfo.mode & 0o077) !== 0
  ) {
    throw new Error(
      'secure E2E ciphertext root is missing or unsafe'
    );
  }

  const testRoot = await mkdtemp(
    join(secureTemporaryRoot, 'openclaw-backup-integration-')
  );
  const output = await mkdtemp(
    join(
      ciphertextOutputRoot,
      'openclaw-backup-integration-output-'
    )
  );
  try {
    const offlineHome = join(testRoot, 'offline-recovery-keyring');
    const publicHome = join(testRoot, 'backup-host-public-keyring');
    const source = join(testRoot, 'source', '.openclaw');
    const restoreTarget = join(testRoot, 'restore');
    await Promise.all([
      mkdir(offlineHome, { recursive: true, mode: 0o700 }),
      mkdir(publicHome, { recursive: true, mode: 0o700 }),
      mkdir(join(source, 'state'), { recursive: true, mode: 0o700 }),
      mkdir(join(source, 'agents', 'main', 'sessions'), {
        recursive: true,
        mode: 0o700
      }),
      mkdir(
        join(source, 'telegram', 'ingress-spool-main'),
        { recursive: true, mode: 0o700 }
      ),
      mkdir(join(source, 'session-delivery-queue'), {
        recursive: true,
        mode: 0o700
      }),
      mkdir(join(source, 'cron'), {
        recursive: true,
        mode: 0o700
      }),
      mkdir(restoreTarget, { recursive: true, mode: 0o700 })
    ]);
    await Promise.all([chmod(offlineHome, 0o700), chmod(publicHome, 0o700)]);
    await writeFile(
      join(source, 'openclaw.json'),
      '{"fixture":"synthetic-only"}\n',
      { mode: 0o600 }
    );
    await writeFile(
      join(
        source,
        'telegram',
        'ingress-spool-main',
        'pending.json'
      ),
      '{"update":"must-stay-quarantined"}\n',
      { mode: 0o600 }
    );
    await writeFile(
      join(source, 'session-delivery-queue', 'pending.json'),
      '{"delivery":"must-stay-quarantined"}\n',
      { mode: 0o600 }
    );
    await writeFile(
      join(source, 'cron', 'jobs.json'),
      '{"job":"must-require-review"}\n',
      { mode: 0o600 }
    );
    await writeFile(
      join(source, 'agents', 'main', 'sessions', 'session.jsonl'),
      '{"event":"kept"}\n',
      { mode: 0o600 }
    );
    const linkFixtureDirectory = join(
      source,
      'workspace',
      'link-fixture'
    );
    await mkdir(linkFixtureDirectory, {
      recursive: true,
      mode: 0o700
    });
    const hardlinkSource = join(
      linkFixtureDirectory,
      'hardlink-source.bin'
    );
    await writeFile(hardlinkSource, 'hardlink-fixture\n', {
      mode: 0o600
    });
    await link(
      hardlinkSource,
      join(linkFixtureDirectory, 'hardlink-copy.bin')
    );
    await symlink(
      '/usr/bin/node',
      join(linkFixtureDirectory, 'absolute-runtime-link')
    );
    await symlink(
      'hardlink-source.bin',
      join(linkFixtureDirectory, 'relative-safe-link')
    );

    const sourceDatabase = join(source, 'state', 'openclaw.sqlite');
    const database = new DatabaseSync(sourceDatabase);
    database.exec(
      'CREATE TABLE fixture (id INTEGER PRIMARY KEY, value TEXT NOT NULL)'
    );
    database.exec(
      'CREATE TABLE delivery_queue_entries (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)'
    );
    database.exec(
      `CREATE TABLE cron_jobs (
        store_key TEXT NOT NULL,
        job_id TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        next_run_at_ms INTEGER,
        running_at_ms INTEGER,
        job_json TEXT NOT NULL,
        state_json TEXT NOT NULL,
        PRIMARY KEY (store_key, job_id)
      )`
    );
    database
      .prepare('INSERT INTO fixture (value) VALUES (?)')
      .run('restored');
    database
      .prepare(
        'INSERT INTO delivery_queue_entries (payload) VALUES (?)'
      )
      .run('must-be-scrubbed');
    database
      .prepare(
        `INSERT INTO cron_jobs (
          store_key,
          job_id,
          enabled,
          next_run_at_ms,
          running_at_ms,
          job_json,
          state_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'fixture',
        'enabled-job',
        1,
        Date.now() + 60_000,
        Date.now(),
        JSON.stringify({
          id: 'enabled-job',
          enabled: true,
          state: { nextRunAtMs: Date.now() + 60_000 }
        }),
        JSON.stringify({
          nextRunAtMs: Date.now() + 60_000,
          runningAtMs: Date.now()
        })
      );
    database.close();
    for (const relativePath of [
      join('agents', 'main', 'agent', 'openclaw-agent.sqlite'),
      join(
        'agents',
        'main',
        'agent',
        'codex-home',
        'state_5.sqlite'
      ),
      join(
        'agents',
        'main',
        'agent',
        'codex-home',
        'memories_1.sqlite'
      ),
      join(
        'agents',
        'main',
        'agent',
        'codex-home',
        'goals_1.sqlite'
      )
    ]) {
      const path = join(source, relativePath);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      const agentDatabase = new DatabaseSync(path);
      agentDatabase.exec(
        'CREATE TABLE fixture_agent_state (value TEXT NOT NULL)'
      );
      agentDatabase.close();
    }

    const { recipient, signer } = await createTestKeys(
      offlineHome,
      publicHome
    );
    const backup = await run(
      process.execPath,
      [
        BACKUP_SCRIPT,
        '--execute',
        '--source',
        source,
        '--output-dir',
        output,
        '--recipient',
        recipient,
        '--signer',
        signer,
        '--chunk-bytes',
        String(64 * 1024 * 1024),
        '--postgres',
        'skip',
        '--production-data',
        'skip',
        '--host-recovery',
        'skip',
        '--consistency',
        'best-effort',
        '--plaintext-staging',
        secureTemporaryRoot,
        '--allow-same-device',
        '--json'
      ],
      {
        env: environmentWithGpgHome(publicHome),
        label: 'synthetic backup creation'
      }
    );
    const backupResult = JSON.parse(backup.stdout.toString('utf8'));
    assert.equal(backupResult.ok, true);

    const outerVerification = await run(
      process.execPath,
      [VERIFY_SCRIPT, backupResult.directory, '--json'],
      {
        env: environmentWithGpgHome(publicHome),
        label: 'outer verification'
      }
    );
    assert.equal(
      JSON.parse(outerVerification.stdout.toString('utf8')).outerIntegrity,
      'sha256-ok'
    );

    const manifest = JSON.parse(
      await readFile(
        join(backupResult.directory, 'manifest.json'),
        'utf8'
      )
    );
    const uploadPlan = await run(
      process.execPath,
      [UPLOAD_SCRIPT, backupResult.directory, '--json'],
      { label: 'offline upload dry run' }
    );
    const parsedUploadPlan = JSON.parse(
      uploadPlan.stdout.toString('utf8')
    );
    assert.equal(parsedUploadPlan.mode, 'dry_run');
    assert.equal(parsedUploadPlan.files, manifest.chunks.length + 1);
    assert.deepEqual(parsedUploadPlan.deniedByDesign, [
      'list',
      'get',
      'head',
      'overwrite',
      'delete'
    ]);

    await rm(join(backupResult.directory, 'manifest.json'));
    const recoveredManifest = await run(
      process.execPath,
      [
        RECOVER_MANIFEST_SCRIPT,
        backupResult.directory,
        '--signer',
        signer,
        '--json'
      ],
      {
        env: environmentWithGpgHome(offlineHome),
        label: 'remote manifest recovery'
      }
    );
    assert.equal(
      JSON.parse(recoveredManifest.stdout.toString('utf8')).verification,
      'sha256-ok'
    );

    const deepVerification = await run(
      process.execPath,
      [
        VERIFY_SCRIPT,
        backupResult.directory,
        '--deep',
        '--signer',
        signer,
        '--json'
      ],
      {
        env: environmentWithGpgHome(offlineHome),
        label: 'deep verification'
      }
    );
    assert.equal(
      JSON.parse(deepVerification.stdout.toString('utf8')).deepIntegrity,
      'signed-gpg-zstd-tar-v2-list-ok'
    );

    const restore = await run(
      process.execPath,
      [
        RESTORE_SCRIPT,
        backupResult.directory,
        '--target',
        restoreTarget,
        '--signer',
        signer,
        '--allow-no-postgres',
        '--allow-no-production-data',
        '--allow-best-effort',
        '--execute',
        '--json'
      ],
      {
        env: environmentWithGpgHome(offlineHome),
        label: 'fenced production restore'
      }
    );
    const restoreResult = JSON.parse(restore.stdout.toString('utf8'));
    assert.equal(restoreResult.status, 'fenced-inspection-only');
    assert.equal(restoreResult.sqlite.restored, 5);
    assert.equal(
      restoreResult.sqlite.scrubbedDeliveryQueueRows,
      1
    );
    assert.equal(restoreResult.sqlite.cronJobsFenced, 1);
    assert.equal(
      restoreResult.sqlite.enabledCronJobsDisabled,
      1
    );
    assert.equal(
      restoreResult.absoluteSymlinksQuarantined,
      1
    );

    const restoredLiveDatabase = join(
      restoreTarget,
      '.openclaw',
      'state',
      'openclaw.sqlite'
    );
    const restoredDatabase = new DatabaseSync(restoredLiveDatabase, {
      readOnly: true
    });
    const restoredRow = restoredDatabase
      .prepare('SELECT value FROM fixture')
      .get();
    const restoredQueueRows = restoredDatabase
      .prepare(
        'SELECT COUNT(*) AS rows FROM delivery_queue_entries'
      )
      .get();
    const restoredCronRow = restoredDatabase
      .prepare(
        `SELECT
           enabled,
           next_run_at_ms,
           running_at_ms,
           job_json,
           state_json
         FROM cron_jobs
         WHERE store_key = ? AND job_id = ?`
      )
      .get('fixture', 'enabled-job');
    restoredDatabase.close();
    assert.equal(restoredRow.value, 'restored');
    assert.equal(restoredQueueRows.rows, 0);
    assert.equal(restoredCronRow.enabled, 0);
    assert.equal(restoredCronRow.next_run_at_ms, null);
    assert.equal(restoredCronRow.running_at_ms, null);
    assert.equal(
      JSON.parse(restoredCronRow.job_json).enabled,
      false
    );
    assert.deepEqual(JSON.parse(restoredCronRow.state_json), {});

    const restoredLinkFixture = join(
      restoreTarget,
      '.openclaw',
      'workspace',
      'link-fixture'
    );
    const firstHardlink = await lstat(
      join(restoredLinkFixture, 'hardlink-source.bin')
    );
    const secondHardlink = await lstat(
      join(restoredLinkFixture, 'hardlink-copy.bin')
    );
    assert.equal(firstHardlink.ino, secondHardlink.ino);
    assert.equal(firstHardlink.nlink, 2);
    assert.equal(
      await readlink(
        join(restoredLinkFixture, 'relative-safe-link')
      ),
      'hardlink-source.bin'
    );
    await assert.rejects(
      lstat(join(restoredLinkFixture, 'absolute-runtime-link')),
      (error) => error?.code === 'ENOENT'
    );
    const absoluteSymlinkReport = JSON.parse(
      await readFile(
        join(
          restoreTarget,
          'backup-meta',
          'quarantine',
          'restore-fenced',
          'absolute-symlinks.json'
        ),
        'utf8'
      )
    );
    assert.deepEqual(absoluteSymlinkReport, [
      {
        path:
          '.openclaw/workspace/link-fixture/absolute-runtime-link',
        target: '/usr/bin/node',
        restoreMode:
          'removed from fenced working tree; rebuild or relink manually after review'
      }
    ]);
    assert.equal(
      await readFile(
        join(
          restoreTarget,
          '.openclaw',
          'agents',
          'main',
          'sessions',
          'session.jsonl'
        ),
        'utf8'
      ),
      '{"event":"kept"}\n'
    );
    assert.equal(
      await readFile(
        join(
          restoreTarget,
          'backup-meta',
          'quarantine',
          'openclaw',
          'telegram',
          'ingress-spool-main',
          'pending.json'
        ),
        'utf8'
      ),
      '{"update":"must-stay-quarantined"}\n'
    );
    assert.equal(
      await readFile(
        join(
          restoreTarget,
          'backup-meta',
          'quarantine',
          'openclaw',
          'session-delivery-queue',
          'pending.json'
        ),
        'utf8'
      ),
      '{"delivery":"must-stay-quarantined"}\n'
    );
    assert.equal(
      await readFile(
        join(
          restoreTarget,
          'backup-meta',
          'quarantine',
          'restore-fenced',
          'openclaw',
          'cron',
          'jobs.json'
        ),
        'utf8'
      ),
      '{"job":"must-require-review"}\n'
    );

    process.stdout.write(
      `openclaw_backup_integration_ok chunks=${manifest.chunks.length} restored_sqlite=ok upload=dry-run\n`
    );
  } finally {
    await rm(testRoot, { recursive: true, force: true });
    await rm(output, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `openclaw_backup_integration_error: ${error.message}\n`
  );
  process.exitCode = 1;
});
