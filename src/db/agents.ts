import { bridgeRequest, hasBridge } from '@/lib/bridge';
import { z } from 'zod';

const openClawAgentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  identityName: z.string().optional(),
  identityEmoji: z.string().optional(),
  identitySource: z.string().optional(),
  workspace: z.string().optional(),
  agentDir: z.string().optional(),
  model: z.string().optional(),
  bindings: z.number().optional(),
  isDefault: z.boolean().optional(),
  displayName: z.string().optional(),
  routes: z
    .array(
      z.object({
        type: z.string(),
        agentId: z.string(),
        channel: z.string(),
        accountId: z.string().nullable(),
        peer: z.string().nullable()
      })
    )
    .optional()
});

const openClawAgentsSchema = z.object({
  agents: z.array(openClawAgentSchema),
  source: z.string(),
  bindingsSource: z.string().optional(),
  bindingsError: z.string().nullable().optional()
});

export type OpenClawAgent = z.infer<typeof openClawAgentSchema>;

const taskOwnerAgentSchema = z.object({
  id: z.string(),
  name: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  status: z.string().optional().nullable()
});

const taskOwnerAgentsSchema = z.object({
  agents: z.array(taskOwnerAgentSchema),
  source: z.string()
});

export type TaskOwnerAgent = z.infer<typeof taskOwnerAgentSchema>;

const fallbackAgents: OpenClawAgent[] = [
  {
    id: 'main',
    identityName: 'Cai',
    identityEmoji: '⚛️',
    model: 'openai-codex/gpt-5.5',
    workspace: '/root/.openclaw/workspace',
    isDefault: true
  }
];

const fallbackTaskOwnerAgents: TaskOwnerAgent[] = [
  { id: 'cai', name: 'Cai', role: 'Orchestrator', status: 'online' },
  { id: 'charles', name: 'Charles', role: 'Product/research', status: 'online' },
  { id: 'sladdis', name: 'Sladdis', role: 'QA agent', status: 'online' },
  { id: 'linda', name: 'Linda', role: 'Paper trading research', status: 'online' },
  { id: 'worker-pool', name: 'Worker pool', role: 'Implementation', status: 'online' }
];

export async function getOpenClawAgents() {
  if (hasBridge()) {
    try {
      const snapshot = openClawAgentsSchema.parse(await bridgeRequest('/agents'));
      return snapshot;
    } catch (error) {
      console.error('OpenClaw agents bridge request failed', error);
    }
  }

  return { agents: fallbackAgents, source: 'fallback', bindingsSource: 'unavailable' };
}

export async function getTaskOwnerAgents() {
  if (hasBridge()) {
    try {
      return taskOwnerAgentsSchema.parse(await bridgeRequest('/task-owner-agents'));
    } catch (error) {
      console.error('Task owner agents bridge request failed', error);
    }
  }

  return { agents: fallbackTaskOwnerAgents, source: 'fallback' };
}
