import { ClassSession, Member } from '@umdsc/shared';

export const ATTENDANCE_FIXED_KEYS = [
  'memberId',
  'fullName',
  'matric',
  'contact',
  'gender',
  'nationality'
] as const;

export const FIXED_LABELS = [
  'Member ID',
  'Full Name',
  'Matric',
  'Contact',
  'Gender',
  'Nationality'
];

export function sessionLabel(s: Pick<ClassSession, 'seq' | 'date' | 'status'>): string {
  const [year, month, day] = s.date.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = days[d.getUTCDay()];
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  let label = `C${s.seq} ${dd}/${mm} ${weekday}`;
  if (s.status === 'cancelled') {
    label += ' (cancelled)';
  }
  return label;
}

export function buildLayout(
  members: Member[],
  sessions: ClassSession[]
): { keyRow: string[]; labelRow: string[]; rows: string[][] } {
  const keyRow: string[] = [...ATTENDANCE_FIXED_KEYS, ...sessions.map(s => s.id)];
  const labelRow: string[] = [...FIXED_LABELS, ...sessions.map(s => sessionLabel(s))];

  const rows: string[][] = [];
  for (const member of members) {
    const row: string[] = [
      member.memberId,
      member.fullName,
      member.matricRaw || member.matricKey,
      member.contact,
      member.gender,
      member.nationality,
      ...sessions.map(() => '')
    ];
    rows.push(row);
  }

  return { keyRow, labelRow, rows };
}

export function locateCell(
  keyRow: string[],
  memberIdColumn: string[],
  memberId: string,
  sessionId: string
): { row1: number; col1: number } | null {
  const colIdx = keyRow.indexOf(sessionId);
  if (colIdx === -1) return null;

  const rowIdx = memberIdColumn.indexOf(memberId);
  if (rowIdx === -1) return null;

  return {
    row1: rowIdx + 1,
    col1: colIdx + 1
  };
}

export function planSync(
  existingKeyRow: string[],
  existingMemberIds: string[],
  members: Member[],
  sessions: ClassSession[]
): { appendColumns: string[]; appendRows: Member[] } {
  const existingKeysSet = new Set(existingKeyRow);
  const existingMemberIdsSet = new Set(existingMemberIds);

  const appendColumns: string[] = [];
  for (const s of sessions) {
    if (!existingKeysSet.has(s.id)) {
      appendColumns.push(s.id);
    }
  }

  const appendRows: Member[] = [];
  for (const m of members) {
    if (!existingMemberIdsSet.has(m.memberId)) {
      appendRows.push(m);
    }
  }

  return { appendColumns, appendRows };
}
