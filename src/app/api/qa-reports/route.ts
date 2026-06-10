import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { upsertPersistedQaReport, verifyQaWriterToken } from '@/features/qa-report/api/persistence';
import { isQaReportVertical } from '@/features/qa-report/api/strategies';
import type { QaReport } from '@/features/qa-report/api/types';
import { readBearerToken } from '@/lib/qa-report-tokens';

const qaReportSchema = z.object({
  vertical: z.string(),
  customerSlug: z.string().min(1),
  customerName: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  targetUrl: z.string().url(),
  generatedAt: z.string(),
  agentName: z.string().min(1),
  reportType: z.string().min(1),
  executiveSummary: z.string(),
  score: z.number().int().min(0).max(100),
  verdict: z.string(),
  scope: z.array(z.string()),
  metrics: z.array(z.unknown()),
  environment: z.array(z.unknown()),
  coverage: z.array(z.unknown()),
  timeline: z.array(z.unknown()),
  risks: z.array(z.unknown()),
  evidence: z.array(z.unknown()),
  findings: z.array(z.unknown()),
  suggestedTests: z.array(z.unknown()),
  nextRun: z.array(z.string())
});

export async function POST(request: NextRequest) {
  const token = readBearerToken(request.headers.get('authorization'));
  const writerToken = token ? await verifyQaWriterToken(token) : null;
  if (!writerToken) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const payload = qaReportSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success || !isQaReportVertical(payload.data.vertical)) {
    return NextResponse.json({ error: 'invalid-report' }, { status: 400 });
  }

  const report = payload.data as QaReport;
  const scope = writerToken.scope;
  if (
    (typeof scope.vertical === 'string' && scope.vertical !== report.vertical) ||
    (typeof scope.customerSlug === 'string' && scope.customerSlug !== report.customerSlug) ||
    (typeof scope.reportSlug === 'string' && scope.reportSlug !== report.slug)
  ) {
    return NextResponse.json({ error: 'token-scope-mismatch' }, { status: 403 });
  }

  await upsertPersistedQaReport(report);

  const reportUrl = `/qa-rapport/${report.vertical}/${report.customerSlug}/${report.slug}`;
  return NextResponse.json(
    { reportUrl },
    { status: 201, headers: { 'cache-control': 'no-store' } }
  );
}
