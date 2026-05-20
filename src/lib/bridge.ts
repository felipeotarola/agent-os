const DEFAULT_BRIDGE_TIMEOUT_MS = 4000;
const DEFAULT_CACHE_KEY_PREFIX = 'bridge:';

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export type BridgeRequestInit = RequestInit & {
  timeoutMs?: number;
  cacheMs?: number;
  cacheKey?: string;
};

const responseCache = new Map<string, CacheEntry<unknown>>();

function bridgeConfig() {
  const url = process.env.AGENT_OS_BRIDGE_URL?.replace(/\/$/, '');
  const token = process.env.AGENT_OS_BRIDGE_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function cacheKeyFor(path: string, init: BridgeRequestInit) {
  return init.cacheKey ?? `${DEFAULT_CACHE_KEY_PREFIX}${init.method ?? 'GET'}:${path}`;
}

function methodAllowsCache(init: BridgeRequestInit) {
  return !init.method || init.method.toUpperCase() === 'GET';
}

function withTimeoutSignal(init: BridgeRequestInit) {
  const timeoutMs = init.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!init.signal) return timeoutSignal;
  return AbortSignal.any([init.signal, timeoutSignal]);
}

function normalizeBridgeError(error: unknown, path: string, timeoutMs: number) {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new Error(`Bridge request timed out after ${timeoutMs}ms: ${path}`);
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error(`Bridge request aborted: ${path}`);
  }
  return error;
}

export function hasBridge() {
  return Boolean(bridgeConfig());
}

export async function bridgeRequest<T>(path: string, init: BridgeRequestInit = {}): Promise<T> {
  const cacheMs = init.cacheMs ?? 0;
  const shouldCache = cacheMs > 0 && methodAllowsCache(init);
  const key = shouldCache ? cacheKeyFor(path, init) : null;

  if (key) {
    const cached = responseCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    responseCache.delete(key);
  }

  const response = await bridgeFetch(path, init);
  const value = (await response.json()) as T;

  if (key) {
    responseCache.set(key, { value, expiresAt: Date.now() + cacheMs });
  }

  return value;
}

export async function bridgeFetch(path: string, init: BridgeRequestInit = {}) {
  const config = bridgeConfig();
  if (!config) throw new Error('Agent OS bridge is not configured');

  const { timeoutMs: _timeoutMs, cacheMs: _cacheMs, cacheKey: _cacheKey, ...fetchInit } = init;

  try {
    const response = await fetch(`${config.url}${path}`, {
      ...fetchInit,
      headers: {
        authorization: `Bearer ${config.token}`,
        'content-type': 'application/json',
        ...fetchInit.headers
      },
      cache: 'no-store',
      signal: withTimeoutSignal(init)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Bridge request failed ${response.status}: ${body}`);
    }

    return response;
  } catch (error) {
    throw normalizeBridgeError(error, path, init.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS);
  }
}
