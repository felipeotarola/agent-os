'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

export type BuildActivitySnapshot = {
  generatedAt: string;
  connected: boolean;
  activeCount: number;
  activeVercelCount: number;
  localBuildCount: number;
  source: string;
  latest: {
    name: string;
    state: string;
    target: string | null;
    createdAt: string | null;
    url: string | null;
    inspectorUrl: string | null;
  } | null;
};

type BuildActivityIndicatorProps = {
  initial: BuildActivitySnapshot;
};

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`size-2 rounded-full ${ok ? 'bg-primary' : 'bg-muted-foreground'}`} />;
}

function timeLabel(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString('sv-SE', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function fetchBuildActivity() {
  const response = await fetch('/api/build-activity', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Build activity ${response.status}`);
  return (await response.json()) as BuildActivitySnapshot;
}

function useBuildActivity(initial: BuildActivitySnapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await fetchBuildActivity();
        if (!cancelled) {
          setSnapshot(next);
          setError(null);
        }
      } catch (refreshError) {
        if (!cancelled) {
          setError(refreshError instanceof Error ? refreshError.message : 'refresh failed');
        }
      }
    };

    const timer = window.setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return { snapshot, error };
}

export function BuildActivityResumeItem({ initial }: BuildActivityIndicatorProps) {
  const { snapshot, error } = useBuildActivity(initial);
  if (!snapshot.activeCount) return null;

  const href = snapshot.latest?.inspectorUrl ?? snapshot.latest?.url ?? '/dashboard/vercel';
  const isExternal = href.startsWith('http');

  return (
    <Link
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noreferrer' : undefined}
      className='mobile-feed-row group flex items-center gap-3 rounded-xl border border-primary/35 bg-primary/10 p-3 transition hover:border-primary/60 hover:bg-primary/15'
    >
      <span className='flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/15 text-card-foreground min-[390px]:size-9'>
        ▲
      </span>
      <span className='min-w-0 flex-1'>
        <span className='text-muted-foreground block text-[10px] uppercase tracking-wide'>
          Vercel build live
        </span>
        <span className='mt-0.5 block line-clamp-2 text-sm font-medium text-card-foreground min-[390px]:truncate'>
          {snapshot.activeCount} running · {snapshot.latest?.name ?? 'build activity'}
        </span>
        {error ? <span className='text-muted-foreground text-[10px]'>refresh degraded</span> : null}
      </span>
      <span className='hidden text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary min-[390px]:inline'>
        →
      </span>
    </Link>
  );
}

export function BuildActivityIndicator({ initial }: BuildActivityIndicatorProps) {
  const { snapshot, error } = useBuildActivity(initial);

  const activeCount = snapshot.activeCount;
  const connected = snapshot.connected && !error;
  const stateLabel = activeCount ? `${activeCount} running` : connected ? 'Idle' : 'Unavailable';
  const latest = snapshot.latest;

  return (
    <Card className='overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm'>
      <CardContent className='p-4 md:p-5'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0 space-y-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant={activeCount ? 'default' : 'outline'} className='gap-1.5'>
                <StatusDot ok={connected && activeCount > 0} />
                {activeCount ? 'BUILD LIVE' : 'BUILD IDLE'}
              </Badge>
              <span className='text-xs text-muted-foreground'>Auto-refreshes every 15s</span>
            </div>
            <div className='text-base font-semibold text-foreground'>{stateLabel}</div>
          </div>
          <Link
            href='/dashboard/vercel'
            className='shrink-0 text-xs font-medium text-primary hover:text-primary/80'
          >
            Vercel →
          </Link>
        </div>

        <div className='mt-3 grid grid-cols-3 gap-2 text-xs'>
          <div className='rounded-xl border border-border bg-muted/35 p-2'>
            <div className='text-muted-foreground'>Vercel</div>
            <div className='mt-1 font-mono text-sm text-foreground'>
              {snapshot.activeVercelCount}
            </div>
          </div>
          <div className='rounded-xl border border-border bg-muted/35 p-2'>
            <div className='text-muted-foreground'>Local</div>
            <div className='mt-1 font-mono text-sm text-foreground'>{snapshot.localBuildCount}</div>
          </div>
          <div className='rounded-xl border border-border bg-muted/35 p-2'>
            <div className='text-muted-foreground'>Checked</div>
            <div className='mt-1 truncate font-mono text-xs text-foreground'>
              {timeLabel(snapshot.generatedAt) ?? '—'}
            </div>
          </div>
        </div>

        {latest ? (
          <div className='mt-3 rounded-2xl border border-border bg-background/45 p-3'>
            <div className='flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted-foreground'>
              <span>{snapshot.activeVercelCount ? 'Current deployment' : 'Latest deployment'}</span>
              <span>{latest.state}</span>
            </div>
            <div className='mt-1 line-clamp-1 text-sm font-medium text-card-foreground'>
              {latest.name}
            </div>
            <div className='mt-1 truncate text-xs text-muted-foreground'>
              {latest.target ?? 'unknown target'} · {timeLabel(latest.createdAt) ?? 'no timestamp'}
            </div>
          </div>
        ) : (
          <div className='mt-3 rounded-2xl border border-dashed border-border p-3 text-sm text-muted-foreground'>
            {connected
              ? 'No recent deployments in the current Vercel snapshot.'
              : 'Connect Vercel read-only credentials to show deployment build activity.'}
          </div>
        )}

        {error ? (
          <div className='mt-2 text-xs text-muted-foreground'>Refresh failed: {error}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
