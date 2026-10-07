import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handleRequest, registerRoutes } from '../../src/router';
import { makeCtx } from '../fakes/makeCtx';
import { Hmac, signToken } from '../../src/security/tokens';
import { getMasterDataRoutes } from '../../src/features/masterData';
import { seedEvent } from '../fixtures/events';

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

  const call = (action: string, payload: any): any =>
    handleRequest({ action, token: adminToken, payload }, ctx, secrets);
  const addStyle = (name: string, aliases: string[] = []) =>
    ctx.db.styles.insert(
      {
        name, aliases, colorKey: 'blue', defaultWeekday: 2, defaultStart: '20:00', defaultEnd: '22:00',
        defaultInstructorId: '', defaultVenue: '', attendanceFolderId: '', videoFolderId: ''
      } as any,
      'admin1',
      ctx.now()
    ).id;
  const expectFailure = (res: any, message: string) => {
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe('VALIDATION');
    expect(res.error.message).toBe(`VALIDATION: ${message}`); // the router prefixes the code
  };

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

  describe('styles.update videoUploaderEmail (class lead upload account)', () => {
    const insertStyle = (videoFolderId: string) =>
      ctx.db.styles.insert(
        {
          name: 'Locking',
          aliases: 'locking',
          colorKey: 'blue',
          defaultWeekday: 2,
          defaultStart: '20:00',
          defaultEnd: '22:00',
          defaultInstructorId: '',
          defaultVenue: 'Studio A',
          attendanceFolderId: '',
          videoFolderId
        },
        'admin1',
        ctx.now()
      );

    const update = (payload: Record<string, unknown>) =>
      handleRequest({ action: 'styles.update', token: adminToken, payload }, ctx, secrets);

    it('saves the uploader email trimmed and lower-cased', () => {
      const folderId = ctx.drive.createFolder('LockingVideos', 'root');
      const style = insertStyle(folderId);

      const res = update({ id: style.id, version: style.version, videoUploaderEmail: '  LockingLead@Gmail.com ' });

      expect(res.ok).toBe(true);
      if (res.ok) expect((res.data as any).videoUploaderEmail).toBe('lockinglead@gmail.com');
      expect(ctx.db.styles.get(style.id)?.videoUploaderEmail).toBe('lockinglead@gmail.com');
    });

    it('rejects something that is not an email', () => {
      const folderId = ctx.drive.createFolder('LockingVideos', 'root');
      const style = insertStyle(folderId);

      const res = update({ id: style.id, version: style.version, videoUploaderEmail: 'not-an-email' });

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe('VALIDATION');
    });

    it('clears the uploader email when the video folder link changes to another folder', () => {
      const oldFolder = ctx.drive.createFolder('LockingVideos', 'root');
      const newFolder = ctx.drive.createFolder('LockingVideos2', 'root');
      const style = insertStyle(oldFolder);
      const first = update({ id: style.id, version: style.version, videoUploaderEmail: 'lead@gmail.com' });
      expect(first.ok).toBe(true);
      const v = (first as any).data.version;

      const res = update({ id: style.id, version: v, videoFolderUrl: 'https://drive.google.com/drive/folders/' + newFolder });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect((res.data as any).videoFolderId).toBe(newFolder);
        expect((res.data as any).videoUploaderEmail).toBe('');
      }
    });

    it('styles.list hides the uploader email from dancers but shows it to admins', () => {
      const folder = ctx.drive.createFolder('LockingVideos', 'root');
      const style = insertStyle(folder);
      update({ id: style.id, version: style.version, videoUploaderEmail: 'lead@gmail.com' });

      const asDancer = handleRequest({ action: 'styles.list', token: dancerToken, payload: {} }, ctx, secrets);
      const asAdmin = handleRequest({ action: 'styles.list', token: adminToken, payload: {} }, ctx, secrets);

      expect(asDancer.ok && asAdmin.ok).toBe(true);
      const dancerRow = (asDancer as any).data.find((s: any) => s.id === style.id);
      const adminRow = (asAdmin as any).data.find((s: any) => s.id === style.id);
      expect(dancerRow).toBeDefined();
      expect(dancerRow.videoUploaderEmail).toBeUndefined();
      expect(adminRow.videoUploaderEmail).toBe('lead@gmail.com');
    });

    it('removing the folder link (empty videoFolderUrl) clears the folder and the uploader account', () => {
      const folder = ctx.drive.createFolder('LockingVideos', 'root');
      const style = insertStyle(folder);
      const first = update({ id: style.id, version: style.version, videoUploaderEmail: 'lead@gmail.com' });
      const v = (first as any).data.version;

      const res = update({ id: style.id, version: v, videoFolderUrl: '' });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect((res.data as any).videoFolderId).toBe('');
        expect((res.data as any).videoUploaderEmail).toBe('');
      }
    });

    it('keeps the uploader email when the same folder link is saved again', () => {
      const folder = ctx.drive.createFolder('LockingVideos', 'root');
      const style = insertStyle(folder);
      const first = update({ id: style.id, version: style.version, videoUploaderEmail: 'lead@gmail.com' });
      const v = (first as any).data.version;

      const res = update({ id: style.id, version: v, videoFolderUrl: 'https://drive.google.com/drive/folders/' + folder });

      expect(res.ok).toBe(true);
      if (res.ok) expect((res.data as any).videoUploaderEmail).toBe('lead@gmail.com');
    });
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
    const styleId = addStyle('Popping');
    // 1. Create
    const createRes = handleRequest(
      {
        action: 'instructors.create',
        token: adminToken,
        payload: {
          name: 'Jane Doe',
          contact: '0123456789',
          styleIds: [styleId]
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

  it('instructors.create saves base64 photo to Google Drive Instructor Photos folder', () => {
    const styleId = addStyle('Popping');
    const fakeBase64 = 'data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoFAAUAPxF8s1CvqaSjAABQCWUAAP74b/8AA/7+gAA/v4AAP7/AAA==';
    const res = handleRequest(
      {
        action: 'instructors.create',
        token: adminToken,
        payload: {
          name: 'Elf',
          styleIds: [styleId],
          contact: '0165857601',
          color: 'pink',
          photoUrl: fakeBase64,
          photosJson: JSON.stringify([{ id: 'p1', url: fakeBase64, active: true }])
        }
      },
      ctx,
      secrets
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      const inst = res.data as any;
      expect(inst.name).toBe('Elf');
      expect(inst.color).toBe('pink');
      // Must be converted to Google Drive URL
      expect(inst.photoUrl).toMatch(/^https:\/\/lh3\.googleusercontent\.com\/d\//);
      const parsedPhotos = JSON.parse(inst.photosJson);
      expect(parsedPhotos[0].url).toMatch(/^https:\/\/lh3\.googleusercontent\.com\/d\//);
      // Deduplication: photoUrl and parsedPhotos[0].url should point to the exact same uploaded file
      expect(inst.photoUrl).toBe(parsedPhotos[0].url);

      // Verify that Instructor Photos folder exists in Drive
      const folderId = ctx.drive.findChildFolder('root', 'Instructor Photos');
      expect(folderId).toBeTruthy();

      // Test instructors.deletePhoto: deletes file from Drive and removes from gallery
      const deleteRes = handleRequest(
        {
          action: 'instructors.deletePhoto',
          token: adminToken,
          payload: {
            instructorId: inst.id,
            photoUrl: inst.photoUrl
          }
        },
        ctx,
        secrets
      );

      expect(deleteRes.ok).toBe(true);
      const updatedInst = deleteRes.data as any;
      expect(updatedInst.photoUrl).toBe('');
      expect(JSON.parse(updatedInst.photosJson)).toHaveLength(0);
    }
  });

  describe('style names are unique', () => {
    it('refuses a second style with the same name ignoring case and spaces', () => {
      addStyle('Hip Hop');
      expectFailure(call('styles.create', { name: 'hip  hop ' }), 'A style named "hip  hop" already exists.');
    });

    it('refuses a name that matches another style alias', () => {
      addStyle('Hip Hop', ['hiphop', 'hip-hop']);
      expectFailure(call('styles.create', { name: ' HipHop' }), 'A style named "HipHop" already exists.');
    });

    it('refuses an alias that matches another style name', () => {
      addStyle('Locking');
      expectFailure(
        call('styles.create', { name: 'Popping', aliases: ['pop', 'locking'] }),
        'A style named "locking" already exists.'
      );
    });

    it('refuses an alias that matches another style alias', () => {
      addStyle('Popping', ['pop']);
      expectFailure(
        call('styles.create', { name: 'Poppin', aliases: [' Pop '] }),
        'A style named "Pop" already exists.'
      );
    });

    it('allows saving a style with its own name and aliases', () => {
      const id = addStyle('Popping', ['popping', 'pop']);
      const style = ctx.db.styles.get(id)!;
      const res = call('styles.update', { id, version: style.version, name: 'popping', aliases: ['Popping', 'pop'] });
      expect(res.ok).toBe(true);
    });

    it('update checks the stored name when only aliases are sent', () => {
      addStyle('Locking');
      const id = addStyle('Popping');
      const style = ctx.db.styles.get(id)!;
      expectFailure(
        call('styles.update', { id, version: style.version, aliases: ['locking'] }),
        'A style named "locking" already exists.'
      );
    });

    it('ignores deactivated styles', () => {
      const old = ctx.db.styles.get(addStyle('Waacking'))!;
      ctx.db.styles.deactivate(old.id, old.version, 'admin1', ctx.now());
      expect(call('styles.create', { name: 'Waacking' }).ok).toBe(true);
    });
  });

  describe('instructors teach styles', () => {
    it('requires at least one style for an instructor', () => {
      expectFailure(
        call('instructors.create', { name: 'X', styleIds: [] }),
        'Choose at least one dance style this instructor teaches.'
      );
      expectFailure(
        call('instructors.create', { name: 'X' }),
        'Choose at least one dance style this instructor teaches.'
      );
    });

    it('rejects unknown or inactive style ids for an instructor', () => {
      const good = addStyle('Popping');
      const gone = ctx.db.styles.get(addStyle('Locking'))!;
      ctx.db.styles.deactivate(gone.id, gone.version, 'admin1', ctx.now());
      expect(call('instructors.create', { name: 'X', styleIds: [good, 'sty_nope'] }).ok).toBe(false);
      expect(call('instructors.create', { name: 'X', styleIds: [gone.id] }).ok).toBe(false);
    });

    it('stores cleaned style ids, and update validates them only when sent', () => {
      const a = addStyle('Popping');
      const b = addStyle('Locking');
      const created = call('instructors.create', { name: 'Jane', styleIds: [a, ` ${b} `, a] });
      expect(created.ok).toBe(true);
      expect(created.data.styleIds).toEqual([a, b]);

      const edited = call('instructors.update', { id: created.data.id, version: created.data.version, contact: '012' });
      expect(edited.ok).toBe(true);
      expect(edited.data.styleIds).toEqual([a, b]);

      const cleared = call('instructors.update', { id: created.data.id, version: edited.data.version, styleIds: [] });
      expect(cleared.ok).toBe(false);
      const narrowed = call('instructors.update', { id: created.data.id, version: edited.data.version, styleIds: [b] });
      expect(narrowed.data.styleIds).toEqual([b]);
    });

    it('update keeps working after one of the instructor styles is deactivated, and drops it', () => {
      const a = addStyle('Popping');
      const b = addStyle('Locking');
      const jane = call('instructors.create', { name: 'Jane', styleIds: [a, b] }).data;
      const gone = ctx.db.styles.get(b)!;
      ctx.db.styles.deactivate(gone.id, gone.version, 'admin1', ctx.now());

      const edited = call('instructors.update', { id: jane.id, version: jane.version, contact: '012', styleIds: [a, b] });
      expect(edited.ok, JSON.stringify(edited)).toBe(true);
      expect(edited.data.styleIds).toEqual([a]);
      expect(ctx.db.instructors.get(jane.id)!.styleIds).toEqual([a]);
    });

    it('update still rejects a newly sent inactive style', () => {
      const a = addStyle('Popping');
      const gone = ctx.db.styles.get(addStyle('Locking'))!;
      ctx.db.styles.deactivate(gone.id, gone.version, 'admin1', ctx.now());
      const jane = call('instructors.create', { name: 'Jane', styleIds: [a] }).data;
      expectFailure(
        call('instructors.update', { id: jane.id, version: jane.version, styleIds: [a, gone.id] }),
        `Unknown or inactive dance style: ${gone.id}`
      );
    });

    it('update rejects an instructor left with no active style', () => {
      const a = addStyle('Popping');
      const jane = call('instructors.create', { name: 'Jane', styleIds: [a] }).data;
      const gone = ctx.db.styles.get(a)!;
      ctx.db.styles.deactivate(gone.id, gone.version, 'admin1', ctx.now());
      expectFailure(
        call('instructors.update', { id: jane.id, version: jane.version, styleIds: [a] }),
        'Choose at least one dance style this instructor teaches.'
      );
    });

    it('instructors.delete removes the instructor from every event list but keeps classes', () => {
      const popping = addStyle('Popping');
      const locking = addStyle('Locking');
      const jane = call('instructors.create', { name: 'Jane', styleIds: [popping, locking] }).data;
      const joe = call('instructors.create', { name: 'Joe', styleIds: [popping] }).data;
      const ev1 = seedEvent(ctx, {
        styleIds: [popping, locking],
        styleInstructors: { [popping]: [jane.id, joe.id], [locking]: [jane.id] }
      });
      const ev2 = seedEvent(ctx, { styleIds: [popping], styleInstructors: { [popping]: [joe.id] } });
      const cls = ctx.db.sessions.insert(
        { eventId: ev1.id, styleId: popping, instructorId: jane.id, date: '2026-10-05', seq: 1 } as any,
        'admin1',
        ctx.now()
      );

      const res = call('instructors.delete', { id: jane.id, version: jane.version });
      expect(res.ok).toBe(true);

      expect(ctx.db.instructors.get(jane.id)?.active).toBe(false);
      expect(ctx.db.events.get(ev1.id)!.styleInstructors).toEqual({ [popping]: [joe.id], [locking]: [] });
      expect(ctx.db.events.get(ev2.id)!.styleInstructors).toEqual({ [popping]: [joe.id] });
      expect(ctx.db.events.get(ev2.id)!.version).toBe(ev2.version);
      expect(ctx.db.sessions.get(cls.id)).toMatchObject({ active: true, instructorId: jane.id });
    });
  });
});
