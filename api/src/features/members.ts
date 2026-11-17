import { DanceStyle, EventItem, Member, TokenClaims } from '@umdsc/shared';
import { Route } from '../router';
import { Ctx, SheetPort } from '../ports';
import { AppError } from '../errors';
import { signToken } from '../security/tokens';
import { getDancerBootstrap } from './bootstrap';
import { logAudit } from '../logic/audit';
import { normalizeMatric, nameKey } from '../logic/normalize';
import { Field, FIELDS, matchHeaders } from '../logic/headerMatch';
import { getEvent, readEventMembers } from './eventMembers';
import { importEventMembers, parseColumnMap } from './eventImport';
import { openSourceTab, timestampColumn } from './eventSource';
import { saveEventFields } from './eventSheets';
import { detectClassColumn } from '../logic/classDetect';
import { isActiveMember, isMemberEnrolledInStyle } from '../logic/styleMatcher';
import { todayKL } from '../logic/events';
import { pastRetention, RETENTION_NO_SYNC } from './events';

/** Dancer details an admin may correct: payload key, form question, the name used in messages. */
const EDITABLE: [keyof Member, Field, string][] = [
  ['fullName', 'fullName', 'name'],
  ['matricRaw', 'matric', 'matric number'],
  ['contact', 'contact', 'phone number'],
  ['email', 'email', 'email'],
  ['gender', 'gender', 'gender'],
  ['nationality', 'nationality', 'nationality']
];

const DEFAULT_RESPONSE_HEADERS = [
  'Timestamp',
  'Full Name',
  'Matric Number',
  'Contact Number',
  'Email',
  'Gender',
  'Nationality',
  'Dance Class'
];

const CANONICAL_FIELD_HEADERS: Record<Field, string> = {
  fullName: 'Full Name',
  matric: 'Matric Number',
  contact: 'Contact Number',
  email: 'Email',
  gender: 'Gender',
  nationality: 'Nationality'
};

function assertWritableActiveEvent(ctx: Ctx, eventId: string): EventItem {
  const event = getEvent(ctx, eventId);
  if (event.status === 'archived') {
    throw new AppError('VALIDATION', 'Archived events cannot be edited');
  }
  // Re-reading an old form would undo the retention wipe of its dancers
  if (pastRetention(event, todayKL(ctx.now()))) {
    throw new AppError('VALIDATION', RETENTION_NO_SYNC);
  }
  return event;
}

function parseStyleFormLabels(event: EventItem): Record<string, string> {
  if (event.styleFormLabels) return event.styleFormLabels;
  if (!event.styleFormLabelsJson) return {};
  try {
    return JSON.parse(event.styleFormLabelsJson);
  } catch {
    return {};
  }
}

function formatStyleCell(event: EventItem, styleIds: string[], allStyles: DanceStyle[]): string {
  const formLabels = parseStyleFormLabels(event);
  return styleIds
    .map(sid => {
      const custom = String(formLabels[sid] || '').trim();
      if (custom) return custom;
      const st = allStyles.find(s => s.id === sid);
      return st ? st.name : sid;
    })
    .join(', ');
}

function validateContactOrEmail(field: Field, value: string): void {
  if (!value) return;
  if (field === 'contact' && value.replace(/\D/g, '').length < 6) {
    throw new AppError('VALIDATION', 'Enter a valid phone number (at least 6 digits)');
  }
  if (field === 'email' && !/^(n\/?a|-+|none|nil)$/i.test(value) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new AppError('VALIDATION', 'Enter a valid email address');
  }
}

function resolveOrCreateClassColumn(
  event: EventItem,
  sheet: SheetPort,
  headers: string[],
  dataRows: string[][],
  allStyles: DanceStyle[],
  styleIds: string[]
): { classCol: number; classIndexDirty: boolean } {
  const detected = detectClassColumn(dataRows, allStyles, headers)?.index ?? -1;
  let classCol = event.classIndex >= 0 ? event.classIndex : detected;
  if (classCol < 0 && headers.length > 0) {
    const headerIdx = headers.findIndex(h =>
      /^(dance\s*class(es)?|class(es)?|dance\s*style(s)?|style(s)?)$/i.test(String(h || '').trim())
    );
    if (headerIdx >= 0) classCol = headerIdx;
  }

  // Single-style events without an existing class column rely on buildEventMembers's fallback
  if (classCol < 0 && event.styleIds.length === 1 && styleIds.length === 1 && styleIds[0] === event.styleIds[0]) {
    return { classCol: -1, classIndexDirty: false };
  }

  let createdColumn = false;
  if (classCol < 0 && (event.styleIds.length > 1 || styleIds.length > 0)) {
    classCol = headers.length;
    headers.push('Dance Class');
    sheet.setValues(1, classCol + 1, [['Dance Class']]);
    createdColumn = true;
  }

  const classIndexDirty =
    classCol >= 0 &&
    event.classIndex < 0 &&
    (createdColumn || detected >= 0 || event.styleIds.length > 1);

  return { classCol, classIndexDirty };
}

function findMemberResponseRows(
  data: string[][],
  matricCol: number,
  matricKey: string
): { row: string[]; i: number }[] {
  return data
    .map((row, i) => ({ row, i }))
    .filter(({ row, i }) => i >= 1 && normalizeMatric(row[matricCol] ?? '') === matricKey);
}

function clearResponseRows(sheet: SheetPort, rows: { row: string[]; i: number }[], minWidth: number): void {
  for (const { row, i } of rows) {
    const width = Math.max(minWidth, row.length);
    if (width === 0) continue;
    sheet.setValues(i + 1, 1, [Array.from({ length: width }, () => '')]);
  }
}

function runMemberSync(ctx: Ctx, eventId: string, fallbackEvent: EventItem) {
  const result = importEventMembers(ctx, ctx.db.events.get(eventId) || fallbackEvent, {
    full: true,
    purgeRemoved: true,
    suppressFormReopen: true
  });
  ctx.cache.remove(`sync:force:${eventId}`);
  return result;
}

function wrapSheetWriteError(ctx: Ctx, err: unknown): never {
  if (err instanceof AppError) throw err;
  throw new AppError(
    'LINK_NO_ACCESS',
    `Give ${ctx.clubEmail} Editor access to the registration form's response sheet, then try again.`
  );
}

export function getMemberRoutes(): Record<string, Route> {
  return {
    'members.list': {
      perm: 'members.view',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const { eventId, styleId } = payload || {};
        if (!eventId) {
          throw new AppError('VALIDATION', 'eventId is required');
        }
        const members = readEventMembers(ctx, getEvent(ctx, eventId));
        if (!styleId) return members;
        const allStyles = ctx.db.styles.find(s => s.active);
        return members.filter(m => isMemberEnrolledInStyle(m, styleId, allStyles));
      }
    },

    'members.add': {
      perm: 'members.import',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const eventId = String(payload?.eventId || '').trim();
        if (!eventId) {
          throw new AppError('VALIDATION', 'eventId is required');
        }
        const event = assertWritableActiveEvent(ctx, eventId);

        const fullName = String(payload?.fullName ?? '').trim();
        if (!fullName) {
          throw new AppError('VALIDATION', 'Name cannot be empty');
        }

        const matricRaw = String(payload?.matricRaw ?? payload?.matric ?? '').trim();
        const matricKey = normalizeMatric(matricRaw);
        if (!matricKey || matricKey.length < 4) {
          throw new AppError('VALIDATION', 'Enter a valid matric number');
        }

        const contact = String(payload?.contact ?? '').trim();
        const email = String(payload?.email ?? '').trim();
        const gender = String(payload?.gender ?? '').trim();
        const nationality = String(payload?.nationality ?? '').trim();
        validateContactOrEmail('contact', contact);
        validateContactOrEmail('email', email);

        const activeMembers = readEventMembers(ctx, event).filter(isActiveMember);
        if (activeMembers.some(m => m.matricKey === matricKey)) {
          throw new AppError('VALIDATION', `Matric ${matricRaw} is already registered in ${event.name}`);
        }

        const signIn = ctx.db.memberIndex.find(m => m.matricKey === matricKey && m.active)[0];
        if (signIn && signIn.eventIds.length > 0 && signIn.nameKey !== nameKey(fullName)) {
          throw new AppError('VALIDATION', `Matric ${matricRaw} already belongs to ${signIn.fullName}`);
        }

        let styleIds: string[];
        if (payload?.styleIds === undefined) {
          styleIds = event.styleIds.length === 1 ? [event.styleIds[0]] : [];
        } else if (Array.isArray(payload.styleIds)) {
          styleIds = Array.from(new Set(payload.styleIds.map((s: any) => String(s ?? '').trim()).filter(Boolean)));
        } else {
          throw new AppError('VALIDATION', 'Select at least one dance class');
        }
        if (styleIds.length === 0) {
          throw new AppError('VALIDATION', 'Select at least one dance class');
        }
        for (const sid of styleIds) {
          if (!event.styleIds.includes(sid)) {
            throw new AppError('VALIDATION', 'Selected dance class is not part of this event');
          }
        }

        const actor = auth?.claims.sub || 'system';
        const { sheet } = openSourceTab(ctx, event.sourceSheetId, event.sourceTab);
        const data = sheet.getDisplayValues();
        const headers = [...(data[0] || [])];
        const allStyles = ctx.db.styles.find(s => s.active || event.styleIds.includes(s.id));

        try {
          if (headers.length === 0) {
            headers.push(...DEFAULT_RESPONSE_HEADERS);
            sheet.setHeaderRow(headers);
          }

          const map = parseColumnMap(event.columnMapJson, headers);
          const autoMap = matchHeaders(headers).map;
          let columnMapDirty = false;

          const fieldValues: Record<Field, string> = {
            fullName,
            matric: matricRaw,
            contact,
            email,
            gender,
            nationality
          };

          for (const field of FIELDS) {
            const val = fieldValues[field];
            const needsCol = field === 'fullName' || field === 'matric' || Boolean(val);
            if (!needsCol) continue;
            if (map[field] === null || map[field] === undefined) {
              if (autoMap[field] !== null && autoMap[field] !== undefined) {
                map[field] = autoMap[field];
              } else {
                const colIdx = headers.length;
                const headerLabel = CANONICAL_FIELD_HEADERS[field];
                headers.push(headerLabel);
                sheet.setValues(1, colIdx + 1, [[headerLabel]]);
                map[field] = colIdx;
              }
              columnMapDirty = true;
            }
          }

          const { classCol, classIndexDirty } = resolveOrCreateClassColumn(
            event,
            sheet,
            headers,
            data.slice(1),
            allStyles,
            styleIds
          );

          const eventPatch: Record<string, any> = {};
          if (columnMapDirty) eventPatch.columnMapJson = JSON.stringify(map);
          if (classIndexDirty) eventPatch.classIndex = classCol;
          if (Object.keys(eventPatch).length > 0) {
            saveEventFields(ctx, event.id, eventPatch, actor);
          }

          const tsCol = timestampColumn(headers);
          const plainCols = [map.matric, map.contact]
            .filter((c): c is number => c !== null && c !== undefined)
            .map(c => c + 1);
          if (plainCols.length > 0) sheet.setPlainTextColumns(plainCols);

          const newRow = new Array(headers.length).fill('');
          if (tsCol !== null) newRow[tsCol] = ctx.now().toISOString();
          for (const field of Object.keys(fieldValues) as Field[]) {
            const colIdx = map[field];
            if (colIdx !== null && colIdx !== undefined) {
              newRow[colIdx] = fieldValues[field];
            }
          }
          if (classCol >= 0) {
            newRow[classCol] = formatStyleCell(event, styleIds, allStyles);
          }
          sheet.appendRows([newRow]);
        } catch (err) {
          wrapSheetWriteError(ctx, err);
        }

        const result = runMemberSync(ctx, event.id, event);
        const memberId = 'M-' + matricKey;
        logAudit(ctx, actor, 'members.add', memberId, `Added ${fullName} (${matricRaw}) to ${event.name} [${styleIds.join(',')}]`);
        return { memberId, result };
      }
    },

    // The registration form's response sheet stays the one source of a dancer's details: an edit is
    // written into every response of that dancer, then the event syncs at once (a corrected matric
    // moves the dancer, her attendance ticks and her sign-in, like a correction made in the sheet).
    'members.edit': {
      perm: 'members.import',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { eventId, memberId } = payload || {};
        if (!eventId || !memberId) {
          throw new AppError('VALIDATION', 'eventId and memberId are required');
        }
        const event = assertWritableActiveEvent(ctx, String(eventId));
        const everyone = readEventMembers(ctx, event).filter(isActiveMember);
        const member = everyone.find(m => m.memberId === memberId);
        if (!member) {
          throw new AppError('NOT_FOUND', `Dancer ${memberId} not found in ${event.name}`);
        }

        const hasStyleEdit = payload.styleIds !== undefined;
        let nextStyleIds: string[] = [];
        if (hasStyleEdit) {
          if (!Array.isArray(payload.styleIds)) {
            throw new AppError('VALIDATION', 'styleIds must be an array');
          }
          nextStyleIds = Array.from(new Set(payload.styleIds.map((s: any) => String(s ?? '').trim()).filter(Boolean)));
          for (const sid of nextStyleIds) {
            if (!event.styleIds.includes(sid)) {
              throw new AppError('VALIDATION', `Dance class ${sid} is not part of ${event.name}`);
            }
          }
        }

        const changes: { field: Field; value: string; label: string; current: string }[] = [];
        for (const [key, field, label] of EDITABLE) {
          if (payload[key] === undefined) continue;
          const value = String(payload[key] ?? '').trim();
          if (field === 'fullName' && !value) throw new AppError('VALIDATION', 'Name cannot be empty');
          validateContactOrEmail(field, value);
          if (field === 'matric') {
            const newKey = normalizeMatric(value);
            if (!newKey) throw new AppError('VALIDATION', 'Enter a valid matric number');
            // Typing someone else's matric would join two dancers, and that cannot be undone here
            const owner = everyone.find(m => m.matricKey === newKey && m.memberId !== memberId);
            if (owner) {
              throw new AppError('VALIDATION', `Matric ${value} already belongs to ${owner.fullName} in ${event.name}`);
            }
            // Signed up elsewhere under another name: a different dancer, whose sign-in this would break
            const signIn = ctx.db.memberIndex.find(m => m.matricKey === newKey && m.active)[0];
            const incomingNameKey = payload.fullName !== undefined ? nameKey(String(payload.fullName || '').trim()) : member.nameKey;
            if (
              signIn &&
              signIn.eventIds.length > 0 &&
              signIn.nameKey !== member.nameKey &&
              signIn.nameKey !== incomingNameKey
            ) {
              throw new AppError('VALIDATION', `Matric ${value} already belongs to ${signIn.fullName}`);
            }
          }
          changes.push({ field, value, label, current: String(member[key] ?? '') });
        }

        const actor = auth?.claims.sub || 'system';
        const { sheet } = openSourceTab(ctx, event.sourceSheetId, event.sourceTab);
        const data = sheet.getDisplayValues();
        const headers = [...(data[0] || [])];
        const map = parseColumnMap(event.columnMapJson, headers);
        const matricCol = map.matric;
        if (matricCol === null || matricCol === undefined) {
          throw new AppError('VALIDATION', 'The registration form has no matric number question');
        }
        const responseRows = findMemberResponseRows(data, matricCol, member.matricKey);
        if (responseRows.length === 0) {
          throw new AppError('NOT_FOUND', "This dancer's response is no longer in the registration form's response sheet");
        }

        if (hasStyleEdit && nextStyleIds.length === 0) {
          try {
            clearResponseRows(sheet, responseRows, headers.length);
          } catch (err) {
            wrapSheetWriteError(ctx, err);
          }
          const result = runMemberSync(ctx, event.id, event);
          logAudit(
            ctx,
            actor,
            'members.remove',
            memberId,
            `Removed ${member.fullName} (${member.matricRaw || member.matricKey}) from ${event.name} (dropped all classes)`
          );
          return { memberId, removed: true, result };
        }

        // Check every field before writing any, so a refused edit leaves the sheet untouched
        const writes: { col: number; value: string; plainText: boolean }[] = [];
        for (const change of changes) {
          const c = map[change.field];
          if (c === null || c === undefined) {
            if (change.value !== change.current) {
              throw new AppError('VALIDATION', `The registration form has no ${change.label} question, so it can't be changed here`);
            }
            continue;
          }
          // Matric and phone numbers stay text, so Sheets keeps leading zeros and a leading +
          writes.push({ col: c, value: change.value, plainText: change.field === 'matric' || change.field === 'contact' });
        }

        const allStyles = ctx.db.styles.find(s => s.active || event.styleIds.includes(s.id));
        try {
          if (hasStyleEdit) {
            const primary = responseRows[0];
            const { classCol, classIndexDirty } = resolveOrCreateClassColumn(
              event,
              sheet,
              headers,
              data.slice(1),
              allStyles,
              nextStyleIds
            );
            if (classIndexDirty) {
              saveEventFields(ctx, event.id, { classIndex: classCol }, actor);
            }

            // Preserve merged profile fields from newer duplicate submissions before clearing them
            for (const [key, field] of EDITABLE) {
              if (payload[key] !== undefined) continue;
              const colIdx = map[field];
              if (colIdx === null || colIdx === undefined) continue;
              const curCell = (primary.row[colIdx] ?? '').trim();
              const fallbackVal = String(member[key] ?? '').trim();
              if (!curCell && fallbackVal) {
                if (field === 'matric' || field === 'contact') sheet.setPlainTextColumns([colIdx + 1]);
                sheet.setValues(primary.i + 1, colIdx + 1, [[fallbackVal]]);
              }
            }

            for (const w of writes) {
              if ((primary.row[w.col] ?? '') === w.value) continue;
              if (w.plainText) sheet.setPlainTextColumns([w.col + 1]);
              sheet.setValues(primary.i + 1, w.col + 1, [[w.value]]);
            }

            if (classCol >= 0) {
              const classValue = formatStyleCell(event, nextStyleIds, allStyles);
              if ((primary.row[classCol] ?? '') !== classValue) {
                sheet.setValues(primary.i + 1, classCol + 1, [[classValue]]);
              }
            }

            if (responseRows.length > 1) {
              clearResponseRows(sheet, responseRows.slice(1), headers.length);
            }
          } else {
            for (const w of writes) {
              const rowsToWrite = responseRows.filter(({ row }) => (row[w.col] ?? '') !== w.value);
              if (rowsToWrite.length === 0) continue;
              if (w.plainText) sheet.setPlainTextColumns([w.col + 1]);
              for (const { i } of rowsToWrite) sheet.setValues(i + 1, w.col + 1, [[w.value]]);
            }
          }
        } catch (err) {
          wrapSheetWriteError(ctx, err);
        }

        const result = runMemberSync(ctx, event.id, event);

        const matric = changes.find(c => c.field === 'matric');
        const newMemberId = matric ? 'M-' + normalizeMatric(matric.value) : memberId;
        const editedParts = [...changes.map(c => c.label), ...(hasStyleEdit ? ['classes'] : [])];
        logAudit(
          ctx,
          actor,
          'members.edit',
          newMemberId,
          `${editedParts.join(', ') || 'nothing'} edited for ${memberId} in ${event.name}`
        );
        return { memberId: newMemberId, result };
      }
    },

    'members.remove': {
      perm: 'members.import',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { eventId, memberId } = payload || {};
        if (!eventId || !memberId) {
          throw new AppError('VALIDATION', 'eventId and memberId are required');
        }
        const event = assertWritableActiveEvent(ctx, String(eventId));
        const member = readEventMembers(ctx, event).find(m => m.memberId === memberId);
        const matricKey = member?.matricKey || normalizeMatric(String(memberId).replace(/^M-/, ''));
        if (!member && !matricKey) {
          throw new AppError('NOT_FOUND', `Dancer ${memberId} not found in ${event.name}`);
        }

        const { sheet } = openSourceTab(ctx, event.sourceSheetId, event.sourceTab);
        const data = sheet.getDisplayValues();
        const headers = data[0] || [];
        const map = parseColumnMap(event.columnMapJson, headers);
        const matricCol = map.matric;
        if (matricCol === null || matricCol === undefined) {
          throw new AppError('VALIDATION', 'The registration form has no matric number question');
        }
        const responseRows = findMemberResponseRows(data, matricCol, matricKey);
        if (!member && responseRows.length === 0) {
          throw new AppError('NOT_FOUND', `Dancer ${memberId} not found in ${event.name}`);
        }

        try {
          clearResponseRows(sheet, responseRows, headers.length);
        } catch (err) {
          wrapSheetWriteError(ctx, err);
        }

        const result = runMemberSync(ctx, event.id, event);
        const actor = auth?.claims.sub || 'system';
        logAudit(
          ctx,
          actor,
          'members.remove',
          String(memberId),
          `Removed ${member?.fullName || memberId} (${matricKey}) from ${event.name}`
        );
        return { memberId, removed: true, result };
      }
    },

    'members.selfEdit': {
      perm: 'signedIn',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        if (!auth || auth.claims.role !== 'dancer') {
          throw new AppError('FORBIDDEN', 'Dancer login required');
        }

        const oldMatricKey = auth.claims.sub.replace(/^M-/, '');
        const dancer = ctx.db.memberIndex.find(m => m.matricKey === oldMatricKey && m.active)[0];
        if (!dancer) {
          throw new AppError('NOT_FOUND', 'Dancer record not found');
        }

        const nameVal = payload?.fullName !== undefined ? payload.fullName : payload?.newFullName;
        const newFullName = nameVal !== undefined ? String(nameVal).trim() : dancer.fullName;

        const matricVal = payload?.matric !== undefined ? payload.matric : payload?.newMatric;
        const rawMatric = matricVal !== undefined ? String(matricVal).trim() : dancer.matricKey;

        if (!newFullName) {
          throw new AppError('VALIDATION', 'Name cannot be empty');
        }

        const newMatricKey = normalizeMatric(rawMatric);
        if (!newMatricKey) {
          throw new AppError('VALIDATION', 'Enter a valid matric number');
        }

        if (newMatricKey !== oldMatricKey) {
          const owner = ctx.db.memberIndex.find(m => m.matricKey === newMatricKey && m.active)[0];
          if (owner && owner.id !== dancer.id) {
            throw new AppError('VALIDATION', `Matric ${rawMatric} already belongs to ${owner.fullName}`);
          }
        }

        const eventIds = dancer.eventIds || [];
        const activeEvents = ctx.db.events.find(
          e => eventIds.includes(e.id) && e.active && e.status !== 'archived'
        );

        for (const event of activeEvents) {
          if (!event.sourceSheetId || pastRetention(event, todayKL(ctx.now()))) continue;

          try {
            const { sheet } = openSourceTab(ctx, event.sourceSheetId, event.sourceTab);
            const data = sheet.getDisplayValues();
            const map = parseColumnMap(event.columnMapJson, data[0] || []);
            const matricCol = map.matric;
            const nameCol = map.fullName;

            if (matricCol !== null && matricCol !== undefined) {
              const responseRows = data
                .map((row, i) => ({ row, i }))
                .filter(({ row, i }) => i >= 1 && normalizeMatric(row[matricCol] ?? '') === oldMatricKey);

              for (const { i, row } of responseRows) {
                if (newMatricKey !== oldMatricKey && (row[matricCol] ?? '') !== rawMatric) {
                  sheet.setPlainTextColumns([matricCol + 1]);
                  sheet.setValues(i + 1, matricCol + 1, [[rawMatric]]);
                }
                if (nameCol !== null && nameCol !== undefined && (row[nameCol] ?? '') !== newFullName) {
                  sheet.setValues(i + 1, nameCol + 1, [[newFullName]]);
                }
              }

              importEventMembers(ctx, ctx.db.events.get(event.id) || event, {
                full: true,
                purgeRemoved: true,
                suppressFormReopen: true
              });
              ctx.cache.remove(`sync:force:${event.id}`);
            }
          } catch (err) {
            console.error(`Error updating event ${event.name} for dancer ${oldMatricKey}:`, err);
            if (err instanceof AppError) throw err;
            throw new AppError(
              'LINK_NO_ACCESS',
              `Give ${ctx.clubEmail} Editor access to the registration form's response sheet, then try again.`
            );
          }
        }

        const updatedDancer = ctx.db.memberIndex.find(m => m.matricKey === newMatricKey && m.active)[0];
        if (!updatedDancer) {
          ctx.db.memberIndex.update(
            dancer.id,
            dancer.version,
            { matricKey: newMatricKey, fullName: newFullName, nameKey: nameKey(newFullName) },
            'selfEdit',
            ctx.now()
          );
        } else if (updatedDancer.fullName !== newFullName) {
          ctx.db.memberIndex.update(
            updatedDancer.id,
            updatedDancer.version,
            { fullName: newFullName, nameKey: nameKey(newFullName) },
            'selfEdit',
            ctx.now()
          );
        }

        // Audit log
        logAudit(
          ctx,
          auth.claims.sub,
          'members.selfEdit',
          'M-' + newMatricKey,
          `Dancer self-edited profile: "${dancer.fullName}" -> "${newFullName}", "${oldMatricKey}" -> "${newMatricKey}"`
        );

        // Invalidate member index and bootstrap caches for both old and new keys
        ctx.cache.remove('mi:' + oldMatricKey);
        ctx.cache.remove('mi:' + newMatricKey);
        const dv = Number(ctx.props.get('DATA_VERSION') || 1);
        ctx.cache.remove(`boot:dancer:${oldMatricKey}:${dv}`);
        ctx.cache.remove(`boot:dancer:${newMatricKey}:${dv}`);

        if (newMatricKey !== oldMatricKey) {
          // Migrate any custom dancer roles to the new matricKey
          const roles = ctx.db.memberRoles.find(mr => mr.matricKey === oldMatricKey && mr.active);
          for (const mr of roles) {
            ctx.db.memberRoles.update(mr.id, mr.version, { matricKey: newMatricKey }, 'selfEdit', ctx.now());
          }

          const oldEntry = ctx.db.memberIndex.find(m => m.matricKey === oldMatricKey && m.active)[0];
          if (oldEntry) {
            const remainingEventIds = (oldEntry.eventIds || []).filter(id => !eventIds.includes(id));
            const remainingEventStyles = { ...(oldEntry.eventStyles || {}) };
            for (const evId of eventIds) delete remainingEventStyles[evId];
            if (remainingEventIds.length === 0) {
              ctx.db.memberIndex.update(oldEntry.id, oldEntry.version, { active: false, eventIds: [] }, 'selfEdit', ctx.now());
            } else {
              ctx.db.memberIndex.update(oldEntry.id, oldEntry.version, { eventIds: remainingEventIds, eventStyles: remainingEventStyles }, 'selfEdit', ctx.now());
            }
          }
        }

        // Issue refreshed token for the dancer
        const pv = Number(ctx.props.get('PERM_VERSION') || 1);
        const exp = Math.floor(ctx.now().getTime() / 1000) + 30 * 24 * 3600;
        const claims: TokenClaims = {
          sub: 'M-' + newMatricKey,
          role: 'dancer',
          name: newFullName,
          roleName: auth.claims.roleName,
          roleId: auth.claims.roleId,
          exp,
          pv,
          perms: auth.claims.perms
        };

        const hmac = (ctx as any)._secrets?.hmac;
        const token = signToken(claims, (ctx as any)._secrets?.tokenSecret, hmac);

        // Fetch fresh bootstrap
        const bootstrap = getDancerBootstrap(ctx, newMatricKey, claims.perms);

        return { token, claims, bootstrap };
      }
    }
  };
}
