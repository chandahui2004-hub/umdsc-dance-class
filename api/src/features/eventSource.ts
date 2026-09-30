import { SourcePreview, extractDriveId } from '@umdsc/shared';
import { Ctx, SheetPort } from '../ports';
import { AppError } from '../errors';
import { matchHeaders } from '../logic/headerMatch';
import { detectClassColumn, parseStyles } from '../logic/classDetect';
import { buildMembers } from '../logic/buildMembers';

const TAB_PREFERENCE = ['Form Responses 1', 'Form responses 1', 'Sheet1'];

function noAccess(ctx: Ctx): AppError {
  return new AppError('LINK_NO_ACCESS', `Share this spreadsheet with ${ctx.clubEmail} as Editor, then try again.`);
}

/** Opens the form response sheet and picks the responses tab. */
export function openSourceTab(ctx: Ctx, sheetId: string, preferredTab?: string): { tab: string; sheet: SheetPort } {
  const info = ctx.drive.info(sheetId);
  if (!info.exists || !info.canEdit) {
    throw noAccess(ctx);
  }
  const ss = ctx.drive.openSpreadsheet(sheetId);
  for (const name of [preferredTab, ...TAB_PREFERENCE]) {
    const sheet = name ? ss.sheet(name) : null;
    if (sheet) return { tab: name!, sheet };
  }
  const first = ss.firstSheet ? ss.firstSheet() : null;
  if (!first) {
    throw new AppError('VALIDATION', 'No sheets found in spreadsheet');
  }
  return { tab: first.name, sheet: first };
}

export function readSourceSheet(ctx: Ctx, sheetId: string, preferredTab?: string): { tab: string; data: string[][] } {
  const { tab, sheet } = openSourceTab(ctx, sheetId, preferredTab);
  return { tab, data: sheet.getDisplayValues() };
}

export function sheetIdFromUrl(sheetUrl: string): string {
  const item = extractDriveId(String(sheetUrl || ''));
  if (!item || item.kind === 'folder') {
    throw new AppError('LINK_INVALID', 'Invalid Google Sheet URL');
  }
  return item.id;
}

export function timestampColumn(headers: string[]): number | null {
  const idx = headers.findIndex(h => /timestamp|tarikh|masa/i.test(h));
  return idx >= 0 ? idx : null;
}

/** Counts class answers that match no active style, e.g. "Waacking". */
export function countUnknownClasses(
  rows: string[][],
  classIndex: number,
  styles: { id: string; name: string; aliases: string[] }[]
): { token: string; count: number }[] {
  if (classIndex < 0) return [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const token of parseStyles(String(row[classIndex] ?? ''), styles).unknownTokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }
  return Array.from(counts, ([token, count]) => ({ token, count }));
}

export function previewSource(ctx: Ctx, sheetUrl: string): SourcePreview {
  const { tab, data } = readSourceSheet(ctx, sheetIdFromUrl(sheetUrl));
  if (data.length === 0) {
    throw new AppError('VALIDATION', 'Sheet is empty');
  }

  const headers = data[0];
  const rows = data.slice(1);
  const { map, scores } = matchHeaders(headers);
  const styles = ctx.db.styles.find(s => s.active);
  const classIndex = detectClassColumn(rows, styles, headers)?.index ?? -1;

  const { members, warnings, countsByStyle } = buildMembers({
    headers,
    rows,
    map,
    classIndex,
    styles,
    timestampIndex: timestampColumn(headers)
  });

  return {
    headers,
    sourceTab: tab,
    columnMap: map,
    scores,
    classIndex,
    rowCount: members.length,
    sampleNames: members.slice(0, 3).map(m => m.fullName),
    detectedStyleIds: styles.filter(s => (countsByStyle[s.id] || 0) > 0).map(s => s.id),
    unknownClasses: countUnknownClasses(rows, classIndex, styles),
    warnings
  };
}
