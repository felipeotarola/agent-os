import assert from 'node:assert/strict';
import test from 'node:test';
import type { HeadBlobResult, PutBlobResult } from '@vercel/blob';
import { handleProbeRequest } from '../api/openclaw-backup/probe.js';
import {
  BACKUP_CONTENT_TYPE,
  REMOTE_PROBE_PATH,
  buildPrivateBackupPathname,
  computeRemoteObjectRootSha256,
  serializeRemoteProbeRequestBody,
  signCanonicalAuthRequest
} from '../src/contract.js';

const AUTHORITY = 'openclaw-backup-ingest.vercel.app';
const HOST_ID = 'hetzner-openclaw-primary';
const SECRET = 'probe-contract-secret-with-more-than-32-bytes';
const NOW_SECONDS = Math.floor(Date.now() / 1000);
const SET_ID = '20260727T120000Z-0123456789abcdef';
const REQUEST_OBJECTS = [
  {
    filename: 'openclaw-backup.part-00000.gpg',
    sha256: 'a'.repeat(64),
    sizeBytes: 4096,
    etag: 'part-etag'
  },
  {
    filename: 'manifest.json.gpg',
    sha256: 'b'.repeat(64),
    sizeBytes: 512,
    etag: 'manifest-etag'
  }
];
const REMOTE_OBJECTS = REQUEST_OBJECTS.map((object) => ({
  ...object,
  setId: SET_ID,
  pathname: buildPrivateBackupPathname(HOST_ID, {
    ...object,
    setId: SET_ID
  })
}));
const BODY = {
  schema: 'openclaw-backup-remote-object-set/v2' as const,
  setId: SET_ID,
  objects: REQUEST_OBJECTS,
  objectRootSha256: computeRemoteObjectRootSha256(REMOTE_OBJECTS)
};

function configureEnvironment(): void {
  process.env.VERCEL_ENV = 'production';
  process.env.OPENCLAW_BACKUP_ALLOWED_HOST_ID = HOST_ID;
  process.env.OPENCLAW_BACKUP_INGEST_HMAC_SECRET = SECRET;
  process.env.OPENCLAW_BACKUP_BLOB_STORE_ID = 'store_probecontract123';
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.VERCEL_BLOB_API_URL;
  delete process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL;
}

function signedProbeRequest(body = BODY, pathname = REMOTE_PROBE_PATH): Request {
  const rawBody = serializeRemoteProbeRequestBody(body);
  const authInput = {
    method: 'POST',
    pathname,
    authority: AUTHORITY,
    hostId: HOST_ID,
    timestamp: String(NOW_SECONDS),
    nonce: '0123456789abcdef0123456789abcdef',
    rawBody
  };
  return new Request(`https://${AUTHORITY}${REMOTE_PROBE_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(rawBody, 'utf8')),
      'x-openclaw-backup-host-id': HOST_ID,
      'x-openclaw-backup-timestamp': authInput.timestamp,
      'x-openclaw-backup-nonce': authInput.nonce,
      'x-openclaw-backup-signature': signCanonicalAuthRequest(authInput, SECRET)
    },
    body: rawBody
  });
}

function exactMetadata(pathname: string, overrides: Partial<HeadBlobResult> = {}): HeadBlobResult {
  const object = REMOTE_OBJECTS.find((candidate) => candidate.pathname === pathname);
  assert.ok(object);
  return {
    size: object.sizeBytes,
    uploadedAt: new Date(),
    pathname,
    contentType: BACKUP_CONTENT_TYPE,
    contentDisposition: 'attachment',
    url: `https://store.private.blob.vercel-storage.com/${pathname}`,
    downloadUrl: `https://store.private.blob.vercel-storage.com/${pathname}?download=1`,
    cacheControl: 'public, max-age=60',
    etag: object.etag,
    ...overrides
  };
}

async function consumeNonce(pathname: string): Promise<PutBlobResult> {
  return {
    url: `https://store.private.blob.vercel-storage.com/${pathname}`,
    downloadUrl: `https://store.private.blob.vercel-storage.com/${pathname}?download=1`,
    pathname,
    contentType: 'text/plain; charset=utf-8',
    contentDisposition: 'attachment',
    etag: 'nonce-etag'
  };
}

test('probe returns only exact full-object-set metadata', async () => {
  configureEnvironment();
  const response = await handleProbeRequest(
    signedProbeRequest(),
    async (pathname) => exactMetadata(pathname),
    consumeNonce
  );
  assert.equal(response.status, 200);
  const result = (await response.json()) as Record<string, unknown>;
  assert.equal(typeof result.checkedAt, 'string');
  delete result.checkedAt;
  assert.deepEqual(result, {
    schema: 'openclaw-backup-remote-probe/v2',
    ok: true,
    hostId: HOST_ID,
    setId: SET_ID,
    objectCount: REMOTE_OBJECTS.length,
    totalBytes: REMOTE_OBJECTS.reduce((total, object) => total + object.sizeBytes, 0),
    objectRootSha256: BODY.objectRootSha256,
    completionMarker: REMOTE_OBJECTS.at(-1)?.pathname
  });
});

test('probe rejects noncanonical sets and mismatched remote metadata', async () => {
  configureEnvironment();
  const wrongFile = {
    ...BODY,
    objects: [{ ...REQUEST_OBJECTS[0], filename: 'manifest.json.gpg' }, REQUEST_OBJECTS[1]]
  };
  const wrongFileResponse = await handleProbeRequest(
    signedProbeRequest(wrongFile),
    async (pathname) => exactMetadata(pathname),
    consumeNonce
  );
  assert.equal(wrongFileResponse.status, 400);

  const mismatchResponse = await handleProbeRequest(
    signedProbeRequest(),
    async (pathname) => {
      const metadata = exactMetadata(pathname);
      return { ...metadata, size: metadata.size + 1 };
    },
    consumeNonce
  );
  assert.equal(mismatchResponse.status, 502);
});

test('probe authentication is bound to the probe pathname', async () => {
  configureEnvironment();
  const response = await handleProbeRequest(
    signedProbeRequest(BODY, '/api/openclaw-backup/upload-url'),
    async (pathname) => exactMetadata(pathname),
    consumeNonce
  );
  assert.equal(response.status, 401);
});

test('probe consumes its nonce before any remote metadata reads', async () => {
  configureEnvironment();
  let headCalls = 0;
  const response = await handleProbeRequest(
    signedProbeRequest(),
    async (pathname) => {
      headCalls += 1;
      return exactMetadata(pathname);
    },
    async () => {
      throw new Error('nonce already exists');
    }
  );
  assert.equal(response.status, 409);
  assert.equal(headCalls, 0);
});
