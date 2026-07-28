import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_BACKUP_PART_BYTES,
  UPLOAD_URL_PATH,
  buildPrivateBackupPathname,
  buildAuthorizationNoncePathname,
  computeRemoteObjectRootSha256,
  parseRemoteProbeRequestBody,
  parseUploadUrlRequestBody,
  serializeRemoteProbeRequestBody,
  serializeUploadUrlRequestBody,
  signCanonicalAuthRequest,
  verifyCanonicalAuthRequest
} from '../src/contract.js';

const NOW_MS = Date.UTC(2026, 6, 27, 12, 0, 0);
const HOST_ID = 'hetzner-openclaw-primary';
const SECRET = 'contract-test-secret-with-more-than-32-bytes';
const BODY = {
  filename: 'openclaw-backup.part-00000.gpg',
  setId: '20260727T120000Z-0123456789abcdef',
  sha256: 'a'.repeat(64),
  sizeBytes: MAX_BACKUP_PART_BYTES
};
const RAW_BODY = serializeUploadUrlRequestBody(BODY);
const AUTH_INPUT = {
  method: 'POST',
  pathname: UPLOAD_URL_PATH,
  authority: 'openclaw-backup-ingest.vercel.app',
  hostId: HOST_ID,
  timestamp: String(Math.floor(NOW_MS / 1000)),
  nonce: '0123456789abcdef0123456789abcdef',
  rawBody: RAW_BODY
};

function signedVerificationInput(overrides: Record<string, unknown> = {}) {
  const input = { ...AUTH_INPUT, ...overrides };
  return {
    ...input,
    allowedHostId: HOST_ID,
    secret: SECRET,
    signature: signCanonicalAuthRequest(input, SECRET),
    nowMs: NOW_MS
  };
}

test('accepts the canonical request and produces an exact private pathname', () => {
  const parsed = parseUploadUrlRequestBody(RAW_BODY);
  assert.deepEqual(parsed, BODY);
  assert.deepEqual(verifyCanonicalAuthRequest(signedVerificationInput()), {
    ok: true,
    timestampSeconds: Math.floor(NOW_MS / 1000)
  });
  assert.equal(
    buildPrivateBackupPathname(HOST_ID, parsed),
    `openclaw-backups/v1/${HOST_ID}/${BODY.setId}/${BODY.sha256}-${BODY.sizeBytes}/${BODY.filename}`
  );
  assert.equal(
    buildAuthorizationNoncePathname(HOST_ID, AUTH_INPUT.timestamp, AUTH_INPUT.nonce),
    `openclaw-backup-auth-nonces/v1/${HOST_ID}/${AUTH_INPUT.timestamp}/${AUTH_INPUT.nonce}`
  );
});

test('rejects invalid signatures without accepting alternate encodings', () => {
  const input = signedVerificationInput();
  assert.deepEqual(verifyCanonicalAuthRequest({ ...input, signature: `v1=${'0'.repeat(64)}` }), {
    ok: false,
    code: 'invalid-signature'
  });
  assert.deepEqual(verifyCanonicalAuthRequest({ ...input, signature: 'V1=' + 'A'.repeat(64) }), {
    ok: false,
    code: 'invalid-signature'
  });
});

test('binds authentication to the exact method, route, authority, host, nonce and body', () => {
  const valid = signedVerificationInput();
  assert.equal(verifyCanonicalAuthRequest({ ...valid, method: 'GET' }).ok, false);
  assert.deepEqual(verifyCanonicalAuthRequest({ ...valid, pathname: `${UPLOAD_URL_PATH}/` }), {
    ok: false,
    code: 'invalid-path'
  });
  assert.deepEqual(
    verifyCanonicalAuthRequest({
      ...valid,
      authority: 'another-backup.vercel.app'
    }),
    {
      ok: false,
      code: 'invalid-signature'
    }
  );
  assert.deepEqual(verifyCanonicalAuthRequest({ ...valid, hostId: 'another-host' }), {
    ok: false,
    code: 'invalid-host'
  });
  assert.deepEqual(verifyCanonicalAuthRequest({ ...valid, nonce: 'short' }), {
    ok: false,
    code: 'invalid-nonce'
  });
  assert.deepEqual(verifyCanonicalAuthRequest({ ...valid, rawBody: `${RAW_BODY}\n` }), {
    ok: false,
    code: 'invalid-signature'
  });
});

test('rejects timestamps outside the five-minute authentication window', () => {
  const staleTimestamp = String(Math.floor(NOW_MS / 1000) - 301);
  const stale = signedVerificationInput({ timestamp: staleTimestamp });
  assert.deepEqual(verifyCanonicalAuthRequest(stale), {
    ok: false,
    code: 'expired-timestamp'
  });

  const futureTimestamp = String(Math.floor(NOW_MS / 1000) + 301);
  const future = signedVerificationInput({ timestamp: futureTimestamp });
  assert.deepEqual(verifyCanonicalAuthRequest(future), {
    ok: false,
    code: 'expired-timestamp'
  });
});

test('rejects noncanonical, unsafe and oversized backup metadata', () => {
  assert.throws(
    () => parseUploadUrlRequestBody(`{\n  "filename": "${BODY.filename}"\n}`),
    /canonical fields/
  );
  assert.throws(
    () =>
      parseUploadUrlRequestBody(
        serializeUploadUrlRequestBody({ ...BODY, filename: '../state.gpg' })
      ),
    /filename/
  );
  assert.throws(
    () =>
      parseUploadUrlRequestBody(
        serializeUploadUrlRequestBody({
          ...BODY,
          setId: '20260230T120000Z-0123456789abcdef'
        })
      ),
    /setId/
  );
  assert.throws(
    () =>
      parseUploadUrlRequestBody(serializeUploadUrlRequestBody({ ...BODY, sha256: 'A'.repeat(64) })),
    /sha256/
  );
  assert.throws(
    () =>
      parseUploadUrlRequestBody(
        serializeUploadUrlRequestBody({
          ...BODY,
          sizeBytes: MAX_BACKUP_PART_BYTES + 1
        })
      ),
    /sizeBytes/
  );
});

test('binds a canonical remote probe to every ordered object', () => {
  const requestObjects = [
    {
      filename: 'openclaw-backup.part-00000.gpg',
      sha256: 'b'.repeat(64),
      sizeBytes: 4096,
      etag: 'part-etag'
    },
    {
      filename: 'manifest.json.gpg',
      sha256: 'c'.repeat(64),
      sizeBytes: 512,
      etag: 'manifest-etag'
    }
  ];
  const remoteObjects = requestObjects.map((object) => ({
    ...object,
    setId: BODY.setId,
    pathname: buildPrivateBackupPathname(HOST_ID, {
      ...object,
      setId: BODY.setId
    })
  }));
  const body = {
    schema: 'openclaw-backup-remote-object-set/v2' as const,
    setId: BODY.setId,
    objects: requestObjects,
    objectRootSha256: computeRemoteObjectRootSha256(remoteObjects)
  };
  const rawBody = serializeRemoteProbeRequestBody(body);
  assert.deepEqual(parseRemoteProbeRequestBody(rawBody, HOST_ID), { body, remoteObjects });
  assert.throws(
    () =>
      parseRemoteProbeRequestBody(
        serializeRemoteProbeRequestBody({
          ...body,
          objectRootSha256: 'd'.repeat(64)
        }),
        HOST_ID
      ),
    /object root/
  );
  assert.throws(
    () =>
      parseRemoteProbeRequestBody(
        serializeRemoteProbeRequestBody({
          ...body,
          objects: requestObjects.toReversed()
        }),
        HOST_ID
      ),
    /out of order/
  );
});
