import { sessionCookieName } from '@/lib/auth/session';
import { NextRequest, NextResponse } from 'next/server';

function signOutResponse(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/auth/sign-in?signedOut=1', request.url), 303);
  response.cookies.set(sessionCookieName, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  });
  return response;
}

export async function POST(request: NextRequest) {
  return signOutResponse(request);
}

export async function GET(request: NextRequest) {
  return signOutResponse(request);
}
