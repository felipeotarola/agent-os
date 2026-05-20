import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { z } from 'zod';

const memoryAgentSchema = z.object({
  agentId: z.string(),
  backend: z.string().optional(),
  files: z.number().optional(),
  chunks: z.number().optional(),
  dirty: z.boolean().optional(),
  sources: z.array(z.string()).optional()
});

const subagentRunSchema = z.object({
  id: z.string(),
  label: z.string(),
  title: z.string(),
  status: z.string(),
  startedAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  runtime: z.string().optional(),
  agentId: z.string().nullable().optional()
});

const systemStatusSchema = z.object({
  ok: z.boolean(),
  contract: z.string().optional(),
  bridge: z.object({
    status: z.string(),
    version: z.string().optional(),
    uptimeSeconds: z.number(),
    now: z.string()
  }),
  db: z.object({
    status: z.string(),
    checkedAt: z.string().optional(),
    error: z.string().nullable().optional()
  }),
  openclaw: z
    .object({
      available: z.boolean(),
      status: z.string(),
      version: z.string().nullable(),
      source: z.string(),
      error: z.string().nullable()
    })
    .optional(),
  agents: z.object({ count: z.number(), source: z.string() }),
  knowledge: z.object({
    raw: z.number(),
    queued: z.number(),
    wikified: z.number(),
    lifecycle: z
      .object({
        statuses: z.record(z.string(), z.number()),
        active: z.array(z.string()),
        planned: z.array(z.string()),
        flow: z.string(),
        futureFlow: z.string()
      })
      .optional()
  }),
  memory: z.object({
    source: z.string(),
    ok: z.boolean(),
    agents: z.array(memoryAgentSchema),
    error: z.string().optional(),
    summary: z
      .object({ agentCount: z.number(), chunks: z.number(), dirtyCount: z.number() })
      .optional()
  }),
  subagents: z
    .object({
      ok: z.boolean(),
      source: z.string(),
      available: z.boolean(),
      runningCount: z.number(),
      activeTaskRunCount: z.number().optional(),
      activeSessionCount: z.number().optional(),
      recent: z.array(subagentRunSchema),
      activeSessions: z.array(subagentRunSchema).optional(),
      error: z.string().nullable(),
      checkedAt: z.string()
    })
    .optional(),
  lastSync: z.record(z.string(), z.string().nullable()).optional()
});

const commandResultSchema = z.object({
  command: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  result: z.unknown()
});

export type SystemStatus = z.infer<typeof systemStatusSchema>;
export type CommandResult = z.infer<typeof commandResultSchema>;

function fallbackSystemStatus(error = 'Bridge saknas'): SystemStatus {
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
      error
    },
    agents: { count: 0, source: 'fallback' },
    knowledge: { raw: 0, queued: 0, wikified: 0 },
    memory: { source: 'fallback', ok: false, agents: [], error },
    subagents: {
      ok: false,
      source: 'fallback:no-bridge',
      available: false,
      runningCount: 0,
      activeTaskRunCount: 0,
      activeSessionCount: 0,
      recent: [],
      activeSessions: [],
      error,
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

export async function getSystemStatus(): Promise<SystemStatus> {
  if (!hasBridge()) return fallbackSystemStatus();

  try {
    return systemStatusSchema.parse(
      await bridgeRequest('/system/status', { cacheMs: 5000, timeoutMs: 2500 })
    );
  } catch (error) {
    console.error('System status bridge request failed', error);
    return fallbackSystemStatus('Bridge status parse/request failed');
  }
}

export async function runCommand(command: string): Promise<CommandResult | null> {
  if (!command || !hasBridge()) return null;
  const params = new URLSearchParams({ command });
  return commandResultSchema.parse(await bridgeRequest(`/commands/run?${params.toString()}`));
}
