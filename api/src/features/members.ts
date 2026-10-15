import { Member, TokenClaims } from '@umdsc/shared';
import { Route } from '../router';
import { AppError } from '../errors';
import { signToken } from '../security/tokens';
import { getDancerBootstrap } from './bootstrap';
import { logAudit } from '../logic/audit';
import { normalizeMatric, nameKey } from '../logic/normalize';
import { Field } from '../logic/headerMatch';
import { getEvent, readEventMembers } from './eventMembers';
import { importEventMembers, parseColumnMap } from './eventImport';
import { openSourceTab } from './eventSource';
import { isMemberEnrolledInStyle } from '../logic/styleMatcher';
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
        // Re-reading an old form would undo the retention wipe of its dancers
        if (pastRetention(event, todayKL(ctx.now()))) {
          throw new AppError('VALIDATION', RETENTION_NO_SYNC);
        }
        const everyone = readEventMembers(ctx, event);
        const member = everyone.find(m => m.memberId === memberId);
        if (!member) {
          throw new AppError('NOT_FOUND', `Dancer ${memberId} not found in ${event.name}`);
        }

        const changes: { field: Field; value: string; label: string; current: string }[] = [];
        for (const [key, field, label] of EDITABLE) {
          if (payload[key] === undefined) continue;
          const value = String(payload[key] ?? '').trim();
          if (field === 'fullName' && !value) throw new AppError('VALIDATION', 'Name cannot be empty');
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
            if (signIn && signIn.eventIds.length > 0 && signIn.nameKey !== member.nameKey) {
              throw new AppError('VALIDATION', `Matric ${value} already belongs to ${signIn.fullName}`);
            }
          }
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

        try {
          for (const w of writes) {
            const rowsToWrite = responseRows.filter(({ row }) => (row[w.col] ?? '') !== w.value);
            if (rowsToWrite.length === 0) continue;
            if (w.plainText) sheet.setPlainTextColumns([w.col + 1]);
            for (const { i } of rowsToWrite) sheet.setValues(i + 1, w.col + 1, [[w.value]]);
          }
        } catch {
          throw new AppError(
            'LINK_NO_ACCESS',
            `Give ${ctx.clubEmail} Editor access to the registration form's response sheet, then try again.`
          );
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

              importEventMembers(ctx, ctx.db.events.get(event.id) || event, { full: true });
              ctx.cache.remove(`sync:force:${event.id}`);
            }
          } catch (err) {
            console.error(`Error updating event ${event.name} for dancer ${oldMatricKey}:`, err);
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
