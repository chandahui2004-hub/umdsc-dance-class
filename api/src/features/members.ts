import { Route } from '../router';
import { AppError } from '../errors';
import { extractDriveId } from '@umdsc/shared';
import { Member } from '@umdsc/shared';
import { matchHeaders, Field } from '../logic/headerMatch';
import { detectClassColumn } from '../logic/classDetect';
import { buildMembers } from '../logic/buildMembers';
import { MEMBERS_COLUMNS } from '../db/schema';
import { attendanceEnsureSheets } from './attendance';
import { logAudit } from '../logic/audit';
import { normalizeMatric, nameKey } from '../logic/normalize';

export function getMemberRoutes(): Record<string, Route> {
  return {
    'members.previewImport': {
      perm: 'members.import',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const { sheetUrl, month } = payload || {};
        if (!sheetUrl || !month) {
          throw new AppError('VALIDATION', 'sheetUrl and month are required');
        }

        const driveItem = extractDriveId(sheetUrl);
        if (!driveItem || driveItem.kind === 'folder') {
          throw new AppError('LINK_INVALID', 'Invalid Google Sheet URL');
        }

        const info = ctx.drive.info(driveItem.id);
        if (!info.exists || !info.canEdit) {
          throw new AppError(
            'LINK_NO_ACCESS',
            `Share this spreadsheet with ${ctx.clubEmail} as Editor, then try again.`
          );
        }

        const ss = ctx.drive.openSpreadsheet(driveItem.id);
        const sheet = ss.sheet('Form Responses 1') || ss.sheet('Form responses 1') || ss.sheet('Sheet1') || (ss.firstSheet ? ss.firstSheet() : null) || (ss as any).getSheet?.('Sheet1') || (ss as any).sheetsMap?.values().next().value;
        if (!sheet) {
          throw new AppError('VALIDATION', 'No sheets found in spreadsheet');
        }

        const data = sheet.getDisplayValues();
        if (data.length === 0) {
          throw new AppError('VALIDATION', 'Sheet is empty');
        }

        const headers = data[0];
        const rows = data.slice(1);
        const { map, scores } = matchHeaders(headers);

        const styles = ctx.db.styles.find(s => s.active);
        const detectedClass = detectClassColumn(rows, styles, headers);
        const classIndex = detectedClass ? detectedClass.index : -1;

        const timestampIndex = headers.findIndex(h => /timestamp|tarikh|masa/i.test(h));

        const { members, warnings, countsByStyle } = buildMembers({
          headers,
          rows,
          map,
          classIndex,
          styles,
          timestampIndex: timestampIndex >= 0 ? timestampIndex : null
        });

        const sampleNames = members.slice(0, 3).map(m => m.fullName);

        return {
          headers,
          columnMap: map,
          scores,
          classIndex,
          countsByStyle,
          warnings,
          rowCount: members.length,
          sampleNames
        };
      }
    },

    'members.confirmImport': {
      perm: 'members.import',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { sheetUrl, month, columnMap, classIndex } = payload || {};
        if (!month) {
          throw new AppError('VALIDATION', 'month is required');
        }

        let sourceUrl = sheetUrl;
        const existingMm = ctx.db.memberMonths.find(m => m.month === month && m.active)[0];
        if (!sourceUrl && existingMm) {
          sourceUrl = existingMm.sourceSheetId;
        }

        if (!sourceUrl) {
          throw new AppError('VALIDATION', 'sheetUrl is required');
        }

        const driveItem = extractDriveId(sourceUrl);
        const sourceSheetId = driveItem ? driveItem.id : sourceUrl;

        const info = ctx.drive.info(sourceSheetId);
        if (!info.exists || !info.canEdit) {
          throw new AppError(
            'LINK_NO_ACCESS',
            `Share this spreadsheet with ${ctx.clubEmail} as Editor, then try again.`
          );
        }

        const ss = ctx.drive.openSpreadsheet(sourceSheetId);
        const sheet = ss.sheet('Form Responses 1') || ss.sheet('Form responses 1') || ss.sheet('Sheet1') || (ss.firstSheet ? ss.firstSheet() : null) || (ss as any).getSheet?.('Sheet1') || (ss as any).sheetsMap?.values().next().value;
        if (!sheet) {
          throw new AppError('VALIDATION', 'Sheet not found');
        }

        const data = sheet.getDisplayValues();
        const headers = data[0];
        const rows = data.slice(1);

        const styles = ctx.db.styles.find(s => s.active);
        const map = columnMap || matchHeaders(headers).map;
        const clsIdx = classIndex !== undefined ? Number(classIndex) : (detectClassColumn(rows, styles, headers)?.index ?? -1);
        const timestampIndex = headers.findIndex(h => /timestamp|tarikh|masa/i.test(h));

        const { members } = buildMembers({
          headers,
          rows,
          map,
          classIndex: clsIdx,
          styles,
          timestampIndex: timestampIndex >= 0 ? timestampIndex : null
        });

        const dbFolder = ctx.db.settings.find(s => s.key === 'dbFolderId' && s.active)[0]?.value || 'root';

        let membersSpreadsheetId = existingMm?.membersSpreadsheetId;
        let membersSs: any;
        if (membersSpreadsheetId) {
          membersSs = ctx.drive.openSpreadsheet(membersSpreadsheetId);
        } else {
          membersSs = ctx.drive.createSpreadsheet(`Members_${month}`, dbFolder);
          membersSpreadsheetId = membersSs.id;
        }

        let membersSheet = membersSs.sheet('Members') || (membersSs as any).getSheet?.('Members');
        if (!membersSheet) {
          membersSheet = membersSs.addSheet('Members', [...MEMBERS_COLUMNS]);
        }

        membersSheet.setPlainTextColumns([1, 3, 4, 6]);

        const memberRows = members.map(m => [
          m.memberId,
          m.fullName,
          m.matricRaw,
          m.matricKey,
          m.nameKey,
          m.contact,
          m.email,
          m.gender,
          m.nationality,
          m.styleIds.join(','),
          m.styleNames.join(','),
          m.sourceTimestamp,
          m.flags.join(',')
        ]);

        membersSheet.setValues(1, 1, [[...MEMBERS_COLUMNS], ...memberRows]);

        const actor = auth?.claims.sub || 'system';
        const now = ctx.now();

        // Upsert MemberIndex
        for (const m of members) {
          const existingMi = ctx.db.memberIndex.find(idx => idx.matricKey === m.matricKey && idx.active)[0];
          if (existingMi) {
            const updatedMonths = existingMi.months.includes(month)
              ? existingMi.months
              : [...existingMi.months, month].sort();
            const lastMonth = updatedMonths[updatedMonths.length - 1];
            ctx.db.memberIndex.update(
              existingMi.id,
              existingMi.version,
              {
                months: updatedMonths,
                lastMonth,
                fullName: m.fullName,
                nameKey: m.nameKey
              },
              actor,
              now
            );
          } else {
            ctx.db.memberIndex.insert(
              {
                matricKey: m.matricKey,
                nameKey: m.nameKey,
                fullName: m.fullName,
                months: [month],
                lastMonth: month
              },
              actor,
              now
            );
          }
        }

        // Record or update MemberMonths
        if (existingMm) {
          ctx.db.memberMonths.update(
            existingMm.id,
            existingMm.version,
            {
              lastSyncAt: now.toISOString(),
              memberCount: members.length,
              columnMapJson: JSON.stringify(map)
            },
            actor,
            now
          );
        } else {
          ctx.db.memberMonths.insert(
            {
              month,
              sourceSheetId,
              sourceTab: 'Sheet1',
              columnMapJson: JSON.stringify(map),
              membersSpreadsheetId,
              importedBy: actor,
              importedAt: now.toISOString(),
              lastSyncAt: now.toISOString(),
              memberCount: members.length
            },
            actor,
            now
          );
        }

        // Sync or create attendance sheets
        const attendanceSheets = attendanceEnsureSheets(ctx, month);

        logAudit(ctx, actor, 'members.confirmImport', month, `Imported ${members.length} members`);

        return {
          membersSpreadsheetId,
          memberCount: members.length,
          attendanceSheets
        };
      }
    },

    'members.resync': {
      perm: 'members.import',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { month } = payload || {};
        if (!month) {
          throw new AppError('VALIDATION', 'month is required');
        }

        const existingMm = ctx.db.memberMonths.find(m => m.month === month && m.active)[0];
        if (!existingMm) {
          throw new AppError('NOT_FOUND', `Month ${month} has not been imported yet`);
        }

        // Delegate to confirmImport handler
        const confirmRoute = getMemberRoutes()['members.confirmImport'];
        return confirmRoute.handler(ctx, auth, {
          month,
          sheetUrl: existingMm.sourceSheetId,
          columnMap: JSON.parse(existingMm.columnMapJson || '{}')
        });
      }
    },

    'members.autoSync': {
      perm: 'members.import',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const targetMonth = payload?.month ? String(payload.month).trim() : null;
        let mmList = ctx.db.memberMonths.find(m => m.active && !!m.sourceSheetId);
        if (targetMonth) {
          mmList = mmList.filter(m => m.month === targetMonth);
        }

        const results: { month: string; beforeCount: number; afterCount: number; newCount: number }[] = [];
        const confirmRoute = getMemberRoutes()['members.confirmImport'];

        for (const mm of mmList) {
          try {
            const beforeCount = mm.memberCount || 0;
            const res: any = confirmRoute.handler(ctx, auth, {
              month: mm.month,
              sheetUrl: mm.sourceSheetId,
              columnMap: JSON.parse(mm.columnMapJson || '{}')
            });
            const afterCount = res?.memberCount || beforeCount;
            results.push({
              month: mm.month,
              beforeCount,
              afterCount,
              newCount: Math.max(0, afterCount - beforeCount)
            });
          } catch (err) {
            console.error(`Error auto-syncing month ${mm.month}:`, err);
          }
        }

        return {
          syncedAt: ctx.now().toISOString(),
          results,
          totalNew: results.reduce((acc, r) => acc + r.newCount, 0)
        };
      }
    },

    'members.sync': {
      perm: 'members.import',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const autoSyncRoute = getMemberRoutes()['members.autoSync'];
        return autoSyncRoute.handler(ctx, auth, payload);
      }
    },

    'members.importedMonths': {
      perm: 'members.import',
      write: false,
      handler: (ctx) => {
        const mmList = ctx.db.memberMonths.find(m => m.active);
        return {
          months: mmList.map(mm => ({
            month: mm.month,
            sourceSheetId: mm.sourceSheetId || '',
            memberCount: mm.memberCount || 0,
            importedAt: mm.importedAt || '',
            lastSyncAt: mm.lastSyncAt || ''
          })).sort((a: any, b: any) => a.month.localeCompare(b.month))
        };
      }
    },

    'members.list': {
      perm: 'members.view',
      write: false,
      handler: (ctx, auth, payload: any) => {
        const { month, styleId } = payload || {};
        if (!month) {
          throw new AppError('VALIDATION', 'month is required');
        }

        const mm = ctx.db.memberMonths.find(m => m.month === month && m.active)[0];
        if (!mm || !mm.membersSpreadsheetId) {
          return [];
        }

        const ss = ctx.drive.openSpreadsheet(mm.membersSpreadsheetId);
        const sheet = ss.sheet('Members') || (ss as any).getSheet?.('Members');
        if (!sheet) return [];

        const rows = sheet.getDisplayValues();
        const headers = rows[0] || [];
        const idCol = headers.indexOf('memberId');
        const nameCol = headers.indexOf('fullName');
        const rawCol = headers.indexOf('matricRaw');
        const keyCol = headers.indexOf('matricKey');
        const nameKeyCol = headers.indexOf('nameKey');
        const contactCol = headers.indexOf('contact');
        const emailCol = headers.indexOf('email');
        const genderCol = headers.indexOf('gender');
        const natCol = headers.indexOf('nationality');
        const stylesCol = headers.indexOf('styleIds');
        const styleNamesCol = headers.indexOf('styleNames');
        const tsCol = headers.indexOf('sourceTimestamp');
        const flagsCol = headers.indexOf('flags');

        const members: Member[] = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r[idCol]) continue;
          const sIds = String(r[stylesCol] || '').split(',').map(s => s.trim()).filter(Boolean);
          if (styleId && !sIds.includes(styleId)) {
            continue;
          }

          members.push({
            memberId: r[idCol],
            fullName: r[nameCol] || '',
            matricRaw: r[rawCol] || '',
            matricKey: r[keyCol] || '',
            nameKey: r[nameKeyCol] || '',
            contact: r[contactCol] || '',
            email: r[emailCol] || '',
            gender: r[genderCol] || '',
            nationality: r[natCol] || '',
            styleIds: sIds,
            styleNames: String(r[styleNamesCol] || '').split(',').map(s => s.trim()).filter(Boolean),
            sourceTimestamp: r[tsCol] || '',
            flags: String(r[flagsCol] || '').split(',').map(s => s.trim()).filter(Boolean)
          });
        }

        return members;
      }
    },

    'members.update': {
      perm: 'members.import',
      write: true,
      bumpsData: true,
      handler: (ctx, auth, payload: any) => {
        const { month, memberId, fullName, matricRaw } = payload || {};
        if (!month || !memberId) {
          throw new AppError('VALIDATION', 'month and memberId are required');
        }

        const mm = ctx.db.memberMonths.find(m => m.month === month && m.active)[0];
        if (!mm || !mm.membersSpreadsheetId) {
          throw new AppError('NOT_FOUND', `Month ${month} not found`);
        }

        const ss = ctx.drive.openSpreadsheet(mm.membersSpreadsheetId);
        const sheet = ss.sheet('Members') || (ss as any).getSheet?.('Members');
        if (!sheet) {
          throw new AppError('NOT_FOUND', 'Members sheet not found');
        }

        const rows = sheet.getDisplayValues();
        const headers = rows[0] || [];
        const idCol = headers.indexOf('memberId');
        const nameCol = headers.indexOf('fullName');
        const rawCol = headers.indexOf('matricRaw');
        const keyCol = headers.indexOf('matricKey');
        const nameKeyCol = headers.indexOf('nameKey');

        const rowIndex = rows.findIndex((r, idx) => idx >= 1 && r[idCol] === memberId);
        if (rowIndex === -1) {
          throw new AppError('NOT_FOUND', `Member ${memberId} not found`);
        }

        const row = [...rows[rowIndex]];
        if (fullName !== undefined) {
          row[nameCol] = fullName;
          row[nameKeyCol] = nameKey(fullName);
        }
        if (matricRaw !== undefined) {
          const normMatric = normalizeMatric(matricRaw);
          row[rawCol] = matricRaw;
          row[keyCol] = normMatric;
        }

        sheet.setValues(rowIndex + 1, 1, [row]);

        // Update MemberIndex
        const oldMatricKey = rows[rowIndex][keyCol];
        const newMatricKey = row[keyCol];
        const actor = auth?.claims.sub || 'system';
        const now = ctx.now();

        const mi = ctx.db.memberIndex.find(idx => idx.matricKey === oldMatricKey && idx.active)[0];
        if (mi) {
          ctx.db.memberIndex.update(
            mi.id,
            mi.version,
            {
              matricKey: newMatricKey,
              fullName: row[nameCol],
              nameKey: row[nameKeyCol]
            },
            actor,
            now
          );
        }

        logAudit(ctx, actor, 'members.update', memberId, `Updated member ${memberId}`);
        return { updated: true };
      }
    }
  };
}
