function bridgeConfig() {
  const url = process.env.AGENT_OS_BRIDGE_URL?.replace(/\/$/, '');
  const token = process.env.AGENT_OS_BRIDGE_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export function hasBridge() {
  return Boolean(bridgeConfig());
}

export async function bridgeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = bridgeConfig();
  if (!config) throw new Error('Agent OS bridge is not configured');

  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {})
    },
    cache: 'no-store'
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bridge request failed ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}
