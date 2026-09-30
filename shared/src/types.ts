export type Month = string;      // 'YYYY-MM'
export type ISODate = string;    // 'YYYY-MM-DD'
export type HHmm = string;       // 'HH:mm'
export type ErrorCode = 'UNAUTHORIZED'|'FORBIDDEN'|'VALIDATION'|'NOT_FOUND'|'VERSION_CONFLICT'
  |'LINK_INVALID'|'LINK_NO_ACCESS'|'LINK_WRONG_KIND'|'LINK_READ_ONLY'|'NAME_MISMATCH'
  |'NOT_REGISTERED'|'LOCKED_OUT'|'BUSY'|'QUOTA'|'INTERNAL'|'SETUP_DONE'|'SETUP_REQUIRED';

export type PermissionCode = 'calendar.view'|'attendance.view.own'|'attendance.view.all'|'attendance.edit'
  |'sessions.edit'|'styles.edit'|'instructors.edit'|'members.view'|'members.import'|'videos.view'
  |'videos.upload'|'videos.edit'|'music.view'|'music.edit'|'sections.edit'|'settings.edit'
  |'admins.manage'|'roles.manage'|'export.download';

export const PERMISSIONS: readonly { code: PermissionCode; group: string; adminOnly?: true }[] = [
  { code: 'calendar.view', group: 'Calendar' },
  { code: 'attendance.view.own', group: 'Attendance' },
  { code: 'attendance.view.all', group: 'Attendance' },
  { code: 'attendance.edit', group: 'Attendance' },
  { code: 'sessions.edit', group: 'Master data' },
  { code: 'styles.edit', group: 'Master data' },
  { code: 'instructors.edit', group: 'Master data' },
  { code: 'members.view', group: 'Members' },
  { code: 'members.import', group: 'Members' },
  { code: 'videos.view', group: 'Videos' },
  { code: 'videos.upload', group: 'Videos' },
  { code: 'videos.edit', group: 'Videos' },
  { code: 'music.view', group: 'Music' },
  { code: 'music.edit', group: 'Music' },
  { code: 'sections.edit', group: 'Music' },
  { code: 'settings.edit', group: 'Settings', adminOnly: true },
  { code: 'admins.manage', group: 'Admin', adminOnly: true },
  { code: 'roles.manage', group: 'Admin', adminOnly: true },
  { code: 'export.download', group: 'Attendance' }
] as const;

export type PermMap = Partial<Record<PermissionCode, '*' | string[]>>;   // string[] = styleIds
export interface ApiRequest { action: string; token?: string; payload?: unknown; opId?: string; sinceVersion?: number }
export type ApiResponse<T> = { ok: true; data: T; dataVersion: number; serverTime: string }
  | { ok: false; error: { code: ErrorCode; message: string; retryable: boolean; latest?: unknown } };
export interface RowMeta { id: string; version: number; updatedBy: string; updatedAt: string; active: boolean }
export interface DanceStyle extends RowMeta { name: string; aliases: string[]; colorKey: string; defaultWeekday: number|null;
  defaultStart: HHmm; defaultEnd: HHmm; defaultInstructorId: string; defaultVenue: string; attendanceFolderId: string; videoFolderId: string }
export interface Instructor extends RowMeta { name: string; contact: string }
export interface ClassSession extends RowMeta { month: Month; styleId: string; seq: number; date: ISODate; start: HHmm; end: HHmm;
  instructorId: string; venue: string; status: 'scheduled'|'replacement'|'cancelled'; note: string }
export interface Member { memberId: string; fullName: string; matricRaw: string; matricKey: string; nameKey: string; contact: string;
  email: string; gender: string; nationality: string; styleIds: string[]; styleNames: string[]; sourceTimestamp: string; flags: string[] }
export interface VideoItem extends RowMeta { styleId: string; month: Month; sessionId: string; title: string; driveFileId: string;
  mimeType: string; sizeBytes: number; folderId: string; uploadedBy: string; source: 'upload'|'scan' }
export interface MusicItem extends RowMeta { styleId: string; month: Month; sessionId: string; title: string;
  sourceType: 'mp3'|'youtube'; driveFileId: string; youtubeId: string }
export interface Section extends RowMeta { musicId: string; name: string; startSec: number; endSec: number; videoId: string; videoStartSec: number|null }
export interface Role extends RowMeta { name: string; description: string; loginType: 'admin'|'dancer'; isSystem: boolean; permissions: PermissionCode[] }
export interface AdminUser extends RowMeta { username: string; displayName: string; roleId: string }
export interface TokenClaims { sub: string; role: 'admin'|'dancer'; name: string; exp: number; pv: number; perms: PermMap }
export interface DancerBootstrap { profile: { matricKey: string; fullName: string; months: Month[]; perms: PermMap };
  styles: DanceStyle[]; instructors: Instructor[]; sessions: ClassSession[]; attendance: { sessionId: string; present: boolean }[];
  videos: VideoItem[]; music: MusicItem[]; sections: Section[] }
export interface AdminBootstrap { profile: { username: string; displayName: string; perms: PermMap }; styles: DanceStyle[];
  instructors: Instructor[]; sessions: ClassSession[]; roles: Role[]; months: Month[]; settings: Record<string,string> }
export interface AttendanceGrid { month: Month; styleId: string; version: number; sessions: ClassSession[];
  members: { memberId: string; fullName: string; matric: string }[]; present: Record<string, string[]> } // memberId -> sessionIds
export interface LoginResult<B> { token: string; claims: TokenClaims; bootstrap: B }

// Type aliases for UI convenience
export type Video = VideoItem;
export type Music = MusicItem;
export type MusicSection = Section;
