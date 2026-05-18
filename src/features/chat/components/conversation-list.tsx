'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AgentId, ChatAgent, ChatMessage } from '../utils/types';

interface ConversationListProps {
  agents: ChatAgent[];
  selectedId: AgentId;
  messagesByAgent: Record<AgentId, ChatMessage[]>;
  onSelect: (id: AgentId) => void;
}

export function ConversationList({
  agents,
  selectedId,
  messagesByAgent,
  onSelect
}: ConversationListProps) {
  return (
    <aside className='hidden min-h-0 w-80 shrink-0 border-r bg-card/40 sm:flex sm:flex-col'>
      <div className='border-b p-4'>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <p className='text-sm font-semibold'>Agent chat</p>
            <p className='text-muted-foreground text-xs'>Cai · Charles · Sladdis</p>
          </div>
          <Badge variant='outline' className='rounded-full'>
            Live API
          </Badge>
        </div>
      </div>
      <div className='min-h-0 flex-1 space-y-2 overflow-y-auto p-3' role='list' aria-label='Agents'>
        {agents.map((agent) => {
          const isActive = agent.id === selectedId;
          const lastMessage = messagesByAgent[agent.id].at(-1);

          return (
            <button
              key={agent.id}
              type='button'
              onClick={() => onSelect(agent.id)}
              className={cn(
                'focus-visible:ring-ring flex w-full gap-3 rounded-2xl border p-3 text-left transition hover:bg-muted/60 focus-visible:ring-2 focus-visible:outline-none',
                isActive ? 'border-primary/40 bg-primary/10' : 'border-transparent bg-background/60'
              )}
              aria-current={isActive ? 'true' : undefined}
              role='listitem'
            >
              <Avatar className='size-10 rounded-2xl border'>
                <AvatarFallback className='rounded-2xl'>{agent.initials}</AvatarFallback>
              </Avatar>
              <div className='min-w-0 flex-1'>
                <div className='flex items-center justify-between gap-2'>
                  <p className='truncate text-sm font-medium'>{agent.name}</p>
                  <span className='bg-primary size-2 rounded-full' />
                </div>
                <p className='text-muted-foreground truncate text-xs'>{agent.tone}</p>
                {lastMessage ? (
                  <p className='text-muted-foreground mt-1 line-clamp-2 text-xs'>
                    {lastMessage.content}
                  </p>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
