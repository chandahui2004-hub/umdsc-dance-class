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
import { warmCaches } from './features/warmup';
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

function buildCtx(): { ctx: Ctx; props: GasPropsAdapter } {
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
  return { ctx, props };
}

/** Run by the time-driven trigger: keeps dancers' first request from paying for cold caches. */
export function warmDancerCaches(): void {
  const { ctx } = buildCtx();
  const result = warmCaches(ctx);
  console.log(JSON.stringify({ action: 'warmDancerCaches', result }));
}

/** Run once from the Apps Script editor: (re)creates the 5-minute warm-up trigger. */
export function installWarmTrigger(): void {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'warmDancerCaches') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  ScriptApp.newTrigger('warmDancerCaches').timeBased().everyMinutes(5).create();
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

  const { ctx, props } = buildCtx();

  const tokenSecret = props.get('TOKEN_SECRET') || 'default_secret';
  const secrets = {
    tokenSecret,
    hmac: gasHmac
  };

  const response = handleRequest(req, ctx, secrets);

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
