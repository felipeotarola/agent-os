#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { presignUrl } from '@vercel/blob';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BLOB_API_VERSION,
  UPLOAD_URL_PATH,
  buildBlobPutHeaders,
  loadUploadPlan,
  parseUploadArgs,
  parseBlobPutHttpResponse,
  readIngestSecret,
  serializeUploadUrlRequestBody,
  signCanonicalAuthRequest,
  validateIngestEndpoint,
  validateBlobStoreId,
  validateBlobPutResponse,
  validateMintResponse,
  validateUploadHostId
} from './upload-openclaw-backup.mjs';
import {
  parseCompletionMarker,
  parseProbeArgs,
  validateProbeEndpoint,
  validateRemoteProbeHttpResponse
} from './probe-openclaw-backup.mjs';

async function main() {
  testCanonicalHmacVector();
  testArgumentAndEndpointGuardrails();
  testRemoteProbeGuardrails();
  testSignedUploadUrlBoundary();
  testBlobPutResponseBoundary();
  testPrivateStoreReceiptBoundary();
  await testActualSdkPresignBoundary();
  await testSecretFileBoundary();
  await testUploadPlanOrdering();
  await testNetworkClientTopLevelLivenessContract();
  process.stdout.write('openclaw_backup_upload_contract_ok\n');
}

async function testNetworkClientTopLevelLivenessContract() {
  const clients = [
    ['upload', new URL('./upload-openclaw-backup.mjs', import.meta.url)],
    ['probe', new URL('./probe-openclaw-backup.mjs', import.meta.url)]
  ];
  for (const [label, url] of clients) {
    const source = await readFile(url, 'utf8');
    assert.match(
      source,
      /const mainKeepAlive = setInterval\(\(\) => \{\}, 1_000\);/,
      `${label} client must retain a referenced handle until main settles`
    );
    assert.match(
      source,
      /\.finally\(\(\) => \{\s*clearInterval\(mainKeepAlive\);\s*\}\);/,
      `${label} client must release its top-level keepalive after main settles`
    );
  }
}

function testRemoteProbeGuardrails() {
  const hostId = 'hetzner-openclaw-primary';
  const setId = '20260727T120000Z-0123456789abcdef';
  const pathname =
    `openclaw-backups/v1/${hostId}/${setId}/` +
    `${'a'.repeat(64)}-4096/manifest.json.gpg`;
  assert.equal(parseProbeArgs(['/tmp/receipt.json']).execute, false);
  assert.equal(
    validateProbeEndpoint(
      'https://openclaw-backup-ingest.vercel.app/api/openclaw-backup/probe'
    ).pathname,
    '/api/openclaw-backup/probe'
  );
  assert.throws(
    () =>
      validateProbeEndpoint(
        'https://example.com/api/openclaw-backup/probe'
      ),
    /exact HTTPS/
  );
  assert.deepEqual(
    parseCompletionMarker(pathname, hostId, setId),
    {
      setId,
      sha256: 'a'.repeat(64),
      sizeBytes: 4096,
      pathname
    }
  );
  assert.throws(
    () => parseCompletionMarker(pathname, 'different-host', setId),
    /configured host/
  );
  assert.throws(
    () =>
      validateRemoteProbeHttpResponse(
        new Response('{}', { status: 409 }),
        { error: 'authorization-replayed-or-unavailable' },
        { hostId: 'hetzner-openclaw-primary' },
        {
          setId,
          objectCount: 2,
          totalBytes: 5096,
          objectRootSha256: 'b'.repeat(64),
          pathname
        }
      ),
    /HTTP 409 \(authorization-replayed-or-unavailable\)/
  );
}

function testPrivateStoreReceiptBoundary() {
  const storeId = 'store_Fixture01';
  const item = {
    hostId: 'hetzner-openclaw-primary',
    filename: 'openclaw-backup.part-00000.gpg',
    setId: '20260727T120000Z-0123456789abcdef',
    sha256: 'c'.repeat(64),
    sizeBytes: 1000
  };
  const pathname = [
    'openclaw-backups/v1',
    item.hostId,
    item.setId,
    `${item.sha256}-${item.sizeBytes}`,
    item.filename
  ].join('/');
  const receipt = {
    url: `https://fixture01.private.blob.vercel-storage.com/${pathname}`,
    downloadUrl:
      `https://fixture01.private.blob.vercel-storage.com/${pathname}` +
      '?download=1',
    pathname,
    contentType: 'application/octet-stream',
    contentDisposition: `attachment; filename="${item.filename}"`,
    etag: '"fixture-etag"'
  };
  assert.equal(
    validateBlobPutResponse(receipt, storeId, item).pathname,
    pathname
  );
  assert.throws(
    () =>
      validateBlobPutResponse(
        {
          ...receipt,
          url: receipt.url.replace('.private.', '.public.')
        },
        storeId,
        item
      ),
    /pinned private store/
  );
  assert.throws(
    () =>
      validateBlobPutResponse(
        {
          ...receipt,
          downloadUrl: `${receipt.url}?download=yes`
        },
        storeId,
        item
      ),
    /pinned private store/
  );
  assert.throws(
    () =>
      validateBlobPutResponse(
        {
          url: receipt.url,
          pathname,
          contentType: 'application/octet-stream',
          contentDisposition: receipt.contentDisposition,
          uploadedAt: new Date().toISOString(),
          size: item.sizeBytes
        },
        storeId,
        item
      ),
    /invalid object receipt/
  );
}

function testBlobPutResponseBoundary() {
  const receipt = {
    url:
      'https://fixture01.private.blob.vercel-storage.com/' +
      'openclaw-backups/v1/host/set/hash/file.gpg',
    downloadUrl:
      'https://fixture01.private.blob.vercel-storage.com/' +
      'openclaw-backups/v1/host/set/hash/file.gpg?download=1',
    pathname: 'openclaw-backups/v1/host/set/hash/file.gpg',
    contentType: 'application/octet-stream',
    contentDisposition: 'attachment; filename="file.gpg"',
    etag: '"fixture-etag"'
  };
  const response = new Response(JSON.stringify(receipt), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
  assert.deepEqual(
    parseBlobPutHttpResponse(response, JSON.stringify(receipt)),
    receipt
  );
  assert.throws(
    () =>
      parseBlobPutHttpResponse(
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'text/plain' }
        }),
        '{}'
      ),
    /invalid content type/
  );
  assert.throws(
    () =>
      parseBlobPutHttpResponse(
        new Response('not-json', {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }),
        'not-json'
      ),
    /invalid JSON/
  );
  assert.throws(
    () =>
      parseBlobPutHttpResponse(
        new Response('[]', {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }),
        '[]'
      ),
    /invalid JSON object/
  );
  assert.throws(
    () =>
      parseBlobPutHttpResponse(
        new Response('{}', {
          status: 409,
          headers: { 'content-type': 'application/json' }
        }),
        '{}'
      ),
    /HTTP 409/
  );
}

function testCanonicalHmacVector() {
  const body = serializeUploadUrlRequestBody({
    filename: 'openclaw-state.tar.zst.gpg.part-0000.gpg',
    setId: '20260727T120000Z-0123456789abcdef',
    sha256: 'a'.repeat(64),
    sizeBytes: 1000
  });
  assert.equal(
    body,
    `{"filename":"openclaw-state.tar.zst.gpg.part-0000.gpg","setId":"20260727T120000Z-0123456789abcdef","sha256":"${'a'.repeat(64)}","sizeBytes":1000}`
  );
  const signature = signCanonicalAuthRequest(
    {
      method: 'POST',
      pathname: UPLOAD_URL_PATH,
      authority: 'openclaw-backup-ingest.vercel.app',
      hostId: 'hetzner-openclaw-primary',
      timestamp: '1785153600',
      nonce: '0123456789abcdef0123456789abcdef',
      rawBody: body
    },
    'contract-test-secret-with-more-than-32-bytes'
  );
  assert.equal(
    signature,
    'v1=a7d95ed604c9ae8db42e0e52c760b161659fbc715248b207f5eb7d71076895f4'
  );
}

function testSignedUploadUrlBoundary() {
  const nowMs = Date.UTC(2026, 6, 27, 12, 0, 0);
  const hostId = 'hetzner-openclaw-primary';
  const item = {
    filename: 'openclaw-backup.part-00000.gpg',
    setId: '20260727T120000Z-0123456789abcdef',
    sha256: 'a'.repeat(64),
    sizeBytes: 1000
  };
  const pathname = [
    'openclaw-backups/v1',
    hostId,
    item.setId,
    `${item.sha256}-${item.sizeBytes}`,
    item.filename
  ].join('/');
  const response = {
    method: 'PUT',
    pathname,
    uploadUrl: '',
    contentType: 'application/octet-stream',
    maximumSizeInBytes: item.sizeBytes,
    expiresAt: new Date(nowMs + 5 * 60 * 1000).toISOString()
  };
  const storeId = 'store_fixture01';
  const uploadUrl = new URL('https://vercel.com/api/blob/');
  uploadUrl.searchParams.set('pathname', pathname);
  uploadUrl.searchParams.set(
    'vercel-blob-allowed-content-types',
    response.contentType
  );
  uploadUrl.searchParams.set(
    'vercel-blob-maximum-size-in-bytes',
    String(item.sizeBytes)
  );
  uploadUrl.searchParams.set('vercel-blob-add-random-suffix', 'false');
  uploadUrl.searchParams.set('vercel-blob-allow-overwrite', 'false');
  uploadUrl.searchParams.set(
    'vercel-blob-delegation',
    `${Buffer.from(
      JSON.stringify({
        storeId,
        pathname,
        operations: ['put'],
        validUntil: nowMs + 5 * 60 * 1000,
        maximumSizeInBytes: item.sizeBytes,
        allowedContentTypes: [response.contentType]
      })
    ).toString('base64url')}.fixture`
  );
  uploadUrl.searchParams.set(
    'vercel-blob-signature',
    'a'.repeat(43)
  );
  response.uploadUrl = uploadUrl.toString();
  assert.equal(
    validateMintResponse(
      response,
      hostId,
      item,
      storeId,
      nowMs
    ).pathname,
    '/api/blob/'
  );
  assert.throws(
    () =>
      validateMintResponse(
        {
          ...response,
          uploadUrl: response.uploadUrl.replace(
            'https://vercel.com/',
            'https://example.com/'
          )
        },
        hostId,
        item,
        storeId,
        nowMs
      ),
    /outside Vercel Blob/
  );
  assert.throws(
    () =>
      validateMintResponse(
        {
          ...response,
          uploadUrl: (() => {
            const wrongPath = new URL(response.uploadUrl);
            wrongPath.searchParams.set(
              'pathname',
              'openclaw-backups/v1/different-object.gpg'
            );
            return wrongPath.toString();
          })()
        },
        hostId,
        item,
        storeId,
        nowMs
      ),
    /outside Vercel Blob/
  );
}

async function testActualSdkPresignBoundary() {
  const nowMs = Date.now();
  const hostId = 'hetzner-openclaw-primary';
  const storeId = 'store_fixture01';
  const item = {
    filename: 'openclaw-backup.part-00000.gpg',
    setId: '20260727T120000Z-0123456789abcdef',
    sha256: 'b'.repeat(64),
    sizeBytes: 1000
  };
  const pathname = [
    'openclaw-backups/v1',
    hostId,
    item.setId,
    `${item.sha256}-${item.sizeBytes}`,
    item.filename
  ].join('/');
  const validUntil = nowMs + 5 * 60 * 1000;
  const delegationToken = `${Buffer.from(
    JSON.stringify({
      storeId,
      pathname,
      operations: ['put'],
      validUntil,
      maximumSizeInBytes: item.sizeBytes,
      allowedContentTypes: ['application/octet-stream']
    })
  ).toString('base64url')}.fixture`;
  const { presignedUrl } = await presignUrl(
    {
      delegationToken,
      clientSigningToken: 'fixture-client-signing-key'
    },
    {
      operation: 'put',
      pathname,
      access: 'private',
      validUntil,
      allowedContentTypes: ['application/octet-stream'],
      maximumSizeInBytes: item.sizeBytes,
      allowOverwrite: false,
      addRandomSuffix: false
    }
  );
  const parsed = new URL(presignedUrl);
  assert.equal(parsed.origin, 'https://vercel.com');
  assert.equal(parsed.pathname, '/api/blob/');
  assert.equal(
    validateMintResponse(
      {
        method: 'PUT',
        pathname,
        uploadUrl: presignedUrl,
        contentType: 'application/octet-stream',
        maximumSizeInBytes: item.sizeBytes,
        expiresAt: new Date(validUntil).toISOString()
      },
      hostId,
      item,
      storeId,
      nowMs
    ).href,
    presignedUrl
  );
  const headers = buildBlobPutHeaders(presignedUrl, item.sizeBytes);
  assert.equal(headers['content-type'], 'application/octet-stream');
  assert.equal(headers['content-length'], String(item.sizeBytes));
  assert.equal(headers['x-api-version'], BLOB_API_VERSION);
  assert.equal(headers['x-vercel-blob-store-id'], 'fixture01');
  assert.equal(headers['x-api-blob-request-attempt'], '0');
  assert.match(
    headers['x-api-blob-request-id'],
    /^fixture01:[0-9]+:[a-f0-9]{16}$/
  );
  assert.equal(headers['x-vercel-blob-access'], 'private');
  assert.equal(headers['x-content-type'], 'application/octet-stream');
}

function testArgumentAndEndpointGuardrails() {
  const options = parseUploadArgs(['/tmp/set']);
  assert.equal(options.execute, false);
  assert.equal(options.setDirectory, '/tmp/set');
  assert.throws(
    () =>
      validateIngestEndpoint(
        `https://backup.example.test${UPLOAD_URL_PATH}`
      ),
    /exact HTTPS/
  );
  assert.equal(
    validateIngestEndpoint(
      `https://openclaw-backup-ingest.vercel.app${UPLOAD_URL_PATH}`
    ).pathname,
    UPLOAD_URL_PATH
  );
  assert.throws(
    () =>
      validateIngestEndpoint(
        `http://backup.example.test${UPLOAD_URL_PATH}`
      ),
    /exact HTTPS/
  );
  assert.throws(
    () =>
      validateIngestEndpoint(
        `https://backup.example.test${UPLOAD_URL_PATH}?token=no`
      ),
    /exact HTTPS/
  );
  assert.equal(
    validateUploadHostId('hetzner-openclaw-primary'),
    'hetzner-openclaw-primary'
  );
  assert.equal(validateBlobStoreId('store_fixture01'), 'fixture01');
  assert.throws(() => validateUploadHostId('../host'), /invalid/);
}

async function testSecretFileBoundary() {
  const directory = await mkdtemp(
    join(tmpdir(), 'openclaw-backup-upload-contract-')
  );
  const secretPath = join(directory, 'ingest-hmac');
  try {
    const secret = 'a-secure-fixture-secret-with-at-least-32-bytes';
    await writeFile(secretPath, `${secret}\n`, { mode: 0o600 });
    assert.equal(await readIngestSecret(secretPath), secret);
    await chmod(secretPath, 0o644);
    await assert.rejects(
      () => readIngestSecret(secretPath),
      /permissions/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function testUploadPlanOrdering() {
  const root = await mkdtemp(
    join(tmpdir(), 'openclaw-backup-upload-plan-')
  );
  const setId = '20260727T120000Z-0123456789abcdef';
  const directory = join(root, setId);
  try {
    await mkdir(directory, { mode: 0o700 });
    const chunkName = 'openclaw-backup.part-00000.gpg';
    const chunk = Buffer.from('ciphertext');
    const encryptedManifestName = 'manifest.json.gpg';
    const encryptedManifest = Buffer.from('encrypted manifest');
    await writeFile(join(directory, chunkName), chunk, { mode: 0o600 });
    await writeFile(
      join(directory, encryptedManifestName),
      encryptedManifest,
      { mode: 0o600 }
    );
    const sha256 = (value) =>
      createHash('sha256').update(value).digest('hex');
    await writeFile(
      join(directory, 'manifest.json'),
      `${JSON.stringify({
        schema: 'openclaw-backup-manifest/v1',
        setId,
        completedAt: '2026-07-27T12:00:00.000Z',
        archive: 'tar',
        compression: 'zstd',
        encryption: 'openpgp-public-recipient',
        recipientFingerprint: 'A'.repeat(40),
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
          name: encryptedManifestName,
          bytes: encryptedManifest.length,
          sha256: sha256(encryptedManifest)
        }
      })}\n`,
      { mode: 0o600 }
    );

    const plan = await loadUploadPlan(directory);
    assert.deepEqual(
      plan.items.map((item) => item.filename),
      [chunkName, encryptedManifestName]
    );
    assert.equal(plan.items.at(-1).filename, encryptedManifestName);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `openclaw_backup_upload_contract_error: ${error.message}\n`
  );
  process.exitCode = 1;
});
