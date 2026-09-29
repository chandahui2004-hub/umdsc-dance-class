import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac } from '../../src/security/tokens';
import { SCHEMA } from '../../src/db/schema';

const nodeHmac: Hmac = (key: string, message: string) => {
  return new Uint8Array(crypto.createHmac('sha256', key).update(message).digest());
};

const secrets = {
  tokenSecret: 'test_secret_key_123456789012345678901234567890',
  hmac: nodeHmac
};

describe('Feature: Setup', () => {
  it('setup.status returns initialized: false before init', () => {
    const ctx = makeCtx();
    const res = handleRequest({ action: 'setup.status' }, ctx, secrets);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({ initialized: false });
    }
  });

  it('setup.init with wrong code → FORBIDDEN', () => {
    const ctx = makeCtx();
    ctx.props.set('SETUP_CODE', 'CORRECT8');

    const res = handleRequest(
      {
        action: 'setup.init',
        payload: {
          setupCode: 'WRONGCODE',
          dbFolderUrl: 'https://drive.google.com/drive/folders/valid_folder_id',
          adminUsername: 'admin',
          adminDisplayName: 'Main Admin',
          adminPassword: 'Password123!'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('FORBIDDEN');
    }
  });

  it('setup.init with a folder the club cannot edit → LINK_NO_ACCESS mentioning umdancesportc@gmail.com', () => {
    const ctx = makeCtx();
    ctx.props.set('SETUP_CODE', 'CORRECT8');

    // Make folder exist but canEdit: false
    const noEditFolderId = '10rrxr82U3sSX16i8AksvFbMeWmsLxgST_noedit';
    (ctx.drive as any).items.set(noEditFolderId, {
      id: noEditFolderId,
      kind: 'folder',
      name: 'No Edit',
      canEdit: false
    });

    const res = handleRequest(
      {
        action: 'setup.init',
        payload: {
          setupCode: 'CORRECT8',
          dbFolderUrl: noEditFolderId,
          adminUsername: 'admin',
          adminDisplayName: 'Main Admin',
          adminPassword: 'Password123!'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('LINK_NO_ACCESS');
      expect(res.error.message).toContain('umdancesportc@gmail.com');
    }
  });

  it('setup.init creates UMDSC_System, seeds tabs, roles, styles, and first admin', () => {
    const ctx = makeCtx();
    ctx.props.set('SETUP_CODE', 'CORRECT8');

    const dbFolderId = '10rrxr82U3sSX16i8AksvFbMeWmsLxgST_dbfolder';
    (ctx.drive as any).items.set(dbFolderId, {
      id: dbFolderId,
      kind: 'folder',
      name: 'Club DB',
      canEdit: true
    });

    const res = handleRequest(
      {
        action: 'setup.init',
        payload: {
          setupCode: 'CORRECT8',
          dbFolderUrl: dbFolderId,
          adminUsername: 'headadmin',
          adminDisplayName: 'Head Admin',
          adminPassword: 'MySecurePassword123'
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);


    // Verify system spreadsheet was created and saved in props
    const sysId = ctx.props.get('SYSTEM_SPREADSHEET_ID');
    expect(sysId).toBeTruthy();

    const ss = ctx.drive.openSpreadsheet(sysId!);
    expect(ss.name).toBe('UMDSC_System');

    // Verify all schema tabs exist with header rows
    for (const tab of Object.keys(SCHEMA)) {
      const sheet = ss.sheet(tab);
      expect(sheet).not.toBeNull();
      const headers = sheet!.getDisplayValues()[0];
      expect(headers).toEqual(SCHEMA[tab as keyof typeof SCHEMA]);
    }

    // Verify seeded roles
    const rolesSheet = ss.sheet('Roles')!;
    const roleRows = rolesSheet.getDisplayValues().slice(1);
    const roleNames = roleRows.map(r => r[0]); // name is col 0
    expect(roleNames).toContain('Admin');
    expect(roleNames).toContain('Dancer');

    // Verify seeded styles (Locking/green, Popping/blue, Hip Hop/orange, Latin/pink)
    const stylesSheet = ss.sheet('DanceStyles')!;
    const styleRows = stylesSheet.getDisplayValues().slice(1);
    const styleNames = styleRows.map(r => r[0]);
    expect(styleNames).toContain('Locking');
    expect(styleNames).toContain('Popping');
    expect(styleNames).toContain('Hip Hop');
    expect(styleNames).toContain('Latin');

    // Hip Hop aliases check
    const hipHopRow = styleRows.find(r => r[0] === 'Hip Hop');
    expect(hipHopRow?.[1]).toContain('hip hop');

    // Verify first admin created
    const adminsSheet = ss.sheet('Admins')!;
    const adminRows = adminsSheet.getDisplayValues().slice(1);
    expect(adminRows.find(r => r[0] === 'headadmin')).toBeTruthy();

    // Verify setup.status is now true
    const statusRes = handleRequest({ action: 'setup.status' }, ctx, secrets);
    expect(statusRes.ok).toBe(true);
    if (statusRes.ok) {
      expect(statusRes.data).toEqual({ initialized: true });
    }

    // Verify calling setup.init twice → SETUP_DONE
    const resTwice = handleRequest(
      {
        action: 'setup.init',
        payload: {
          setupCode: 'CORRECT8',
          dbFolderUrl: '10rrxr82U3sSX16i8AksvFbMeWmsLxgST_dbfolder',
          adminUsername: 'another',

          adminDisplayName: 'Another',
          adminPassword: 'Password123!'
        }
      },
      ctx,
      secrets
    );
    expect(resTwice.ok).toBe(false);
    if (!resTwice.ok) {
      expect(resTwice.error.code).toBe('SETUP_DONE');
    }
  });
});
