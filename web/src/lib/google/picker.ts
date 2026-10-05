declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

let gapiLoadedPromise: Promise<void> | null = null;

export function loadGapiScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.gapi?.load) return Promise.resolve();

  if (!gapiLoadedPromise) {
    gapiLoadedPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="apis.google.com/js/api.js"]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', (e) => reject(e));
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google API Client script'));
      document.head.appendChild(script);
    });
  }

  return gapiLoadedPromise;
}

export async function ensurePickerLoaded(): Promise<void> {
  await loadGapiScript();
  if (!window.gapi) {
    throw new Error('Google API client is unavailable');
  }

  if (window.google?.picker) return;

  return new Promise((resolve) => {
    window.gapi.load('picker', () => {
      resolve();
    });
  });
}

export function hasPickerGrant(folderId: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`umdsc:pickerGrant:${folderId}`) === 'true';
}

/**
 * Checks whether the current OAuth token already has access to a Google Drive folder.
 * Returns true if status 200, false otherwise.
 */
export async function checkFolderAccess(token: string, folderId: string): Promise<boolean> {
  if (!token || !folderId) return false;
  try {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id&supportsAllDrives=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function pickFolder(token: string, parentFolderId: string): Promise<string> {
  await ensurePickerLoaded();

  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
  const appId = import.meta.env.VITE_GOOGLE_APP_ID;

  return new Promise((resolve, reject) => {
    try {
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true)
        .setParent(parentFolderId);

      const picker = new window.google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .setAppId(appId)
        .setCallback((data: any) => {
          if (data.action === window.google.picker.Action.PICKED) {
            const doc = data.docs[0];
            const pickedId = doc.id;
            localStorage.setItem(`umdsc:pickerGrant:${pickedId}`, 'true');
            localStorage.setItem(`umdsc:pickerGrant:${parentFolderId}`, 'true');
            resolve(pickedId);
          } else if (data.action === window.google.picker.Action.CANCEL) {
            reject(new Error('Folder selection was cancelled'));
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      reject(err);
    }
  });
}
