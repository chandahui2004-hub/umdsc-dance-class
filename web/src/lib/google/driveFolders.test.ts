import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureFolderPath, ensureClassFolder } from './driveFolders';

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

describe('ensureClassFolder', () => {
  let moved: { id: string; from: string; to: string }[] = [];

  /** A tiny fake of Drive's files.list / files.create / files.update (move), keyed by parent id. */
  function fakeDrive(folders: Record<string, { id: string; name: string }[]>) {
    let n = 1;
    const created: { name: string; parent: string }[] = [];
    moved = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const u = new URL(url);
        const id = u.pathname.split('/').pop()!;
        const from = u.searchParams.get('removeParents')!;
        const to = u.searchParams.get('addParents')!;
        const item = (folders[from] || []).find(f => f.id === id)!;
        folders[from] = folders[from].filter(f => f.id !== id);
        (folders[to] ||= []).push(item);
        moved.push({ id, from, to });
        return { ok: true, status: 200, json: async () => ({ id }) } as unknown as Response;
      }
      if (init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        const id = `new-${n++}`;
        (folders[body.parents[0]] ||= []).push({ id, name: body.name });
        created.push({ name: body.name, parent: body.parents[0] });
        return { ok: true, status: 200, json: async () => ({ id }) } as unknown as Response;
      }
      const q = new URL(url).searchParams.get('q') || '';
      const parent = q.match(/'([^']+)' in parents/)?.[1] || '';
      const name = q.match(/name='([^']+)'/)?.[1] || '';
      return { ok: true, status: 200, json: async () => ({ files: (folders[parent] || []).filter(f => f.name === name) }) } as unknown as Response;
    }) as any;
    return created;
  }

  const target = {
    videoMasterFolderId: 'video-master',
    eventFolderId: '',
    eventFolderName: 'OCT MONTHLY CLASS',
    classFolderName: '2026-10-08 Popping Class 1',
    musicFolderName: 'Music'
  };

  it('reuses eventFolderId and creates only the class folder', async () => {
    const created = fakeDrive({ 'evt-folder': [] });
    const result = await ensureClassFolder('tok', { ...target, eventFolderId: 'evt-folder' }, 'video');
    expect(result.eventFolderId).toBe('evt-folder');
    expect(created).toEqual([{ name: '2026-10-08 Popping Class 1', parent: 'evt-folder' }]);
    expect(result.classFolderId).toBe('new-1');
    expect(result.musicFolderId).toBeUndefined();
  });

  it('creates event folder under video master when eventFolderId is blank, and Music for audio', async () => {
    const created = fakeDrive({ 'video-master': [] });
    const result = await ensureClassFolder('tok', target, 'mp3');
    expect(created.map(c => c.name)).toEqual(['OCT MONTHLY CLASS', '2026-10-08 Popping Class 1', 'Music']);
    expect(created[0].parent).toBe('video-master');
    expect(result).toEqual({ eventFolderId: 'new-1', classFolderId: 'new-2', musicFolderId: 'new-3' });
  });

  it('files a new event folder under its year folder, reusing the year folder if it exists', async () => {
    const created = fakeDrive({ 'video-master': [{ id: 'year-2026', name: '2026' }] });
    const result = await ensureClassFolder('tok', { ...target, yearFolderName: '2026' }, 'video');
    expect(created).toEqual([
      { name: 'OCT MONTHLY CLASS', parent: 'year-2026' },
      { name: '2026-10-08 Popping Class 1', parent: 'new-1' }
    ]);
    expect(result).toEqual({ eventFolderId: 'new-1', classFolderId: 'new-2' });
  });

  it('moves an older event folder straight under the style folder into the year folder it makes', async () => {
    const created = fakeDrive({ 'video-master': [{ id: 'old-evt', name: 'OCT MONTHLY CLASS' }], 'old-evt': [] });
    const result = await ensureClassFolder(
      'tok',
      { ...target, eventFolderId: 'old-evt', eventFolderInYear: false, yearFolderName: '2026' },
      'video'
    );
    expect(created[0]).toEqual({ name: '2026', parent: 'video-master' });
    expect(moved).toEqual([{ id: 'old-evt', from: 'video-master', to: 'new-1' }]);
    expect(result.eventFolderId).toBe('old-evt');
  });

  it('still uploads into the older event folder when Drive refuses the move', async () => {
    fakeDrive({ 'video-master': [{ id: 'old-evt', name: 'OCT MONTHLY CLASS' }], 'old-evt': [] });
    const realFetch = globalThis.fetch as any;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? ({ ok: false, status: 403, text: async () => 'forbidden' } as unknown as Response)
        : realFetch(url, init)
    ) as any;
    const result = await ensureClassFolder(
      'tok',
      { ...target, eventFolderId: 'old-evt', eventFolderInYear: false, yearFolderName: '2026' },
      'video'
    );
    expect(result.eventFolderId).toBe('old-evt');
    expect(result.classFolderId).toBeTruthy();
  });

  it('leaves an event folder that is already in its year folder alone', async () => {
    fakeDrive({ 'evt-folder': [] });
    await ensureClassFolder('tok', { ...target, eventFolderId: 'evt-folder', eventFolderInYear: true, yearFolderName: '2026' }, 'video');
    expect(moved).toEqual([]);
  });
});
