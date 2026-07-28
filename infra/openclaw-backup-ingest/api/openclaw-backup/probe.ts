import { BlobNotFoundError, head, put } from '@vercel/blob';
import {
  BACKUP_CONTENT_TYPE,
  ContractValidationError,
  MAX_PROBE_REQUEST_BODY_BYTES,
  REMOTE_PROBE_PATH,
  buildAuthorizationNoncePathname,
  isValidHostId,
  isValidIngestAuthority,
  parseRemoteProbeRequestBody,
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

  if (
    process.env.VERCEL_ENV !== 'production' ||
    !isValidHostId(allowedHostId) ||
    Buffer.byteLength(hmacSecret, 'utf8') < 32 ||
    Buffer.byteLength(hmacSecret, 'utf8') > 512 ||
    [...hmacSecret].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    }) ||
    !/^(?:store_)?[A-Za-z0-9_-]{8,128}$/.test(storeId)
  ) {
    throw new HttpError(503, 'service-not-configured', 'Backup probe is not configured.');
  }
  if (
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
    process.env.VERCEL_BLOB_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_BLOB_API_URL?.trim()
  ) {
    throw new HttpError(503, 'unsafe-blob-environment', 'Backup probe environment is unsafe.');
  }
  return { allowedHostId, hmacSecret, storeId };
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

async function readRawBody(request: Request): Promise<string> {
  const contentLength = request.headers.get('content-length') ?? '';
  if (!/^[1-9][0-9]{0,4}$/.test(contentLength)) {
    throw new HttpError(411, 'content-length-required', 'A bounded Content-Length is required.');
  }
  if (Number(contentLength) > MAX_PROBE_REQUEST_BODY_BYTES) {
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
      if (totalBytes > MAX_PROBE_REQUEST_BODY_BYTES) {
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

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const runners = Array.from(
    {
      length: Math.min(concurrency, values.length)
    },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(values[index]);
      }
    }
  );
  await Promise.all(runners);
}

export async function handleProbeRequest(
  request: Request,
  headBlob: typeof head = head,
  putBlob: typeof put = put
): Promise<Response> {
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
    if (pathname !== REMOTE_PROBE_PATH || hasQuery || !isValidIngestAuthority(authority)) {
      throw new HttpError(404, 'not-found', 'Route not found.');
    }
    if (request.headers.get('content-type') !== 'application/json') {
      throw new HttpError(415, 'invalid-content-type', 'Content-Type must be application/json.');
    }

    const environment = getRequiredEnvironment();
    const rawBody = await readRawBody(request);
    const hostId = request.headers.get('x-openclaw-backup-host-id') ?? '';
    const timestamp = request.headers.get('x-openclaw-backup-timestamp') ?? '';
    const nonce = request.headers.get('x-openclaw-backup-nonce') ?? '';
    const authResult = verifyCanonicalAuthRequest({
      method: request.method,
      pathname,
      authority,
      hostId,
      timestamp,
      nonce,
      rawBody,
      signature: request.headers.get('x-openclaw-backup-signature') ?? '',
      allowedHostId: environment.allowedHostId,
      secret: environment.hmacSecret,
      expectedPathname: REMOTE_PROBE_PATH
    });
    if (!authResult.ok) {
      throw new HttpError(401, 'unauthorized', 'Authentication failed.');
    }

    const { body, remoteObjects } = parseRemoteProbeRequestBody(rawBody, hostId);
    const noncePathname = buildAuthorizationNoncePathname(hostId, timestamp, nonce);
    try {
      await putBlob(noncePathname, `probe\n${body.setId}\n${body.objectRootSha256}\n`, {
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
    await mapWithConcurrency(remoteObjects, 8, async (object) => {
      let metadata;
      try {
        metadata = await headBlob(object.pathname, {
          storeId: environment.storeId,
          abortSignal: AbortSignal.timeout(8_000)
        });
      } catch (error) {
        if (error instanceof BlobNotFoundError) {
          throw new HttpError(
            404,
            'encrypted-object-set-incomplete',
            'One or more encrypted backup objects were not found.'
          );
        }
        throw error;
      }
      if (
        metadata.pathname !== object.pathname ||
        metadata.size !== object.sizeBytes ||
        metadata.contentType !== BACKUP_CONTENT_TYPE ||
        metadata.etag !== object.etag
      ) {
        throw new HttpError(
          502,
          'encrypted-object-mismatch',
          'Encrypted backup object metadata did not match.'
        );
      }
    });
    const totalBytes = remoteObjects.reduce((total, object) => total + object.sizeBytes, 0);

    return jsonResponse(200, {
      schema: 'openclaw-backup-remote-probe/v2',
      ok: true,
      checkedAt: new Date().toISOString(),
      hostId,
      setId: body.setId,
      objectCount: remoteObjects.length,
      totalBytes,
      objectRootSha256: body.objectRootSha256,
      completionMarker: remoteObjects.at(-1)?.pathname
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(error.status, {
        error: error.code,
        message: error.message
      });
    }
    if (error instanceof ContractValidationError) {
      return jsonResponse(400, {
        error: error.code,
        message: error.message
      });
    }
    return jsonResponse(502, {
      error: 'encrypted-object-set-probe-failed',
      message: 'Could not verify the encrypted backup object set.'
    });
  }
}

const probeFunction = {
  fetch: handleProbeRequest
};

export default probeFunction;
