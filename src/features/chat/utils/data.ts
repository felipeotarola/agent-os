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
    role: 'QA agent',
    initials: 'SL',
    tone: 'Exploratory testing, test cases, checks, and concise QA reports'
  }
];

export const defaultWelcomeByAgent = {
  cai: 'Cai ready. Pick an agent, write the task, and I’ll route it through the chat API when the backend is available.',
  charles: 'Charles here. Give me the messy context and I’ll turn it into a strategy thread.',
  sladdis:
    'Sladdis online. Give me a link and I’ll explore it, suggest tests, run checks, and report findings.'
} satisfies Record<ChatAgent['id'], string>;
