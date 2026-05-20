import { getSessionFromRequest } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';

const publicPaths = ['/auth/sign-in', '/terms-of-service', '/privacy-policy'];

function isPublicPath(pathname: string) {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/auth/sign-up')) {
    return NextResponse.redirect(new URL('/auth/sign-in?signup=disabled', request.url));
  }

  if (isPublicPath(pathname) || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  const isProtectedDashboard = pathname === '/' || pathname.startsWith('/dashboard');
  const isProtectedApi = pathname.startsWith('/api/secrets');
  if (!isProtectedDashboard && !isProtectedApi) return NextResponse.next();

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
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)'
  ]
};
