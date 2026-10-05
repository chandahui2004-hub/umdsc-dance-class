import { describe, it, expect, vi, afterEach } from 'vitest';
import { trashDriveFile } from './driveTrash';

describe('trashDriveFile', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('PATCHes trashed: true with the bearer token', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as any;

    await expect(trashDriveFile('tok', 'file-1')).resolves.toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/files/file-1?supportsAllDrives=true',
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true })
      }
    );
  });

  it('treats an already-gone file (404) as done', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as any;
    await expect(trashDriveFile('tok', 'file-1')).resolves.toBe(true);
  });

  it('returns false when Drive refuses (another account owns the file)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 }) as any;
    await expect(trashDriveFile('tok', 'file-1')).resolves.toBe(false);
  });

  it('returns false without a token, without calling Drive', async () => {
    globalThis.fetch = vi.fn() as any;
    await expect(trashDriveFile('', 'file-1')).resolves.toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
