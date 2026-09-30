export const COMMON_COLUMNS = ['id', 'version', 'updatedBy', 'updatedAt', 'active'] as const;

export const SCHEMA = {
  Settings: ['key', 'value', ...COMMON_COLUMNS],
  Events: ['name', 'nameKey', 'type', 'startDate', 'endDate', 'sourceSheetId', 'sourceTab', 'columnMapJson', 'classIndex', 'styleIds', 'folderId', 'videoFolderId', 'membersSpreadsheetId', 'status', 'sourceRowCount', 'sourceLastRowHash', 'lastSyncAt', 'lastSyncError', 'memberCount', ...COMMON_COLUMNS],
  LinkHistory: ['key', 'oldValue', 'newValue', 'changedBy', 'changedAt', ...COMMON_COLUMNS],
  DanceStyles: ['name', 'aliases', 'colorKey', 'defaultWeekday', 'defaultStart', 'defaultEnd', 'defaultInstructorId', 'defaultVenue', 'attendanceFolderId', 'videoFolderId', 'videoFoldersJson', ...COMMON_COLUMNS],
  Instructors: ['name', 'contact', ...COMMON_COLUMNS],
  ClassSessions: ['eventId', 'styleId', 'seq', 'date', 'start', 'end', 'instructorId', 'venue', 'status', 'note', ...COMMON_COLUMNS],
  MemberIndex: ['matricKey', 'nameKey', 'fullName', 'eventIds', 'lastEventEnd', ...COMMON_COLUMNS],
  AttendanceSheets: ['eventId', 'styleId', 'spreadsheetId', ...COMMON_COLUMNS],
  Admins: ['username', 'displayName', 'passwordHash', 'salt', 'iterations', 'roleId', ...COMMON_COLUMNS],
  Roles: ['name', 'description', 'loginType', 'isSystem', ...COMMON_COLUMNS],
  RolePermissions: ['roleId', 'permission', ...COMMON_COLUMNS],
  MemberRoles: ['matricKey', 'roleId', 'styleIds', ...COMMON_COLUMNS],
  Videos: ['styleId', 'eventId', 'sessionId', 'title', 'driveFileId', 'mimeType', 'sizeBytes', 'folderId', 'uploadedBy', 'source', ...COMMON_COLUMNS],
  Music: ['styleId', 'eventId', 'sessionId', 'title', 'sourceType', 'driveFileId', 'youtubeId', ...COMMON_COLUMNS],
  Sections: ['musicId', 'name', 'startSec', 'endSec', 'videoId', 'videoStartSec', ...COMMON_COLUMNS],
  AuditLog: ['ts', 'actor', 'action', 'target', 'detail', ...COMMON_COLUMNS]
} as const;

export type TabName = keyof typeof SCHEMA;

export const MEMBERS_COLUMNS = [
  'memberId',
  'fullName',
  'matricRaw',
  'matricKey',
  'nameKey',
  'contact',
  'email',
  'gender',
  'nationality',
  'styleIds',
  'styleNames',
  'sourceTimestamp',
  'flags'
] as const;

export const ATTENDANCE_FIXED_KEYS = [
  'memberId',
  'fullName',
  'matric',
  'contact',
  'gender',
  'nationality'
] as const;

export const PLAIN_TEXT_COLUMNS = new Set([
  'date',
  'start',
  'end',
  'month',
  'matric',
  'matricKey',
  'matricRaw',
  'contact',
  'defaultStart',
  'defaultEnd',
  'updatedAt',
  'sourceTimestamp',
  'importedAt',
  'lastSyncAt',
  'changedAt',
  'ts',
  'startDate',
  'endDate',
  'lastEventEnd'
]);
