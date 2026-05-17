import { bridgeRequest, hasBridge } from '@/lib/bridge';

export type OpenClawAgent = {
  id: string;
  name?: string;
  identityName?: string;
  identityEmoji?: string;
  identitySource?: string;
  workspace?: string;
  agentDir?: string;
  model?: string;
  bindings?: number;
  isDefault?: boolean;
};

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
      const result = await bridgeRequest<{ agents: OpenClawAgent[]; source: string }>('/agents');
      return result;
    } catch (error) {
      console.error('OpenClaw agents bridge request failed', error);
    }
  }

  return { agents: fallbackAgents, source: 'fallback' };
}
