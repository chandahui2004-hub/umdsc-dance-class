import { Member } from '@umdsc/shared';
import { Route } from '../router';
import { AppError } from '../errors';
import { logAudit } from '../logic/audit';
import { normalizeMatric } from '../logic/normalize';
import { Field } from '../logic/headerMatch';
import { getEvent, readEventMembers } from './eventMembers';
import { importEventMembers, parseColumnMap } from './eventImport';
import { openSourceTab } from './eventSource';
import { isMemberEnrolledInStyle } from '../logic/styleMatcher';

/** Dancer details an admin may correct: payload key, form question, the name used in messages. */
const EDITABLE: [keyof Member, Field, string][] = [
  ['fullName', 'fullName', 'name'],
  ['matricRaw', 'matric', 'matric number'],
  ['contact', 'contact', 'phone number'],
  ['email', 'email', 'email'],
  ['gender', 'gender', 'gender'],
  ['nationality', 'nationality', 'nationality']
];

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
        const event = getEvent(ctx, eventId);
        if (event.status === 'archived') {
          throw new AppError('VALIDATION', 'Archived events cannot be edited');
        }
        const member = readEventMembers(ctx, event).find(m => m.memberId === memberId);
        if (!member) {
          throw new AppError('NOT_FOUND', `Dancer ${memberId} not found in ${event.name}`);
        }

        const changes: { field: Field; value: string; label: string; current: string }[] = [];
        for (const [key, field, label] of EDITABLE) {
          if (payload[key] === undefined) continue;
          const value = String(payload[key] ?? '').trim();
          if (field === 'fullName' && !value) throw new AppError('VALIDATION', 'Name cannot be empty');
          if (field === 'matric' && !normalizeMatric(value)) throw new AppError('VALIDATION', 'Enter a valid matric number');
          changes.push({ field, value, label, current: String(member[key] ?? '') });
        }

        const { sheet } = openSourceTab(ctx, event.sourceSheetId, event.sourceTab);
        const data = sheet.getDisplayValues();
        const map = parseColumnMap(event.columnMapJson, data[0] || []);
        const matricCol = map.matric;
        if (matricCol === null || matricCol === undefined) {
          throw new AppError('VALIDATION', 'The registration form has no matric number question');
        }
        const responseRows = data
          .map((row, i) => ({ row, i }))
          .filter(({ row, i }) => i >= 1 && normalizeMatric(row[matricCol] ?? '') === member.matricKey);
        if (responseRows.length === 0) {
          throw new AppError('NOT_FOUND', "This dancer's response is no longer in the registration form's response sheet");
        }

        for (const change of changes) {
          const c = map[change.field];
          if (c === null || c === undefined) {
            if (change.value !== change.current) {
              throw new AppError('VALIDATION', `The registration form has no ${change.label} question, so it can't be changed here`);
            }
            continue;
          }
          for (const { row, i } of responseRows) {
            if ((row[c] ?? '') === change.value) continue;
            try {
              sheet.setValues(i + 1, c + 1, [[change.value]]);
            } catch {
              throw new AppError(
                'LINK_NO_ACCESS',
                `Give ${ctx.clubEmail} Editor access to the registration form's response sheet, then try again.`
              );
            }
          }
        }

        const result = importEventMembers(ctx, ctx.db.events.get(event.id) || event, { full: true });
        ctx.cache.remove(`sync:force:${event.id}`);

        const matric = changes.find(c => c.field === 'matric');
        const newMemberId = matric ? 'M-' + normalizeMatric(matric.value) : memberId;
        logAudit(
          ctx,
          auth?.claims.sub || 'system',
          'members.edit',
          newMemberId,
          `${changes.map(c => c.label).join(', ') || 'nothing'} edited for ${memberId} in ${event.name}`
        );
        return { memberId: newMemberId, result };
      }
    }
  };
}
