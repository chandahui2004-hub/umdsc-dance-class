import { Ctx } from '../../src/ports';
import { FakeHttp } from './fakeHttp';
import { FakeYouTube } from './fakeYouTube';
import { FakeDrive } from './fakeDrive';
import { FakeCache } from './fakeCache';
import { FakeLock } from './fakeLock';
import { FakeProps } from './fakeProps';
import { openDb } from '../../src/db/db';

export function makeCtx(opts?: {
  now?: Date;
  drive?: FakeDrive;
  cache?: FakeCache;
  lock?: FakeLock;
  props?: FakeProps;
  http?: FakeHttp;
  youtube?: FakeYouTube;
  clubEmail?: string;
  systemSpreadsheetId?: string;
  /** false leaves the one-time style-instructor fill-in pending; default presets it as done. */
  styleInstructorsMigrated?: boolean;
}): Ctx & { http: FakeHttp; youtube: FakeYouTube } {
  const drive = opts?.drive || new FakeDrive();
  const cache = opts?.cache || new FakeCache();
  const lock = opts?.lock || new FakeLock();
  const props = opts?.props || new FakeProps();
  if (opts?.styleInstructorsMigrated !== false) props.set('STYLE_INSTRUCTORS_V1', 'done');
  const http = opts?.http || new FakeHttp();
  const youtube = opts?.youtube || new FakeYouTube();
  const now = opts?.now || new Date('2026-09-28T12:00:00Z');
  const clubEmail = opts?.clubEmail || 'umdancesportc@gmail.com';
  const systemSpreadsheetId = opts?.systemSpreadsheetId || 'test_system_ss';

  const db = openDb(drive, systemSpreadsheetId);

  return {
    now: () => now,
    drive,
    cache,
    lock,
    props,
    db,
    clubEmail,
    http,
    youtube
  };
}
