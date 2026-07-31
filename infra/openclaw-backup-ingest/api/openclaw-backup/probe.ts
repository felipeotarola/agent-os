import {
  BlobAccessError,
  BlobError,
  BlobNotFoundError,
  BlobRequestAbortedError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobUnknownError,
  issueSignedToken,
  presignUrl,
  type HeadBlobResult
} from '@vercel/blob';
import {
  BACKUP_CONTENT_TYPE,
  ContractValidationError,
  MAX_PROBE_REQUEST_BODY_BYTES,
  REMOTE_PROBE_PATH,
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

type HeadBlob = (
  pathname: string,
  options: {
    storeId: string;
    abortSignal: AbortSignal;
  }
) => Promise<HeadBlobResult>;

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

function blobHeadFailure(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }
  if (error instanceof BlobNotFoundError) {
    return new HttpError(
      404,
      'encrypted-object-set-incomplete',
      'One or more encrypted backup objects were not found.'
    );
  }
  if (error instanceof BlobStoreSuspendedError) {
    return new HttpError(
      507,
      'blob-store-suspended',
      'The dedicated backup store is suspended or over quota.'
    );
  }
  if (error instanceof BlobServiceRateLimited) {
    return new HttpError(
      429,
      'blob-store-rate-limited',
      'The dedicated backup store rate limit was reached.'
    );
  }
  if (error instanceof BlobServiceNotAvailable) {
    return new HttpError(
      503,
      'blob-store-unavailable',
      'The dedicated backup store is temporarily unavailable.'
    );
  }
  if (
    error instanceof BlobRequestAbortedError ||
    (error instanceof DOMException &&
      (error.name === 'AbortError' || error.name === 'TimeoutError'))
  ) {
    return new HttpError(
      504,
      'blob-store-timeout',
      'The dedicated backup store did not answer in time.'
    );
  }
  if (error instanceof TypeError) {
    logBlobStageFailure('metadata', error);
    return new HttpError(
      503,
      'blob-metadata-type-error',
      'The dedicated backup store metadata request could not be completed.'
    );
  }
  if (error instanceof BlobAccessError) {
    return new HttpError(
      502,
      'blob-store-access-denied',
      'The backup probe identity cannot read metadata from the dedicated store.'
    );
  }
  if (error instanceof BlobStoreNotFoundError) {
    return new HttpError(
      502,
      'blob-store-not-found',
      'The configured dedicated backup store was not found.'
    );
  }
  if (error instanceof BlobUnknownError) {
    return new HttpError(
      502,
      'blob-store-unknown-error',
      'The dedicated backup store returned an unknown error.'
    );
  }
  if (error instanceof BlobError) {
    return new HttpError(
      502,
      'blob-store-request-rejected',
      'The dedicated backup store rejected the metadata request.'
    );
  }
  console.error(
    JSON.stringify({
      event: 'openclaw_backup_blob_head_failure',
      errorType: error instanceof Error ? error.constructor.name : typeof error
    })
  );
  return new HttpError(
    502,
    'encrypted-object-set-probe-failed',
    'Could not verify the encrypted backup object set.'
  );
}

function logBlobStageFailure(
  stage:
    | 'delegation'
    | 'presign'
    | 'delegation-validation'
    | 'object-head'
    | 'response-metadata'
    | 'metadata',
  error: unknown
): void {
  const cause =
    error instanceof Error && 'cause' in error && error.cause && typeof error.cause === 'object'
      ? error.cause
      : undefined;
  console.error(
    JSON.stringify({
      event: 'openclaw_backup_blob_stage_failure',
      stage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      causeType:
        cause && 'constructor' in cause && cause.constructor ? cause.constructor.name : undefined,
      causeCode: cause && 'code' in cause && typeof cause.code === 'string' ? cause.code : undefined
    })
  );
}

async function headPrivateBlobMetadata(
  pathname: string,
  options: {
    storeId: string;
    abortSignal: AbortSignal;
  }
): Promise<HeadBlobResult> {
  const validUntil = Date.now() + 30_000;
  let signedToken;
  try {
    signedToken = await issueSignedToken({
      storeId: options.storeId,
      pathname,
      operations: ['head'],
      validUntil,
      abortSignal: options.abortSignal
    });
  } catch (error) {
    logBlobStageFailure('delegation', error);
    if (error instanceof TypeError) {
      throw new HttpError(
        503,
        'blob-delegation-network-error',
        'The Blob service could not issue a bounded HEAD delegation.'
      );
    }
    throw error;
  }
  let presignedUrl;
  let parsedUrl;
  try {
    ({ presignedUrl } = await presignUrl(signedToken, {
      operation: 'head',
      pathname,
      access: 'private',
      validUntil
    }));
    parsedUrl = new URL(presignedUrl);
  } catch (error) {
    logBlobStageFailure('presign', error);
    if (error instanceof TypeError) {
      throw new HttpError(
        502,
        'blob-head-presign-error',
        'The bounded Blob HEAD delegation could not be presigned.'
      );
    }
    throw error;
  }
  try {
    const normalizedStoreId = options.storeId.replace(/^store_/, '').toLowerCase();
    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.port ||
      parsedUrl.hostname !== `${normalizedStoreId}.private.blob.vercel-storage.com` ||
      parsedUrl.pathname !== `/${pathname}` ||
      !parsedUrl.search
    ) {
      throw new HttpError(
        502,
        'blob-head-delegation-invalid',
        'The Blob service returned an invalid HEAD delegation.'
      );
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    logBlobStageFailure('delegation-validation', error);
    if (error instanceof TypeError) {
      throw new HttpError(
        502,
        'blob-head-delegation-validation-error',
        'The bounded Blob HEAD delegation could not be validated.'
      );
    }
    throw error;
  }

  let response;
  try {
    response = await fetch(presignedUrl, {
      method: 'HEAD',
      headers: {
        'accept-encoding': 'identity'
      },
      redirect: 'error',
      cache: 'no-store',
      signal: options.abortSignal
    });
  } catch (error) {
    logBlobStageFailure('object-head', error);
    if (error instanceof TypeError) {
      throw new HttpError(
        503,
        'blob-object-head-network-error',
        'The private Blob object host could not complete a bounded HEAD request.'
      );
    }
    throw error;
  }
  try {
    if (response.status === 404) {
      throw new BlobNotFoundError();
    }
    if (response.status === 401 || response.status === 403) {
      throw new BlobAccessError();
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new BlobServiceRateLimited(
        retryAfter && /^[0-9]{1,6}$/.test(retryAfter) ? Number(retryAfter) : undefined
      );
    }
    if (response.status >= 500) {
      throw new BlobServiceNotAvailable();
    }
    if (response.status !== 200) {
      throw new BlobUnknownError();
    }

    const contentLength = response.headers.get('content-length') ?? '';
    const contentType = response.headers.get('content-type') ?? '';
    const etag = response.headers.get('etag') ?? '';
    if (
      !/^[1-9][0-9]*$/.test(contentLength) ||
      !Number.isSafeInteger(Number(contentLength)) ||
      !contentType ||
      !etag
    ) {
      const headerNames: string[] = [];
      response.headers.forEach((_value, name) => {
        headerNames.push(name);
      });
      console.error(
        JSON.stringify({
          event: 'openclaw_backup_blob_head_metadata_incomplete',
          status: response.status,
          contentLengthPresent: Boolean(contentLength),
          contentLengthDecimal: /^[1-9][0-9]*$/.test(contentLength),
          contentLengthSafeInteger: Number.isSafeInteger(Number(contentLength)),
          contentTypePresent: Boolean(contentType),
          etagPresent: Boolean(etag),
          headerNames: headerNames.sort()
        })
      );
      throw new HttpError(
        502,
        'encrypted-object-metadata-invalid',
        'Encrypted backup object metadata was incomplete.'
      );
    }

    return {
      url: `${parsedUrl.origin}${parsedUrl.pathname}`,
      downloadUrl: `${parsedUrl.origin}${parsedUrl.pathname}?download=1`,
      pathname,
      size: Number(contentLength),
      uploadedAt: new Date(0),
      contentType,
      contentDisposition: response.headers.get('content-disposition') ?? '',
      cacheControl: response.headers.get('cache-control') ?? '',
      etag
    };
  } catch (error) {
    if (error instanceof HttpError || error instanceof BlobError) {
      throw error;
    }
    logBlobStageFailure('response-metadata', error);
    if (error instanceof TypeError) {
      throw new HttpError(
        502,
        'blob-head-response-metadata-error',
        'The private Blob HEAD response metadata could not be validated.'
      );
    }
    throw error;
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
  headBlob: HeadBlob = headPrivateBlobMetadata
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
    // This route is deliberately metadata-only. Its nonce remains bound into
    // the HMAC request and the five-minute freshness window, but is not stored
    // in Blob: a probe must still work when a completed store is write-blocked.
    // Replays can only repeat the same bounded exact HEAD checks; they cannot
    // mint write authority or create positive evidence without fresh matches.
    await mapWithConcurrency(remoteObjects, 8, async (object) => {
      let metadata;
      const abortController = new AbortController();
      const abortTimer = setTimeout(() => {
        abortController.abort();
      }, 8_000);
      try {
        metadata = await headBlob(object.pathname, {
          storeId: environment.storeId,
          abortSignal: abortController.signal
        });
      } catch (error) {
        throw blobHeadFailure(error);
      } finally {
        clearTimeout(abortTimer);
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
  fetch(request: Request): Promise<Response> {
    // Vercel supplies a runtime context as the second fetch argument. Keep the
    // test-only HeadBlob injection on handleProbeRequest out of that call
    // signature so the runtime context can never replace the metadata reader.
    return handleProbeRequest(request);
  }
};

export default probeFunction;
