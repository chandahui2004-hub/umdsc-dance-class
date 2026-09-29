import { TokenClaims } from '@umdsc/shared';
import { AppError } from '../errors';

export type Hmac = (key: string, message: string) => Uint8Array;

function base64ToBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBase64(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  return b64;
}

function utf8ToBase64(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64');
  }
  // GAS environment
  return Utilities.base64Encode(str, Utilities.Charset.UTF_8);
}

function base64ToUtf8(b64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf8');
  }
  // GAS environment
  const decoded = Utilities.base64Decode(b64, Utilities.Charset.UTF_8);
  return Utilities.newBlob(decoded).getDataAsString('utf8');
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  return Utilities.base64Encode(Array.from(bytes));
}

export function signToken(claims: TokenClaims, secret: string, hmac: Hmac): string {
  const jsonStr = JSON.stringify(claims);
  const payloadB64Url = base64ToBase64Url(utf8ToBase64(jsonStr));

  const sigBytes = hmac(secret, payloadB64Url);
  const sigB64Url = base64ToBase64Url(bytesToBase64(sigBytes));

  return `${payloadB64Url}.${sigB64Url}`;
}

export function verifyToken(token: string, secret: string, hmac: Hmac, nowSec: number): TokenClaims {
  if (!token || typeof token !== 'string') {
    throw new AppError('UNAUTHORIZED', 'Missing or invalid token');
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new AppError('UNAUTHORIZED', 'Malformed token format');
  }

  const [payloadB64Url, sigB64Url] = parts;

  const expectedSigBytes = hmac(secret, payloadB64Url);
  const expectedSigB64Url = base64ToBase64Url(bytesToBase64(expectedSigBytes));

  if (sigB64Url !== expectedSigB64Url) {
    throw new AppError('UNAUTHORIZED', 'Invalid token signature');
  }

  let claims: TokenClaims;
  try {
    const jsonStr = base64ToUtf8(base64UrlToBase64(payloadB64Url));
    claims = JSON.parse(jsonStr);
  } catch {
    throw new AppError('UNAUTHORIZED', 'Failed to parse token claims');
  }

  if (claims.exp !== undefined && claims.exp < nowSec) {
    throw new AppError('UNAUTHORIZED', 'Token expired');
  }

  return claims;
}
