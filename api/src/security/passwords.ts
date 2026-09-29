import { Hmac } from './tokens';

export const PASSWORD_ITERATIONS = 2000;

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function hashPassword(password: string, salt: string, iterations: number, hmac: Hmac): string {
  let current = hmac(salt, password);
  for (let i = 1; i < iterations; i++) {
    current = hmac(salt, bytesToHex(current));
  }
  return bytesToHex(current);
}

export function verifyPassword(
  password: string,
  stored: { hash?: string; passwordHash?: string; salt: string; iterations: number },
  hmac: Hmac
): boolean {
  const hash = stored.hash || stored.passwordHash || '';
  if (!hash) return false;
  const computed = hashPassword(password, stored.salt, stored.iterations, hmac);

  if (computed.length !== hash.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  }

  return diff === 0;
}
