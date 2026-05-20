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

export async function getOpenClawAgents() {
  if (hasBridge()) {
    try {
      return openClawAgentsSchema.parse(await bridgeRequest('/agents'));
    } catch (error) {
      console.error('OpenClaw agents bridge request failed', error);
    }
  }

  return { agents: fallbackAgents, source: 'fallback' };
}
