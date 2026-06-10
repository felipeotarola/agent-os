import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createQaReportClaim } from '@/features/qa-report/api/claims';
import { isQaReportVertical } from '@/features/qa-report/api/strategies';
import type { QaReportVertical } from '@/features/qa-report/api/types';

const createClaimSchema = z.object({
  vertical: z.string(),
  requestedByAgent: z.string().optional(),
  requester: z.string().optional(),
  customerSlug: z.string().optional(),
  customerName: z.string().optional(),
  reportSlug: z.string().optional(),
  targetUrl: z.string().url().optional(),
  reportTitle: z.string().optional(),
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
    return NextResponse.json(
      {
        error: 'invalid-claim-request',
        details: payload.success
          ? [{ path: ['vertical'], message: 'Unsupported QA report vertical.' }]
          : payload.error.issues.map((issue) => ({
              path: issue.path,
              message: issue.message
            }))
      },
      { status: 400 }
    );
  }

  const { requester, reportTitle, metadata, ...claimInput } = payload.data;
  let claim;
  try {
    claim = await createQaReportClaim({
      ...claimInput,
      requestedByAgent: claimInput.requestedByAgent ?? requester,
      vertical: payload.data.vertical as QaReportVertical,
      metadata: {
        ...metadata,
        ...(reportTitle ? { reportTitle } : {})
      }
    });
  } catch (error) {
    console.error('Failed to create QA report claim', error);
    return NextResponse.json({ error: 'claim-storage-unavailable' }, { status: 503 });
  }

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
