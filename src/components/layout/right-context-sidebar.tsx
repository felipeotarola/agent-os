'use client';

import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import * as React from 'react';

const STORAGE_KEY = 'agent-os:right-context-sidebar:open';

type RightContextContent = {
  title?: string;
  description?: string;
  content?: React.ReactNode;
};

type RightContextSidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  content: RightContextContent;
  setContent: (content: RightContextContent) => void;
};

const RightContextSidebarContext = React.createContext<RightContextSidebarContextValue | null>(
  null
);

function useRightContextSidebar() {
  const context = React.useContext(RightContextSidebarContext);
  if (!context) {
    throw new Error('useRightContextSidebar must be used within RightContextSidebarProvider.');
  }

  return context;
}

export function RightContextSidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpenState] = React.useState(true);
  const [openMobile, setOpenMobile] = React.useState(false);
  const [content, setContent] = React.useState<RightContextContent>({});
  const isMobile = useIsMobile();

  React.useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) setOpenState(stored === 'true');
  }, []);

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (isMobile) {
        setOpenMobile(nextOpen);
        return;
      }

      setOpenState(nextOpen);
      window.localStorage.setItem(STORAGE_KEY, String(nextOpen));
    },
    [isMobile]
  );

  const toggleOpen = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((current) => !current);
      return;
    }

    setOpenState((current) => {
      const next = !current;
      window.localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, [isMobile]);

  const value = React.useMemo<RightContextSidebarContextValue>(
    () => ({
      open,
      setOpen,
      toggleOpen,
      openMobile,
      setOpenMobile,
      content,
      setContent
    }),
    [content, open, openMobile, setOpen, toggleOpen]
  );

  return (
    <RightContextSidebarContext.Provider value={value}>
      {children}
    </RightContextSidebarContext.Provider>
  );
}

function DefaultRightContextContent() {
  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between gap-3'>
          <CardTitle className='text-base'>Page context</CardTitle>
          <Badge variant='outline'>Empty</Badge>
        </div>
        <CardDescription>
          No page-specific context has been configured for this view yet.
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3 text-sm text-muted-foreground'>
        <div className='flex items-start gap-3'>
          <Icons.info className='mt-0.5 size-4 shrink-0' />
          <p>Selected details, quick actions, and relevant notes will appear here.</p>
        </div>
        <Separator />
        <div className='flex flex-col gap-2'>
          <div className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
            Context slots
          </div>
          <ul className='flex flex-col gap-2'>
            <li>Selected row or entity details</li>
            <li>Page filters and saved views</li>
            <li>Relevant AI brief or next actions</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function RightContextSidebarBody() {
  const { content } = useRightContextSidebar();
  const title = content.title ?? 'Page rail';
  const description = content.description ?? 'Context for the current workspace';

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3'>
        <div className='min-w-0'>
          <div className='truncate text-sm font-semibold'>{title}</div>
          <div className='truncate text-xs text-muted-foreground'>{description}</div>
        </div>
        <Badge variant='secondary' className='shrink-0'>
          Context
        </Badge>
      </div>
      <div className='min-h-0 flex-1 overflow-y-auto p-3'>
        {content.content ?? <DefaultRightContextContent />}
      </div>
    </div>
  );
}

export function RightContextSidebarTrigger() {
  const { open, toggleOpen } = useRightContextSidebar();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-7'
          aria-label={open ? 'Collapse right context sidebar' : 'Open right context sidebar'}
          aria-pressed={open}
          onClick={toggleOpen}
        >
          <Icons.panelLeft className={cn('size-4 transition-transform', open && 'rotate-180')} />
          <span className='sr-only'>Toggle right context sidebar</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side='bottom'>Toggle page context</TooltipContent>
    </Tooltip>
  );
}

export function RightContextSidebarRegistration({
  title,
  description,
  children,
  defaultOpen
}: RightContextContent & {
  children?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const { setContent, setOpen } = useRightContextSidebar();

  React.useEffect(() => {
    setContent({
      title,
      description,
      content: children
    });

    if (defaultOpen !== undefined) {
      setOpen(defaultOpen);
    }

    return () => {
      setContent({});
    };
  }, [children, defaultOpen, description, setContent, setOpen, title]);

  return null;
}

export function RightContextSidebar() {
  const { open, openMobile, setOpenMobile } = useRightContextSidebar();

  return (
    <>
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent side='right' className='w-[min(92vw,24rem)] p-0'>
          <SheetHeader className='sr-only'>
            <SheetTitle>Page context</SheetTitle>
            <SheetDescription>Context for the current dashboard page.</SheetDescription>
          </SheetHeader>
          <RightContextSidebarBody />
        </SheetContent>
      </Sheet>

      <aside
        className={cn(
          'bg-sidebar text-sidebar-foreground hidden min-h-svh shrink-0 border-l transition-[width] duration-200 ease-linear xl:flex',
          open ? 'w-80 2xl:w-[22rem]' : 'w-12'
        )}
        data-state={open ? 'expanded' : 'collapsed'}
        data-side='right'
      >
        {open ? (
          <RightContextSidebarBody />
        ) : (
          <div className='flex h-svh w-full flex-col items-center gap-3 px-2 py-4'>
            <div className='flex flex-col items-center gap-1 text-[10px] font-semibold uppercase leading-none text-muted-foreground'>
              {'Rail'.split('').map((letter) => (
                <span key={letter}>{letter}</span>
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
