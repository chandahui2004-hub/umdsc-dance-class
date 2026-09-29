import { initSecrets, authorizeOnce } from './gas/setupHelpers';

export { initSecrets, authorizeOnce };

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
  let body: any = {};
  if (e?.postData?.contents) {
    try {
      body = JSON.parse(e.postData.contents);
    } catch {
      body = { raw: e.postData.contents };
    }
  }

  const action = body.action || e?.parameter?.action || 'unknown';
  const response = {
    ok: true,
    data: { echo: action }
  };

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
