import { bridgeRequest, hasBridge } from '@/lib/bridge';

export type VercelCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type VercelMetric = {
  label: string;
  value: string;
  detail: string;
};

export type VercelAlert = {
  severity: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
};

export type VercelProject = {
  id: string;
  name: string;
  framework: string | null;
  targets: string[];
  updatedAt: string | null;
};

export type VercelDeployment = {
  uid: string;
  name: string;
  url: string | null;
  state: string;
  target: string | null;
  createdAt: string | null;
};

export type VercelSnapshot = {
  contract: 'agent-os.vercel-observability.v1';
  source: string;
  generatedAt: string;
  configured: boolean;
  connected: boolean;
  account: { username: string; emailVisible: boolean } | null;
  projects: VercelProject[];
  deployments: VercelDeployment[];
  checks: VercelCheck[];
  metrics: VercelMetric[];
  alerts: VercelAlert[];
  nextSteps: string[];
};

const fallback: VercelSnapshot = {
  contract: 'agent-os.vercel-observability.v1',
  source: 'fallback',
  generatedAt: new Date().toISOString(),
  configured: false,
  connected: false,
  account: null,
  projects: [],
  deployments: [],
  checks: [
    {
      id: 'bridge',
      label: 'Bridge configured',
      ok: false,
      detail: 'AGENT_OS_BRIDGE_URL or AGENT_OS_BRIDGE_TOKEN missing'
    }
  ],
  metrics: [],
  alerts: [],
  nextSteps: ['Configure the Agent OS bridge before enabling Vercel observability.']
};

export async function getVercelSnapshot(): Promise<VercelSnapshot> {
  if (!hasBridge()) return fallback;
  try {
    return await bridgeRequest<VercelSnapshot>('/vercel/snapshot');
  } catch (error) {
    console.error('Vercel bridge request failed', error);
    return {
      ...fallback,
      source: 'bridge:error',
      configured: true,
      alerts: [
        {
          severity: 'warning',
          title: 'Vercel snapshot unavailable',
          detail: error instanceof Error ? error.message : 'unknown bridge error'
        }
      ],
      nextSteps: ['Check the Agent OS bridge logs and retry the Vercel snapshot.']
    };
  }
}
