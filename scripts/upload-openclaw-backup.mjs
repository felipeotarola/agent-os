#!/usr/bin/env node

import {
  createHash,
  createHmac,
  randomBytes
} from 'node:crypto';
import { constants } from 'node:fs';
import {
  lstat,
  open,
  readFile,
  realpath
} from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { finished } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { verifySet } from './verify-openclaw-backup.mjs';

export const UPLOAD_URL_PATH = '/api/openclaw-backup/upload-url';
export const BACKUP_CONTENT_TYPE = 'application/octet-stream';
export const MAX_BACKUP_PART_BYTES = 96 * 1024 * 1024;

const SET_ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{16}$/;
const HOST_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const FILENAME_PATTERN =
  /^(?:openclaw-backup\.part-[0-9]{5}|manifest\.json)\.gpg$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SIGNATURE_PATTERN = /^v1=[a-f0-9]{64}$/;
const MAX_RESPONSE_BYTES = 16 * 1024;
const MINT_TIMEOUT_MS = 20 * 1000;
const UPLOAD_TIMEOUT_MS = 20 * 60 * 1000;

function containsAsciiControl(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function usage() {
  return `Usage:
  node scripts/upload-openclaw-backup.mjs SET_DIRECTORY [options]

Default behavior is a local dry run. Network access requires --execute.

Options:
  --execute            Mint signed URLs and upload encrypted files.
  --endpoint URL       Exact HTTPS ingest endpoint.
  --host-id ID         Fixed host ID allowed by the ingest service.
  --store-id ID        Exact dedicated Blob store ID (not a credential).
  --secret-file PATH   Root-owned HMAC secret file; never accepts inline secrets.
  --json               Emit machine-readable output.
  --help               Show this help.

Environment fallbacks:
  OPENCLAW_BACKUP_INGEST_URL
  OPENCLAW_BACKUP_HOST_ID
  OPENCLAW_BACKUP_BLOB_STORE_ID
  OPENCLAW_BACKUP_INGEST_SECRET_FILE

The plaintext manifest is never uploaded. Encrypted chunks are uploaded first
and manifest.json.gpg is uploaded last as the completed-set marker.`;
}

export function parseUploadArgs(argv) {
  const options = {
    setDirectory: '',
    execute: false,
    endpoint: process.env.OPENCLAW_BACKUP_INGEST_URL || '',
    hostId: process.env.OPENCLAW_BACKUP_HOST_ID || '',
    storeId: process.env.OPENCLAW_BACKUP_BLOB_STORE_ID || '',
    secretFile: process.env.OPENCLAW_BACKUP_INGEST_SECRET_FILE || '',
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
    else if (argument === '--store-id') options.storeId = takeValue();
    else if (argument === '--secret-file') options.secretFile = takeValue();
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
  return options;
}

export function serializeUploadUrlRequestBody(body) {
  return JSON.stringify({
    filename: body.filename,
    setId: body.setId,
    sha256: body.sha256,
    sizeBytes: body.sizeBytes
  });
}

export function buildCanonicalAuthRequest(input) {
  const bodySha256 = createHash('sha256')
    .update(input.rawBody, 'utf8')
    .digest('hex');
  return [
    'OPENCLAW-BACKUP-HMAC-V1',
    `method=${input.method}`,
    `pathname=${input.pathname}`,
    `authority=${input.authority}`,
    `host-id=${input.hostId}`,
    `timestamp=${input.timestamp}`,
    `nonce=${input.nonce}`,
    `body-sha256=${bodySha256}`
  ].join('\n');
}

export function signCanonicalAuthRequest(input, secret) {
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('HMAC secret must contain at least 32 UTF-8 bytes');
  }
  const digest = createHmac('sha256', secret)
    .update(buildCanonicalAuthRequest(input), 'utf8')
    .digest('hex');
  return `v1=${digest}`;
}

export function validateIngestEndpoint(value) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error('Ingest endpoint must be a valid URL');
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== UPLOAD_URL_PATH ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(
      endpoint.hostname
    )
  ) {
    throw new Error(
      `Ingest endpoint must be exact HTTPS path ${UPLOAD_URL_PATH} without credentials, query, or fragment`
    );
  }
  return endpoint;
}

export function validateUploadHostId(hostId) {
  if (
    hostId.length < 3 ||
    hostId.length > 64 ||
    !HOST_ID_PATTERN.test(hostId)
  ) {
    throw new Error('Backup host ID is invalid');
  }
  return hostId;
}

export function validateBlobStoreId(storeId) {
  if (!/^(?:store_)?[A-Za-z0-9_-]{8,128}$/.test(storeId)) {
    throw new Error('Backup Blob store ID is invalid');
  }
  return storeId.startsWith('store_') ? storeId.slice(6) : storeId;
}

export async function readIngestSecret(secretFile) {
  if (!secretFile) throw new Error('A HMAC secret file is required');
  const sourceInfo = await lstat(secretFile);
  if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile()) {
    throw new Error('HMAC secret path must be a regular non-symlink file');
  }
  if ((sourceInfo.mode & 0o077) !== 0) {
    throw new Error('HMAC secret file permissions must be 0600 or stricter');
  }
  if (
    typeof process.getuid === 'function' &&
    sourceInfo.uid !== process.getuid()
  ) {
    throw new Error('HMAC secret file must be owned by the backup process user');
  }
  const canonicalPath = await realpath(secretFile);
  const raw = await readFile(canonicalPath, 'utf8');
  const secret = raw.replace(/\r?\n$/, '');
  if (
    Buffer.byteLength(secret, 'utf8') < 32 ||
    Buffer.byteLength(secret, 'utf8') > 512 ||
    containsAsciiControl(secret)
  ) {
    throw new Error(
      'HMAC secret must be 32-512 bytes of printable text with at most one trailing newline'
    );
  }
  return secret;
}

function validateUploadItem(item, setId) {
  if (
    !item ||
    !FILENAME_PATTERN.test(item.name) ||
    basename(item.name) !== item.name ||
    !Number.isSafeInteger(item.bytes) ||
    item.bytes < 1 ||
    item.bytes > MAX_BACKUP_PART_BYTES ||
    !SHA256_PATTERN.test(item.sha256) ||
    !SET_ID_PATTERN.test(setId)
  ) {
    throw new Error('Backup upload item violates the ingest contract');
  }
  return {
    filename: item.name,
    setId,
    sha256: item.sha256,
    sizeBytes: item.bytes
  };
}

export async function loadUploadPlan(setDirectory) {
  const verification = await verifySet(setDirectory);
  const directory = await realpath(setDirectory);
  const manifest = JSON.parse(
    await readFile(join(directory, 'manifest.json'), 'utf8')
  );
  const items = [
    ...manifest.chunks.map((item) =>
      validateUploadItem(item, manifest.setId)
    ),
    validateUploadItem(manifest.encryptedManifest, manifest.setId)
  ];
  return {
    directory,
    verification,
    setId: manifest.setId,
    payloadClass: verification.payloadClass,
    payloadManifestEntries:
      manifest.payloadManifest?.entries ?? null,
    productionData:
      manifest.payloadComponents?.agentOsProduction ?? null,
    items,
    totalUploadBytes: items.reduce(
      (total, item) => total + item.sizeBytes,
      0
    )
  };
}

export function expectedBlobPathname(hostId, item) {
  return [
    'openclaw-backups/v1',
    hostId,
    item.setId,
    `${item.sha256}-${item.sizeBytes}`,
    item.filename
  ].join('/');
}

function validateReceiptEtag(value) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 512 ||
    containsAsciiControl(value)
  ) {
    throw new Error('Blob upload returned an invalid object etag');
  }
  return value;
}

export function serializeRemoteObjectSet(objects) {
  return JSON.stringify(
    objects.map((object) => ({
      filename: object.filename,
      sha256: object.sha256,
      sizeBytes: object.sizeBytes,
      etag: object.etag,
      pathname: object.pathname
    }))
  );
}

export function computeRemoteObjectRootSha256(objects) {
  return createHash('sha256')
    .update(serializeRemoteObjectSet(objects), 'utf8')
    .digest('hex');
}

async function readBoundedResponse(response) {
  const declaredLength = response.headers.get('content-length');
  if (
    declaredLength !== null &&
    (!/^[0-9]+$/.test(declaredLength) ||
      Number(declaredLength) > MAX_RESPONSE_BYTES)
  ) {
    throw new Error('HTTP response exceeded the bounded response size');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error(
          'HTTP response exceeded the bounded response size'
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

function decodeDelegationScope(delegation) {
  const encodedPayload = delegation.split('.', 1)[0];
  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    );
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid delegation payload');
    }
    return parsed;
  } catch {
    throw new Error('Signed upload URL has an invalid delegation scope');
  }
}

export function validateMintResponse(
  value,
  hostId,
  item,
  expectedStoreId,
  nowMs = Date.now()
) {
  const expectedPathname = expectedBlobPathname(hostId, item);
  const normalizedStoreId = validateBlobStoreId(expectedStoreId);
  if (
    !value ||
    value.method !== 'PUT' ||
    value.pathname !== expectedPathname ||
    value.contentType !== BACKUP_CONTENT_TYPE ||
    value.maximumSizeInBytes !== item.sizeBytes ||
    typeof value.uploadUrl !== 'string' ||
    typeof value.expiresAt !== 'string'
  ) {
    throw new Error('Ingest service returned an invalid upload contract');
  }
  let uploadUrl;
  try {
    uploadUrl = new URL(value.uploadUrl);
  } catch {
    throw new Error('Ingest service returned an invalid signed URL');
  }
  const allowedQueryKeys = new Set([
    'pathname',
    'vercel-blob-add-random-suffix',
    'vercel-blob-allow-overwrite',
    'vercel-blob-allowed-content-types',
    'vercel-blob-delegation',
    'vercel-blob-maximum-size-in-bytes',
    'vercel-blob-signature',
    'vercel-blob-valid-until'
  ]);
  const hasSingleQueryValue = (name, expected) => {
    const values = uploadUrl.searchParams.getAll(name);
    return (
      values.length === 1 &&
      (expected === undefined || values[0] === expected)
    );
  };
  const delegation = uploadUrl.searchParams.get('vercel-blob-delegation');
  const signature = uploadUrl.searchParams.get('vercel-blob-signature');
  if (
    uploadUrl.protocol !== 'https:' ||
    uploadUrl.hostname !== 'vercel.com' ||
    uploadUrl.username ||
    uploadUrl.password ||
    uploadUrl.port ||
    uploadUrl.hash ||
    uploadUrl.pathname !== '/api/blob/' ||
    [...uploadUrl.searchParams.keys()].some(
      (key) => !allowedQueryKeys.has(key)
    ) ||
    !hasSingleQueryValue('pathname', expectedPathname) ||
    !hasSingleQueryValue(
      'vercel-blob-allowed-content-types',
      BACKUP_CONTENT_TYPE
    ) ||
    !hasSingleQueryValue(
      'vercel-blob-maximum-size-in-bytes',
      String(item.sizeBytes)
    ) ||
    !hasSingleQueryValue('vercel-blob-add-random-suffix', 'false') ||
    !hasSingleQueryValue('vercel-blob-allow-overwrite', 'false') ||
    !hasSingleQueryValue('vercel-blob-delegation') ||
    !hasSingleQueryValue('vercel-blob-signature') ||
    typeof delegation !== 'string' ||
    delegation.length < 16 ||
    delegation.length > 8192 ||
    !/^[A-Za-z0-9_.-]+$/.test(delegation) ||
    typeof signature !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) {
    throw new Error('Signed upload URL is outside Vercel Blob');
  }
  const delegationScope = decodeDelegationScope(delegation);
  const expiresAt = Date.parse(value.expiresAt);
  const signedUrlExpiry = uploadUrl.searchParams.get(
    'vercel-blob-valid-until'
  );
  if (
    signedUrlExpiry !== null &&
    (!/^[0-9]{13}$/.test(signedUrlExpiry) ||
      Number(signedUrlExpiry) !== expiresAt)
  ) {
    throw new Error('Signed upload URL has an invalid lifetime');
  }
  if (
    (String(delegationScope.storeId || '').startsWith('store_')
      ? String(delegationScope.storeId).slice(6)
      : String(delegationScope.storeId || '')) !== normalizedStoreId ||
    delegationScope.pathname !== expectedPathname ||
    !Array.isArray(delegationScope.operations) ||
    delegationScope.operations.length !== 1 ||
    delegationScope.operations[0] !== 'put' ||
    delegationScope.validUntil !== expiresAt ||
    delegationScope.maximumSizeInBytes !== item.sizeBytes ||
    !Array.isArray(delegationScope.allowedContentTypes) ||
    delegationScope.allowedContentTypes.length !== 1 ||
    delegationScope.allowedContentTypes[0] !== BACKUP_CONTENT_TYPE
  ) {
    throw new Error('Signed upload URL has an invalid delegation scope');
  }
  const remainingMs = expiresAt - nowMs;
  if (
    !Number.isFinite(expiresAt) ||
    remainingMs < 30 * 1000 ||
    remainingMs > 6 * 60 * 1000
  ) {
    throw new Error('Signed upload URL has an invalid lifetime');
  }
  return uploadUrl;
}

async function mintUploadUrl(endpoint, hostId, storeId, secret, item) {
  const rawBody = serializeUploadUrlRequestBody(item);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString('hex');
  const canonicalInput = {
    method: 'POST',
    pathname: UPLOAD_URL_PATH,
    authority: endpoint.host,
    hostId,
    timestamp,
    nonce,
    rawBody
  };
  const signature = signCanonicalAuthRequest(canonicalInput, secret);
  if (!SIGNATURE_PATTERN.test(signature)) {
    throw new Error('Could not create the HMAC request signature');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(rawBody, 'utf8')),
      'x-openclaw-backup-host-id': hostId,
      'x-openclaw-backup-timestamp': timestamp,
      'x-openclaw-backup-nonce': nonce,
      'x-openclaw-backup-signature': signature
    },
    body: rawBody,
    redirect: 'error',
    signal: AbortSignal.timeout(MINT_TIMEOUT_MS)
  });
  const responseBody = await readBoundedResponse(response);
  if (!response.ok) {
    throw new Error(`Ingest authorization failed with HTTP ${response.status}`);
  }
  if (
    response.headers.get('content-type')?.split(';', 1)[0].trim() !==
    'application/json'
  ) {
    throw new Error('Ingest service returned an invalid content type');
  }

  let parsed;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    throw new Error('Ingest service returned invalid JSON');
  }
  return validateMintResponse(parsed, hostId, item, storeId);
}

async function uploadItem(directory, uploadUrl, item) {
  const filePath = join(directory, item.filename);
  const handle = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  const initialInfo = await handle.stat({ bigint: true });
  if (
    !initialInfo.isFile() ||
    initialInfo.size !== BigInt(item.sizeBytes) ||
    (initialInfo.mode & 0o222n) !== 0n
  ) {
    await handle.close();
    throw new Error('Backup file changed after verification');
  }

  const preflightHash = createHash('sha256');
  let preflightBytes = 0;
  const preflightStream = handle.createReadStream({
    autoClose: false,
    start: 0,
    end: item.sizeBytes - 1
  });
  for await (const chunk of preflightStream) {
    preflightBytes += chunk.length;
    preflightHash.update(chunk);
  }
  const afterPreflightInfo = await handle.stat({ bigint: true });
  if (
    preflightBytes !== item.sizeBytes ||
    preflightHash.digest('hex') !== item.sha256 ||
    !sameFileVersion(initialInfo, afterPreflightInfo)
  ) {
    await handle.close();
    throw new Error('Backup file changed before upload authorization');
  }

  const source = handle.createReadStream({
    autoClose: false,
    start: 0,
    end: item.sizeBytes - 1
  });
  const hash = createHash('sha256');
  let streamedBytes = 0;
  const integrityStream = new Transform({
    transform(chunk, _encoding, callback) {
      streamedBytes += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    }
  });
  source.pipe(integrityStream);
  const streamCompletion = finished(integrityStream, { cleanup: true });
  try {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'content-type': BACKUP_CONTENT_TYPE,
        'content-length': String(item.sizeBytes)
      },
      body: Readable.toWeb(integrityStream),
      duplex: 'half',
      redirect: 'error',
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
    });
    await streamCompletion;
    const responseBody = await readBoundedResponse(response);
    if (!response.ok) {
      throw new Error(`Blob upload failed with HTTP ${response.status}`);
    }
    const finalInfo = await handle.stat({ bigint: true });
    if (
      streamedBytes !== item.sizeBytes ||
      hash.digest('hex') !== item.sha256 ||
      !sameFileVersion(initialInfo, finalInfo)
    ) {
      throw new Error(
        'Backup file integrity changed during upload; completion marker withheld'
      );
    }
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseBody);
    } catch {
      throw new Error('Blob upload returned invalid JSON');
    }
    return parsedResponse;
  } finally {
    source.destroy();
    integrityStream.destroy();
    await streamCompletion.catch(() => {});
    await handle.close();
  }
}

function sameFileVersion(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

export function validateBlobPutResponse(value, storeId, item) {
  const normalizedStoreId = validateBlobStoreId(storeId);
  const expectedHostname =
    `${normalizedStoreId}.private.blob.vercel-storage.com`;
  const expectedPathname = `/${expectedBlobPathname(
    item.hostId,
    item
  )}`;
  if (
    !value ||
    value.pathname !== expectedPathname.slice(1) ||
    value.contentType !== BACKUP_CONTENT_TYPE ||
    typeof value.url !== 'string' ||
    typeof value.downloadUrl !== 'string' ||
    typeof value.etag !== 'string'
  ) {
    throw new Error('Blob upload returned an invalid object receipt');
  }
  validateReceiptEtag(value.etag);
  for (const [name, rawUrl] of [
    ['url', value.url],
    ['downloadUrl', value.downloadUrl]
  ]) {
    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('Blob upload returned an invalid object URL');
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== expectedHostname ||
      parsed.port ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== expectedPathname ||
      parsed.hash ||
      (name === 'url' && parsed.search)
    ) {
      throw new Error(
        'Blob upload did not resolve to the pinned private store'
      );
    }
  }
  return value;
}

async function executeUpload(options, plan) {
  const endpoint = validateIngestEndpoint(options.endpoint);
  const hostId = validateUploadHostId(options.hostId);
  const storeId = validateBlobStoreId(options.storeId);
  const secret = await readIngestSecret(options.secretFile);
  const uploaded = [];

  for (const item of plan.items) {
    const uploadUrl = await mintUploadUrl(
      endpoint,
      hostId,
      storeId,
      secret,
      item
    );
    const putResponse = await uploadItem(
      plan.directory,
      uploadUrl,
      item
    );
    const receipt = validateBlobPutResponse(
      putResponse,
      storeId,
      { ...item, hostId }
    );
    uploaded.push({
      filename: item.filename,
      sizeBytes: item.sizeBytes,
      sha256: item.sha256,
      etag: receipt.etag,
      pathname: expectedBlobPathname(hostId, item)
    });
  }

  const completedAt = new Date();
  const completionMarker = uploaded.at(-1)?.pathname ?? null;
  return {
    schema: 'openclaw-backup-upload-result/v2',
    ok: true,
    completedAt: completedAt.toISOString(),
    completedAtEpoch: Math.floor(completedAt.getTime() / 1000),
    setId: plan.setId,
    payloadClass: plan.payloadClass,
    payloadManifestEntries: plan.payloadManifestEntries,
    productionData: plan.productionData,
    uploadedFiles: uploaded.length,
    uploadedBytes: uploaded.reduce(
      (total, item) => total + item.sizeBytes,
      0
    ),
    objects: uploaded,
    objectRootSha256: computeRemoteObjectRootSha256(uploaded),
    completionMarker
  };
}

async function main() {
  process.umask(0o077);
  const options = parseUploadArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const plan = await loadUploadPlan(options.setDirectory);
  if (!options.execute) {
    const dryRun = {
      schema: 'openclaw-backup-upload-plan/v1',
      mode: 'dry_run',
      setId: plan.setId,
      payloadClass: plan.payloadClass,
      payloadManifestEntries:
        plan.payloadManifestEntries,
      productionData: plan.productionData,
      files: plan.items.length,
      bytes: plan.totalUploadBytes,
      localIntegrity: plan.verification.outerIntegrity,
      endpointConfigured: Boolean(options.endpoint),
      hostIdConfigured: Boolean(options.hostId),
      storeIdConfigured: Boolean(options.storeId),
      secretFileConfigured: Boolean(options.secretFile),
      permissions: ['mint-exact-put', 'upload-new-object'],
      deniedByDesign: ['list', 'get', 'head', 'overwrite', 'delete']
    };
    process.stdout.write(
      options.json
        ? `${JSON.stringify(dryRun, null, 2)}\n`
        : `backup_upload_dry_run set=${dryRun.setId} files=${dryRun.files} bytes=${dryRun.bytes}\n`
    );
    return;
  }

  const result = await executeUpload(options, plan);
  process.stdout.write(
    options.json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `backup_upload_ok set=${result.setId} files=${result.uploadedFiles} bytes=${result.uploadedBytes}\n`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    process.stderr.write(`openclaw_backup_upload_error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
