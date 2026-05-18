import { bridgeRequest, hasBridge } from '@/lib/bridge';

export type SystemStatus = {
  ok: boolean;
  contract?: string;
  bridge: { status: string; version?: string; uptimeSeconds: number; now: string };
  db: { status: string; checkedAt?: string; error?: string | null };
  openclaw?: {
    available: boolean;
    status: string;
    version: string | null;
    source: string;
    error: string | null;
  };
  agents: { count: number; source: string };
  knowledge: {
    raw: number;
    queued: number;
    wikified: number;
    lifecycle?: {
      statuses: Record<string, number>;
      active: string[];
      planned: string[];
      flow: string;
      futureFlow: string;
    };
  };
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
    summary?: { agentCount: number; chunks: number; dirtyCount: number };
  };
  subagents?: {
    ok: boolean;
    source: string;
    available: boolean;
    runningCount: number;
    recent: Array<{
      id: string;
      label: string;
      title: string;
      status: string;
      startedAt: string | null;
      updatedAt: string | null;
      finishedAt: string | null;
    }>;
    error: string | null;
    checkedAt: string;
  };
  lastSync?: Record<string, string | null>;
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
      contract: 'agent-os.bridge.status.v1',
      bridge: {
        status: 'missing',
        version: undefined,
        uptimeSeconds: 0,
        now: new Date().toISOString()
      },
      db: { status: 'unknown' },
      openclaw: {
        available: false,
        status: 'unknown',
        version: null,
        source: 'fallback:no-bridge',
        error: 'Bridge saknas'
      },
      agents: { count: 0, source: 'fallback' },
      knowledge: { raw: 0, queued: 0, wikified: 0 },
      memory: { source: 'fallback', ok: false, agents: [], error: 'Bridge saknas' },
      subagents: {
        ok: false,
        source: 'fallback:no-bridge',
        available: false,
        runningCount: 0,
        recent: [],
        error: 'Bridge saknas',
        checkedAt: new Date().toISOString()
      },
      lastSync: {
        bridgeCheckedAt: null,
        openclawCheckedAt: null,
        subagentsCheckedAt: null,
        knowledgeUpdatedAt: null,
        memoryCheckedAt: null
      }
    };
  }

  return bridgeRequest<SystemStatus>('/system/status');
}

export async function runCommand(command: string): Promise<CommandResult | null> {
  if (!command || !hasBridge()) return null;
  const params = new URLSearchParams({ command });
  return bridgeRequest<CommandResult>(`/commands/run?${params.toString()}`);
}
