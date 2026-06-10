import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createQaReportClaim } from '@/features/qa-report/api/claims';
import { isQaReportVertical } from '@/features/qa-report/api/strategies';
import type { QaReportVertical } from '@/features/qa-report/api/types';

const createClaimSchema = z.object({
  vertical: z.string(),
  requestedByAgent: z.string().optional(),
  customerSlug: z.string().optional(),
  customerName: z.string().optional(),
  reportSlug: z.string().optional(),
  targetUrl: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
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

  const payload = createClaimSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success || !isQaReportVertical(payload.data.vertical)) {
    return NextResponse.json({ error: 'invalid-claim-request' }, { status: 400 });
  }

  const claim = await createQaReportClaim({
    ...payload.data,
    vertical: payload.data.vertical as QaReportVertical
  });
  const activationUrl = new URL('/qa-rapport/activate', request.url);
  activationUrl.searchParams.set('claim', claim.claimToken);

  return NextResponse.json(
    {
      claimToken: claim.claimToken,
      activationUrl: activationUrl.toString(),
      expiresAt: claim.expiresAt.toISOString()
    },
    { status: 201, headers: { 'cache-control': 'no-store' } }
  );
}
