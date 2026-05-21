'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';

export const CONTEXT_RAIL_TOGGLE_EVENT = 'agent-os:context-rail-toggle';

export function ContextRailHeaderTrigger() {
  const pathname = usePathname();
  const isOverview = pathname === '/dashboard/overview' || pathname === '/dashboard';

  if (!isOverview) return null;

  return (
    <Button
      type='button'
      data-context-rail-header-trigger
      variant='ghost'
      size='icon'
      className='size-7'
      onClick={() => window.dispatchEvent(new CustomEvent(CONTEXT_RAIL_TOGGLE_EVENT))}
    >
      <Icons.panelLeft className='size-4 rotate-180' />
      <span className='sr-only'>Toggle context rail</span>
    </Button>
  );
}
