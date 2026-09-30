import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { getMasterDataRoutes } from '../../src/features/masterData';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

describe('Feature: Master Data (Styles & Instructors)', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let adminToken: string;
  let dancerToken: string;

  beforeEach(() => {
    ctx = makeCtx();
    registerRoutes(getMasterDataRoutes());

    adminToken = signToken(
      {
        sub: 'admin1',
        role: 'admin',
        name: 'Admin One',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: { 'styles.edit': '*', 'instructors.edit': '*' }
      },
      secrets.tokenSecret,
      secrets.hmac
    );

    dancerToken = signToken(
      {
        sub: 'M-22003949',
        role: 'dancer',
        name: 'Dancer Test',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: { 'calendar.view': '*' }
      },
      secrets.tokenSecret,
      secrets.hmac
    );
  });

  it('styles.list returns all active styles, accessible to signedIn users', () => {
    ctx.db.styles.insert(
      {
        name: 'Popping',
        aliases: 'popping,pop',
        colorKey: 'blue',
        defaultWeekday: 2,
        defaultStart: '20:00',
        defaultEnd: '22:00',
        defaultInstructorId: '',
        defaultVenue: 'Studio A',
        attendanceFolderId: '',
        videoFolderId: ''
      },
      'admin1',
      ctx.now()
    );

    const res = handleRequest(
      {
        action: 'styles.list',
        token: dancerToken
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any[];
      expect(data.length).toBe(1);
      expect(data[0].name).toBe('Popping');
    }
  });

  it('styles.update with stale version → VERSION_CONFLICT carrying latest row', () => {
    const style = ctx.db.styles.insert(
      {
        name: 'Locking',
        aliases: 'locking',
        colorKey: 'green',
        defaultWeekday: 1,
        defaultStart: '20:00',
        defaultEnd: '22:00',
        defaultInstructorId: '',
        defaultVenue: 'Studio B',
        attendanceFolderId: '',
        videoFolderId: ''
      },
      'admin1',
      ctx.now()
    );

    // Stale version: 999 instead of style.version
    const res = handleRequest(
      {
        action: 'styles.update',
        token: adminToken,
        payload: {
          id: style.id,
          version: 999,
          colorKey: 'yellow'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('VERSION_CONFLICT');
      expect((res.error as any).latest.name).toBe('Locking');
    }
  });

  it('styles.update converts videoFolderUrl to videoFolderId after validation', () => {
    const folderId = ctx.drive.createFolder('StyleVideoFolder', 'root');

    const style = ctx.db.styles.insert(
      {
        name: 'Hip Hop',
        aliases: 'hip hop',
        colorKey: 'orange',
        defaultWeekday: 3,
        defaultStart: '20:00',
        defaultEnd: '22:00',
        defaultInstructorId: '',
        defaultVenue: 'Studio C',
        attendanceFolderId: '',
        videoFolderId: ''
      },
      'admin1',
      ctx.now()
    );

    const res = handleRequest(
      {
        action: 'styles.update',
        token: adminToken,
        payload: {
          id: style.id,
          version: style.version,
          videoFolderUrl: 'https://drive.google.com/drive/folders/' + folderId
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const updated = res.data as any;
      expect(updated.videoFolderId).toBe(folderId);
    }
  });

  it('styles.update manages multiple video folders: add, activate, and remove', () => {
    const folder1 = ctx.drive.createFolder('root', 'Popping Batch 1');
    const folder2 = ctx.drive.createFolder('root', 'Popping Batch 2');

    const style = ctx.db.styles.insert(
      {
        name: 'Popping',
        aliases: 'pop',
        colorKey: 'blue',
        defaultWeekday: 2,
        defaultStart: '20:00',
        defaultEnd: '22:00',
        defaultInstructorId: '',
        defaultVenue: 'Studio A',
        attendanceFolderId: '',
        videoFolderId: ''
      },
      'admin1',
      ctx.now()
    );

    // 1. Add folder 1
    const res1 = handleRequest(
      {
        action: 'styles.update',
        token: adminToken,
        payload: {
          id: style.id,
          version: style.version,
          addVideoFolderUrl: 'https://drive.google.com/drive/folders/' + folder1
        }
      },
      ctx,
      secrets
    );
    expect(res1.ok).toBe(true);
    const updated1 = (res1 as any).data;
    expect(updated1.videoFolderId).toBe(folder1);
    const folders1 = JSON.parse(updated1.videoFoldersJson);
    expect(folders1).toHaveLength(1);
    expect(folders1[0].id).toBe(folder1);
    expect(folders1[0].name).toBe('Popping Batch 1');

    // 2. Add folder 2
    const res2 = handleRequest(
      {
        action: 'styles.update',
        token: adminToken,
        payload: {
          id: style.id,
          version: updated1.version,
          addVideoFolderUrl: 'https://drive.google.com/drive/folders/' + folder2
        }
      },
      ctx,
      secrets
    );
    expect(res2.ok).toBe(true);
    const updated2 = (res2 as any).data;
    const folders2 = JSON.parse(updated2.videoFoldersJson);
    expect(folders2).toHaveLength(2);
    expect(folders2[1].id).toBe(folder2);
    expect(folders2[1].name).toBe('Popping Batch 2');

    // 3. Activate folder 2
    const res3 = handleRequest(
      {
        action: 'styles.update',
        token: adminToken,
        payload: {
          id: style.id,
          version: updated2.version,
          activateVideoFolderId: folder2
        }
      },
      ctx,
      secrets
    );
    expect(res3.ok).toBe(true);
    const updated3 = (res3 as any).data;
    expect(updated3.videoFolderId).toBe(folder2);

    // 4. Remove active folder 2 -> fallback to folder 1
    const res4 = handleRequest(
      {
        action: 'styles.update',
        token: adminToken,
        payload: {
          id: style.id,
          version: updated3.version,
          removeVideoFolderId: folder2
        }
      },
      ctx,
      secrets
    );
    expect(res4.ok).toBe(true);
    const updated4 = (res4 as any).data;
    expect(updated4.videoFolderId).toBe(folder1);
    const folders4 = JSON.parse(updated4.videoFoldersJson);
    expect(folders4).toHaveLength(1);
    expect(folders4[0].id).toBe(folder1);
  });

  it('instructors CRUD: create, update, deactivate', () => {
    // 1. Create
    const createRes = handleRequest(
      {
        action: 'instructors.create',
        token: adminToken,
        payload: {
          name: 'Jane Doe',
          contact: '0123456789'
        }
      },
      ctx,
      secrets
    );

    expect(createRes.ok).toBe(true);
    let instructor: any;
    if (createRes.ok) {
      instructor = createRes.data;
      expect(instructor.name).toBe('Jane Doe');
      expect(instructor.contact).toBe('0123456789');
    }

    // 2. Update
    const updateRes = handleRequest(
      {
        action: 'instructors.update',
        token: adminToken,
        payload: {
          id: instructor.id,
          version: instructor.version,
          contact: '0198765432'
        }
      },
      ctx,
      secrets
    );

    expect(updateRes.ok).toBe(true);
    if (updateRes.ok) {
      const updated = updateRes.data as any;
      expect(updated.contact).toBe('0198765432');
      instructor = updated;
    }

    // 3. Deactivate
    const deactivateRes = handleRequest(
      {
        action: 'instructors.deactivate',
        token: adminToken,
        payload: {
          id: instructor.id,
          version: instructor.version
        }
      },
      ctx,
      secrets
    );

    expect(deactivateRes.ok).toBe(true);

    // List should now be empty of active instructors
    const listRes = handleRequest(
      {
        action: 'instructors.list',
        token: adminToken
      },
      ctx,
      secrets
    );
    expect(listRes.ok).toBe(true);
    if (listRes.ok) {
      expect((listRes.data as any[]).length).toBe(0);
    }
  });
});
