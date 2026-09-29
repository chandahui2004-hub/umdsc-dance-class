import {
  RowMeta,
  DanceStyle,
  Instructor,
  ClassSession,
  VideoItem,
  MusicItem,
  Section,
  Role,
  PermissionCode
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

export interface MemberMonthRow extends RowMeta {
  month: string;
  sourceSheetId: string;
  sourceTab: string;
  columnMapJson: string;
  membersSpreadsheetId: string;
  importedBy: string;
  importedAt: string;
  lastSyncAt: string;
  memberCount: number;
}

export interface MemberIndexRow extends RowMeta {
  matricKey: string;
  nameKey: string;
  fullName: string;
  months: string[];
  lastMonth: string;
}

export interface AttendanceSheetRow extends RowMeta {
  month: string;
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
  settings: Table<SettingRow>;
  linkHistory: Table<LinkHistoryRow>;
  styles: Table<DanceStyle>;
  instructors: Table<Instructor>;
  sessions: Table<ClassSession>;
  memberMonths: Table<MemberMonthRow>;
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

function parseList(val: string): string[] {
  if (!val) return [];
  return String(val).split(',').map(s => s.trim()).filter(Boolean);
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
      videoFolderId: c.videoFolderId || ''
    })
  },
  instructors: {
    toCells: (r: Instructor) => ({ ...r, active: r.active ? 'TRUE' : 'FALSE' }),
    fromCells: (c: Record<string, string>): Instructor => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      name: c.name || '',
      contact: c.contact || ''
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
      month: c.month || '',
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
  memberMonths: {
    toCells: (r: MemberMonthRow) => ({ ...r, active: r.active ? 'TRUE' : 'FALSE' }),
    fromCells: (c: Record<string, string>): MemberMonthRow => ({
      id: c.id,
      version: Number(c.version || 1),
      updatedBy: c.updatedBy || '',
      updatedAt: c.updatedAt || '',
      active: parseBool(c.active),
      month: c.month || '',
      sourceSheetId: c.sourceSheetId || '',
      sourceTab: c.sourceTab || '',
      columnMapJson: c.columnMapJson || '{}',
      membersSpreadsheetId: c.membersSpreadsheetId || '',
      importedBy: c.importedBy || '',
      importedAt: c.importedAt || '',
      lastSyncAt: c.lastSyncAt || '',
      memberCount: Number(c.memberCount || 0)
    })
  },
  memberIndex: {
    toCells: (r: MemberIndexRow) => ({
      ...r,
      months: (r.months || []).join(','),
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
      months: parseList(c.months),
      lastMonth: c.lastMonth || ''
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
      month: c.month || '',
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
      month: c.month || '',
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
      month: c.month || '',
      sessionId: c.sessionId || '',
      title: c.title || '',
      sourceType: (c.sourceType || 'mp3') as any,
      driveFileId: c.driveFileId || '',
      youtubeId: c.youtubeId || ''
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
    get settings() {
      return (tables.settings ||= new Table(getSheet('Settings'), SCHEMA.Settings, defaultCodecs.settings, 'set'));
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
    get memberMonths() {
      return (tables.memberMonths ||= new Table(getSheet('MemberMonths'), SCHEMA.MemberMonths, defaultCodecs.memberMonths, 'mm'));
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
