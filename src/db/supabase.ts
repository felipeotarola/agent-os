import { bridgeRequest, hasBridge } from '@/lib/bridge';

export type SupabaseCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type SupabaseMetric = {
  label: string;
  value: string;
  detail: string;
};

export type SupabaseAlert = {
  severity: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
};

export type SupabaseProject = {
  ref: string;
  name: string;
  region: string | null;
  status: string;
  database?: { hostConfigured: boolean } | null;
  createdAt: string | null;
};

export type SupabaseSnapshot = {
  contract: 'agent-os.supabase-observability.v1';
  source: string;
  generatedAt: string;
  configured: boolean;
  connected: boolean;
  project: SupabaseProject | null;
  checks: SupabaseCheck[];
  metrics: SupabaseMetric[];
  alerts: SupabaseAlert[];
  nextSteps: string[];
};

const fallback: SupabaseSnapshot = {
  contract: 'agent-os.supabase-observability.v1',
  source: 'fallback',
  generatedAt: new Date().toISOString(),
  configured: false,
  connected: false,
  project: null,
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
  nextSteps: ['Configure the Agent OS bridge before enabling Supabase observability.']
};

export async function getSupabaseSnapshot(): Promise<SupabaseSnapshot> {
  if (!hasBridge()) return fallback;
  try {
    return await bridgeRequest<SupabaseSnapshot>('/supabase/snapshot');
  } catch (error) {
    console.error('Supabase bridge request failed', error);
    return {
      ...fallback,
      source: 'bridge:error',
      configured: true,
      alerts: [
        {
          severity: 'warning',
          title: 'Supabase snapshot unavailable',
          detail: error instanceof Error ? error.message : 'unknown bridge error'
        }
      ],
      nextSteps: ['Check the Agent OS bridge logs and retry the Supabase snapshot.']
    };
  }
}
