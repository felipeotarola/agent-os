import { createHash, randomBytes } from 'node:crypto';

export function createOpaqueToken(prefix: string) {
  return `${prefix}_${randomBytes(32).toString('base64url')}`;
}

export function hashQaToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function readBearerToken(value: string | null) {
  if (!value) return null;
  const [scheme, token] = value.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}
