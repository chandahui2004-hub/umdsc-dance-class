import type { TokenClaims } from '@umdsc/shared';

const STORAGE_KEY = 'umdsc:session';
type UnauthHandler = () => void;
const unauthHandlers = new Set<UnauthHandler>();

export const session = {
  get(): { token: string; claims: TokenClaims } | null {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = sessionStorage.getItem(STORAGE_KEY);
    }
    if (!raw) return null;

    try {
      const data = JSON.parse(raw) as { token: string; claims: TokenClaims; remember?: boolean };
      if (!data.token || !data.claims) {
        session.clear();
        return null;
      }

      const nowSec = Math.floor(Date.now() / 1000);
      if (data.claims.exp && data.claims.exp < nowSec) {
        session.clear();
        return null;
      }

      return { token: data.token, claims: data.claims };
    } catch {
      session.clear();
      return null;
    }
  },

  set(token: string, claims: TokenClaims, remember: boolean = false): void {
    const payload = JSON.stringify({ token, claims, remember });
    if (claims.role === 'dancer' || remember) {
      localStorage.setItem(STORAGE_KEY, payload);
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, payload);
      localStorage.removeItem(STORAGE_KEY);
    }
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  },

  onUnauthorized(fn: UnauthHandler): () => void {
    unauthHandlers.add(fn);
    return () => {
      unauthHandlers.delete(fn);
    };
  },

  notifyUnauthorized(): void {
    session.clear();
    unauthHandlers.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.error('Error in onUnauthorized listener:', err);
      }
    });
  }
};
