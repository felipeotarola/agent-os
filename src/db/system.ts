import { bridgeRequest, hasBridge } from '@/lib/bridge';

export type SystemStatus = {
  ok: boolean;
  bridge: { status: string; uptimeSeconds: number; now: string };
  db: { status: string };
  agents: { count: number; source: string };
  knowledge: { raw: number; queued: number; wikified: number };
  memory: {
    source: string;
    ok: boolean;
    agents: Array<{
      agentId: string;
      backend?: string;
      files?: number;
      chunks?: number;
      dirty?: boolean;
      sources?: string[];
    }>;
    error?: string;
  };
};

export type CommandResult = {
  command: string;
  startedAt: string;
  finishedAt: string;
  result: unknown;
};

export async function getSystemStatus(): Promise<SystemStatus> {
  if (!hasBridge()) {
    return {
      ok: false,
      bridge: { status: 'missing', uptimeSeconds: 0, now: new Date().toISOString() },
      db: { status: 'unknown' },
      agents: { count: 0, source: 'fallback' },
      knowledge: { raw: 0, queued: 0, wikified: 0 },
      memory: { source: 'fallback', ok: false, agents: [], error: 'Bridge saknas' }
    };
  }

  return bridgeRequest<SystemStatus>('/system/status');
}

export async function runCommand(command: string): Promise<CommandResult | null> {
  if (!command || !hasBridge()) return null;
  const params = new URLSearchParams({ command });
  return bridgeRequest<CommandResult>(`/commands/run?${params.toString()}`);
}
