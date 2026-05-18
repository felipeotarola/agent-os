'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type { AgentId, ChatAgent } from '../utils/types';

interface ConversationSelectProps {
  agents: ChatAgent[];
  selectedId: AgentId;
  onSelect: (id: AgentId) => void;
}

export function ConversationSelect({ agents, selectedId, onSelect }: ConversationSelectProps) {
  return (
    <div className='border-b bg-background/95 px-4 py-3 sm:hidden'>
      <label
        htmlFor='mobile-agent-select'
        className='text-muted-foreground mb-1 block text-xs font-medium'
      >
        Agent
      </label>
      <Select value={selectedId} onValueChange={(value) => onSelect(value as AgentId)}>
        <SelectTrigger id='mobile-agent-select' className='w-full rounded-xl bg-card'>
          <SelectValue placeholder='Choose an agent' />
        </SelectTrigger>
        <SelectContent>
          {agents.map((agent) => (
            <SelectItem key={agent.id} value={agent.id}>
              {agent.name} — {agent.role}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
