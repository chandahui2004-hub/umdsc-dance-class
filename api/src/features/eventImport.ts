import { EventItem, Member } from '@umdsc/shared';
import { Ctx, SheetPort } from '../ports';
import { MEMBERS_COLUMNS } from '../db/schema';
import { matchHeaders, Field } from '../logic/headerMatch';
import { buildMembers } from '../logic/buildMembers';
import { hashSheet } from '../logic/events';
import { bumpAttendanceVersion } from '../logic/attendanceVersion';
import { logAudit } from '../logic/audit';
import { openSourceTab, timestampColumn, countUnknownClasses } from './eventSource';
import { membersChanged, readEventMembers } from './eventMembers';
import { ensureEventFolder, ensureMembersSheet, ensureEventSheets, saveEventFields } from './eventSheets';

export interface ImportResult {
  changed: boolean;
  added: number;
  updated: number;
  flaggedRemoved: number;
  purged: number;
  /** Dancers whose matric was corrected in the form and who were moved to it. */
  corrected: number;
  memberCount: number;
  unknownClasses: { token: string; count: number }[];
}

const REMOVED_FLAG = 'removed-from-form';
/** Member fields refreshed from the form on every sync that reads it. */
const REFRESHED_FIELDS: (keyof Member)[] = [
  'fullName', 'nameKey', 'contact', 'email', 'gender', 'nationality', 'styleIds', 'styleNames'
];
/** Fixed (non-tick) attendance columns refreshed by Sync now. */
const ATTENDANCE_FIXED: [string, (m: Member) => string][] = [
  ['fullName', m => m.fullName],
  ['matric', m => m.matricRaw || m.matricKey],
  ['contact', m => m.contact],
  ['gender', m => m.gender],
  ['nationality', m => m.nationality]
];

function cellsOf(m: Member): string[] {
  return MEMBERS_COLUMNS.map(col => {
    const v = (m as any)[col];
    return Array.isArray(v) ? v.join(',') : String(v ?? '');
  });
}

export function parseColumnMap(json: string, headers: string[]): Record<Field, number | null> {
  try {
    const parsed = JSON.parse(json || '{}');
    if (parsed && Object.keys(parsed).length > 0) return parsed;
  } catch {
    // fall through to automatic matching
  }
  return matchHeaders(headers).map;
}

function buildEventMembers(ctx: Ctx, event: EventItem, data: string[][]) {
  const headers = data[0] || [];
  const rows = data.slice(1);
  const styles = ctx.db.styles.find(s => event.styleIds.includes(s.id));
  const { members, timestampsByMember } = buildMembers({
    headers,
    rows,
    map: parseColumnMap(event.columnMapJson, headers),
    classIndex: event.classIndex,
    styles,
    timestampIndex: timestampColumn(headers)
  });

  // A single-style event whose form has no class question: everyone takes that style.
  if (event.classIndex < 0 && event.styleIds.length === 1) {
    const only = styles.find(s => s.id === event.styleIds[0]);
    for (const m of members) {
      m.styleIds = [event.styleIds[0]];
      m.styleNames = [only ? only.name : event.styleIds[0]];
      m.flags = m.flags.filter(f => f !== 'noStyle');
    }
  }
  return { members, timestampsByMember, unknownClasses: countUnknownClasses(rows, event.classIndex, styles) };
}

export function refreshAttendanceFixedColumns(ctx: Ctx, event: EventItem, changed: Map<string, Member>): void {
  for (const rec of ctx.db.attendanceSheets.find(a => a.eventId === event.id && a.active)) {
    const sheet = ctx.drive.openSpreadsheet(rec.spreadsheetId).sheet('Attendance');
    if (!sheet) continue;
    const data = sheet.getDisplayValues();
    const keyRow = data[0] || [];
    const idCol = keyRow.indexOf('memberId');
    const width = ATTENDANCE_FIXED.reduce((w, [key]) => Math.max(w, keyRow.indexOf(key) + 1), idCol + 1);
    let touched = false;
    const block = data.slice(2).map(row => {
      const cells = row.slice(0, width);
      const m = changed.get(row[idCol]);
      if (m) {
        for (const [key, value] of ATTENDANCE_FIXED) {
          const col = keyRow.indexOf(key);
          if (col >= 0) cells[col] = value(m);
        }
        touched = true;
      }
      return cells;
    });
    if (touched) sheet.setValues(3, 1, block);
  }
}

/** One read, no writes: true when nothing in the form changed (any response, not only the newest). */
export function sourceUnchanged(ctx: Ctx, event: EventItem): boolean {
  const { sheet } = openSourceTab(ctx, event.sourceSheetId, event.sourceTab);
  const data = sheet.getDisplayValues();
  if (data.length !== event.sourceRowCount || hashSheet(data) !== event.sourceLastRowHash) {
    return false;
  }
  // Re-read if source sheet has fewer responses than stored memberCount (e.g. responses were removed)
  if (data.length > 1 && event.memberCount > 0 && data.length - 1 < event.memberCount) {
    return false;
  }
  return true;
}

interface GoneRow {
  memberId: string;
  matricKey: string;
  nameKey: string;
  email: string;
  contact: string;
  sourceTimestamp: string;
  /** Already marked as gone by an earlier sync: only an exact response match may claim it. */
  removedBefore: boolean;
}

/** Same person: the name, email or phone number still agrees after the matric changed. */
function samePerson(g: GoneRow, m: Member): boolean {
  return (
    (Boolean(g.nameKey) && g.nameKey === m.nameKey) ||
    (Boolean(g.email) && g.email.toLowerCase() === m.email.toLowerCase()) ||
    (Boolean(g.contact) && g.contact === m.contact)
  );
}

/**
 * Members no longer in the form, paired with the member they became. The same response (timestamp)
 * now under another matric, for the same person, is a corrected matric; a timestamp that another
 * listed dancer shares proves nothing. Otherwise a dancer who has just appeared with the same name
 * is taken as a re-sent response; a name alone never joins two dancers already listed.
 */
export function findCorrections(
  gone: GoneRow[],
  members: Member[],
  timestampsByMember: Record<string, string[]>,
  knownIds: Set<string>,
  listed: { memberId: string; sourceTimestamp: string }[]
): Map<string, Member> {
  const corrections = new Map<string, Member>();
  for (const g of gone) {
    let target: Member | undefined;
    if (g.sourceTimestamp) {
      const sameResponse = members.filter(
        m => m.memberId !== g.memberId && (timestampsByMember[m.memberId] || []).includes(g.sourceTimestamp)
      );
      const candidate = sameResponse.length === 1 ? sameResponse[0] : undefined;
      // The candidate may share the timestamp only when an earlier sync split this dancer in two
      // (old row marked removed, corrected row added from the same response)
      const sharedWithOthers = listed.some(
        l =>
          l.sourceTimestamp === g.sourceTimestamp &&
          l.memberId !== g.memberId &&
          !(g.removedBefore && l.memberId === candidate?.memberId)
      );
      if (candidate && !sharedWithOthers && samePerson(g, candidate)) target = candidate;
    }
    if (!target && !g.removedBefore && g.nameKey) {
      const sameName = members.filter(m => !knownIds.has(m.memberId) && m.nameKey === g.nameKey);
      if (sameName.length === 1) target = sameName[0];
    }
    if (target) corrections.set(g.memberId, target);
  }
  return corrections;
}

/** More corrections than this in one sync means the form changed shape (e.g. a column moved), not typos. */
function tooManyCorrections(corrections: number, members: number): boolean {
  return corrections > Math.max(3, Math.ceil(members * 0.2));
}

/**
 * Moves corrected dancers in the attendance sheets: the old row takes the new id and details, or,
 * when the dancer already has a row, its class ticks are added to that row and the old row is emptied.
 */
function moveAttendanceRows(ctx: Ctx, event: EventItem, corrections: Map<string, Member>): void {
  for (const rec of ctx.db.attendanceSheets.find(a => a.eventId === event.id && a.active)) {
    const sheet = ctx.drive.openSpreadsheet(rec.spreadsheetId).sheet('Attendance');
    if (!sheet) continue;
    const data = sheet.getDisplayValues();
    const keyRow = data[0] || [];
    const idCol = keyRow.indexOf('memberId');
    if (idCol === -1) continue;
    const fixedCols = [idCol, ...ATTENDANCE_FIXED.map(([key]) => keyRow.indexOf(key)).filter(c => c >= 0)];
    const fixedWidth = Math.max(...fixedCols) + 1;
    // Only class columns carry ticks; anything else an admin added stays where it is
    const classCols = keyRow.map((key, c) => (key.startsWith('ses_') ? c : -1)).filter(c => c >= 0);
    const rowOf = new Map<string, number>();
    data.forEach((r, i) => {
      if (i >= 2 && r[idCol]) rowOf.set(r[idCol], i);
    });

    let touched = false;
    for (const [oldId, target] of corrections) {
      const from = rowOf.get(oldId);
      if (from === undefined) continue;
      const into = rowOf.get(target.memberId);
      if (into === undefined) {
        const cells = keyRow.slice(0, fixedWidth).map((_, c) => data[from][c] ?? '');
        cells[idCol] = target.memberId;
        for (const [key, value] of ATTENDANCE_FIXED) {
          const c = keyRow.indexOf(key);
          if (c >= 0) cells[c] = value(target);
        }
        sheet.setValues(from + 1, 1, [cells]);
        rowOf.set(target.memberId, from);
      } else {
        for (const c of classCols) {
          if (data[from][c] && !data[into][c]) {
            sheet.setValues(into + 1, c + 1, [[data[from][c]]]);
            data[into][c] = data[from][c];
          }
        }
        sheet.setValues(from + 1, 1, [[...fixedCols, ...classCols].reduce((cells, c) => {
          cells[c] = '';
          return cells;
        }, keyRow.map((_, c) => data[from][c] ?? ''))]);
      }
      rowOf.delete(oldId);
      touched = true;
    }
    if (touched) bumpAttendanceVersion(ctx, event.id, rec.styleId);
  }
}

/**
 * The old matric no longer belongs to this event, so signing in with it stops showing the event.
 * The entry itself stays active: the same matric may register again (or be the real one after all).
 */
function dropEventFromIndex(ctx: Ctx, event: EventItem, matricKey: string): void {
  const entry = ctx.db.memberIndex.find(m => m.matricKey === matricKey && m.active)[0];
  if (entry && entry.eventIds.includes(event.id)) {
    const eventIds = entry.eventIds.filter(id => id !== event.id);
    const eventStyles = { ...(entry.eventStyles || {}) };
    delete eventStyles[event.id];
    ctx.db.memberIndex.update(entry.id, entry.version, { eventIds, eventStyles }, 'sync', ctx.now());
  }
  ctx.cache.remove('mi:' + matricKey);
}

export function sendRegistrationConfirmationEmail(ctx: Ctx, event: EventItem, member: Member): void {
  const to = String(member.email || '').trim().toLowerCase();
  if (!to || !to.includes('@')) return;

  const name = member.fullName || 'Dancer';
  const eventName = event.name || 'UMDSC Dance Class';
  const stylesList = (member.styleNames && member.styleNames.length > 0)
    ? member.styleNames.join(', ')
    : 'All Styles';
  const matric = member.matricRaw || member.matricKey || '-';

  const subject = `[UMDSC] Registration Confirmed - ${eventName}`;
  const body = `Hi ${name},\n\nWelcome to UMDSC! Your registration for ${eventName} has been confirmed.\n\nEnrolled Style(s): ${stylesList}\nMatric Number: ${matric}\n\nYou can access your class schedules, practice music, and recap videos here:\nhttps://umdsc-dance-class.umdancesportc.workers.dev\n\nKeep dancing!\nUniversiti Malaya Dance Sport Club (UMDSC)`;

  const htmlBody = `<div style="font-family: sans-serif; line-height: 1.6; color: #222;">
  <h2 style="color: #6366f1;">UMDSC Dance Class System</h2>
  <p>Hi <strong>${name}</strong>,</p>
  <p>Welcome to UMDSC! Your registration for <strong>${eventName}</strong> has been confirmed.</p>
  <div style="background-color: #f3f4f6; border-left: 4px solid #6366f1; padding: 12px 16px; margin: 16px 0;">
    <p style="margin: 4px 0;"><strong>Enrolled Style(s):</strong> ${stylesList}</p>
    <p style="margin: 4px 0;"><strong>Matric Number:</strong> ${matric}</p>
  </div>
  <p>You can access your class schedules, practice music, and recap videos here:</p>
  <p style="margin: 24px 0;">
    <a href="https://umdsc-dance-class.umdancesportc.workers.dev" style="background-color: #6366f1; color: #fff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block;">GO TO DANCE CLASS PORTAL</a>
  </p>
  <p style="color: #666; font-size: 13px;">Or open: <a href="https://umdsc-dance-class.umdancesportc.workers.dev">https://umdsc-dance-class.umdancesportc.workers.dev</a></p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">Universiti Malaya Dance Sport Club (UMDSC)</p>
</div>`;

  try {
    ctx.mail.sendEmail({ to, subject, body, htmlBody });
  } catch (err) {
    console.warn(`[eventImport] Failed to send registration confirmation email to ${to}:`, err);
  }
}

/**
 * Brings an event's Members sheet, attendance sheets and MemberIndex up to date
 * with its form. Call with the script lock held. Without `full`, returns early
 * with no writes when the form's row count and last row are unchanged; `full`
 * (Sync now) always re-reads, which also catches edits to older responses.
 */
export function importEventMembers(
  ctx: Ctx,
  event: EventItem,
  opts: { full: boolean; purgeRemoved?: boolean; force?: boolean }
): ImportResult {
  const { tab, sheet: source } = openSourceTab(ctx, event.sourceSheetId, event.sourceTab);
  const data = source.getDisplayValues();
  const lastRow = data.length;
  const hash = hashSheet(data);
  if (!opts.full && lastRow === event.sourceRowCount && hash === event.sourceLastRowHash) {
    return { changed: false, added: 0, updated: 0, flaggedRemoved: 0, purged: 0, corrected: 0, memberCount: event.memberCount, unknownClasses: [] };
  }

  const { members, timestampsByMember, unknownClasses } = buildEventMembers(ctx, event, data);
  const incoming = new Map(members.map(m => [m.memberId, m]));

  // Members sheet: rewrite changed rows in one write, append new members in one write
  const folderId = ensureEventFolder(ctx, event);
  const membersId = ensureMembersSheet(ctx, ctx.db.events.get(event.id) || event, folderId);
  const membersSheet = ctx.drive.openSpreadsheet(membersId).sheet('Members') as SheetPort;
  const existing = membersSheet.getDisplayValues();
  const header = existing[0] || [...MEMBERS_COLUMNS];
  const col = (name: string) => header.indexOf(name);
  let body = existing.slice(1).map(r => MEMBERS_COLUMNS.map((_, i) => r[i] ?? ''));

  let updated = 0;
  let flaggedRemoved = 0;
  let purged = 0;
  let bodyChanged = false;
  const refreshed = new Map<string, Member>();
  const known = new Set(body.map(row => row[col('memberId')]).filter(Boolean));

  const gone: GoneRow[] = body
    .filter(row => row[col('memberId')] && !incoming.has(row[col('memberId')]))
    .map(row => ({
      memberId: row[col('memberId')],
      matricKey: row[col('matricKey')],
      nameKey: row[col('nameKey')],
      email: row[col('email')],
      contact: row[col('contact')],
      sourceTimestamp: row[col('sourceTimestamp')],
      removedBefore: String(row[col('flags')] || '').split(',').includes(REMOVED_FLAG)
    }));
  const listed = body
    .filter(row => row[col('memberId')])
    .map(row => ({ memberId: row[col('memberId')], sourceTimestamp: row[col('sourceTimestamp')] }));
  const corrections = findCorrections(gone, members, timestampsByMember, known, listed);
  const correctionsHeld = !opts.force && !opts.purgeRemoved && tooManyCorrections(corrections.size, members.length);
  if (correctionsHeld) corrections.clear();
  const placed = new Set<string>();

  if (opts.purgeRemoved) {
    for (const g of gone) {
      if (!corrections.has(g.memberId)) {
        dropEventFromIndex(ctx, event, g.matricKey);
      }
    }
  }

  const stylesAddedMembers: Member[] = [];

  body.forEach((row, i) => {
    const id = row[col('memberId')];
    if (!id) return;
    const flags = String(row[col('flags')] || '').split(',').filter(Boolean);
    const m = incoming.get(id);
    if (!m) {
      const target = corrections.get(id);
      if (target) {
        // A corrected matric: this row becomes the dancer's row, or is emptied when she already has one
        if (!known.has(target.memberId) && !placed.has(target.memberId)) {
          body[i] = cellsOf(target);
          placed.add(target.memberId);
        } else {
          body[i] = MEMBERS_COLUMNS.map(() => '');
        }
        bodyChanged = true;
        return;
      }
      if (opts.purgeRemoved) {
        body[i] = MEMBERS_COLUMNS.map(() => '');
        purged++;
        bodyChanged = true;
        return;
      }
      if (!flags.includes(REMOVED_FLAG)) {
        body[i][col('flags')] = [...flags, REMOVED_FLAG].join(',');
        flaggedRemoved++;
        bodyChanged = true;
      }
      return;
    }
    // The whole form was read, so refresh known members too (e.g. a second
    // submission adding a style); this writes only when something differs.
    const prevStyles = String(row[col('styleIds')] || '').split(',').filter(Boolean);
    const next = cellsOf(m);
    const differs = REFRESHED_FIELDS.some(f => next[col(f)] !== row[col(f)]);
    const hadDuplicateFlag = flags.includes('duplicate');
    if (differs || flags.includes(REMOVED_FLAG) || hadDuplicateFlag) {
      body[i] = next;
      bodyChanged = true;
      if (differs) {
        updated++;
        refreshed.set(id, m);
        const hasNewStyles = m.styleIds.some(s => !prevStyles.includes(s));
        if (hasNewStyles) {
          stylesAddedMembers.push(m);
        }
      }
    }
  });

  if (opts.purgeRemoved) {
    body = body.filter(r => r[col('memberId')]);
  }

  if (bodyChanged) {
    if (opts.purgeRemoved) {
      membersSheet.clearBody();
      if (body.length > 0) membersSheet.setValues(2, 1, body);
    } else {
      membersSheet.setValues(2, 1, body);
    }
  }
  const added = members.filter(m => !known.has(m.memberId) && !placed.has(m.memberId));
  if (added.length > 0) membersSheet.appendRows(added.map(cellsOf));

  const sentEmails = new Set<string>();
  for (const m of [...added, ...stylesAddedMembers]) {
    const to = String(m.email || '').trim().toLowerCase();
    if (!to || !to.includes('@') || sentEmails.has(to)) continue;
    sentEmails.add(to);
    sendRegistrationConfirmationEmail(ctx, event, m);
  }

  if (bodyChanged || added.length > 0) {
    membersChanged(ctx, event);
  }

  // Corrected matrics: move attendance rows (keeping ticks) and the sign-in link before new rows are added
  if (corrections.size > 0) {
    moveAttendanceRows(ctx, event, corrections);
    for (const g of gone) {
      const target = corrections.get(g.memberId);
      if (!target) continue;
      if (g.matricKey !== target.matricKey) dropEventFromIndex(ctx, event, g.matricKey);
      logAudit(ctx, 'sync', 'members.matricCorrected', target.memberId, `${g.memberId} → ${target.memberId} in ${event.name}`);
    }
  }

  // Attendance sheets: append new members / classes; Sync now also refreshes names
  const latest = ctx.db.events.get(event.id) || event;
  ensureEventSheets(ctx, latest);
  if (refreshed.size > 0) refreshAttendanceFixedColumns(ctx, latest, refreshed);

  // A dancer whose sign-in entry was switched off earlier (e.g. a matric moved away) is signing up again
  const inForm = new Set(members.map(m => m.matricKey));
  for (const off of ctx.db.memberIndex.find(m => !m.active && inForm.has(m.matricKey))) {
    ctx.db.memberIndex.update(off.id, off.version, { active: true } as any, 'sync', ctx.now());
    ctx.cache.remove('mi:' + off.matricKey);
  }

  // MemberIndex: one write for every dancer in this form
  const index = new Map(ctx.db.memberIndex.find(m => m.active).map(m => [m.matricKey, m]));
  ctx.db.memberIndex.upsertMany(
    'matricKey',
    members.map(m => {
      const prev = index.get(m.matricKey);
      const eventIds = Array.from(new Set([...(prev ? prev.eventIds : []), event.id]));
      const lastEventEnd = prev && prev.lastEventEnd > latest.endDate ? prev.lastEventEnd : latest.endDate;
      const styleIds = [...m.styleIds];
      const prevStyles = prev?.eventStyles?.[event.id];
      if (
        !prev ||
        !prev.eventIds.includes(event.id) ||
        prev.fullName !== m.fullName ||
        !prevStyles ||
        prevStyles.join(',') !== styleIds.join(',')
      ) {
        ctx.cache.remove('mi:' + m.matricKey);
      }
      const eventStyles = { ...(prev?.eventStyles || {}), [event.id]: styleIds };
      return { matricKey: m.matricKey, nameKey: m.nameKey, fullName: m.fullName, eventIds, lastEventEnd, eventStyles };
    }),
    'sync',
    ctx.now()
  );

  const activeBody = body.filter(r => r[col('memberId')] && !String(r[col('flags')] || '').split(',').includes(REMOVED_FLAG));
  const memberCount = activeBody.length + added.length;

  // Check slot capacity per style and send alert email once when capacity is reached
  const { newlyNotified, notifiedFullStyles: notifiedList } = checkAndNotifySlotCapacities(ctx, event, members);

  saveEventFields(ctx, event.id, {
    sourceTab: tab,
    sourceRowCount: lastRow,
    sourceLastRowHash: hash,
    memberCount,
    lastSyncAt: ctx.now().toISOString(),
    lastSyncError: correctionsHeld
      ? 'Many matric numbers changed at once, so no dancer was moved. Check that the columns of the form did not move.'
      : unknownClasses.length
        ? `Unknown class in form: ${unknownClasses.map(u => u.token).join(', ')}`
        : '',
    ...(newlyNotified ? { notifiedFullStyles: notifiedList, notifiedFullStylesJson: JSON.stringify(notifiedList) } : {})
  });

  return { changed: true, added: added.length, updated, flaggedRemoved, purged, corrected: corrections.size, memberCount, unknownClasses };
}

/**
 * Evaluates enrolled members against target styleSlots and sends notification
 * emails once when capacity is reached. Can be called during member import,
 * on event update (when slots are changed), or during background sync.
 */
export function checkAndNotifySlotCapacities(
  ctx: Ctx,
  event: EventItem,
  providedMembers?: Member[]
): { newlyNotified: boolean; notifiedFullStyles: string[] } {
  const slotCapacity = event.styleSlots || (event.styleSlotsJson ? JSON.parse(event.styleSlotsJson) : {});
  const alreadyNotified = new Set<string>(
    event.notifiedFullStyles || (event.notifiedFullStylesJson ? JSON.parse(event.notifiedFullStylesJson) : [])
  );
  let newlyNotified = false;

  const members = providedMembers || (event.membersSpreadsheetId ? readEventMembers(ctx, event) : []);
  const activeMembers = members.filter(
    m => !(m.flags || []).includes('removed') && !(m.flags || []).includes(REMOVED_FLAG)
  );

  // Recipients:
  // 1. Club system email
  const clubEmail = ctx.clubEmail || ctx.db.settings.find(s => s.key === 'clubEmail' && s.active)[0]?.value;
  // 2. Admin notification emails configured in Settings (comma/semicolon/newline separated)
  const adminNotifRaw = ctx.db.settings.find(s => s.key === 'adminNotificationEmails' && s.active)[0]?.value || '';
  const adminNotifEmails = adminNotifRaw
    .split(/[,;\n\r]+/)
    .map(e => e.trim())
    .filter(e => e.includes('@'));
  // 3. Admin user accounts with @ in username
  const adminUserEmails = ctx.db.admins.find(a => a.active && a.username.includes('@')).map(a => a.username);

  // 4. Test recipient override setting: when set, all live recipient notifications are suppressed and sent only to the test email
  const slotAlertTestEmail = (ctx.db.settings.find(s => s.key === 'slotAlertTestEmail' && s.active)[0]?.value || '').trim();
  const isTestMode = Boolean(slotAlertTestEmail && slotAlertTestEmail.includes('@'));

  for (const styleId of event.styleIds || []) {
    const cap = Number(slotCapacity[styleId]);
    if (cap > 0) {
      // If single style event, all event members count towards the style
      const enrolledCount = (event.styleIds.length === 1)
        ? activeMembers.length
        : activeMembers.filter(m => (m.styleIds || []).includes(styleId)).length;

      if (enrolledCount >= cap) {
        if (!alreadyNotified.has(styleId)) {
          alreadyNotified.add(styleId);
          newlyNotified = true;
          const style = ctx.db.styles.find(s => s.id === styleId && s.active)[0];
          const styleName = style?.name || styleId;
          const classLeadEmail = style?.videoUploaderEmail?.trim();
          const styleInstructors = (event.styleInstructors?.[styleId] || []);
          const instructorEmails = styleInstructors
            .map(id => ctx.db.instructors.get(id))
            .filter(Boolean)
            .map(i => i?.contact?.trim())
            .filter((c): c is string => Boolean(c && c.includes('@')));

          const allLiveRecipients = Array.from(
            new Set([
              clubEmail,
              ...adminNotifEmails,
              ...adminUserEmails,
              classLeadEmail,
              ...instructorEmails
            ].filter(Boolean).map(e => e!.toLowerCase()))
          ) as string[];

          const recipients = isTestMode ? [slotAlertTestEmail.toLowerCase()] : allLiveRecipients;

          for (const to of recipients) {
            const subjectPrefix = isTestMode ? '[TEST MODE] ' : '';
            const subject = `${subjectPrefix}[UMDSC Alert] Slot Full: ${styleName} in ${event.name} (${enrolledCount}/${cap} Enrolled)`;
            const body = isTestMode
              ? `[TEST MODE NOTICE: Recipient override is active. Live notifications to all ${allLiveRecipients.length} admins/contacts (${allLiveRecipients.join(', ')}) were suppressed and routed only to ${slotAlertTestEmail} for testing.]\n\nDear Admins and Class Lead,\n\nThis is an automated notification from the UMDSC Dance Class System.\n\nThe enrollment for ${styleName} in ${event.name} has reached or exceeded its target slot capacity:\n- Style: ${styleName}\n- Event: ${event.name}\n- Enrolled Dancers: ${enrolledCount}\n- Slot Capacity: ${cap}\n\nPlease note: The system and Google Form will still continue to accept additional member registrations unless you choose to close the form. This email is sent as an alert for your awareness.\n\nKeep dancing!\nUniversiti Malaya Dance Sport Club (UMDSC)`
              : `Dear Admins and Class Lead,\n\nThis is an automated notification from the UMDSC Dance Class System.\n\nThe enrollment for ${styleName} in ${event.name} has reached or exceeded its target slot capacity:\n- Style: ${styleName}\n- Event: ${event.name}\n- Enrolled Dancers: ${enrolledCount}\n- Slot Capacity: ${cap}\n\nPlease note: The system and Google Form will still continue to accept additional member registrations unless you choose to close the form. This email is sent as an alert for your awareness.\n\nKeep dancing!\nUniversiti Malaya Dance Sport Club (UMDSC)`;

            const testNoticeHtml = isTestMode
              ? `<div style="background-color: #fef9c3; border-left: 4px solid #ca8a04; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; color: #854d0e;">
    <strong>TEST MODE ACTIVE:</strong> Recipient override is active. Live notifications to all <strong>${allLiveRecipients.length}</strong> admins/contacts (<code>${allLiveRecipients.join(', ')}</code>) were suppressed and routed only to <strong>${slotAlertTestEmail}</strong> for testing.
  </div>`
              : '';

            const htmlBody = `<div style="font-family: sans-serif; line-height: 1.6; color: #222;">
  ${testNoticeHtml}
  <h2 style="color: #ef4444;">[UMDSC Alert] Slot Capacity Reached</h2>
  <p>The enrollment for <strong>${styleName}</strong> in <strong>${event.name}</strong> has reached its target slot capacity.</p>
  <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin: 16px 0;">
    <p style="margin: 4px 0;"><strong>Dance Style:</strong> ${styleName}</p>
    <p style="margin: 4px 0;"><strong>Event:</strong> ${event.name}</p>
    <p style="margin: 4px 0;"><strong>Enrolled Count:</strong> <span style="color: #ef4444; font-weight: bold;">${enrolledCount}</span> / ${cap}</p>
  </div>
  <p style="color: #4b5563;"><strong>Note:</strong> The system and Google Form will still continue to accept additional member registrations unless you choose to close the form. This notification is sent for your awareness.</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">Universiti Malaya Dance Sport Club (UMDSC)</p>
</div>`;
            try {
              ctx.mail.sendEmail({ to, subject, body, htmlBody, name: 'UMDSC Dance Class System' });
            } catch (err) {
              console.warn(`[checkAndNotifySlotCapacities] Failed to send slot capacity alert email to ${to}:`, err);
            }
          }
        }
      } else if (alreadyNotified.has(styleId)) {
        // Re-arm notification if enrollment drops below cap or cap was raised
        alreadyNotified.delete(styleId);
        newlyNotified = true;
      }
    }
  }

  const notifiedList = Array.from(alreadyNotified);
  if (newlyNotified) {
    event.notifiedFullStyles = notifiedList;
    event.notifiedFullStylesJson = JSON.stringify(notifiedList);
    saveEventFields(ctx, event.id, {
      notifiedFullStylesJson: event.notifiedFullStylesJson
    });
  }

  return { newlyNotified, notifiedFullStyles: notifiedList };
}

