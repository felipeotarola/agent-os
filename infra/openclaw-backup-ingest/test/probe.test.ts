import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BlobAccessError,
  BlobRequestAbortedError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobUnknownError,
  type HeadBlobResult
} from '@vercel/blob';
import probeFunction, { handleProbeRequest } from '../api/openclaw-backup/probe.js';
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

test('production fetch adapter cannot treat Vercel runtime context as HeadBlob', () => {
  assert.equal(probeFunction.fetch.length, 1);
});

test('probe returns only exact full-object-set metadata', async () => {
  configureEnvironment();
  const response = await handleProbeRequest(signedProbeRequest(), async (pathname) =>
    exactMetadata(pathname)
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
    async (pathname) => exactMetadata(pathname)
  );
  assert.equal(wrongFileResponse.status, 400);

  const mismatchResponse = await handleProbeRequest(signedProbeRequest(), async (pathname) => {
    const metadata = exactMetadata(pathname);
    return { ...metadata, size: metadata.size + 1 };
  });
  assert.equal(mismatchResponse.status, 502);
});

test('probe returns bounded safe Blob metadata failure codes', async () => {
  configureEnvironment();
  const cases = [
    [new BlobStoreSuspendedError(), 507, 'blob-store-suspended'],
    [new BlobServiceRateLimited(1), 429, 'blob-store-rate-limited'],
    [new BlobServiceNotAvailable(), 503, 'blob-store-unavailable'],
    [new BlobRequestAbortedError(), 504, 'blob-store-timeout'],
    [new TypeError('fetch failed'), 503, 'blob-metadata-type-error'],
    [new BlobAccessError(), 502, 'blob-store-access-denied'],
    [new BlobStoreNotFoundError(), 502, 'blob-store-not-found'],
    [new BlobUnknownError(), 502, 'blob-store-unknown-error']
  ] as const;
  for (const [failure, expectedStatus, expectedCode] of cases) {
    const response = await handleProbeRequest(signedProbeRequest(), async () => {
      throw failure;
    });
    assert.equal(response.status, expectedStatus);
    assert.equal(((await response.json()) as { error: string }).error, expectedCode);
  }
});

test('probe authentication is bound to the probe pathname before any reads', async () => {
  configureEnvironment();
  let headCalls = 0;
  const response = await handleProbeRequest(
    signedProbeRequest(BODY, '/api/openclaw-backup/upload-url'),
    async (pathname) => {
      headCalls += 1;
      return exactMetadata(pathname);
    }
  );
  assert.equal(response.status, 401);
  assert.equal(headCalls, 0);
});

test('a fresh authenticated replay repeats every exact metadata read', async () => {
  configureEnvironment();
  let headCalls = 0;
  const readExactMetadata = async (pathname: string): Promise<HeadBlobResult> => {
    headCalls += 1;
    return exactMetadata(pathname);
  };
  const first = await handleProbeRequest(signedProbeRequest(), readExactMetadata);
  const replay = await handleProbeRequest(signedProbeRequest(), readExactMetadata);
  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.equal(headCalls, REMOTE_OBJECTS.length * 2);
});
