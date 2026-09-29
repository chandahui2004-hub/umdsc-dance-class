import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { getSettingsRoutes } from '../../src/features/settings';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

describe('Feature: Settings and Links', () => {
  let ctx: ReturnType<typeof makeCtx>;
  let adminToken: string;

  beforeEach(() => {
    ctx = makeCtx();
    registerRoutes(getSettingsRoutes());

    adminToken = signToken(
      {
        sub: 'admin1',
        role: 'admin',
        name: 'Admin One',
        exp: Math.floor(ctx.now().getTime() / 1000) + 3600,
        pv: 1,
        perms: { 'settings.edit': '*' }
      },
      secrets.tokenSecret,
      secrets.hmac
    );
  });

  it('settings.get returns all settings and clubEmail', () => {
    ctx.db.settings.insert(
      { key: 'defaultAttendanceFolderId', value: 'f12345678901234567890' },
      'admin1',
      ctx.now()
    );

    const res = handleRequest(
      {
        action: 'settings.get',
        token: adminToken
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any;
      expect(data.clubEmail).toBe(ctx.clubEmail);
      expect(data.defaultAttendanceFolderId).toBe('f12345678901234567890');
    }
  });

  it('setLink with sheet URL for a folder key → LINK_WRONG_KIND', () => {
    // create fake sheet
    const ss = ctx.drive.createSpreadsheet('TestSheet', 'root');
    const sheetUrl = 'https://docs.google.com/spreadsheets/d/' + ss.id + '/edit';

    const res = handleRequest(
      {
        action: 'settings.setLink',
        token: adminToken,
        payload: {
          key: 'defaultAttendanceFolderId',
          url: sheetUrl
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('LINK_WRONG_KIND');
    }
  });

  it('setLink on item without access → LINK_NO_ACCESS, message contains clubEmail', () => {
    const res = handleRequest(
      {
        action: 'settings.setLink',
        token: adminToken,
        payload: {
          key: 'defaultAttendanceFolderId',
          url: 'https://drive.google.com/drive/folders/nonexistent_folder_id_12345'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('LINK_NO_ACCESS');
      expect(res.error.message).toContain(ctx.clubEmail);
    }
  });

  it('setLink on view-only item → LINK_READ_ONLY', () => {
    const folderId = ctx.drive.createFolder('ViewOnlyFolder', 'root');
    ctx.drive.setAccess(folderId, false);

    const res = handleRequest(
      {
        action: 'settings.setLink',
        token: adminToken,
        payload: {
          key: 'defaultAttendanceFolderId',
          url: 'https://drive.google.com/drive/folders/' + folderId
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('LINK_READ_ONLY');
      expect(res.error.message).toContain(ctx.clubEmail);
    }
  });

  it('setLink success writes Settings and a LinkHistory row with old and new value', () => {
    const oldFolderId = ctx.drive.createFolder('OldFolder', 'root');
    const newFolderId = ctx.drive.createFolder('NewFolder', 'root');

    ctx.db.settings.insert(
      { key: 'defaultAttendanceFolderId', value: oldFolderId },
      'admin1',
      ctx.now()
    );

    const res = handleRequest(
      {
        action: 'settings.setLink',
        token: adminToken,
        payload: {
          key: 'defaultAttendanceFolderId',
          url: 'https://drive.google.com/drive/folders/' + newFolderId
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);

    const setting = ctx.db.settings.find(s => s.key === 'defaultAttendanceFolderId' && s.active)[0];
    expect(setting.value).toBe(newFolderId);

    const history = ctx.db.linkHistory.find(h => h.key === 'defaultAttendanceFolderId' && h.active);
    expect(history.length).toBe(1);
    expect(history[0].oldValue).toBe(oldFolderId);
    expect(history[0].newValue).toBe(newFolderId);
    expect(history[0].changedBy).toBe('admin1');

    // Audit log written
    const audit = ctx.db.auditLog.find(a => a.action === 'settings.setLink');
    expect(audit.length).toBe(1);
    expect(audit[0].target).toBe('defaultAttendanceFolderId');
  });

  it('links.history returns history rows filtered by key', () => {
    ctx.db.linkHistory.insert(
      {
        key: 'keyA',
        oldValue: 'oldA',
        newValue: 'newA',
        changedBy: 'admin1',
        changedAt: ctx.now().toISOString()
      },
      'admin1',
      ctx.now()
    );
    ctx.db.linkHistory.insert(
      {
        key: 'keyB',
        oldValue: 'oldB',
        newValue: 'newB',
        changedBy: 'admin1',
        changedAt: ctx.now().toISOString()
      },
      'admin1',
      ctx.now()
    );

    const res = handleRequest(
      {
        action: 'links.history',
        token: adminToken,
        payload: { key: 'keyA' }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const data = res.data as any[];
      expect(data.length).toBe(1);
      expect(data[0].key).toBe('keyA');
    }
  });
});
