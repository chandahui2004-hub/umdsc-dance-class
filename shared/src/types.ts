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
export interface StyleVideoFolder {
  id: string;
  name: string;
  url: string;
  addedAt: string;
}
export interface RowMeta { id: string; version: number; updatedBy: string; updatedAt: string; active: boolean }
export interface DanceStyle extends RowMeta { name: string; aliases: string[]; colorKey: string; defaultWeekday: number|null;
  defaultStart: HHmm; defaultEnd: HHmm; defaultInstructorId: string; defaultVenue: string; attendanceFolderId: string; videoFolderId: string; videoFoldersJson?: string }
export interface InstructorPhoto {
  id: string;
  url: string;
  active: boolean;
  uploadedAt: string;
}
export interface Instructor extends RowMeta {
  name: string;
  contact: string;
  color?: string;
  photoUrl?: string;
  photos?: InstructorPhoto[];
  photosJson?: string;
}
export interface ClassSession extends RowMeta { eventId: string; styleId: string; seq: number; date: ISODate; start: HHmm; end: HHmm;
  instructorId: string; venue: string; status: 'scheduled'|'replacement'|'cancelled'; note: string }
export interface Member { memberId: string; fullName: string; matricRaw: string; matricKey: string; nameKey: string; contact: string;
  email: string; gender: string; nationality: string; styleIds: string[]; styleNames: string[]; sourceTimestamp: string; flags: string[] }
export interface VideoItem extends RowMeta { styleId: string; eventId: string; sessionId: string; title: string; driveFileId: string;
  mimeType: string; sizeBytes: number; folderId: string; uploadedBy: string; source: 'upload'|'scan' }
export interface MusicItem extends RowMeta { styleId: string; eventId: string; sessionId: string; title: string;
  sourceType: 'mp3'|'youtube'|'soundcloud'|'spotify'; driveFileId: string; youtubeId: string;
  /** Canonical https://soundcloud.com/{user}/{track}; '' when the song is not on SoundCloud. */
  soundcloudUrl?: string;
  /** Canonical https://open.spotify.com/track/{id}; set when the song came from Spotify. */
  spotifyUrl?: string }
export interface Section extends RowMeta { musicId: string; name: string; startSec: number; endSec: number; videoId: string; videoStartSec: number|null }
export interface Role extends RowMeta { name: string; description: string; loginType: 'admin'|'dancer'; isSystem: boolean; permissions: PermissionCode[] }
export interface AdminUser extends RowMeta { username: string; displayName: string; roleId: string }
export interface TokenClaims { sub: string; role: 'admin'|'dancer'; name: string; exp: number; pv: number; perms: PermMap }
export interface DancerBootstrap { profile: { matricKey: string; fullName: string; eventIds: string[]; perms: PermMap };
  events: EventSummary[]; styles: DanceStyle[]; instructors: Instructor[]; sessions: ClassSession[]; attendance: { sessionId: string; present: boolean }[];
  videos: VideoItem[]; music: MusicItem[]; sections: Section[] }
export interface AdminBootstrap { profile: { username: string; displayName: string; perms: PermMap }; styles: DanceStyle[];
  instructors: Instructor[]; sessions: ClassSession[]; roles: Role[]; events: EventItem[]; settings: Record<string,string>;
  videos?: VideoItem[]; music?: MusicItem[]; sections?: Section[] }
export interface AttendanceGrid { eventId: string; styleId: string; version: number; sessions: ClassSession[];
  members: { memberId: string; fullName: string; matric: string }[]; present: Record<string, string[]>;
  spreadsheetId?: string; folderId?: string; masterFolderId?: string } // memberId -> sessionIds
export interface LoginResult<B> { token: string; claims: TokenClaims; bootstrap?: B }

export type EventType = 'monthly' | 'trial' | 'workshop' | 'other';
export type EventStatus = 'active' | 'archived';
export interface EventItem extends RowMeta {
  name: string; nameKey: string; type: EventType; startDate: ISODate; endDate: ISODate;
  sourceSheetId: string; sourceTab: string; columnMapJson: string; classIndex: number;
  styleIds: string[]; folderId: string; videoFolderId: string; membersSpreadsheetId: string;
  status: EventStatus; sourceRowCount: number; sourceLastRowHash: string;
  lastSyncAt: string; lastSyncError: string; memberCount: number;
}
export type EventListItem = EventItem & { folderMissing: boolean };
export type EventSummary = Pick<EventItem, 'id' | 'name' | 'type' | 'startDate' | 'endDate' | 'status' | 'styleIds'>;
export type TodayClass = ClassSession & { eventName: string };
export interface SourcePreview {
  headers: string[]; sourceTab: string; columnMap: Record<string, number | null>;
  scores: Record<string, number>; classIndex: number; rowCount: number; sampleNames: string[];
  detectedStyleIds: string[]; unknownClasses: { token: string; count: number }[];
  warnings: { kind: string; row: number; detail: string }[];
}

// Type aliases for UI convenience
export type Video = VideoItem;
export type Music = MusicItem;
export type MusicSection = Section;
