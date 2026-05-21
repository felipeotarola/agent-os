'use client';

import * as React from 'react';
import { Icons } from '@/components/icons';
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
        'relative grid grid-cols-1 gap-4 transition-[grid-template-columns] duration-300 ease-linear',
        open
          ? 'xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_380px]'
          : 'xl:grid-cols-[minmax(0,1fr)_3rem]'
      )}
      data-context-rail={open ? 'open' : 'closed'}
    >
      <div className='mb-1 flex justify-end xl:hidden'>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant='outline' size='sm' className='rounded-full'>
              <Icons.panelLeft className='mr-1.5 size-4 rotate-180' />
              Context
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

      <aside className='hidden min-w-0 xl:sticky xl:top-20 xl:block xl:self-start'>
        <div
          className={cn(
            'relative min-h-0 transition-all duration-300 ease-linear',
            open ? 'w-full' : 'w-12'
          )}
          data-state={open ? 'expanded' : 'collapsed'}
          data-side='right'
        >
          <button
            type='button'
            aria-label={open ? 'Hide context rail' : 'Open context rail'}
            title={open ? 'Hide context rail' : 'Open context rail'}
            onClick={() => setPersistedOpen(!open)}
            className={cn(
              'hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] xl:flex',
              open ? '-left-2 cursor-e-resize' : '-left-2 cursor-w-resize'
            )}
          />

          {open ? (
            <div className='space-y-3'>
              <div className='flex items-center justify-between gap-2 rounded-2xl border bg-sidebar px-3 py-2 text-sidebar-foreground shadow-sm'>
                <div className='flex min-w-0 items-center gap-2 text-sm font-medium'>
                  <Icons.panelLeft className='size-4 rotate-180' />
                  <span>Context</span>
                </div>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='size-7'
                  onClick={() => setPersistedOpen(false)}
                  aria-pressed={open}
                >
                  <Icons.chevronsRight className='size-4' />
                  <span className='sr-only'>Hide context</span>
                </Button>
              </div>
              <div className='space-y-4'>{rail}</div>
            </div>
          ) : (
            <div className='flex min-h-[calc(100svh-6rem)] w-12 flex-col items-center gap-2 rounded-2xl border bg-sidebar p-2 text-sidebar-foreground shadow-sm'>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='size-8'
                onClick={() => setPersistedOpen(true)}
                aria-pressed={open}
              >
                <Icons.panelLeft className='size-4 rotate-180' />
                <span className='sr-only'>Open context</span>
              </Button>
              <div className='h-px w-6 bg-sidebar-border' />
              <div className='mt-1 flex flex-1 items-start justify-center'>
                <div className='rotate-90 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.25em] text-sidebar-foreground/70'>
                  Context
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}
