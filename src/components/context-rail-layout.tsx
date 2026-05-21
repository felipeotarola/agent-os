'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'overview_context_rail_open';

type ContextRailLayoutProps = {
  children: React.ReactNode;
  rail: React.ReactNode;
};

export function ContextRailLayout({ children, rail }: ContextRailLayoutProps) {
  const [open, setOpen] = React.useState(true);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setOpen(stored === 'true');
  }, []);

  const setPersistedOpen = React.useCallback((next: boolean) => {
    setOpen(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
  }, []);

  return (
    <section
      className={cn(
        'relative grid grid-cols-1 gap-4 transition-[grid-template-columns] duration-300 ease-out',
        open
          ? 'xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]'
          : 'xl:grid-cols-[minmax(0,1fr)_0px]'
      )}
      data-context-rail={open ? 'open' : 'closed'}
    >
      <div className='mb-1 flex justify-end xl:hidden'>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant='outline' size='sm' className='rounded-full'>
              Context rail
            </Button>
          </SheetTrigger>
          <SheetContent side='right' className='w-[min(92vw,380px)] overflow-y-auto p-4'>
            <SheetHeader className='sr-only'>
              <SheetTitle>Daily context rail</SheetTitle>
              <SheetDescription>Calendar, briefing, status and quick context.</SheetDescription>
            </SheetHeader>
            <div className='space-y-4 pb-6'>{rail}</div>
          </SheetContent>
        </Sheet>
      </div>

      {children}

      <aside
        className={cn(
          'hidden min-w-0 transition-all duration-300 ease-out xl:block xl:sticky xl:top-20 xl:self-start',
          open
            ? 'pointer-events-auto translate-x-0 opacity-100'
            : 'pointer-events-none translate-x-3 overflow-hidden opacity-0'
        )}
        aria-hidden={!open}
      >
        <div className='space-y-4'>{rail}</div>
      </aside>

      <Button
        type='button'
        variant='outline'
        size='sm'
        className={cn(
          'fixed right-3 top-24 z-30 hidden rounded-full border bg-background/90 px-3 shadow-sm backdrop-blur xl:inline-flex',
          open && 'right-[calc(360px+0.75rem)] 2xl:right-[calc(380px+0.75rem)]'
        )}
        onClick={() => setPersistedOpen(!open)}
        aria-pressed={open}
      >
        {open ? 'Hide context' : 'Context'}
      </Button>
    </section>
  );
}
