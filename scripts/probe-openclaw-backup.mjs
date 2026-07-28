#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import {
  lstat,
  readFile,
  realpath
} from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  computeRemoteObjectRootSha256,
  expectedBlobPathname,
  readIngestSecret,
  signCanonicalAuthRequest
} from './upload-openclaw-backup.mjs';

const REMOTE_PROBE_PATH = '/api/openclaw-backup/probe';
const MAX_RESPONSE_BYTES = 16 * 1024;
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_PROBE_OBJECTS = 128;
const REQUEST_TIMEOUT_MS = 60 * 1000;
const SET_ID_PATTERN =
  /^[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}$/;
const COMPLETION_MARKER_PATTERN =
  /^openclaw-backups\/v1\/([a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?)\/([0-9]{8}T[0-9]{6}Z-[0-9a-f]{16})\/([a-f0-9]{64})-([1-9][0-9]*)\/manifest\.json\.gpg$/;

function usage() {
  return `Usage:
  node scripts/probe-openclaw-backup.mjs RECEIPT [options]

Default behavior validates the local upload receipt and prints a network-free
probe plan. --execute performs authenticated, metadata-only HEAD checks for
every exact encrypted object in the completed set.

Options:
  --execute            Perform the remote metadata probe.
  --endpoint URL       Exact HTTPS /api/openclaw-backup/probe endpoint.
  --host-id ID         Fixed backup host ID.
  --secret-file PATH   Root-owned ingest HMAC secret file.
  --json               Emit machine-readable output.
  --help                Show this help.

Environment fallbacks:
  OPENCLAW_BACKUP_REMOTE_PROBE_URL
  OPENCLAW_BACKUP_HOST_ID
  OPENCLAW_BACKUP_INGEST_SECRET_FILE`;
}

export function parseProbeArgs(argv) {
  const options = {
    receipt: '',
    execute: false,
    endpoint:
      process.env.OPENCLAW_BACKUP_REMOTE_PROBE_URL || '',
    hostId: process.env.OPENCLAW_BACKUP_HOST_ID || '',
    secretFile:
      process.env.OPENCLAW_BACKUP_INGEST_SECRET_FILE || '',
    json: false,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const takeValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${argument}`);
      }
      index += 1;
      return value;
    };
    if (argument === '--execute') options.execute = true;
    else if (argument === '--endpoint') options.endpoint = takeValue();
    else if (argument === '--host-id') options.hostId = takeValue();
    else if (argument === '--secret-file') {
      options.secretFile = takeValue();
    } else if (argument === '--json') options.json = true;
    else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (!argument.startsWith('--') && !options.receipt) {
      options.receipt = argument;
    } else {
      throw new Error(`Unknown or duplicate argument: ${argument}`);
    }
  }
  if (!options.help && !options.receipt) {
    throw new Error('An upload receipt path is required');
  }
  return options;
}

export function validateProbeEndpoint(value) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('Remote probe endpoint must be a valid URL');
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== REMOTE_PROBE_PATH ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(
      endpoint.hostname
    )
  ) {
    throw new Error(
      `Remote probe endpoint must be exact HTTPS path ${REMOTE_PROBE_PATH}`
    );
  }
  return endpoint;
}

export function parseCompletionMarker(
  value,
  expectedHostId,
  expectedSetId
) {
  const marker = COMPLETION_MARKER_PATTERN.exec(value);
  if (
    !marker ||
    marker[1] !== expectedHostId ||
    marker[2] !== expectedSetId
  ) {
    throw new Error(
      'Upload receipt completion marker does not match the configured host'
    );
  }
  const sizeBytes = Number(marker[4]);
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 1 ||
    sizeBytes > 96 * 1024 * 1024
  ) {
    throw new Error('Completion marker size is invalid');
  }
  return {
    setId: marker[2],
    sha256: marker[3],
    sizeBytes,
    pathname: value
  };
}

function containsAsciiControl(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function validateReceiptObject(
  value,
  expectedHostId,
  expectedSetId,
  index,
  count
) {
  const expectedFilename =
    index === count - 1
      ? 'manifest.json.gpg'
      : `openclaw-backup.part-${String(index).padStart(5, '0')}.gpg`;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).toSorted()) !==
      JSON.stringify(
        ['filename', 'sha256', 'sizeBytes', 'etag', 'pathname'].toSorted()
      ) ||
    value.filename !== expectedFilename ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    !Number.isSafeInteger(value.sizeBytes) ||
    value.sizeBytes < 1 ||
    value.sizeBytes > 96 * 1024 * 1024 ||
    typeof value.etag !== 'string' ||
    value.etag.length < 1 ||
    value.etag.length > 512 ||
    containsAsciiControl(value.etag) ||
    typeof value.pathname !== 'string'
  ) {
    throw new Error('Upload receipt encrypted object set is invalid');
  }
  const expectedPath = expectedBlobPathname(expectedHostId, {
    filename: value.filename,
    setId: expectedSetId,
    sha256: value.sha256,
    sizeBytes: value.sizeBytes
  });
  if (value.pathname !== expectedPath) {
    throw new Error(
      'Upload receipt encrypted object pathname is not host-bound'
    );
  }
  return {
    filename: value.filename,
    sha256: value.sha256,
    sizeBytes: value.sizeBytes,
    etag: value.etag,
    pathname: value.pathname
  };
}

export function serializeRemoteProbeRequestBody(plan) {
  return JSON.stringify({
    schema: 'openclaw-backup-remote-object-set/v2',
    setId: plan.setId,
    objects: plan.objects.map((object) => ({
      filename: object.filename,
      sha256: object.sha256,
      sizeBytes: object.sizeBytes,
      etag: object.etag
    })),
    objectRootSha256: plan.objectRootSha256
  });
}

async function readReceipt(path, expectedHostId) {
  const sourceInfo = await lstat(path);
  const expectedUid =
    typeof process.getuid === 'function' ? process.getuid() : null;
  if (
    sourceInfo.isSymbolicLink() ||
    !sourceInfo.isFile() ||
    (sourceInfo.mode & 0o077) !== 0 ||
    (expectedUid !== null && sourceInfo.uid !== expectedUid)
  ) {
    throw new Error('Upload receipt is not a private owned regular file');
  }
  const canonicalPath = await realpath(path);
  const receipt = JSON.parse(await readFile(canonicalPath, 'utf8'));
  if (
    !receipt ||
    receipt.schema !== 'openclaw-backup-upload-result/v2' ||
    receipt.ok !== true ||
    typeof receipt.setId !== 'string' ||
    !SET_ID_PATTERN.test(receipt.setId) ||
    !Array.isArray(receipt.objects) ||
    receipt.objects.length < 2 ||
    receipt.objects.length > MAX_PROBE_OBJECTS ||
    receipt.uploadedFiles !== receipt.objects.length ||
    !Number.isSafeInteger(receipt.uploadedBytes) ||
    receipt.uploadedBytes < 1 ||
    typeof receipt.objectRootSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(receipt.objectRootSha256) ||
    typeof receipt.completionMarker !== 'string'
  ) {
    throw new Error('Upload receipt contract is invalid');
  }
  const objects = receipt.objects.map((object, index) =>
    validateReceiptObject(
      object,
      expectedHostId,
      receipt.setId,
      index,
      receipt.objects.length
    )
  );
  const uploadedBytes = objects.reduce(
    (total, object) => total + object.sizeBytes,
    0
  );
  if (
    uploadedBytes !== receipt.uploadedBytes ||
    computeRemoteObjectRootSha256(objects) !==
      receipt.objectRootSha256 ||
    receipt.completionMarker !== objects.at(-1).pathname
  ) {
    throw new Error(
      'Upload receipt encrypted object root does not match its objects'
    );
  }
  const marker = parseCompletionMarker(
    receipt.completionMarker,
    expectedHostId,
    receipt.setId
  );
  return {
    receiptPath: canonicalPath,
    setId: receipt.setId,
    sha256: marker.sha256,
    sizeBytes: marker.sizeBytes,
    pathname: receipt.completionMarker,
    objects,
    objectCount: objects.length,
    totalBytes: uploadedBytes,
    objectRootSha256: receipt.objectRootSha256
  };
}

async function readBoundedJson(response) {
  const declared = response.headers.get('content-length');
  if (
    declared !== null &&
    (!/^[0-9]+$/.test(declared) ||
      Number(declared) > MAX_RESPONSE_BYTES)
  ) {
    throw new Error('Remote probe response exceeded its size bound');
  }
  if (!response.body) {
    throw new Error('Remote probe returned no response body');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error(
          'Remote probe response exceeded its size bound'
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Remote probe returned invalid JSON');
  }
}

async function executeProbe(options, plan) {
  const endpoint = validateProbeEndpoint(options.endpoint);
  const secret = await readIngestSecret(options.secretFile);
  const rawBody = serializeRemoteProbeRequestBody(plan);
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BYTES) {
    throw new Error('Remote probe request exceeded its size bound');
  }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString('hex');
  const authInput = {
    method: 'POST',
    pathname: endpoint.pathname,
    authority: endpoint.host,
    hostId: options.hostId,
    timestamp,
    nonce,
    rawBody
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(rawBody, 'utf8')),
      'x-openclaw-backup-host-id': options.hostId,
      'x-openclaw-backup-timestamp': timestamp,
      'x-openclaw-backup-nonce': nonce,
      'x-openclaw-backup-signature':
        signCanonicalAuthRequest(authInput, secret)
    },
    body: rawBody,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  const result = await readBoundedJson(response);
  if (
    response.status !== 200 ||
    result?.schema !== 'openclaw-backup-remote-probe/v2' ||
    result.ok !== true ||
    result.hostId !== options.hostId ||
    result.setId !== plan.setId ||
    result.objectCount !== plan.objectCount ||
    result.totalBytes !== plan.totalBytes ||
    result.objectRootSha256 !== plan.objectRootSha256 ||
    result.completionMarker !== plan.pathname ||
    typeof result.checkedAt !== 'string'
  ) {
    throw new Error(
      'Remote probe did not confirm the exact encrypted object set'
    );
  }
  return result;
}

async function main() {
  process.umask(0o077);
  const options = parseProbeArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (
    !/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/.test(
      options.hostId
    )
  ) {
    throw new Error('Backup host ID is invalid');
  }
  const plan = await readReceipt(options.receipt, options.hostId);
  if (!options.execute) {
    const result = {
      schema: 'openclaw-backup-remote-probe-plan/v2',
      mode: 'dry_run',
      setId: plan.setId,
      objectCount: plan.objectCount,
      totalBytes: plan.totalBytes,
      objectRootSha256: plan.objectRootSha256,
      completionMarker: plan.pathname,
      endpointConfigured: Boolean(options.endpoint),
      secretFileConfigured: Boolean(options.secretFile),
      operation: 'head-exact-encrypted-object-set',
      deniedByDesign: ['list', 'get-body', 'put', 'overwrite', 'delete']
    };
    process.stdout.write(
      options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : `openclaw_backup_remote_probe_dry_run set=${result.setId}\n`
    );
    return;
  }
  const result = await executeProbe(options, plan);
  process.stdout.write(
    options.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `openclaw_backup_remote_probe_ok set=${result.setId}\n`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    process.stderr.write(
      `openclaw_backup_remote_probe_error: ${error.message}\n`
    );
    process.exitCode = 1;
  });
}
