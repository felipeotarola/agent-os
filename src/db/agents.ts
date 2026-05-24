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
