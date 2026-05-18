import type { ChatAgent } from './types';

export const chatAgents: ChatAgent[] = [
  {
    id: 'cai',
    name: 'Cai',
    role: 'Main operator',
    initials: 'CA',
    tone: 'Direct, practical, workspace-aware'
  },
  {
    id: 'charles',
    name: 'Charles',
    role: 'Strategy agent',
    initials: 'CH',
    tone: 'Career, positioning, and business thinking'
  },
  {
    id: 'sladdis',
    name: 'Sladdis',
    role: 'Playful companion',
    initials: 'SL',
    tone: 'Lightweight help, ideas, and small tasks'
  }
];

export const defaultWelcomeByAgent = {
  cai: 'Cai ready. Pick an agent, write the task, and I’ll route it through the chat API when the backend is available.',
  charles: 'Charles here. Give me the messy context and I’ll turn it into a strategy thread.',
  sladdis: 'Sladdis online. Small chaos accepted, preferably with snacks.'
} satisfies Record<ChatAgent['id'], string>;
