import { getSessionFromRequest } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/auth/sign-up')) {
    return NextResponse.redirect(new URL('/auth/sign-in?signup=disabled', request.url));
  }

  const isProtectedDashboard = pathname === '/' || pathname.startsWith('/dashboard');
  const isProtectedApi = pathname.startsWith('/api/secrets');

  const session = await getSessionFromRequest(request);
  if (session) return NextResponse.next();

  if (isProtectedApi) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const signInUrl = new URL('/auth/sign-in', request.url);
  signInUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ['/', '/dashboard/:path*', '/api/secrets/:path*', '/auth/sign-up/:path*']
};
