declare global {
  interface Window {
    google?: any;
  }
}

let gisLoadedPromise: Promise<void> | null = null;

export function loadGisScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  if (!gisLoadedPromise) {
    gisLoadedPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', (e) => reject(e));
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Identity Services SDK'));
      document.head.appendChild(script);
    });
  }

  return gisLoadedPromise;
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getAccessToken(opts?: { prompt?: '' | 'consent' }): Promise<string> {
  const now = Date.now();
  // Reuse token if still valid for > 60 seconds and no explicit consent prompt requested
  if (cachedToken && tokenExpiresAt - now > 60000 && !opts?.prompt) {
    return cachedToken;
  }

  await loadGisScript();

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services SDK is unavailable');
  }

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID environment variable is missing');
  }

  return new Promise((resolve, reject) => {
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        prompt: opts?.prompt ?? '',
        callback: (resp: any) => {
          if (resp.error) {
            reject(new Error(`OAuth error: ${resp.error_description || resp.error}`));
            return;
          }

          cachedToken = resp.access_token;
          const expiresInSec = Number(resp.expires_in) || 3599;
          tokenExpiresAt = Date.now() + expiresInSec * 1000;
          if (cachedToken) {
            resolve(cachedToken);
          } else {
            reject(new Error('No access token received from Google OAuth'));
          }
        }
      });

      tokenClient.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
}
