export const agentOsCaiSessionKey = 'session:dashboard-cai-copilot';

export const chatAgentSessionKeys = {
  cai: agentOsCaiSessionKey,
  charles: 'agent:charles:main',
  sladdis: 'agent:sladdis:main'
} as const;

export type ChatAgentId = keyof typeof chatAgentSessionKeys;
