import { initSecrets, authorizeOnce } from './gas/setupHelpers';
import { handleRequest } from './router';
import {
  GasDriveAdapter,
  GasCacheAdapter,
  GasLockAdapter,
  GasPropsAdapter
} from './gas/adapters';
import { openDb } from './db/db';
import { Ctx } from './ports';
import { Hmac } from './security/tokens';
import { ApiRequest } from '@umdsc/shared';

export { initSecrets, authorizeOnce };

const gasHmac: Hmac = (key: string, message: string) => {
  const signed = Utilities.computeHmacSha256Signature(message, key);
  const bytes = new Uint8Array(signed.length);
  for (let i = 0; i < signed.length; i++) {
    bytes[i] = (signed[i] + 256) % 256;
  }
  return bytes;
};

export function doGet(e?: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
  const action = e?.parameter?.action;
  let response: unknown;

  if (action === 'health') {
    response = { ok: true, data: { version: '0.1.0' } };
  } else {
    response = { ok: true, data: { status: 'UMDSC API active' } };
  }

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

export function doPost(e?: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  let req: ApiRequest = { action: 'unknown' };
  if (e?.postData?.contents) {
    try {
      req = JSON.parse(e.postData.contents);
    } catch {
      req = { action: e?.parameter?.action || 'unknown' };
    }
  }

  const drive = new GasDriveAdapter();
  const cache = new GasCacheAdapter();
  const lock = new GasLockAdapter();
  const props = new GasPropsAdapter();

  const systemSpreadsheetId = props.get('SYSTEM_SPREADSHEET_ID') || '';
  const db = openDb(drive, systemSpreadsheetId);
  const clubEmail = props.get('CLUB_EMAIL') || 'umdancesportc@gmail.com';

  const ctx: Ctx = {
    now: () => new Date(),
    drive,
    cache,
    lock,
    props,
    db,
    clubEmail
  };

  const tokenSecret = props.get('TOKEN_SECRET') || 'default_secret';
  const secrets = {
    tokenSecret,
    hmac: gasHmac
  };

  const response = handleRequest(req, ctx, secrets);

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
