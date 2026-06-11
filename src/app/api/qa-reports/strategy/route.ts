import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildQaRuntimeSnapshot } from '@/features/qa-knowledge/api/runtime';
import { isQaReportVertical } from '@/features/qa-report/api/strategies';
import type { QaReportVertical } from '@/features/qa-report/api/types';

const strategyRequestSchema = z.object({
  targetUrl: z.string().url().optional(),
  customerSlug: z.string().optional(),
  requestedVertical: z.string().optional(),
  requestText: z.string().optional()
});

function activationSecretConfigured() {
  return Boolean(process.env.SLADDIS_QA_ACTIVATION_SECRET?.trim());
}

function hasActivationSecret(request: NextRequest) {
  const expected = process.env.SLADDIS_QA_ACTIVATION_SECRET?.trim();
  if (!expected) return true;
  return request.headers.get('authorization') === `Bearer ${expected}`;
}

export async function POST(request: NextRequest) {
  if (activationSecretConfigured() && !hasActivationSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const payload = strategyRequestSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json(
      {
        error: 'invalid-strategy-request',
        issues: payload.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message
        }))
      },
      { status: 400 }
    );
  }

  if (
    typeof payload.data.requestedVertical === 'string' &&
    !isQaReportVertical(payload.data.requestedVertical)
  ) {
    return NextResponse.json(
      {
        error: 'invalid-strategy-request',
        issues: [
          {
            path: 'requestedVertical',
            code: 'invalid_value',
            message: 'Unsupported QA report vertical.'
          }
        ]
      },
      { status: 400 }
    );
  }

  const snapshot = await buildQaRuntimeSnapshot({
    ...payload.data,
    requestedVertical: payload.data.requestedVertical as QaReportVertical | undefined
  });

  return NextResponse.json(snapshot, { headers: { 'cache-control': 'no-store' } });
}
