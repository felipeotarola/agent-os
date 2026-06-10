import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth/session';
import { approveQaReportClaim } from '@/features/qa-report/api/claims';

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.redirect(new URL('/auth/sign-in?next=/qa-rapport', request.url), 303);
  }

  const formData = await request.formData();
  const claimToken = String(formData.get('claim') ?? '');
  const approved = await approveQaReportClaim(claimToken, session.email);

  if (!approved) {
    return NextResponse.redirect(new URL('/qa-rapport/activate?status=invalid', request.url), 303);
  }

  return NextResponse.redirect(new URL('/qa-rapport/activate?status=approved', request.url), 303);
}
