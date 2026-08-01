'use client';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { Messenger } from './messenger';

export default function ChatViewPage({ agents }: { agents: import('../utils/types').ChatAgent[] }) {
  if (!agents.length) {
    return (
      <Card className='flex min-h-0 flex-1 items-center justify-center text-center'>
        <CardHeader className='w-full max-w-lg justify-items-center'>
          <CardTitle className='flex flex-col items-center gap-4'>
            <span className='bg-muted flex size-12 items-center justify-center rounded-xl'>
              <Icons.chat aria-hidden='true' className='text-muted-foreground size-5' />
            </span>
            <span>OpenClaw agents unavailable</span>
          </CardTitle>
          <CardDescription className='text-pretty'>
            Connect the Agent OS bridge to load the live agent registry. Chat stays intentionally
            empty until a real runtime is available.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-wrap justify-center gap-2'>
          <Button asChild>
            <Link href='/dashboard/settings'>Review connections</Link>
          </Button>
          <Button asChild variant='outline'>
            <Link href='/dashboard/credentials'>Open Credentials</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <Messenger agents={agents} />
    </div>
  );
}
