#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  lstat,
  open,
  opendir,
  readFile,
  realpath,
  stat
} from 'node:fs/promises';
import { basename, join } from 'node:path';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import {
  assertTrustedDirectoryHierarchy
} from './openclaw-backup-path-security.mjs';
import {
  BACKUP_MANIFEST_V1,
  BACKUP_MANIFEST_V2,
  HOST_RECOVERY_POLICIES,
  PATH_MANIFEST_ARCHIVE_PATH,
  PATH_MANIFEST_SCHEMA,
  containsAsciiControl,
  isForbiddenBrowserRuntimeArchivePath,
  normalizePayloadClass,
  validateProductionDataSummary
} from './openclaw-backup-schema.mjs';

const SET_ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{16}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FINGERPRINT_PATTERN = /^(?:[0-9A-F]{40}|[0-9A-F]{64})$/;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_CHUNK_BYTES = 96 * 1024 * 1024;
const MAX_ARCHIVE_MEMBERS = 250000;
const MAX_ARCHIVE_PATH_BYTES = 16 * 1024;
const MAX_PATH_MANIFEST_BYTES = 64 * 1024 * 1024;
const ALLOWED_EXTERNAL_ARCHIVE_PATHS = [
  { path: 'etc/systemd/system/qaa-sladdis-web-runner.service', tree: false },
  { path: 'etc/cron.d/agent-os-postgres-backup', tree: false },
  {
    path: 'etc/systemd/system/openclaw-backup-maintenance.service',
    tree: false
  },
  {
    path: 'etc/systemd/system/openclaw-backup-maintenance-guard.service',
    tree: false
  },
  {
    path: 'etc/systemd/system/openclaw-backup-maintenance.timer',
    tree: false
  },
  {
    path: 'etc/systemd/system/openclaw-backup-alert@.service',
    tree: false
  },
  {
    path: 'etc/systemd/system/openclaw-backup-healthcheck.service',
    tree: false
  },
  {
    path: 'etc/systemd/system/openclaw-backup-healthcheck.timer',
    tree: false
  },
  { path: 'etc/ufw/user.rules', tree: false },
  { path: 'etc/ufw/user6.rules', tree: false },
  { path: 'etc/ufw/ufw.conf', tree: false },
  { path: 'etc/ufw/sysctl.conf', tree: false },
  { path: 'etc/ufw/before.rules', tree: false },
  { path: 'etc/ufw/before6.rules', tree: false },
  { path: 'etc/ufw/after.rules', tree: false },
  { path: 'etc/ufw/after6.rules', tree: false },
  { path: 'etc/default/ufw', tree: false },
  { path: 'etc/ssh/sshd_config', tree: false },
  { path: 'etc/ssh/sshd_config.d', tree: true },
  { path: 'etc/docker/daemon.json', tree: false },
  {
    path: 'root/.config/systemd/user/openclaw-gateway.service',
    tree: false
  },
  {
    path: 'root/.config/systemd/user/openclaw-gateway.service.d',
    tree: true
  },
  { path: 'root/.config/gogcli', tree: true },
  { path: 'root/.config/clerk', tree: true },
  { path: 'root/.docker', tree: true },
  { path: 'root/.ssh', tree: true },
  { path: 'root/.gitconfig', tree: false }
];

function expectedProcessUid() {
  if (typeof process.getuid !== 'function') {
    throw new Error('Backup verification requires Unix ownership');
  }
  return process.getuid();
}

function isPrivateOwnedFile(info, expectedUid) {
  return (
    !info.isSymbolicLink() &&
    info.isFile() &&
    info.uid === expectedUid &&
    (info.mode & 0o077) === 0
  );
}

function usage() {
  return `Usage:
  node scripts/verify-openclaw-backup.mjs SET_DIRECTORY [--deep] [options]

The default verification is non-secret and needs no private key: it validates
the outer manifest, exact chunk sequence, sizes, and SHA-256 hashes.

--deep additionally streams all chunks through gpg -> zstd -> tar and requires
the private recovery key to be available to GnuPG. It lists no payload paths and
writes no decrypted data to disk.

Options:
  --signer FINGERPRINT   Required with --deep; exact trusted signing identity.
  --json                 Emit machine-readable output.`;
}

export function parseVerifyArgs(argv) {
  const options = {
    setDirectory: '',
    deep: false,
    signer:
      process.env.OPENCLAW_BACKUP_GPG_SIGNER || '',
    json: false,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--deep') options.deep = true;
    else if (argument === '--signer') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --signer');
      }
      options.signer = value;
      index += 1;
    }
    else if (argument === '--json') options.json = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (!argument.startsWith('--') && !options.setDirectory) {
      options.setDirectory = argument;
    } else {
      throw new Error(`Unknown or duplicate argument: ${argument}`);
    }
  }
  if (!options.help && !options.setDirectory) {
    throw new Error('A backup set directory is required');
  }
  if (
    !options.help &&
    options.deep &&
    !FINGERPRINT_PATTERN.test(options.signer)
  ) {
    throw new Error(
      '--deep requires an exact trusted --signer fingerprint'
    );
  }
  return options;
}

export function validateManifestShape(manifest, directoryName) {
  const isLegacy = manifest?.schema === BACKUP_MANIFEST_V1;
  const isV2 = manifest?.schema === BACKUP_MANIFEST_V2;
  if (
    !manifest ||
    (!isLegacy && !isV2) ||
    !SET_ID_PATTERN.test(manifest.setId) ||
    manifest.setId !== directoryName ||
    manifest.archive !== 'tar' ||
    manifest.compression !== 'zstd' ||
    manifest.encryption !== 'openpgp-public-recipient' ||
    !FINGERPRINT_PATTERN.test(manifest.recipientFingerprint) ||
    !FINGERPRINT_PATTERN.test(manifest.signerFingerprint) ||
    manifest.signerFingerprint === manifest.recipientFingerprint ||
    !manifest.consistencyProof ||
    !['quiesced', 'best-effort'].includes(
      manifest.consistencyProof.mode
    ) ||
    !Number.isSafeInteger(
      manifest.consistencyProof.writersChecked
    ) ||
    manifest.consistencyProof.writersChecked < 1 ||
    typeof manifest.consistencyProof.writersStoppedBefore !==
      'boolean' ||
    (manifest.consistencyProof.writersStoppedAfter !== null &&
      typeof manifest.consistencyProof.writersStoppedAfter !==
        'boolean') ||
    !Number.isSafeInteger(
      manifest.consistencyProof.protectedEntriesChecked
    ) ||
    manifest.consistencyProof.protectedEntriesChecked < 0 ||
    (manifest.consistencyProof.protectedTreeStable !== null &&
      typeof manifest.consistencyProof.protectedTreeStable !==
        'boolean') ||
    !Number.isSafeInteger(manifest.payloadBytesEstimate) ||
    manifest.payloadBytesEstimate <= 0 ||
    !Number.isSafeInteger(manifest.chunkBytes) ||
    manifest.chunkBytes < 64 * 1024 * 1024 ||
    manifest.chunkBytes > MAX_CHUNK_BYTES ||
    !Number.isSafeInteger(manifest.totalBytes) ||
    manifest.totalBytes <= 0 ||
    !Array.isArray(manifest.chunks) ||
    manifest.chunks.length === 0 ||
    manifest.chunks.length > 100000
  ) {
    throw new Error('Backup manifest contract validation failed');
  }
  normalizePayloadClass(manifest.payloadClass, {
    legacyMissingAsCore: isLegacy
  });
  if (isV2) {
    const payloadManifest = manifest.payloadManifest;
    if (
      !payloadManifest ||
      payloadManifest.schema !== PATH_MANIFEST_SCHEMA ||
      payloadManifest.archivePath !==
        PATH_MANIFEST_ARCHIVE_PATH ||
      !Number.isSafeInteger(payloadManifest.bytes) ||
      payloadManifest.bytes <= 0 ||
      payloadManifest.bytes > MAX_PATH_MANIFEST_BYTES ||
      !SHA256_PATTERN.test(payloadManifest.sha256) ||
      !Number.isSafeInteger(payloadManifest.entries) ||
      payloadManifest.entries < 2 ||
      payloadManifest.entries > MAX_ARCHIVE_MEMBERS ||
      !Number.isSafeInteger(payloadManifest.contentBytes) ||
      payloadManifest.contentBytes < 0 ||
      !HOST_RECOVERY_POLICIES.has(payloadManifest.hostPolicy)
    ) {
      throw new Error(
        'Backup payload manifest summary validation failed'
      );
    }
    if (
      !manifest.payloadComponents ||
      Object.keys(manifest.payloadComponents).length !== 1
    ) {
      throw new Error(
        'Backup payload component summary validation failed'
      );
    }
    validateProductionDataSummary(
      manifest.payloadComponents.agentOsProduction,
      manifest.setId
    );
  } else if (manifest.payloadManifest !== undefined) {
    throw new Error(
      'Legacy backup manifest cannot claim a v2 payload manifest'
    );
  }
  if (
    manifest.consistencyProof.mode === 'quiesced' &&
    (!manifest.consistencyProof.writersStoppedBefore ||
      !manifest.consistencyProof.writersStoppedAfter ||
      !manifest.consistencyProof.protectedTreeStable ||
      manifest.consistencyProof.protectedEntriesChecked < 1)
  ) {
    throw new Error('Quiesced consistency proof is incomplete');
  }

  let totalBytes = 0;
  for (let index = 0; index < manifest.chunks.length; index += 1) {
    const chunk = manifest.chunks[index];
    const expectedName = `openclaw-backup.part-${String(index).padStart(5, '0')}.gpg`;
    if (
      !chunk ||
      chunk.name !== expectedName ||
      basename(chunk.name) !== chunk.name ||
      !Number.isSafeInteger(chunk.bytes) ||
      chunk.bytes <= 0 ||
      chunk.bytes > manifest.chunkBytes ||
      !SHA256_PATTERN.test(chunk.sha256)
    ) {
      throw new Error('Backup chunk manifest contract validation failed');
    }
    totalBytes += chunk.bytes;
  }
  if (totalBytes !== manifest.totalBytes) {
    throw new Error('Backup manifest total does not match its chunks');
  }

  if (
    !manifest.encryptedManifest ||
    manifest.encryptedManifest.name !== 'manifest.json.gpg' ||
    basename(manifest.encryptedManifest.name) !==
      manifest.encryptedManifest.name ||
    !Number.isSafeInteger(manifest.encryptedManifest.bytes) ||
    manifest.encryptedManifest.bytes <= 0 ||
    manifest.encryptedManifest.bytes > MAX_MANIFEST_BYTES ||
    !SHA256_PATTERN.test(manifest.encryptedManifest.sha256)
  ) {
    throw new Error('Encrypted remote manifest contract validation failed');
  }
}

async function sha256File(path) {
  const handle = await open(path, 'r');
  const hash = createHash('sha256');
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      hash.update(chunk);
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

export async function verifySet(
  setDirectory,
  { deep = false, signerFingerprint = '' } = {}
) {
  const directory = await realpath(setDirectory);
  await assertTrustedDirectoryHierarchy(directory, {
    label: 'Backup set'
  });
  const directoryInfo = await stat(directory);
  const expectedUid = expectedProcessUid();
  if (
    !directoryInfo.isDirectory() ||
    directoryInfo.uid !== expectedUid ||
    (directoryInfo.mode & 0o077) !== 0
  ) {
    throw new Error(
      'Backup set must be a private directory owned by the current user'
    );
  }

  const manifestPath = join(directory, 'manifest.json');
  const manifestInfo = await lstat(manifestPath);
  if (
    !isPrivateOwnedFile(manifestInfo, expectedUid) ||
    manifestInfo.size <= 0 ||
    manifestInfo.size > MAX_MANIFEST_BYTES
  ) {
    throw new Error('Backup manifest is missing or too large');
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  validateManifestShape(manifest, basename(directory));

  const expectedFiles = new Set([
    'manifest.json',
    manifest.encryptedManifest.name,
    ...manifest.chunks.map((chunk) => chunk.name)
  ]);
  const actualFiles = new Set();
  const entries = await opendir(directory);
  for await (const entry of entries) {
    if (!entry.isFile() || !expectedFiles.has(entry.name)) {
      throw new Error('Backup set contains an unexpected entry');
    }
    actualFiles.add(entry.name);
  }
  if (
    actualFiles.size !== expectedFiles.size ||
    [...expectedFiles].some((name) => !actualFiles.has(name))
  ) {
    throw new Error('Backup set is incomplete');
  }

  for (const chunk of manifest.chunks) {
    const path = join(directory, chunk.name);
    const info = await lstat(path);
    if (
      !isPrivateOwnedFile(info, expectedUid) ||
      info.size !== chunk.bytes ||
      (await sha256File(path)) !== chunk.sha256
    ) {
      throw new Error('Backup chunk integrity verification failed');
    }
  }
  const encryptedManifestPath = join(
    directory,
    manifest.encryptedManifest.name
  );
  const encryptedManifestInfo = await lstat(
    encryptedManifestPath
  );
  if (
    !isPrivateOwnedFile(encryptedManifestInfo, expectedUid) ||
    encryptedManifestInfo.size !== manifest.encryptedManifest.bytes ||
    (await sha256File(encryptedManifestPath)) !==
      manifest.encryptedManifest.sha256
  ) {
    throw new Error('Encrypted remote manifest integrity verification failed');
  }

  let deepResult = null;
  if (deep) {
    if (!FINGERPRINT_PATTERN.test(signerFingerprint)) {
      throw new Error(
        'Deep verification requires an exact trusted signer fingerprint'
      );
    }
    deepResult = await deepVerify(
      directory,
      manifest,
      signerFingerprint.toUpperCase()
    );
  }

  return {
    schema: 'openclaw-backup-verification/v1',
    ok: true,
    setId: manifest.setId,
    payloadClass: normalizePayloadClass(
      manifest.payloadClass,
      {
        legacyMissingAsCore:
          manifest.schema === BACKUP_MANIFEST_V1
      }
    ),
    payloadManifestEntries:
      manifest.payloadManifest?.entries ?? null,
    productionData:
      manifest.payloadComponents?.agentOsProduction ?? null,
    chunks: manifest.chunks.length,
    ciphertextBytes: manifest.totalBytes,
    outerIntegrity: 'sha256-ok',
    deepIntegrity: deepResult
  };
}

async function deepVerify(directory, manifest, signerFingerprint) {
  await verifyEncryptedRemoteManifest(
    directory,
    manifest,
    signerFingerprint
  );
  const gpg = spawn(
    'gpg',
    ['--batch', '--no-tty', '--decrypt'],
    { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C' } }
  );
  const zstd = spawn(
    'zstd',
    ['--decompress', '--stdout', '--quiet'],
    { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C' } }
  );
  const tar = spawn(
    'tar',
    ['--list', '--quoting-style=literal', '--file=-'],
    { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C' } }
  );
  gpg.stdout.on('error', () => {});
  zstd.stdin.on('error', () => {});
  zstd.stdout.on('error', () => {});
  tar.stdin.on('error', () => {});
  gpg.stdout.pipe(zstd.stdin);
  zstd.stdout.pipe(tar.stdin);
  gpg.stderr.resume();
  zstd.stderr.resume();
  tar.stderr.resume();

  let listingRemainder = '';
  let sawOpenClaw = false;
  let sawBackupMetadata = false;
  let sawPayloadManifest =
    manifest.schema === BACKUP_MANIFEST_V1;
  let invalidArchivePath = false;
  let archiveMembers = 0;
  const memberNames = new Set();
  const inspectArchiveMember = (line) => {
    archiveMembers += 1;
    if (
      archiveMembers > MAX_ARCHIVE_MEMBERS ||
      Buffer.byteLength(line, 'utf8') > MAX_ARCHIVE_PATH_BYTES ||
      !isAllowedArchiveMember(line) ||
      (
        normalizePayloadClass(manifest.payloadClass, {
          legacyMissingAsCore:
            manifest.schema === BACKUP_MANIFEST_V1
        }) === 'core' &&
        (
          line === '.openclaw/browser/' ||
          line.startsWith('.openclaw/browser/')
        )
      ) ||
      memberNames.has(line)
    ) {
      invalidArchivePath = true;
      return;
    }
    memberNames.add(line);
    if (line === '.openclaw/' || line.startsWith('.openclaw/')) {
      sawOpenClaw = true;
    }
    if (line === 'backup-meta/backup.json') sawBackupMetadata = true;
    if (line === PATH_MANIFEST_ARCHIVE_PATH) {
      sawPayloadManifest = true;
    }
  };
  tar.stdout.setEncoding('utf8');
  tar.stdout.on('data', (data) => {
    const lines = `${listingRemainder}${data}`.split('\n');
    listingRemainder = lines.pop() || '';
    for (const line of lines) {
      inspectArchiveMember(line);
    }
  });

  const completions = [
    waitForChild(gpg, 'gpg'),
    waitForChild(zstd, 'zstd'),
    waitForChild(tar, 'tar')
  ];
  gpg.stdin.on('error', () => {});
  try {
    for (const chunk of manifest.chunks) {
      const handle = await open(join(directory, chunk.name), 'r');
      try {
        for await (const data of handle.createReadStream({ autoClose: false })) {
          if (!gpg.stdin.write(data)) await once(gpg.stdin, 'drain');
        }
      } finally {
        await handle.close();
      }
    }
    gpg.stdin.end();
  } catch {
    gpg.stdin.destroy();
    throw new Error('Deep backup verification input failed');
  }

  const results = await Promise.all(completions);
  if (listingRemainder) inspectArchiveMember(listingRemainder);
  if (results.some((result) => result !== 0)) {
    throw new Error('Deep backup cryptographic/archive verification failed');
  }
  if (
    invalidArchivePath ||
    !sawOpenClaw ||
    !sawBackupMetadata ||
    !sawPayloadManifest
  ) {
    throw new Error('Deep backup payload contract verification failed');
  }
  return manifest.schema === BACKUP_MANIFEST_V2
    ? 'signed-gpg-zstd-tar-v2-list-ok'
    : 'signed-gpg-zstd-tar-v1-list-ok';
}

export function isAllowedArchiveMember(rawPath) {
  if (
    !rawPath ||
    rawPath.startsWith('/') ||
    containsAsciiControl(rawPath)
  ) {
    return false;
  }
  const path = rawPath.endsWith('/')
    ? rawPath.slice(0, -1)
    : rawPath;
  const segments = path.split('/');
  if (
    segments.some(
      (segment) => !segment || segment === '.' || segment === '..'
    )
  ) {
    return false;
  }
  if (
    path === '.openclaw' ||
    path.startsWith('.openclaw/')
  ) {
    return (
      !isForbiddenBrowserRuntimeArchivePath(path) &&
      !/\.openclaw\/.*\.(?:sqlite3?|db)(?:-(?:wal|shm|journal))?$/.test(
        path.toLowerCase()
      )
    );
  }
  if (path === 'backup-meta' || path.startsWith('backup-meta/')) {
    return true;
  }
  return ALLOWED_EXTERNAL_ARCHIVE_PATHS.some((allowed) =>
    allowed.tree
      ? path === allowed.path || path.startsWith(`${allowed.path}/`)
      : path === allowed.path
  );
}

export async function decryptSignedManifest(
  encryptedManifestPath,
  expectedSignerFingerprint
) {
  if (!FINGERPRINT_PATTERN.test(expectedSignerFingerprint)) {
    throw new Error('Trusted signer fingerprint is invalid');
  }
  const child = spawn(
    'gpg',
    [
      '--batch',
      '--no-tty',
      '--status-fd',
      '3',
      '--decrypt',
      encryptedManifestPath
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
      env: { ...process.env, LC_ALL: 'C' }
    }
  );
  const stdout = [];
  const statusOutput = [];
  let bytes = 0;
  let statusBytes = 0;
  child.stdout.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_MANIFEST_BYTES) child.kill('SIGKILL');
    else stdout.push(chunk);
  });
  child.stdio[3].on('data', (chunk) => {
    statusBytes += chunk.length;
    if (statusBytes > 64 * 1024) child.kill('SIGKILL');
    else statusOutput.push(chunk);
  });
  child.stderr.resume();
  const code = await waitForChild(child, 'gpg remote manifest');
  if (
    code !== 0 ||
    bytes > MAX_MANIFEST_BYTES ||
    statusBytes > 64 * 1024
  ) {
    throw new Error(
      'Encrypted remote manifest could not be decrypted and authenticated'
    );
  }

  const trusted = expectedSignerFingerprint.toUpperCase();
  const validSignatures = Buffer.concat(statusOutput)
    .toString('utf8')
    .split('\n')
    .filter((line) => line.startsWith('[GNUPG:] VALIDSIG '))
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => {
      const signingFingerprint = fields[2]?.toUpperCase();
      const primaryFingerprint = fields.at(-1)?.toUpperCase();
      return (
        signingFingerprint === trusted ||
        primaryFingerprint === trusted
      );
    });
  if (validSignatures.length !== 1) {
    throw new Error(
      'Encrypted remote manifest lacks the pinned valid signature'
    );
  }

  let decrypted;
  try {
    decrypted = JSON.parse(Buffer.concat(stdout).toString('utf8'));
  } catch {
    throw new Error('Encrypted remote manifest is not valid JSON');
  }
  return decrypted;
}

async function verifyEncryptedRemoteManifest(
  directory,
  manifest,
  signerFingerprint
) {
  const decrypted = await decryptSignedManifest(
    join(directory, manifest.encryptedManifest.name),
    signerFingerprint
  );
  if (
    manifest.signerFingerprint !== signerFingerprint ||
    decrypted.signerFingerprint !== signerFingerprint
  ) {
    throw new Error('Backup signer does not match the pinned identity');
  }
  const { encryptedManifest: _localOnly, ...expected } = manifest;
  if (JSON.stringify(decrypted) !== JSON.stringify(expected)) {
    throw new Error('Encrypted remote manifest does not match the local manifest');
  }
}

function waitForChild(child, name) {
  return new Promise((resolvePromise, rejectPromise) => {
    child.once('error', () => {
      rejectPromise(new Error(`${name} could not start`));
    });
    child.once('close', (code) => {
      resolvePromise(Number.isInteger(code) ? code : 1);
    });
  });
}

async function main() {
  const options = parseVerifyArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await verifySet(options.setDirectory, {
    deep: options.deep,
    signerFingerprint: options.signer
  });
  process.stdout.write(
    options.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `backup_verify_ok set=${result.setId} chunks=${result.chunks} deep=${result.deepIntegrity || 'not-requested'}\n`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    process.stderr.write(`openclaw_backup_verify_error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
