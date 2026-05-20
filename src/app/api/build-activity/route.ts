import { NextResponse } from 'next/server';
import { getVercelSnapshot, type VercelDeployment, type VercelSnapshot } from '@/db/vercel';
import { getCaiBriefing } from '@/lib/briefing';
import type { BuildActivitySnapshot } from '@/components/build-activity-indicator';

const activeVercelBuildStates = new Set(['BUILDING', 'QUEUED', 'INITIALIZING', 'DEPLOYING']);

function isActiveVercelBuild(deployment: VercelDeployment) {
  return activeVercelBuildStates.has(String(deployment.state).toUpperCase());
}

function localBuildRunCount(briefing: Awaited<ReturnType<typeof getCaiBriefing>>) {
  const recent = briefing.cockpit.subagents?.recent ?? [];
  return recent.filter(
    (run) =>
      ['queued', 'running', 'active'].includes(run.status) &&
      /\b(build|deploy|typecheck|lint|verify)\b/i.test(`${run.title} ${run.label}`)
  ).length;
}

function snapshotFrom(vercel: VercelSnapshot, localCount: number): BuildActivitySnapshot {
  const activeDeployments = vercel.deployments.filter(isActiveVercelBuild);
  const latest = activeDeployments[0] ?? vercel.deployments[0] ?? null;
  return {
    generatedAt: new Date().toISOString(),
    connected: vercel.connected,
    activeCount: activeDeployments.length + localCount,
    activeVercelCount: activeDeployments.length,
    localBuildCount: localCount,
    source: vercel.source,
    latest: latest
      ? {
          name: latest.name,
          state: latest.state,
          target: latest.target,
          createdAt: latest.createdAt
        }
      : null
  };
}

export async function GET() {
  const [vercel, briefing] = await Promise.all([getVercelSnapshot(), getCaiBriefing()]);
  return NextResponse.json(snapshotFrom(vercel, localBuildRunCount(briefing)), {
    headers: { 'Cache-Control': 'no-store' }
  });
}
