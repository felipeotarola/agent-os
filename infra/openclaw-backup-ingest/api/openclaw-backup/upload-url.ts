import { issueSignedToken, presignUrl, put } from '@vercel/blob';
import {
  BACKUP_CONTENT_TYPE,
  ContractValidationError,
  MAX_REQUEST_BODY_BYTES,
  PRESIGNED_URL_LIFETIME_MS,
  UPLOAD_URL_PATH,
  buildAuthorizationNoncePathname,
  buildPrivateBackupPathname,
  isValidHostId,
  isValidIngestAuthority,
  parseUploadUrlRequestBody,
  verifyCanonicalAuthRequest
} from '../../src/contract.js';

interface RouteEnvironment {
  allowedHostId: string;
  hmacSecret: string;
  storeId: string;
}

class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;

  public constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

function getRequiredEnvironment(): RouteEnvironment {
  const allowedHostId = process.env.OPENCLAW_BACKUP_ALLOWED_HOST_ID?.trim() ?? '';
  const hmacSecret = process.env.OPENCLAW_BACKUP_INGEST_HMAC_SECRET ?? '';
  const storeId = process.env.OPENCLAW_BACKUP_BLOB_STORE_ID?.trim() ?? '';

  if (!allowedHostId || !hmacSecret || !storeId) {
    throw new HttpError(503, 'service-not-configured', 'Backup ingest is not configured.');
  }
  if (process.env.VERCEL_ENV !== 'production') {
    throw new HttpError(
      503,
      'production-only',
      'Backup ingest is available only in the production deployment.'
    );
  }
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    throw new HttpError(
      503,
      'static-blob-credential-forbidden',
      'Static Blob credentials are forbidden for backup ingest.'
    );
  }
  if (
    process.env.VERCEL_BLOB_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL?.trim()
  ) {
    throw new HttpError(
      503,
      'blob-api-override-forbidden',
      'Blob API origin overrides are forbidden.'
    );
  }
  if (
    !isValidHostId(allowedHostId) ||
    Buffer.byteLength(hmacSecret, 'utf8') < 32 ||
    Buffer.byteLength(hmacSecret, 'utf8') > 512 ||
    [...hmacSecret].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    })
  ) {
    throw new HttpError(503, 'invalid-auth-config', 'Backup ingest auth is not configured.');
  }
  if (!/^(?:store_)?[A-Za-z0-9_-]{8,128}$/.test(storeId)) {
    throw new HttpError(503, 'invalid-store-id', 'Backup ingest store is not configured.');
  }
  return { allowedHostId, hmacSecret, storeId };
}

function getSingleHeader(request: Request, name: string): string {
  return request.headers.get(name) ?? '';
}

async function readRawBody(request: Request): Promise<string> {
  const contentLength = getSingleHeader(request, 'content-length');
  if (!/^[1-9][0-9]{0,3}$/.test(contentLength)) {
    throw new HttpError(411, 'content-length-required', 'A bounded Content-Length is required.');
  }
  if (Number(contentLength) > MAX_REQUEST_BODY_BYTES) {
    throw new HttpError(413, 'body-too-large', 'Request body is too large.');
  }

  if (!request.body) {
    throw new HttpError(400, 'body-required', 'A request body is required.');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, 'body-too-large', 'Request body is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (totalBytes !== Number(contentLength)) {
    throw new HttpError(400, 'content-length-mismatch', 'Content-Length does not match body.');
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'content-security-policy': "default-src 'none'",
      'x-content-type-options': 'nosniff'
    }
  });
}

function requestTarget(request: Request): {
  authority: string;
  pathname: string;
  hasQuery: boolean;
} {
  const parsed = new URL(request.url);
  return {
    authority: parsed.host,
    pathname: parsed.pathname,
    hasQuery: parsed.search.length > 0
  };
}

async function handleRequest(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      const response = jsonResponse(405, {
        error: 'method-not-allowed',
        message: 'Only POST is allowed.'
      });
      response.headers.set('allow', 'POST');
      return response;
    }

    const { authority, pathname, hasQuery } = requestTarget(request);
    if (pathname !== UPLOAD_URL_PATH || hasQuery || !isValidIngestAuthority(authority)) {
      throw new HttpError(404, 'not-found', 'Route not found.');
    }
    if (getSingleHeader(request, 'content-type') !== 'application/json') {
      throw new HttpError(415, 'invalid-content-type', 'Content-Type must be application/json.');
    }

    const environment = getRequiredEnvironment();
    const rawBody = await readRawBody(request);
    const hostId = getSingleHeader(request, 'x-openclaw-backup-host-id');
    const timestamp = getSingleHeader(request, 'x-openclaw-backup-timestamp');
    const nonce = getSingleHeader(request, 'x-openclaw-backup-nonce');
    const signature = getSingleHeader(request, 'x-openclaw-backup-signature');
    const authResult = verifyCanonicalAuthRequest({
      method: request.method,
      pathname,
      authority,
      hostId,
      timestamp,
      nonce,
      rawBody,
      signature,
      allowedHostId: environment.allowedHostId,
      secret: environment.hmacSecret
    });
    if (!authResult.ok) {
      throw new HttpError(401, 'unauthorized', 'Authentication failed.');
    }

    const body = parseUploadUrlRequestBody(rawBody);
    const noncePathname = buildAuthorizationNoncePathname(hostId, timestamp, nonce);
    try {
      await put(noncePathname, `${body.setId}\n${body.sha256}\n`, {
        access: 'private',
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: 60,
        contentType: 'text/plain; charset=utf-8',
        storeId: environment.storeId
      });
    } catch {
      throw new HttpError(
        409,
        'authorization-replayed-or-unavailable',
        'Authorization nonce could not be consumed.'
      );
    }
    const blobPathname = buildPrivateBackupPathname(hostId, body);
    const validUntil = Date.now() + PRESIGNED_URL_LIFETIME_MS;
    const signedToken = await issueSignedToken({
      storeId: environment.storeId,
      pathname: blobPathname,
      operations: ['put'],
      validUntil,
      allowedContentTypes: [BACKUP_CONTENT_TYPE],
      maximumSizeInBytes: body.sizeBytes
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      operation: 'put',
      pathname: blobPathname,
      access: 'private',
      validUntil,
      allowedContentTypes: [BACKUP_CONTENT_TYPE],
      maximumSizeInBytes: body.sizeBytes,
      allowOverwrite: false,
      addRandomSuffix: false
    });

    return jsonResponse(200, {
      method: 'PUT',
      pathname: blobPathname,
      uploadUrl: presignedUrl,
      contentType: BACKUP_CONTENT_TYPE,
      maximumSizeInBytes: body.sizeBytes,
      expiresAt: new Date(validUntil).toISOString()
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(error.status, { error: error.code, message: error.message });
    }
    if (error instanceof ContractValidationError) {
      return jsonResponse(400, { error: error.code, message: error.message });
    }
    return jsonResponse(502, {
      error: 'upload-url-mint-failed',
      message: 'Could not create upload authorization.'
    });
  }
}

const uploadUrlFunction = {
  fetch: handleRequest
};

export default uploadUrlFunction;
