import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { exchangeQaReportClaim } from '@/features/qa-report/api/claims';

const exchangeSchema = z.object({
  claimToken: z.string().min(20)
});

export async function POST(request: NextRequest) {
  const payload = exchangeSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json({ error: 'invalid-exchange-request' }, { status: 400 });
  }

  const result = await exchangeQaReportClaim(payload.data.claimToken);
  if (!result) {
    return NextResponse.json({ error: 'claim-not-approved' }, { status: 409 });
  }

  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}
