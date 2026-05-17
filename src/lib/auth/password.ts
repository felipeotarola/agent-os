import { pbkdf2Sync, timingSafeEqual } from 'crypto';

export function verifyPassword(password: string, encodedHash?: string) {
  if (!encodedHash) return false;

  const [algorithm, iterationsText, salt, expectedHash] = encodedHash.split('$');
  if (algorithm !== 'pbkdf2-sha256' || !iterationsText || !salt || !expectedHash) {
    return false;
  }

  const iterations = Number(iterationsText);
  if (!Number.isFinite(iterations) || iterations < 100000) return false;

  const actual = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const expected = Buffer.from(expectedHash, 'base64url');

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
