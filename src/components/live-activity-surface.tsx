import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { SubagentRun, SubagentRunsSnapshot } from '@/db/queries';
import Link from 'next/link';

type LiveActivitySurfaceProps = {
  subagents?: SubagentRunsSnapshot | null;
  href?: string;
  className?: string;
  compact?: boolean;
};

function isActiveRun(run: SubagentRun) {
  return ['queued', 'running', 'active'].includes(run.status);
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

function ageLabel(ageMs?: number | null) {
  if (!Number.isFinite(ageMs ?? NaN)) return null;
  const minutes = Math.max(0, Math.round((ageMs ?? 0) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m active`;
  return `${Math.round(minutes / 60)}h active`;
}

function uniqueRuns(runs: SubagentRun[]) {
  const seen = new Set<string>();
  return runs.filter((run) => {
    const key = run.id || run.runId || run.sessionKey || run.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`size-2 rounded-full ${ok ? 'bg-primary' : 'bg-muted-foreground'}`} />;
}

function runKind(run: SubagentRun) {
  if (run.runtime === 'session') return run.agentId ? `${run.agentId} session` : 'session';
  return run.runtime || 'task run';
}

export function LiveActivitySurface({
  subagents,
  href = '/dashboard/agents',
  className = '',
  compact = false
}: LiveActivitySurfaceProps) {
  const recent = subagents?.recent ?? [];
  const activeSessions = subagents?.activeSessions ?? [];
  const activeRuns = uniqueRuns([
    ...recent.filter(isActiveRun),
    ...activeSessions.filter(isActiveRun)
  ]).slice(0, compact ? 2 : 3);
  const activeCount = subagents?.runningCount ?? activeRuns.length;
  const activeTaskRunCount =
    subagents?.activeTaskRunCount ?? activeRuns.filter((run) => run.runtime !== 'session').length;
  const activeSessionCount =
    subagents?.activeSessionCount ?? activeRuns.filter((run) => run.runtime === 'session').length;
  const latest = activeRuns[0] ?? recent[0] ?? null;
  const checkedAt = timeLabel(subagents?.checkedAt);
  const ok = Boolean(subagents?.ok);

  return (
    <Card className={`overflow-hidden border bg-card text-card-foreground shadow-sm ${className}`}>
      <CardContent className={compact ? 'p-3' : 'p-4 md:p-5'}>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0 space-y-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant={activeCount ? 'default' : 'outline'} className='gap-1.5'>
                <StatusDot ok={ok && activeCount > 0} />
                {activeCount ? 'LIVE WORK' : ok ? 'IDLE' : 'OFFLINE'}
              </Badge>
              <span className='text-xs text-muted-foreground'>OpenClaw activity</span>
            </div>
            <div className='text-base font-semibold text-foreground'>
              {activeCount
                ? `${activeCount} active ${activeCount === 1 ? 'run/session' : 'runs/sessions'}`
                : 'No active runs'}
            </div>
          </div>
          <Link
            href={href}
            className='shrink-0 text-xs font-medium text-primary hover:text-primary/80'
          >
            Open →
          </Link>
        </div>

        <div className='mt-3 grid grid-cols-3 gap-2 text-xs'>
          <div className='rounded-xl border border-border bg-muted/35 p-2'>
            <div className='text-muted-foreground'>Tasks</div>
            <div className='mt-1 font-mono text-sm text-foreground'>{activeTaskRunCount}</div>
          </div>
          <div className='rounded-xl border border-border bg-muted/35 p-2'>
            <div className='text-muted-foreground'>Sessions</div>
            <div className='mt-1 font-mono text-sm text-foreground'>{activeSessionCount}</div>
          </div>
          <div className='rounded-xl border border-border bg-muted/35 p-2'>
            <div className='text-muted-foreground'>Checked</div>
            <div className='mt-1 truncate font-mono text-xs text-foreground'>
              {checkedAt ?? '—'}
            </div>
          </div>
        </div>

        {latest ? (
          <div className='mt-3 rounded-2xl border border-border bg-background/45 p-3'>
            <div className='flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-muted-foreground'>
              <span>{activeCount ? 'Now running' : 'Latest activity'}</span>
              <span>{ageLabel(latest.ageMs) ?? timeLabel(latest.updatedAt) ?? latest.status}</span>
            </div>
            <div className='mt-1 line-clamp-2 text-sm font-medium text-card-foreground'>
              {latest.title || latest.label}
            </div>
            {!compact ? (
              <div className='mt-1 truncate text-xs text-muted-foreground'>
                {runKind(latest)} · {latest.status} ·{' '}
                {latest.ownerKey ?? latest.sessionKey ?? latest.runId ?? 'no id'}
              </div>
            ) : null}
          </div>
        ) : (
          <div className='mt-3 rounded-2xl border border-dashed border-border p-3 text-sm text-muted-foreground'>
            {ok
              ? 'Bridge is connected, but no recent task/session activity was reported.'
              : `Activity source unavailable: ${subagents?.error ?? 'missing bridge snapshot'}.`}
          </div>
        )}

        {!compact ? (
          <div className='mt-3 truncate font-mono text-[11px] text-muted-foreground'>
            source: {subagents?.source ?? 'missing'}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
