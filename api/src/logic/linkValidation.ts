import { Ctx } from '../ports';
import { extractDriveId } from '@umdsc/shared';
import { AppError } from '../errors';

export function validateLink(
  ctx: Ctx,
  url: string,
  expected: 'folder' | 'spreadsheet'
): string {
  const extracted = extractDriveId(url);
  if (!extracted || !extracted.id) {
    throw new AppError('LINK_INVALID', 'Invalid Google Drive link');
  }

  const id = extracted.id;
  const info = ctx.drive.info(id);

  if (!info.exists) {
    throw new AppError(
      'LINK_NO_ACCESS',
      `Share this ${expected} with ${ctx.clubEmail} as Editor, then try again.`
    );
  }

  if (info.kind !== expected) {
    throw new AppError(
      'LINK_WRONG_KIND',
      `Expected a Google Drive ${expected}, got ${info.kind}`
    );
  }

  if (!info.canEdit) {
    throw new AppError(
      'LINK_READ_ONLY',
      `Share this ${expected} with ${ctx.clubEmail} as Editor, then try again.`
    );
  }

  return id;
}
