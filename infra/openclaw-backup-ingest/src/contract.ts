import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const UPLOAD_URL_PATH = '/api/openclaw-backup/upload-url';
export const REMOTE_PROBE_PATH = '/api/openclaw-backup/probe';
export const BACKUP_PATH_PREFIX = 'openclaw-backups/v1';
export const AUTH_NONCE_PATH_PREFIX = 'openclaw-backup-auth-nonces/v1';
export const BACKUP_CONTENT_TYPE = 'application/octet-stream';
export const MAX_BACKUP_PART_BYTES = 96 * 1024 * 1024;
export const MAX_REQUEST_BODY_BYTES = 2048;
export const MAX_PROBE_REQUEST_BODY_BYTES = 64 * 1024;
export const MAX_PROBE_OBJECTS = 128;
export const AUTH_MAX_CLOCK_SKEW_SECONDS = 5 * 60;
export const PRESIGNED_URL_LIFETIME_MS = 5 * 60 * 1000;

const HOST_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const INGEST_AUTHORITY_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/;
const SET_ID_PATTERN = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-([a-f0-9]{16})$/;
const FILENAME_PATTERN = /^(?:openclaw-backup\.part-[0-9]{5}|manifest\.json)\.gpg$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const NONCE_PATTERN = /^[a-f0-9]{32}$/;
const TIMESTAMP_PATTERN = /^[0-9]{10}$/;
const SIGNATURE_PATTERN = /^v1=([a-f0-9]{64})$/;
const REQUEST_BODY_KEYS = ['filename', 'setId', 'sha256', 'sizeBytes'] as const;
const REMOTE_PROBE_BODY_KEYS = ['schema', 'setId', 'objects', 'objectRootSha256'] as const;
const REMOTE_PROBE_OBJECT_KEYS = ['filename', 'sha256', 'sizeBytes', 'etag'] as const;

export interface UploadUrlRequestBody {
  filename: string;
  setId: string;
  sha256: string;
  sizeBytes: number;
}

export interface RemoteProbeRequestObject {
  filename: string;
  sha256: string;
  sizeBytes: number;
  etag: string;
}

export interface RemoteProbeRequestBody {
  schema: 'openclaw-backup-remote-object-set/v2';
  setId: string;
  objects: RemoteProbeRequestObject[];
  objectRootSha256: string;
}

export interface RemoteProbeObject extends RemoteProbeRequestObject {
  setId: string;
  pathname: string;
}

export interface CanonicalAuthInput {
  method: string;
  pathname: string;
  authority: string;
  hostId: string;
  timestamp: string;
  nonce: string;
  rawBody: string;
}

export interface VerifyAuthInput extends CanonicalAuthInput {
  allowedHostId: string;
  signature: string;
  secret: string;
  nowMs?: number;
  expectedPathname?: string;
}

export type AuthFailureCode =
  | 'invalid-method'
  | 'invalid-path'
  | 'invalid-authority'
  | 'invalid-host'
  | 'invalid-timestamp'
  | 'expired-timestamp'
  | 'invalid-nonce'
  | 'invalid-secret'
  | 'invalid-signature';

export type VerifyAuthResult =
  | { ok: true; timestampSeconds: number }
  | { ok: false; code: AuthFailureCode };

export class ContractValidationError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = 'ContractValidationError';
    this.code = code;
  }
}

function assertPlainObject(value: unknown): asserts value is Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new ContractValidationError('invalid-body', 'Body must be a JSON object.');
  }
}

function containsAsciiControl(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function isValidUtcSetId(value: string): boolean {
  const match = SET_ID_PATTERN.exec(value);
  if (!match) return false;

  const [, year, month, day, hour, minute, second] = match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  const date = new Date(timestamp);

  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day) &&
    date.getUTCHours() === Number(hour) &&
    date.getUTCMinutes() === Number(minute) &&
    date.getUTCSeconds() === Number(second)
  );
}

export function isValidHostId(value: string): boolean {
  return value.length >= 3 && value.length <= 64 && HOST_ID_PATTERN.test(value);
}

export function isValidIngestAuthority(value: string): boolean {
  return INGEST_AUTHORITY_PATTERN.test(value);
}

export function serializeUploadUrlRequestBody(body: UploadUrlRequestBody): string {
  return JSON.stringify({
    filename: body.filename,
    setId: body.setId,
    sha256: body.sha256,
    sizeBytes: body.sizeBytes
  });
}

export function serializeRemoteObjectSet(objects: RemoteProbeObject[]): string {
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

export function computeRemoteObjectRootSha256(objects: RemoteProbeObject[]): string {
  return createHash('sha256').update(serializeRemoteObjectSet(objects), 'utf8').digest('hex');
}

export function serializeRemoteProbeRequestBody(body: RemoteProbeRequestBody): string {
  return JSON.stringify({
    schema: body.schema,
    setId: body.setId,
    objects: body.objects.map((object) => ({
      filename: object.filename,
      sha256: object.sha256,
      sizeBytes: object.sizeBytes,
      etag: object.etag
    })),
    objectRootSha256: body.objectRootSha256
  });
}

export function parseRemoteProbeRequestBody(
  rawBody: string,
  hostId: string
): {
  body: RemoteProbeRequestBody;
  remoteObjects: RemoteProbeObject[];
} {
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_PROBE_REQUEST_BODY_BYTES) {
    throw new ContractValidationError('body-too-large', 'Probe request body is too large.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new ContractValidationError('invalid-json', 'Body must be valid JSON.');
  }
  assertPlainObject(parsed);
  const keys = Object.keys(parsed);
  if (
    keys.length !== REMOTE_PROBE_BODY_KEYS.length ||
    !REMOTE_PROBE_BODY_KEYS.every((key, index) => keys[index] === key) ||
    parsed.schema !== 'openclaw-backup-remote-object-set/v2' ||
    typeof parsed.setId !== 'string' ||
    !isValidUtcSetId(parsed.setId) ||
    !Array.isArray(parsed.objects) ||
    parsed.objects.length < 2 ||
    parsed.objects.length > MAX_PROBE_OBJECTS ||
    typeof parsed.objectRootSha256 !== 'string' ||
    !SHA256_PATTERN.test(parsed.objectRootSha256)
  ) {
    throw new ContractValidationError(
      'invalid-object-set',
      'Probe body must contain one canonical encrypted object set.'
    );
  }
  const setId = parsed.setId;
  const objectRootSha256 = parsed.objectRootSha256;
  const parsedObjects = parsed.objects;
  const objects: RemoteProbeRequestObject[] = parsedObjects.map((value, index) => {
    assertPlainObject(value);
    const objectKeys = Object.keys(value);
    const expectedFilename =
      index === parsedObjects.length - 1
        ? 'manifest.json.gpg'
        : `openclaw-backup.part-${String(index).padStart(5, '0')}.gpg`;
    if (
      objectKeys.length !== REMOTE_PROBE_OBJECT_KEYS.length ||
      !REMOTE_PROBE_OBJECT_KEYS.every((key, keyIndex) => objectKeys[keyIndex] === key) ||
      value.filename !== expectedFilename ||
      typeof value.sha256 !== 'string' ||
      !SHA256_PATTERN.test(value.sha256) ||
      typeof value.sizeBytes !== 'number' ||
      !Number.isSafeInteger(value.sizeBytes) ||
      value.sizeBytes < 1 ||
      value.sizeBytes > MAX_BACKUP_PART_BYTES ||
      typeof value.etag !== 'string' ||
      value.etag.length < 1 ||
      value.etag.length > 512 ||
      containsAsciiControl(value.etag)
    ) {
      throw new ContractValidationError(
        'invalid-object-set',
        'Probe object metadata is invalid or out of order.'
      );
    }
    return {
      filename: value.filename,
      sha256: value.sha256,
      sizeBytes: value.sizeBytes,
      etag: value.etag
    };
  });
  const body: RemoteProbeRequestBody = {
    schema: 'openclaw-backup-remote-object-set/v2',
    setId,
    objects,
    objectRootSha256
  };
  if (serializeRemoteProbeRequestBody(body) !== rawBody) {
    throw new ContractValidationError(
      'noncanonical-body',
      'Probe body JSON must use the canonical compact encoding.'
    );
  }
  const remoteObjects = objects.map((object) => ({
    ...object,
    setId,
    pathname: buildPrivateBackupPathname(hostId, {
      ...object,
      setId
    })
  }));
  if (computeRemoteObjectRootSha256(remoteObjects) !== objectRootSha256) {
    throw new ContractValidationError(
      'object-root-mismatch',
      'Probe object root does not match the requested object set.'
    );
  }
  return { body, remoteObjects };
}

export function parseUploadUrlRequestBody(rawBody: string): UploadUrlRequestBody {
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_REQUEST_BODY_BYTES) {
    throw new ContractValidationError('body-too-large', 'Request body is too large.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new ContractValidationError('invalid-json', 'Body must be valid JSON.');
  }

  assertPlainObject(parsed);
  const keys = Object.keys(parsed);
  if (
    keys.length !== REQUEST_BODY_KEYS.length ||
    !REQUEST_BODY_KEYS.every((key, index) => keys[index] === key)
  ) {
    throw new ContractValidationError(
      'noncanonical-body',
      'Body must contain only the canonical fields in canonical order.'
    );
  }

  const { filename, setId, sha256, sizeBytes } = parsed;
  if (typeof filename !== 'string' || !FILENAME_PATTERN.test(filename)) {
    throw new ContractValidationError(
      'invalid-filename',
      'filename must be a canonical encrypted backup part or manifest.'
    );
  }
  if (typeof setId !== 'string' || !isValidUtcSetId(setId)) {
    throw new ContractValidationError(
      'invalid-set-id',
      'setId must use YYYYMMDDTHHMMSSZ-<16 lowercase hex>.'
    );
  }
  if (typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) {
    throw new ContractValidationError(
      'invalid-sha256',
      'sha256 must be 64 lowercase hexadecimal characters.'
    );
  }
  if (
    typeof sizeBytes !== 'number' ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes < 1 ||
    sizeBytes > MAX_BACKUP_PART_BYTES
  ) {
    throw new ContractValidationError(
      'invalid-size',
      `sizeBytes must be an integer between 1 and ${MAX_BACKUP_PART_BYTES}.`
    );
  }

  const body: UploadUrlRequestBody = { filename, setId, sha256, sizeBytes };
  if (serializeUploadUrlRequestBody(body) !== rawBody) {
    throw new ContractValidationError(
      'noncanonical-body',
      'Body JSON must use the canonical compact encoding.'
    );
  }
  return body;
}

export function buildPrivateBackupPathname(hostId: string, body: UploadUrlRequestBody): string {
  if (!isValidHostId(hostId)) {
    throw new ContractValidationError('invalid-host', 'hostId is invalid.');
  }
  return [
    BACKUP_PATH_PREFIX,
    hostId,
    body.setId,
    `${body.sha256}-${body.sizeBytes}`,
    body.filename
  ].join('/');
}

export function buildAuthorizationNoncePathname(
  hostId: string,
  timestamp: string,
  nonce: string
): string {
  if (!isValidHostId(hostId) || !TIMESTAMP_PATTERN.test(timestamp) || !NONCE_PATTERN.test(nonce)) {
    throw new ContractValidationError(
      'invalid-nonce-path',
      'Authorization nonce pathname input is invalid.'
    );
  }
  return [AUTH_NONCE_PATH_PREFIX, hostId, timestamp, nonce].join('/');
}

export function buildCanonicalAuthRequest(input: CanonicalAuthInput): string {
  const bodySha256 = createHash('sha256').update(input.rawBody, 'utf8').digest('hex');
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

function isStrongSecret(secret: string): boolean {
  return Buffer.byteLength(secret, 'utf8') >= 32;
}

export function signCanonicalAuthRequest(input: CanonicalAuthInput, secret: string): string {
  if (!isStrongSecret(secret)) {
    throw new ContractValidationError(
      'invalid-secret',
      'HMAC secret must contain at least 32 UTF-8 bytes.'
    );
  }
  const canonicalRequest = buildCanonicalAuthRequest(input);
  const digest = createHmac('sha256', secret).update(canonicalRequest, 'utf8').digest('hex');
  return `v1=${digest}`;
}

function constantTimeSignatureMatches(provided: string, expected: string): boolean {
  const providedMatch = SIGNATURE_PATTERN.exec(provided);
  const expectedMatch = SIGNATURE_PATTERN.exec(expected);
  const providedBytes = providedMatch ? Buffer.from(providedMatch[1], 'hex') : Buffer.alloc(32);
  const expectedBytes = expectedMatch
    ? Buffer.from(expectedMatch[1], 'hex')
    : Buffer.alloc(32, 0xff);
  const equal = timingSafeEqual(providedBytes, expectedBytes);
  return providedMatch !== null && expectedMatch !== null && equal;
}

export function verifyCanonicalAuthRequest(input: VerifyAuthInput): VerifyAuthResult {
  if (input.method !== 'POST') return { ok: false, code: 'invalid-method' };
  if (input.pathname !== (input.expectedPathname ?? UPLOAD_URL_PATH)) {
    return { ok: false, code: 'invalid-path' };
  }
  if (!isValidIngestAuthority(input.authority)) {
    return { ok: false, code: 'invalid-authority' };
  }
  if (!isValidHostId(input.allowedHostId) || input.hostId !== input.allowedHostId) {
    return { ok: false, code: 'invalid-host' };
  }
  if (!TIMESTAMP_PATTERN.test(input.timestamp)) {
    return { ok: false, code: 'invalid-timestamp' };
  }

  const timestampSeconds = Number(input.timestamp);
  if (!Number.isSafeInteger(timestampSeconds)) {
    return { ok: false, code: 'invalid-timestamp' };
  }
  const nowMs = input.nowMs ?? Date.now();
  const skewSeconds = Math.abs(Math.floor(nowMs / 1000) - timestampSeconds);
  if (skewSeconds > AUTH_MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, code: 'expired-timestamp' };
  }
  if (!NONCE_PATTERN.test(input.nonce)) {
    return { ok: false, code: 'invalid-nonce' };
  }
  if (!isStrongSecret(input.secret)) {
    return { ok: false, code: 'invalid-secret' };
  }

  const expected = signCanonicalAuthRequest(input, input.secret);
  if (!constantTimeSignatureMatches(input.signature, expected)) {
    return { ok: false, code: 'invalid-signature' };
  }
  return { ok: true, timestampSeconds };
}
