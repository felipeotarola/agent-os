#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import {
  chmod,
  lstat,
  open,
  opendir,
  realpath,
  rename,
  rm
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { once } from 'node:events';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  assertTrustedDirectoryHierarchy,
  openPrivateLockFile
} from './openclaw-backup-path-security.mjs';
import {
  BACKUP_MANIFEST_V2,
  HOST_RECOVERY_POLICY,
  PRODUCTION_CAPTURE_V2,
  SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS
} from './openclaw-backup-schema.mjs';
import {
  computeRemoteObjectRootSha256,
  expectedBlobPathname
} from './upload-openclaw-backup.mjs';
import { verifySet } from './verify-openclaw-backup.mjs';

const SCRIPT_PATH = new URL(import.meta.url).pathname;
const SET_ID_PATTERN =
  /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}$/;
const PARTIAL_SET_PATTERN =
  /^\.[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}\.partial$/;
const COMPLETION_MARKER_PATTERN =
  /^openclaw-backups\/v1\/([a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?)\/([0-9]{8}T[0-9]{6}Z-[0-9a-f]{16})\/([a-f0-9]{64})-([1-9][0-9]*)\/manifest\.json\.gpg$/;
const ISO_TIMESTAMP_PATTERN =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
const MINIMUM_RETAINED_SETS = 2;
const MINIMUM_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAXIMUM_PROBE_AGE_MS = 36 * 60 * 60 * 1000;
const MAXIMUM_DELETION_PROBE_AGE_MS = 5 * 60 * 1000;
const MAXIMUM_FUTURE_SKEW_MS = 5 * 60 * 1000;
const MAXIMUM_SET_ENTRIES = 100000;
const MAXIMUM_RUN_ENTRIES = 100000;
const MAXIMUM_MANIFEST_BYTES = 1024 * 1024;
const MAXIMUM_RECEIPT_BYTES = 1024 * 1024;
const MAXIMUM_PROBE_BYTES = 64 * 1024;
const MAXIMUM_PATH_BYTES = 4096;
const DEFAULT_STATE_ROOT = '/var/lib/openclaw-backup/state';
const LOCK_ROOT = '/run/openclaw-backup';
const MAINTENANCE_LOCK_NAME = 'maintenance.lock';
const BACKUP_LOCK_NAME = 'creator.lock';
const INTERNAL_LOCK_ENV =
  'OPENCLAW_BACKUP_RETENTION_LOCK_HELD';

class RetentionError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = 'RetentionError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function usage() {
  return `Usage:
  node scripts/retain-openclaw-backups.mjs --sets-root DIRECTORY [options]

The default is a read-only dry-run. A set is eligible only when it is older
than seven full days, belongs to the full production-recovery class, is not one
of the two newest sets in that class, passes the existing backup verifier, and
has a fresh upload receipt plus remote probe cross-bound to every exact
encrypted object.

Options:
  --sets-root PATH    Completed encrypted backup-set root. Falls back to
                      OPENCLAW_BACKUP_OUTPUT_DIR.
  --state-root PATH   Maintenance state root (default:
                      /var/lib/openclaw-backup/state).
  --execute           Acquire both backup locks and delete eligible sets.
  --json              Emit a secret-free JSON result.
  --help              Show this help.`;
}

export function parseRetentionArgs(argv, env = process.env) {
  const options = {
    setsRoot: env.OPENCLAW_BACKUP_OUTPUT_DIR || '',
    stateRoot: DEFAULT_STATE_ROOT,
    execute: false,
    json: false,
    help: false,
    internalLocked: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new RetentionError(
          'INVALID_ARGUMENT',
          `Missing value for ${argument}`,
          64
        );
      }
      index += 1;
      return value;
    };
    if (argument === '--sets-root') {
      options.setsRoot = takeValue();
    } else if (argument === '--state-root') {
      options.stateRoot = takeValue();
    } else if (argument === '--execute') {
      options.execute = true;
    } else if (argument === '--json') {
      options.json = true;
    } else if (argument === '--internal-locked') {
      options.internalLocked = true;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new RetentionError(
        'INVALID_ARGUMENT',
        `Unknown argument: ${argument}`,
        64
      );
    }
  }
  if (!options.help && !options.setsRoot) {
    throw new RetentionError(
      'MISSING_SETS_ROOT',
      'A backup sets root is required',
      64
    );
  }
  if (options.internalLocked && !options.execute) {
    throw new RetentionError(
      'INVALID_ARGUMENT',
      'The internal lock marker requires --execute',
      64
    );
  }
  return options;
}

function expectedUid() {
  if (typeof process.getuid !== 'function') {
    throw new RetentionError(
      'UNSUPPORTED_PLATFORM',
      'Retention requires Unix ownership metadata'
    );
  }
  return process.getuid();
}

function isMissing(error) {
  return error && error.code === 'ENOENT';
}

async function validatePrivateRoot(rawPath, label) {
  const path = resolve(rawPath);
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (isMissing(error)) {
      throw new RetentionError(
        'ROOT_MISSING',
        `${label} does not exist`
      );
    }
    throw error;
  }
  if (
    info.isSymbolicLink() ||
    !info.isDirectory() ||
    info.uid !== expectedUid() ||
    (info.mode & 0o777) !== 0o700
  ) {
    throw new RetentionError(
      'ROOT_UNSAFE',
      `${label} must be a private owned non-symlink directory`
    );
  }
  const canonical = await realpath(path);
  if (canonical !== path) {
    throw new RetentionError(
      'ROOT_UNSAFE',
      `${label} cannot contain symlink traversal`
    );
  }
  try {
    await assertTrustedDirectoryHierarchy(canonical, { label });
  } catch {
    throw new RetentionError(
      'ROOT_UNSAFE',
      `${label} has an untrusted directory hierarchy`
    );
  }
  return canonical;
}

async function readPrivateFile(
  path,
  maximumBytes,
  { exactMode = 0o600 } = {}
) {
  let handle;
  try {
    handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW
    );
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  try {
    const info = await handle.stat();
    if (
      !info.isFile() ||
      info.uid !== expectedUid() ||
      (info.mode & 0o777) !== exactMode ||
      info.nlink !== 1 ||
      info.size < 1 ||
      info.size > maximumBytes
    ) {
      throw new RetentionError(
        'EVIDENCE_UNSAFE',
        'Retention evidence has unsafe file metadata'
      );
    }
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

function parseJson(raw, code) {
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('not an object');
    }
    return value;
  } catch {
    throw new RetentionError(code, 'Retention evidence is invalid JSON');
  }
}

function parseCanonicalTimestamp(value) {
  if (
    typeof value !== 'string' ||
    !ISO_TIMESTAMP_PATTERN.test(value)
  ) {
    return null;
  }
  const milliseconds = Date.parse(value);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== value
  ) {
    return null;
  }
  return milliseconds;
}

function parseSetTimestamp(setId) {
  if (!SET_ID_PATTERN.test(setId)) return null;
  const compact = setId.slice(0, 16);
  const timestamp = [
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
  const milliseconds = Date.parse(timestamp);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString() !== timestamp
  ) {
    return null;
  }
  return milliseconds;
}

async function readManifest(setPath) {
  const raw = await readPrivateFile(
    join(setPath, 'manifest.json'),
    MAXIMUM_MANIFEST_BYTES,
    { exactMode: 0o400 }
  );
  if (raw === null) {
    throw new RetentionError(
      'SET_NOT_SEALED',
      'Verified set manifest disappeared'
    );
  }
  return parseJson(raw, 'SET_NOT_SEALED');
}

async function measureSealedSet(setPath) {
  let bytes = 0;
  let entries = 0;
  const directory = await opendir(setPath);
  for await (const entry of directory) {
    entries += 1;
    if (entries > MAXIMUM_SET_ENTRIES || !entry.isFile()) {
      throw new RetentionError(
        'SET_NOT_SEALED',
        'Sealed set contains an invalid entry'
      );
    }
    const path = join(setPath, entry.name);
    const info = await lstat(path);
    if (
      info.isSymbolicLink() ||
      !info.isFile() ||
      info.uid !== expectedUid() ||
      (info.mode & 0o777) !== 0o400 ||
      info.nlink !== 1
    ) {
      throw new RetentionError(
        'SET_NOT_SEALED',
        'Sealed set file metadata is invalid'
      );
    }
    bytes += info.size;
    if (!Number.isSafeInteger(bytes)) {
      throw new RetentionError(
        'SET_NOT_SEALED',
        'Sealed set byte count is invalid'
      );
    }
  }
  return bytes;
}

async function validateSealedSet(setsRoot, setId) {
  const setPath = join(setsRoot, setId);
  if (
    dirname(setPath) !== setsRoot ||
    !SET_ID_PATTERN.test(setId) ||
    parseSetTimestamp(setId) === null
  ) {
    throw new RetentionError(
      'SET_NOT_SEALED',
      'Backup set identifier is invalid'
    );
  }
  const info = await lstat(setPath);
  if (
    info.isSymbolicLink() ||
    !info.isDirectory() ||
    info.uid !== expectedUid() ||
    (info.mode & 0o777) !== 0o500
  ) {
    throw new RetentionError(
      'SET_NOT_SEALED',
      'Backup set does not have sealed directory metadata'
    );
  }
  const canonical = await realpath(setPath);
  if (canonical !== setPath) {
    throw new RetentionError(
      'SET_NOT_SEALED',
      'Backup set cannot contain symlink traversal'
    );
  }
  const verification = await verifySet(canonical);
  if (
    verification?.ok !== true ||
    verification.setId !== setId ||
    verification.outerIntegrity !== 'sha256-ok'
  ) {
    throw new RetentionError(
      'SET_VERIFICATION_FAILED',
      'Backup set verification failed'
    );
  }
  const manifest = await readManifest(canonical);
  const manifestCompletedAtMs = parseCanonicalTimestamp(
    manifest.completedAt
  );
  const setStartedAtMs = parseSetTimestamp(setId);
  if (
    manifestCompletedAtMs === null ||
    setStartedAtMs === null ||
    manifestCompletedAtMs < setStartedAtMs
  ) {
    throw new RetentionError(
      'SET_VERIFICATION_FAILED',
      'Backup set completion timestamp is invalid'
    );
  }
  const bytes = await measureSealedSet(canonical);
  return {
    setId,
    setPath: canonical,
    setStartedAtMs,
    completedAtMs: manifestCompletedAtMs,
    bytes,
    verification,
    manifest
  };
}

function markerFromReceipt(receipt, set) {
  const match = COMPLETION_MARKER_PATTERN.exec(
    receipt.completionMarker
  );
  const sizeBytes = match ? Number(match[4]) : NaN;
  if (
    !match ||
    match[2] !== set.setId ||
    match[3] !== set.manifest.encryptedManifest.sha256 ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes !== set.manifest.encryptedManifest.bytes
  ) {
    throw new RetentionError(
      'EVIDENCE_CROSSBIND_FAILED',
      'Upload receipt completion marker is not bound to the set'
    );
  }
  return {
    hostId: match[1],
    setId: match[2],
    sha256: match[3],
    sizeBytes,
    pathname: receipt.completionMarker
  };
}

function containsAsciiControl(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function validateReceiptObjects(receipt, set, marker) {
  const expectedObjects = [
    ...set.manifest.chunks,
    set.manifest.encryptedManifest
  ];
  if (
    !Array.isArray(receipt.objects) ||
    receipt.objects.length !== expectedObjects.length ||
    receipt.objects.length < 2 ||
    receipt.objects.length > 128
  ) {
    throw new RetentionError(
      'EVIDENCE_CROSSBIND_FAILED',
      'Upload receipt does not enumerate the complete encrypted object set'
    );
  }
  const objects = receipt.objects.map((object, index) => {
    const expected = expectedObjects[index];
    if (
      !object ||
      typeof object !== 'object' ||
      Array.isArray(object) ||
      JSON.stringify(Object.keys(object).toSorted()) !==
        JSON.stringify(
          ['filename', 'sha256', 'sizeBytes', 'etag', 'pathname'].toSorted()
        ) ||
      object.filename !== expected.name ||
      object.sha256 !== expected.sha256 ||
      object.sizeBytes !== expected.bytes ||
      typeof object.etag !== 'string' ||
      object.etag.length < 1 ||
      object.etag.length > 512 ||
      containsAsciiControl(object.etag) ||
      object.pathname !==
        expectedBlobPathname(marker.hostId, {
          filename: expected.name,
          setId: set.setId,
          sha256: expected.sha256,
          sizeBytes: expected.bytes
        })
    ) {
      throw new RetentionError(
        'EVIDENCE_CROSSBIND_FAILED',
        'Upload receipt object is not bound to the local manifest'
      );
    }
    return {
      filename: object.filename,
      sha256: object.sha256,
      sizeBytes: object.sizeBytes,
      etag: object.etag,
      pathname: object.pathname
    };
  });
  const totalBytes = objects.reduce(
    (total, object) => total + object.sizeBytes,
    0
  );
  const objectRootSha256 =
    computeRemoteObjectRootSha256(objects);
  if (
    receipt.objectRootSha256 !== objectRootSha256 ||
    receipt.completionMarker !== objects.at(-1).pathname
  ) {
    throw new RetentionError(
      'EVIDENCE_CROSSBIND_FAILED',
      'Upload receipt object root is not bound to the local manifest'
    );
  }
  return {
    objects,
    objectCount: objects.length,
    totalBytes,
    objectRootSha256
  };
}

function validateReceipt(receipt, set, nowMs) {
  const completedAtMs = parseCanonicalTimestamp(
    receipt.completedAt
  );
  const expectedUploadBytes =
    set.manifest.totalBytes +
    set.manifest.encryptedManifest.bytes;
  if (
    receipt.schema !== 'openclaw-backup-upload-result/v2' ||
    receipt.ok !== true ||
    receipt.setId !== set.setId ||
    completedAtMs === null ||
    receipt.completedAtEpoch !==
      Math.floor(completedAtMs / 1000) ||
    completedAtMs < set.completedAtMs ||
    completedAtMs > nowMs + MAXIMUM_FUTURE_SKEW_MS ||
    receipt.payloadClass !== set.verification.payloadClass ||
    receipt.payloadManifestEntries !==
      set.verification.payloadManifestEntries ||
    !isDeepStrictEqual(
      receipt.productionData,
      set.verification.productionData
    ) ||
    receipt.uploadedFiles !== set.verification.chunks + 1 ||
    receipt.uploadedBytes !== expectedUploadBytes ||
    typeof receipt.completionMarker !== 'string'
  ) {
    throw new RetentionError(
      'EVIDENCE_CROSSBIND_FAILED',
      'Upload receipt is not bound to the verified set'
    );
  }
  const marker = markerFromReceipt(receipt, set);
  const objectEvidence = validateReceiptObjects(
    receipt,
    set,
    marker
  );
  if (
    objectEvidence.objectCount !== receipt.uploadedFiles ||
    objectEvidence.totalBytes !== receipt.uploadedBytes ||
    objectEvidence.totalBytes !== expectedUploadBytes
  ) {
    throw new RetentionError(
      'EVIDENCE_CROSSBIND_FAILED',
      'Upload receipt object totals are not bound to the verified set'
    );
  }
  return {
    completedAtMs,
    marker,
    ...objectEvidence
  };
}

function validateProbe(
  probe,
  receiptEvidence,
  nowMs,
  maximumAgeMs = MAXIMUM_PROBE_AGE_MS
) {
  const checkedAtMs = parseCanonicalTimestamp(probe.checkedAt);
  const marker = receiptEvidence.marker;
  if (
    probe.schema !== 'openclaw-backup-remote-probe/v2' ||
    probe.ok !== true ||
    probe.hostId !== marker.hostId ||
    probe.setId !== marker.setId ||
    probe.objectCount !== receiptEvidence.objectCount ||
    probe.totalBytes !== receiptEvidence.totalBytes ||
    probe.objectRootSha256 !==
      receiptEvidence.objectRootSha256 ||
    probe.completionMarker !== marker.pathname ||
    checkedAtMs === null ||
    checkedAtMs < receiptEvidence.completedAtMs ||
    checkedAtMs > nowMs + MAXIMUM_FUTURE_SKEW_MS ||
    nowMs - checkedAtMs > maximumAgeMs
  ) {
    throw new RetentionError(
      'EVIDENCE_CROSSBIND_FAILED',
      'Remote probe is not fresh and bound to the receipt'
    );
  }
  return checkedAtMs;
}

async function validateRunDirectory(runsRoot, name) {
  const path = join(runsRoot, name);
  if (dirname(path) !== runsRoot) {
    throw new RetentionError(
      'EVIDENCE_ROOT_UNSAFE',
      'Evidence run path escaped its root'
    );
  }
  const info = await lstat(path);
  if (
    info.isSymbolicLink() ||
    !info.isDirectory() ||
    info.uid !== expectedUid() ||
    (info.mode & 0o777) !== 0o700
  ) {
    throw new RetentionError(
      'EVIDENCE_RUN_UNSAFE',
      'Evidence run directory metadata is unsafe'
    );
  }
  if ((await realpath(path)) !== path) {
    throw new RetentionError(
      'EVIDENCE_RUN_UNSAFE',
      'Evidence run directory uses symlink traversal'
    );
  }
  return path;
}

async function readEvidenceBundle(runPath, set, nowMs) {
  const receiptRaw = await readPrivateFile(
    join(runPath, 'upload-receipt.json'),
    MAXIMUM_RECEIPT_BYTES
  );
  const probeRaw = await readPrivateFile(
    join(runPath, 'remote-probe.json'),
    MAXIMUM_PROBE_BYTES
  );
  const completedPathRaw = await readPrivateFile(
    join(runPath, 'completed-set-path'),
    MAXIMUM_PATH_BYTES
  );
  if (
    receiptRaw === null ||
    probeRaw === null ||
    completedPathRaw === null
  ) {
    return null;
  }
  if (completedPathRaw !== `${set.setPath}\n`) {
    throw new RetentionError(
      'EVIDENCE_CROSSBIND_FAILED',
      'Completed set path is not bound to the evidence run'
    );
  }
  const receipt = parseJson(
    receiptRaw,
    'EVIDENCE_CROSSBIND_FAILED'
  );
  const probe = parseJson(
    probeRaw,
    'EVIDENCE_CROSSBIND_FAILED'
  );
  const receiptEvidence = validateReceipt(receipt, set, nowMs);
  const checkedAtMs = validateProbe(
    probe,
    receiptEvidence,
    nowMs
  );
  return {
    runPath,
    checkedAtMs,
    receiptEvidence
  };
}

async function executeFreshRemoteProbe({ runPath }) {
  const receiptPath = join(runPath, 'upload-receipt.json');
  const probeScript = join(
    dirname(SCRIPT_PATH),
    'probe-openclaw-backup.mjs'
  );
  const child = spawn(
    process.execPath,
    [
      probeScript,
      receiptPath,
      '--execute',
      '--json'
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  const stdout = [];
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let exceeded = false;
  child.stdout.on('data', (chunk) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > MAXIMUM_PROBE_BYTES) {
      exceeded = true;
      child.kill('SIGKILL');
      return;
    }
    stdout.push(Buffer.from(chunk));
  });
  child.stderr.on('data', (chunk) => {
    stderrBytes += chunk.length;
    if (stderrBytes > MAXIMUM_PROBE_BYTES) {
      exceeded = true;
      child.kill('SIGKILL');
    }
  });
  const timeout = setTimeout(
    () => child.kill('SIGKILL'),
    90 * 1000
  );
  let code;
  try {
    [code] = await once(child, 'close');
  } finally {
    clearTimeout(timeout);
  }
  if (code !== 0 || exceeded) {
    throw new RetentionError(
      'FRESH_REMOTE_PROBE_FAILED',
      'Fresh remote object-set probe failed before deletion'
    );
  }
  return parseJson(
    Buffer.concat(stdout).toString('utf8'),
    'FRESH_REMOTE_PROBE_FAILED'
  );
}

async function validateRunsRoot(stateRoot) {
  const path = join(stateRoot, 'runs');
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  if (
    info.isSymbolicLink() ||
    !info.isDirectory() ||
    info.uid !== expectedUid() ||
    (info.mode & 0o777) !== 0o700 ||
    (await realpath(path)) !== path
  ) {
    throw new RetentionError(
      'EVIDENCE_ROOT_UNSAFE',
      'Evidence runs root is unsafe'
    );
  }
  return path;
}

async function collectEvidence(stateRoot, sets, nowMs) {
  const setsById = new Map(
    sets.map((set) => [set.setId, set])
  );
  const result = new Map(
    sets.map((set) => [
      set.setId,
      { valid: [], invalidRuns: 0 }
    ])
  );
  const runsRoot = await validateRunsRoot(stateRoot);
  if (runsRoot === null) return result;

  let runEntries = 0;
  const directory = await opendir(runsRoot);
  for await (const entry of directory) {
    runEntries += 1;
    if (runEntries > MAXIMUM_RUN_ENTRIES) {
      throw new RetentionError(
        'EVIDENCE_ROOT_UNSAFE',
        'Evidence runs root exceeds its entry bound'
      );
    }
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new RetentionError(
        'EVIDENCE_ROOT_UNSAFE',
        'Evidence runs root contains an unsafe entry'
      );
    }
    let runPath;
    try {
      runPath = await validateRunDirectory(
        runsRoot,
        entry.name
      );
    } catch {
      continue;
    }
    let claimedSetId = '';
    try {
      const raw = await readPrivateFile(
        join(runPath, 'upload-receipt.json'),
        MAXIMUM_RECEIPT_BYTES
      );
      if (raw === null) continue;
      const receipt = parseJson(
        raw,
        'EVIDENCE_CROSSBIND_FAILED'
      );
      if (
        typeof receipt.setId !== 'string' ||
        !SET_ID_PATTERN.test(receipt.setId)
      ) {
        continue;
      }
      claimedSetId = receipt.setId;
      const set = setsById.get(claimedSetId);
      if (!set) continue;
      const evidence = await readEvidenceBundle(
        runPath,
        set,
        nowMs
      );
      if (evidence !== null) {
        result.get(set.setId).valid.push(evidence);
      }
    } catch {
      if (setsById.has(claimedSetId)) {
        result.get(claimedSetId).invalidRuns += 1;
      }
    }
  }
  for (const evidence of result.values()) {
    evidence.valid.sort(
      (left, right) => right.checkedAtMs - left.checkedAtMs
    );
  }
  return result;
}

async function hasActiveMaintenance(stateRoot) {
  const path = join(stateRoot, 'maintenance-active.json');
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
  if (
    info.isSymbolicLink() ||
    !info.isFile() ||
    info.uid !== expectedUid() ||
    (info.mode & 0o777) !== 0o600 ||
    info.nlink !== 1
  ) {
    throw new RetentionError(
      'ACTIVE_STATE_UNSAFE',
      'Maintenance active-state metadata is unsafe'
    );
  }
  return true;
}

function isProductionRecoverySet(set) {
  const manifest = set.manifest;
  const proof = manifest.consistencyProof;
  const production =
    manifest.payloadComponents?.agentOsProduction;
  const capabilities = production?.recoveryCapabilities;
  return (
    manifest.schema === BACKUP_MANIFEST_V2 &&
    manifest.payloadClass === 'core+browser' &&
    proof?.mode === 'quiesced' &&
    proof.writersStoppedBefore === true &&
    proof.writersStoppedAfter === true &&
    proof.protectedTreeStable === true &&
    proof.protectedEntriesChecked > 0 &&
    manifest.payloadManifest?.hostPolicy ===
      HOST_RECOVERY_POLICY &&
    production?.schema === PRODUCTION_CAPTURE_V2 &&
    production.included === true &&
    production.authControlPlane?.artifactCount ===
      SUPABASE_AUTH_CONTROL_PLANE_ENDPOINTS.length &&
    production.authControlPlane?.consistency ===
      'canonical-before-after' &&
    capabilities?.supabasePublicData === true &&
    capabilities.supabaseAuthData === true &&
    capabilities.vercelMediaObjects === true &&
    capabilities.supabaseAuthControlPlaneMetadata === true &&
    capabilities.supabaseAuthProviderConfig === false &&
    capabilities.supabaseControlPlane === false &&
    capabilities.fullProductionRecovery === false
  );
}

function recoveryKeyCohort(set) {
  return [
    set.manifest.schema,
    set.manifest.recipientFingerprint,
    set.manifest.signerFingerprint
  ].join(':');
}

async function inventorySets(setsRoot) {
  const sealed = [];
  const protectedSets = [];
  const counts = {
    rootEntries: 0,
    verifiedSealedSets: 0,
    incompleteSets: 0,
    unverifiedSets: 0,
    productionRecoverySets: 0,
    nonProductionRecoverySets: 0,
    unexpectedEntries: 0,
    unsafeEntries: 0
  };
  const directory = await opendir(setsRoot);
  for await (const entry of directory) {
    counts.rootEntries += 1;
    if (counts.rootEntries > MAXIMUM_SET_ENTRIES) {
      throw new RetentionError(
        'SET_ROOT_UNSAFE',
        'Backup sets root exceeds its entry bound'
      );
    }
    if (entry.isSymbolicLink()) {
      counts.unsafeEntries += 1;
      continue;
    }
    if (PARTIAL_SET_PATTERN.test(entry.name)) {
      counts.incompleteSets += 1;
      continue;
    }
    if (!SET_ID_PATTERN.test(entry.name)) {
      counts.unexpectedEntries += 1;
      continue;
    }
    if (!entry.isDirectory()) {
      counts.unsafeEntries += 1;
      protectedSets.push({
        setId: entry.name,
        reason: 'not_verified_sealed'
      });
      continue;
    }
    try {
      const set = await validateSealedSet(
        setsRoot,
        entry.name
      );
      sealed.push(set);
      counts.verifiedSealedSets += 1;
      if (isProductionRecoverySet(set)) {
        counts.productionRecoverySets += 1;
      } else {
        counts.nonProductionRecoverySets += 1;
      }
    } catch {
      counts.unverifiedSets += 1;
      protectedSets.push({
        setId: entry.name,
        reason: 'not_verified_sealed'
      });
    }
  }
  return { sealed, protectedSets, counts };
}

function publicSet(set, reason) {
  return {
    setId: set.setId,
    completedAt: new Date(set.completedAtMs).toISOString(),
    ageDays: Math.floor(
      Math.max(0, set.nowMs - set.completedAtMs) /
        (24 * 60 * 60 * 1000)
    ),
    reason
  };
}

function buildPolicyPlan(
  inventory,
  evidenceBySet,
  nowMs
) {
  const sorted = [...inventory.sealed].sort((left, right) => {
    if (right.setStartedAtMs !== left.setStartedAtMs) {
      return right.setStartedAtMs - left.setStartedAtMs;
    }
    return right.setId.localeCompare(left.setId);
  });
  const productionRecoverySets = sorted.filter(
    isProductionRecoverySet
  );
  const newest = new Set();
  const cohortCounts = new Map();
  for (const set of productionRecoverySets) {
    const cohort = recoveryKeyCohort(set);
    const retainedInCohort = cohortCounts.get(cohort) ?? 0;
    if (retainedInCohort < MINIMUM_RETAINED_SETS) {
      newest.add(set.setId);
      cohortCounts.set(cohort, retainedInCohort + 1);
    }
  }
  const retained = [...inventory.protectedSets];
  const deletions = [];
  let invalidEvidenceSets = 0;

  for (const set of sorted) {
    set.nowMs = nowMs;
    if (!isProductionRecoverySet(set)) {
      retained.push(
        publicSet(set, 'outside_production_recovery_class')
      );
      continue;
    }
    if (newest.has(set.setId)) {
      retained.push(
        publicSet(set, 'newest_key_cohort_minimum')
      );
      continue;
    }
    if (nowMs - set.completedAtMs < MINIMUM_AGE_MS) {
      retained.push(
        publicSet(set, 'younger_than_minimum_age')
      );
      continue;
    }
    const evidence = evidenceBySet.get(set.setId);
    if (!evidence || evidence.valid.length === 0) {
      invalidEvidenceSets += 1;
      retained.push(
        publicSet(
          set,
          'missing_or_invalid_remote_evidence'
        )
      );
      continue;
    }
    deletions.push({
      ...set,
      evidence: evidence.valid[0]
    });
  }
  return {
    sorted,
    productionRecoverySets,
    retained,
    deletions,
    invalidEvidenceSets
  };
}

async function deleteValidatedSet(
  setsRoot,
  stateRoot,
  candidate,
  clock,
  remoteProbeRunner
) {
  if (await hasActiveMaintenance(stateRoot)) {
    throw new RetentionError(
      'MAINTENANCE_ACTIVE',
      'Maintenance is active; no set was deleted',
      75
    );
  }
  const revalidated = await validateSealedSet(
    setsRoot,
    candidate.setId
  );
  const currentNowMs = Number(clock());
  if (!Number.isFinite(currentNowMs)) {
    throw new RetentionError(
      'INVALID_TIME',
      'Retention clock failed before deletion'
    );
  }
  if (
    revalidated.completedAtMs !== candidate.completedAtMs ||
    revalidated.bytes !== candidate.bytes ||
    !isProductionRecoverySet(revalidated) ||
    currentNowMs - revalidated.completedAtMs < MINIMUM_AGE_MS
  ) {
    throw new RetentionError(
      'SET_CHANGED',
      'Backup set changed after retention planning'
    );
  }
  const evidence = await readEvidenceBundle(
    candidate.evidence.runPath,
    revalidated,
    currentNowMs
  );
  if (evidence === null) {
    throw new RetentionError(
      'EVIDENCE_CHANGED',
      'Retention evidence disappeared before deletion'
    );
  }
  const freshProbe = await remoteProbeRunner({
    runPath: candidate.evidence.runPath,
    setId: candidate.setId
  });
  validateProbe(
    freshProbe,
    evidence.receiptEvidence,
    Number(clock()),
    MAXIMUM_DELETION_PROBE_AGE_MS
  );

  const tombName = [
    '.retention-delete',
    candidate.setId,
    process.pid,
    randomBytes(8).toString('hex')
  ].join('-');
  const tombPath = join(setsRoot, tombName);
  await rename(revalidated.setPath, tombPath);
  const tombInfo = await lstat(tombPath);
  if (
    tombInfo.isSymbolicLink() ||
    !tombInfo.isDirectory() ||
    tombInfo.uid !== expectedUid()
  ) {
    throw new RetentionError(
      'DELETE_QUARANTINE_UNSAFE',
      'Atomic deletion quarantine validation failed'
    );
  }
  await chmod(tombPath, 0o700);
  await rm(tombPath, { recursive: true, force: false });
  return revalidated.bytes;
}

export async function runRetention({
  setsRoot,
  stateRoot = DEFAULT_STATE_ROOT,
  execute = false,
  lockConfirmed = false,
  now = new Date(),
  clock = Date.now,
  remoteProbeRunner = executeFreshRemoteProbe
}) {
  const nowMs =
    now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) {
    throw new RetentionError(
      'INVALID_TIME',
      'Retention time is invalid'
    );
  }
  if (execute && !lockConfirmed) {
    throw new RetentionError(
      'LOCK_NOT_HELD',
      'Execution requires both backup locks',
      75
    );
  }
  const canonicalSetsRoot = await validatePrivateRoot(
    setsRoot,
    'Backup sets root'
  );
  const canonicalStateRoot = await validatePrivateRoot(
    stateRoot,
    'Backup state root'
  );
  const active = await hasActiveMaintenance(canonicalStateRoot);
  if (execute && active) {
    throw new RetentionError(
      'MAINTENANCE_ACTIVE',
      'Maintenance is active; no set was deleted',
      75
    );
  }

  const inventory = await inventorySets(canonicalSetsRoot);
  const evidence = await collectEvidence(
    canonicalStateRoot,
    inventory.sealed,
    nowMs
  );
  const policyPlan = buildPolicyPlan(
    inventory,
    evidence,
    nowMs
  );
  const blockers = [];
  if (active) blockers.push('maintenance_active');
  if (inventory.counts.unsafeEntries > 0) {
    blockers.push('unsafe_set_root_entry');
  }
  if (execute && blockers.length > 0) {
    throw new RetentionError(
      'EXECUTION_BLOCKED',
      'Retention execution is blocked by protected state',
      75
    );
  }

  const selected = policyPlan.deletions.map((set) =>
    publicSet(
      { ...set, nowMs },
      execute ? 'delete' : 'would_delete'
    )
  );
  let reclaimedBytes = 0;
  let deletedSets = 0;
  if (execute) {
    for (const candidate of policyPlan.deletions) {
      reclaimedBytes += await deleteValidatedSet(
        canonicalSetsRoot,
        canonicalStateRoot,
        candidate,
        clock,
        remoteProbeRunner
      );
      deletedSets += 1;
    }
  }

  return {
    schema: 'openclaw-backup-retention-result/v1',
    ok: true,
    mode: execute ? 'execute' : 'dry_run',
    policy: {
      minimumRetainedSetsPerKeyCohort:
        MINIMUM_RETAINED_SETS,
      minimumAgeDays: MINIMUM_AGE_MS / (24 * 60 * 60 * 1000),
      maximumProbeAgeHours:
        MAXIMUM_PROBE_AGE_MS / (60 * 60 * 1000)
    },
    lockProtection: execute
      ? 'both_locks_held'
      : 'required_for_execute',
    executionBlocked: blockers,
    inventory: {
      ...inventory.counts,
      invalidEvidenceSets:
        policyPlan.invalidEvidenceSets
    },
    selected,
    retained: policyPlan.retained,
    wouldDeleteSets: execute
      ? 0
      : policyPlan.deletions.length,
    wouldReclaimBytes: execute
      ? 0
      : policyPlan.deletions.reduce(
          (total, set) => total + set.bytes,
          0
        ),
    deletedSets,
    reclaimedBytes
  };
}

async function relaunchUnderLocks(argv, json) {
  const maintenanceLock = await openPrivateLockFile(
    LOCK_ROOT,
    MAINTENANCE_LOCK_NAME,
    { label: 'Backup maintenance lock' }
  );
  const backupLock = await openPrivateLockFile(
    LOCK_ROOT,
    BACKUP_LOCK_NAME,
    { label: 'Backup creator lock' }
  );
  let code;
  let signal;
  try {
    const child = spawn(
      'flock',
      [
        '--exclusive',
        '--nonblock',
        '--conflict-exit-code',
        '75',
        '3',
        'flock',
        '--exclusive',
        '--nonblock',
        '--conflict-exit-code',
        '75',
        '4',
        process.execPath,
        SCRIPT_PATH,
        ...argv,
        '--internal-locked'
      ],
      {
        stdio: [
          'inherit',
          'inherit',
          'inherit',
          maintenanceLock.fd,
          backupLock.fd
        ],
        env: {
          ...process.env,
          [INTERNAL_LOCK_ENV]: '1'
        }
      }
    );
    [code, signal] = await once(child, 'close');
  } finally {
    await Promise.all([
      maintenanceLock.close(),
      backupLock.close()
    ]);
  }
  if (signal) {
    throw new RetentionError(
      'LOCK_RUN_INTERRUPTED',
      'Locked retention run was interrupted',
      75
    );
  }
  if (code === 75) {
    if (json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            schema:
              'openclaw-backup-retention-error/v1',
            ok: false,
            code: 'BACKUP_LOCKED'
          },
          null,
          2
        )}\n`
      );
    } else {
      process.stderr.write(
        'openclaw_backup_retention_locked\n'
      );
    }
  }
  return code ?? 1;
}

function safeErrorResult(error) {
  const known = error instanceof RetentionError;
  return {
    schema: 'openclaw-backup-retention-error/v1',
    ok: false,
    code: known ? error.code : 'INTERNAL_ERROR'
  };
}

async function main() {
  process.umask(0o077);
  const argv = process.argv.slice(2);
  let options;
  try {
    options = parseRetentionArgs(argv);
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    if (options.execute && !options.internalLocked) {
      process.exitCode = await relaunchUnderLocks(
        argv,
        options.json
      );
      return;
    }
    if (
      options.internalLocked &&
      process.env[INTERNAL_LOCK_ENV] !== '1'
    ) {
      throw new RetentionError(
        'LOCK_NOT_HELD',
        'Internal locked execution marker is invalid',
        75
      );
    }
    const result = await runRetention({
      setsRoot: options.setsRoot,
      stateRoot: options.stateRoot,
      execute: options.execute,
      lockConfirmed: options.internalLocked
    });
    process.stdout.write(
      options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : [
            'openclaw_backup_retention_ok',
            `mode=${result.mode}`,
            `selected=${result.selected.length}`,
            `deleted=${result.deletedSets}`
          ].join(' ') + '\n'
    );
  } catch (error) {
    const json =
      options?.json || argv.includes('--json');
    if (json) {
      process.stdout.write(
        `${JSON.stringify(safeErrorResult(error), null, 2)}\n`
      );
    } else {
      const code =
        error instanceof RetentionError
          ? error.code
          : 'INTERNAL_ERROR';
      process.stderr.write(
        `openclaw_backup_retention_error: ${code}\n`
      );
    }
    process.exitCode =
      error instanceof RetentionError
        ? error.exitCode
        : 1;
  }
}

if (
  import.meta.url ===
  pathToFileURL(process.argv[1] || '').href
) {
  main();
}
