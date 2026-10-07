import {
  RowMeta,
  DanceStyle,
  Instructor,
  ClassSession,
  VideoItem,
  MusicItem,
  Section,
  Role,
  PermissionCode,
  EventItem
} from '@umdsc/shared';
import { DrivePort, SpreadsheetPort } from '../ports';
import { Table, RowCodec } from './table';
import { SCHEMA } from './schema';

export interface SettingRow extends RowMeta {
  key: string;
  value: string;
}

export interface LinkHistoryRow extends RowMeta {
  key: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedAt: string;
}

export interface MemberIndexRow extends RowMeta {
  matricKey: string;
  nameKey: string;
  fullName: string;
  eventIds: string[];
  lastEventEnd: string;
  /** Style ids the dancer registered for, per event id: lets login skip the event Members sheets. */
  eventStyles?: Record<string, string[]>;
}

export interface AttendanceSheetRow extends RowMeta {
  eventId: string;
  styleId: string;
  spreadsheetId: string;
}

export interface AdminRow extends RowMeta {
  username: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  iterations: number;
  roleId: string;
}

export interface RoleRow extends RowMeta {
  name: string;
  description: string;
  loginType: 'admin' | 'dancer';
  isSystem: boolean;
}

export interface RolePermissionRow extends RowMeta {
  roleId: string;
  permission: PermissionCode;
}

export interface MemberRoleRow extends RowMeta {
  matricKey: string;
  roleId: string;
  styleIds: string[];
}

export interface AuditLogRow extends RowMeta {
  ts: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

export interface Db {
  /** Forgets every cached table so the next read sees other requests' writes. */
  reload(): void;
  settings: Table<SettingRow>;
  events: Table<EventItem>;
  linkHistory: Table<LinkHistoryRow>;
  styles: Table<DanceStyle>;
  instructors: Table<Instructor>;
  sessions: Table<ClassSession>;
  memberIndex: Table<MemberIndexRow>;
  attendanceSheets: Table<AttendanceSheetRow>;
  admins: Table<AdminRow>;
  roles: Table<RoleRow>;
  rolePermissions: Table<RolePermissionRow>;
  memberRoles: Table<MemberRoleRow>;
  videos: Table<VideoItem>;
  music: Table<MusicItem>;
  sections: Table<Section>;
  auditLog: Table<AuditLogRow>;
}

function parseBool(val: string): boolean {
  return String(val).toUpperCase() === 'TRUE';
}

/** Reads the eventStyles cell: JSON `{ eventId: styleId[] }`; empty or invalid text means none stored. */
function parseEventStyles(raw: string | undefined): Record<string, string[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseList(val: string): string[] {
  if (!val) return [];
  return String(val).split(',').map(s => s.trim()).filter(Boolean);
}

function parseStyleInstructors(raw: string): Record<string, string[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string[]> = {};
    for (const [styleId, ids] of Object.entries(parsed)) {
      if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) return {};
      out[styleId] = ids as string[];
    }
    return out;
  } catch {
    return {};
  }
}

const defaultCodecs = {
  settings: {
    toCells: (r: SettingRow) => ({ ...r, active: r.active ? 'TRUE' : 'FALSE' }),
    fromCells: (c: Record<string, string>): SettingRow => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      key: c.key || '',
      value: c.value || ''
    })
  },
  events: {
    toCells: (r: EventItem) => {
      const { styleInstructors, ...rest } = r;
      return {
        ...rest,
        styleIds: (r.styleIds || []).join(','),
        styleInstructorsJson: JSON.stringify(styleInstructors || {}),
        active: r.active ? 'TRUE' : 'FALSE'
      };
    },
    fromCells: (c: Record<string, string>): EventItem => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      name: c.name || '',
      nameKey: c.nameKey || '',
      type: (c.type || 'other') as EventItem['type'],
      startDate: c.startDate || '',
      endDate: c.endDate || '',
      sourceSheetId: c.sourceSheetId || '',
      sourceTab: c.sourceTab || '',
      columnMapJson: c.columnMapJson || '{}',
      classIndex: c.classIndex === '' || c.classIndex === undefined ? -1 : Number(c.classIndex),
      styleIds: parseList(c.styleIds),
      styleInstructors: parseStyleInstructors(c.styleInstructorsJson),
      folderId: c.folderId || '',
      videoFolderId: c.videoFolderId || '',
      membersSpreadsheetId: c.membersSpreadsheetId || '',
      status: (c.status || 'active') as EventItem['status'],
      sourceRowCount: Number(c.sourceRowCount || 0),
      sourceLastRowHash: c.sourceLastRowHash || '',
      lastSyncAt: c.lastSyncAt || '',
      lastSyncError: c.lastSyncError || '',
      memberCount: Number(c.memberCount || 0)
    })
  },
  linkHistory: {
    toCells: (r: LinkHistoryRow) => ({ ...r, active: r.active ? 'TRUE' : 'FALSE' }),
    fromCells: (c: Record<string, string>): LinkHistoryRow => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      key: c.key || '',
      oldValue: c.oldValue || '',
      newValue: c.newValue || '',
      changedBy: c.changedBy || '',
      changedAt: c.changedAt || ''
    })
  },
  styles: {
    toCells: (r: DanceStyle) => ({
      ...r,
      aliases: Array.isArray(r.aliases) ? r.aliases.join(',') : String(r.aliases || ''),
      defaultWeekday: r.defaultWeekday !== null ? r.defaultWeekday : '',
      videoFoldersJson: r.videoFoldersJson || '[]',
      active: r.active ? 'TRUE' : 'FALSE'
    }),
    fromCells: (c: Record<string, string>): DanceStyle => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      name: c.name || '',
      aliases: parseList(c.aliases),
      colorKey: c.colorKey || '',
      defaultWeekday: c.defaultWeekday ? Number(c.defaultWeekday) : null,
      defaultStart: c.defaultStart || '',
      defaultEnd: c.defaultEnd || '',
      defaultInstructorId: c.defaultInstructorId || '',
      defaultVenue: c.defaultVenue || '',
      attendanceFolderId: c.attendanceFolderId || '',
      videoFolderId: c.videoFolderId || '',
      videoFoldersJson: c.videoFoldersJson || '[]',
      videoUploaderEmail: c.videoUploaderEmail || ''
    })
  },
  instructors: {
    toCells: (r: Instructor) => ({ ...r, styleIds: (r.styleIds || []).join(','), active: r.active ? 'TRUE' : 'FALSE' }),
    fromCells: (c: Record<string, string>): Instructor => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      name: c.name || '',
      contact: c.contact || '',
      color: c.color || '',
      photoUrl: c.photoUrl || '',
      photosJson: c.photosJson || '[]',
      styleIds: parseList(c.styleIds)
    })
  },
  sessions: {
    toCells: (r: ClassSession) => ({ ...r, seq: r.seq, active: r.active ? 'TRUE' : 'FALSE' }),
    fromCells: (c: Record<string, string>): ClassSession => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      eventId: c.eventId || '',
      styleId: c.styleId || '',
      seq: Number(c.seq || 1),
      date: c.date || '',
      start: c.start || '',
      end: c.end || '',
      instructorId: c.instructorId || '',
      venue: c.venue || '',
      status: (c.status || 'scheduled') as any,
      note: c.note || ''
    })
  },
  memberIndex: {
    toCells: (r: MemberIndexRow) => ({
      ...r,
      eventIds: (r.eventIds || []).join(','),
      eventStyles: JSON.stringify(r.eventStyles || {}),
      active: r.active ? 'TRUE' : 'FALSE'
    }),
    fromCells: (c: Record<string, string>): MemberIndexRow => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      matricKey: c.matricKey || '',
      nameKey: c.nameKey || '',
      fullName: c.fullName || '',
      eventIds: parseList(c.eventIds),
      lastEventEnd: c.lastEventEnd || '',
      eventStyles: parseEventStyles(c.eventStyles)
    })
  },
  attendanceSheets: {
    toCells: (r: AttendanceSheetRow) => ({ ...r, active: r.active ? 'TRUE' : 'FALSE' }),
    fromCells: (c: Record<string, string>): AttendanceSheetRow => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      eventId: c.eventId || '',
      styleId: c.styleId || '',
      spreadsheetId: c.spreadsheetId || ''
    })
  },
  admins: {
    toCells: (r: AdminRow) => ({ ...r, active: r.active ? 'TRUE' : 'FALSE' }),
    fromCells: (c: Record<string, string>): AdminRow => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      username: c.username || '',
      displayName: c.displayName || '',
      passwordHash: c.passwordHash || '',
      salt: c.salt || '',
      iterations: Number(c.iterations || 2000),
      roleId: c.roleId || ''
    })
  },
  roles: {
    toCells: (r: RoleRow) => ({
      ...r,
      isSystem: r.isSystem ? 'TRUE' : 'FALSE',
      active: r.active ? 'TRUE' : 'FALSE'
    }),
    fromCells: (c: Record<string, string>): RoleRow => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      name: c.name || '',
      description: c.description || '',
      loginType: (c.loginType || 'dancer') as any,
      isSystem: parseBool(c.isSystem)
    })
  },
  rolePermissions: {
    toCells: (r: RolePermissionRow) => ({ ...r, active: r.active ? 'TRUE' : 'FALSE' }),
    fromCells: (c: Record<string, string>): RolePermissionRow => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      roleId: c.roleId || '',
      permission: c.permission as PermissionCode
    })
  },
  memberRoles: {
    toCells: (r: MemberRoleRow) => ({
      ...r,
      styleIds: (r.styleIds || []).join(','),
      active: r.active ? 'TRUE' : 'FALSE'
    }),
    fromCells: (c: Record<string, string>): MemberRoleRow => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      matricKey: c.matricKey || '',
      roleId: c.roleId || '',
      styleIds: parseList(c.styleIds)
    })
  },
  videos: {
    toCells: (r: VideoItem) => ({ ...r, active: r.active ? 'TRUE' : 'FALSE' }),
    fromCells: (c: Record<string, string>): VideoItem => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      styleId: c.styleId || '',
      eventId: c.eventId || '',
      sessionId: c.sessionId || '',
      title: c.title || '',
      driveFileId: c.driveFileId || '',
      mimeType: c.mimeType || '',
      sizeBytes: Number(c.sizeBytes || 0),
      folderId: c.folderId || '',
      uploadedBy: c.uploadedBy || '',
      source: (c.source || 'upload') as any
    })
  },
  music: {
    toCells: (r: MusicItem) => ({ ...r, active: r.active ? 'TRUE' : 'FALSE' }),
    fromCells: (c: Record<string, string>): MusicItem => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      styleId: c.styleId || '',
      eventId: c.eventId || '',
      sessionId: c.sessionId || '',
      title: c.title || '',
      sourceType: (c.sourceType || 'mp3') as any,
      driveFileId: c.driveFileId || '',
      youtubeId: c.youtubeId || '',
      soundcloudUrl: c.soundcloudUrl || '',
      spotifyUrl: c.spotifyUrl || ''
    })
  },
  sections: {
    toCells: (r: Section) => ({
      ...r,
      videoStartSec: r.videoStartSec !== null ? r.videoStartSec : '',
      active: r.active ? 'TRUE' : 'FALSE'
    }),
    fromCells: (c: Record<string, string>): Section => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      musicId: c.musicId || '',
      name: c.name || '',
      startSec: Number(c.startSec || 0),
      endSec: Number(c.endSec || 0),
      videoId: c.videoId || '',
      videoStartSec: c.videoStartSec ? Number(c.videoStartSec) : null
    })
  },
  auditLog: {
    toCells: (r: AuditLogRow) => ({ ...r, active: r.active ? 'TRUE' : 'FALSE' }),
    fromCells: (c: Record<string, string>): AuditLogRow => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      ts: c.ts || '',
      actor: c.actor || '',
      action: c.action || '',
      target: c.target || '',
      detail: c.detail || ''
    })
  }
};

export function openDb(drive: DrivePort, systemSpreadsheetId: string): Db {
  let ss: SpreadsheetPort | null = null;
  const getSs = () => {
    if (!ss) {
      ss = drive.openSpreadsheet(systemSpreadsheetId);
    }
    return ss;
  };

  const getSheet = (tabName: keyof typeof SCHEMA) => {
    const sheet = getSs().sheet(tabName);
    if (!sheet) {
      // Create if missing
      return getSs().addSheet(tabName, [...SCHEMA[tabName]]);
    }
    return sheet;
  };

  const tables: Partial<Db> = {};

  return {
    reload() {
      for (const key of Object.keys(tables)) {
        delete (tables as any)[key];
      }
    },
    get settings() {
      return (tables.settings ||= new Table(getSheet('Settings'), SCHEMA.Settings, defaultCodecs.settings, 'set'));
    },
    get events() {
      return (tables.events ||= new Table(getSheet('Events'), SCHEMA.Events, defaultCodecs.events, 'evt'));
    },
    get linkHistory() {
      return (tables.linkHistory ||= new Table(getSheet('LinkHistory'), SCHEMA.LinkHistory, defaultCodecs.linkHistory, 'lh'));
    },
    get styles() {
      return (tables.styles ||= new Table(getSheet('DanceStyles'), SCHEMA.DanceStyles, defaultCodecs.styles, 'sty'));
    },
    get instructors() {
      return (tables.instructors ||= new Table(getSheet('Instructors'), SCHEMA.Instructors, defaultCodecs.instructors, 'ins'));
    },
    get sessions() {
      return (tables.sessions ||= new Table(getSheet('ClassSessions'), SCHEMA.ClassSessions, defaultCodecs.sessions, 'ses'));
    },
    get memberIndex() {
      return (tables.memberIndex ||= new Table(getSheet('MemberIndex'), SCHEMA.MemberIndex, defaultCodecs.memberIndex, 'mi'));
    },
    get attendanceSheets() {
      return (tables.attendanceSheets ||= new Table(getSheet('AttendanceSheets'), SCHEMA.AttendanceSheets, defaultCodecs.attendanceSheets, 'as'));
    },
    get admins() {
      return (tables.admins ||= new Table(getSheet('Admins'), SCHEMA.Admins, defaultCodecs.admins, 'adm'));
    },
    get roles() {
      return (tables.roles ||= new Table(getSheet('Roles'), SCHEMA.Roles, defaultCodecs.roles, 'rol'));
    },
    get rolePermissions() {
      return (tables.rolePermissions ||= new Table(getSheet('RolePermissions'), SCHEMA.RolePermissions, defaultCodecs.rolePermissions, 'rp'));
    },
    get memberRoles() {
      return (tables.memberRoles ||= new Table(getSheet('MemberRoles'), SCHEMA.MemberRoles, defaultCodecs.memberRoles, 'mr'));
    },
    get videos() {
      return (tables.videos ||= new Table(getSheet('Videos'), SCHEMA.Videos, defaultCodecs.videos, 'vid'));
    },
    get music() {
      return (tables.music ||= new Table(getSheet('Music'), SCHEMA.Music, defaultCodecs.music, 'mus'));
    },
    get sections() {
      return (tables.sections ||= new Table(getSheet('Sections'), SCHEMA.Sections, defaultCodecs.sections, 'sec'));
    },
    get auditLog() {
      return (tables.auditLog ||= new Table(getSheet('AuditLog'), SCHEMA.AuditLog, defaultCodecs.auditLog, 'log'));
    }
  };
}
