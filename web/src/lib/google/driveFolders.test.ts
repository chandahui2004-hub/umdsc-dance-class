import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureFolderPath } from './driveFolders';

describe('ensureFolderPath', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses an existing folder and creates only missing levels', async () => {
    const existingFolders: Record<string, { id: string; name: string; parent: string }[]> = {
      'root-1': [{ id: 'month-folder-id', name: '2026-10', parent: 'root-1' }],
      'month-folder-id': [] // Class folder does not exist yet
    };

    let createdIdCounter = 1;

    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      // 1. files.list query
      if (url.includes('https://www.googleapis.com/drive/v3/files?')) {
        const u = new URL(url);
        const q = u.searchParams.get('q') || '';
        // match parent and name
        const parentMatch = q.match(/'([^']+)' in parents/);
        const nameMatch = q.match(/name='([^']+)'/);
        const parentId = parentMatch ? parentMatch[1] : '';
        const name = nameMatch ? nameMatch[1] : '';

        const found = (existingFolders[parentId] || []).filter((f) => f.name === name);
        return {
          ok: true,
          status: 200,
          json: async () => ({ files: found })
        } as unknown as Response;
      }

      // 2. files create
      if (url === 'https://www.googleapis.com/drive/v3/files' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        const newId = `new-folder-${createdIdCounter++}`;
        const parent = body.parents[0];
        if (!existingFolders[parent]) existingFolders[parent] = [];
        existingFolders[parent].push({ id: newId, name: body.name, parent });
        if (!existingFolders[newId]) existingFolders[newId] = [];

        return {
          ok: true,
          status: 200,
          json: async () => ({ id: newId, name: body.name })
        } as unknown as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({})
      } as unknown as Response;
    });

    globalThis.fetch = mockFetch;

    const finalFolderId = await ensureFolderPath('test-token', 'root-1', [
      '2026-10',
      '2026-10-08 Popping Class 1'
    ]);

    // First level (2026-10) was reused, second level was created
    expect(finalFolderId).toBe('new-folder-1');
    expect(existingFolders['month-folder-id']).toContainEqual(
      expect.objectContaining({
        id: 'new-folder-1',
        name: '2026-10-08 Popping Class 1'
      })
    );
  });
});
