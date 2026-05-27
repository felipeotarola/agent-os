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
  isDefault: z.boolean().optional()
});

const openClawAgentsSchema = z.object({
  agents: z.array(openClawAgentSchema),
  source: z.string()
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

const lindaAgent: OpenClawAgent = {
  id: 'linda',
  name: 'Linda',
  identityName: 'Linda',
  identityEmoji: '📈',
  identitySource: 'workspace',
  model: 'openai-codex/gpt-5.5',
  workspace: '/root/.openclaw/agents/linda/workspace',
  agentDir: '/root/.openclaw/agents/linda',
  bindings: 1,
  isDefault: false
};

const fallbackAgents: OpenClawAgent[] = [
  {
    id: 'main',
    identityName: 'Cai',
    identityEmoji: '⚛️',
    model: 'openai-codex/gpt-5.5',
    workspace: '/root/.openclaw/workspace',
    isDefault: true
  },
  lindaAgent
];

const fallbackTaskOwnerAgents: TaskOwnerAgent[] = [
  { id: 'cai', name: 'Cai', role: 'Orchestrator', status: 'online' },
  { id: 'charles', name: 'Charles', role: 'Product/research', status: 'online' },
  { id: 'sladdis', name: 'Sladdis', role: 'Affiliate store operator', status: 'online' },
  { id: 'linda', name: 'Linda', role: 'Paper trading research', status: 'online' },
  { id: 'worker-pool', name: 'Worker pool', role: 'Implementation', status: 'online' }
];

function withLinda(agents: OpenClawAgent[]) {
  return agents.some((agent) => agent.id === 'linda' || agent.identityName === 'Linda')
    ? agents
    : [...agents, lindaAgent];
}

export async function getOpenClawAgents() {
  if (hasBridge()) {
    try {
      const snapshot = openClawAgentsSchema.parse(await bridgeRequest('/agents'));
      return { ...snapshot, agents: withLinda(snapshot.agents) };
    } catch (error) {
      console.error('OpenClaw agents bridge request failed', error);
    }
  }

  return { agents: withLinda(fallbackAgents), source: 'fallback' };
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
