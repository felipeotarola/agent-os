'use client';

import { Messenger } from './messenger';

export default function ChatViewPage({ agents }: { agents: import('../utils/types').ChatAgent[] }) {
  return (
    <div className='flex min-h-0 flex-1 flex-col gap-4'>
      <div className='space-y-1 px-1'>
        <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>Chat</h1>
        <p className='text-muted-foreground text-sm'>
          Mobile-first chat surface backed by the live OpenClaw agent registry.
        </p>
      </div>
      <Messenger agents={agents} />
    </div>
  );
}
