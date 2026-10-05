import { useSyncExternalStore } from 'react';
import { getAccessToken, getCachedToken } from './gis';

/**
 * Which Google account the current Drive token belongs to. Shared by every screen that uploads,
 * so the folders panel and the upload dialog always show the same account.
 */
let currentEmail: string | null = null;
let emailToken: string | null = null;
const listeners = new Set<() => void>();

function setCurrentEmail(email: string | null): void {
  currentEmail = email;
  listeners.forEach(listener => listener());
}

export function normalizeEmail(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase();
}

export function sameAccount(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeEmail(a);
  return left !== '' && left === normalizeEmail(b);
}

/** Reads the account email for a token (Drive about.get works with the drive.file scope). */
export async function fetchAccountEmail(token: string): Promise<string> {
  if (token === emailToken && currentEmail) return currentEmail;
  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    throw new Error(`Could not read which Google account is signed in (${res.status})`);
  }
  const data = await res.json();
  const email = normalizeEmail(data?.user?.emailAddress);
  if (!email) throw new Error('Google did not return the signed-in account email');
  emailToken = token;
  setCurrentEmail(email);
  return email;
}

/** Signs in with the last-used account (or asks once). Call it directly inside a tap handler. */
export async function signInGoogle(): Promise<{ token: string; email: string }> {
  const token = await getAccessToken();
  return { token, email: await fetchAccountEmail(token) };
}

/** Always shows Google's account chooser. Call it directly inside a tap handler. */
export async function switchGoogleAccount(): Promise<{ token: string; email: string }> {
  const token = await getAccessToken({ prompt: 'select_account' });
  return { token, email: await fetchAccountEmail(token) };
}

/** Shows the account for an already cached token, without ever opening a popup. */
export async function refreshAccountFromCache(): Promise<string | null> {
  const token = getCachedToken();
  if (!token) return null;
  try {
    return await fetchAccountEmail(token);
  } catch {
    return null;
  }
}

export function useGoogleAccountEmail(): string | null {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => currentEmail,
    () => null
  );
}

export function _resetGoogleAccountForTesting(): void {
  emailToken = null;
  setCurrentEmail(null);
}
