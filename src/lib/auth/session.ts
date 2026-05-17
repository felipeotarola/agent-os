import { readAuthEnv } from './env';
import { NextRequest } from 'next/server';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sessionCookieName = 'agent_os_session';
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

type SessionPayload = {
  email: string;
  exp: number;
};

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlToBytes(value: string) {
  const base64 = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64UrlEncode(value: string) {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlDecode(value: string) {
  return decoder.decode(base64UrlToBytes(value));
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string) {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  if (aBytes.length !== bBytes.length) return false;

  let mismatch = 0;
  for (let index = 0; index < aBytes.length; index++) {
    mismatch |= aBytes[index] ^ bBytes[index];
  }
  return mismatch === 0;
}

function getAuthSecret() {
  return readAuthEnv('AUTH_SECRET');
}

export { sessionCookieName, sessionMaxAgeSeconds };

export async function createSessionToken(email: string) {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error('AUTH_SECRET is required');
  }

  const payload: SessionPayload = {
    email,
    exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token?: string | null) {
  const secret = getAuthSecret();
  if (!secret || !token) return null;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = await hmac(encodedPayload, secret);
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (!payload.email || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSessionFromRequest(request: NextRequest) {
  return verifySessionToken(request.cookies.get(sessionCookieName)?.value);
}
