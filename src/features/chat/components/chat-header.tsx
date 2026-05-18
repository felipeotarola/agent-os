'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { ChatAgent } from '../utils/types';

interface ChatHeaderProps {
  agent: ChatAgent;
  isLoadingHistory: boolean;
}

export function ChatHeader({ agent, isLoadingHistory }: ChatHeaderProps) {
  return (
    <header className='border-b bg-background/95 px-4 py-3 backdrop-blur sm:px-6'>
      <div className='mx-auto flex max-w-4xl items-center justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-3'>
          <Avatar className='size-11 rounded-2xl border'>
            <AvatarFallback className='bg-primary/15 text-primary rounded-2xl font-semibold'>
              {agent.initials}
            </AvatarFallback>
          </Avatar>
          <div className='min-w-0'>
            <div className='flex items-center gap-2'>
              <h1 className='truncate text-base font-semibold sm:text-lg'>{agent.name}</h1>
              <span className='bg-primary size-2 rounded-full' aria-label='Online' />
            </div>
            <p className='text-muted-foreground truncate text-xs sm:text-sm'>{agent.role}</p>
          </div>
        </div>
        <Badge variant='outline' className='hidden rounded-full sm:inline-flex'>
          {isLoadingHistory ? 'Syncing' : 'MVP'}
        </Badge>
      </div>
    </header>
  );
}
