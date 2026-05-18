'use client';

import { Messenger } from './messenger';

export default function ChatViewPage() {
  return (
    <div className='flex min-h-0 flex-1 flex-col gap-4'>
      <div className='space-y-1 px-1'>
        <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>Chat</h1>
        <p className='text-muted-foreground text-sm'>
          Mobile-first chat surface for Cai, Charles, and Sladdis.
        </p>
      </div>
      <Messenger />
    </div>
  );
}
