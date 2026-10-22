export function initSecrets(): string {
  const props = PropertiesService.getScriptProperties();
  let tokenSecret = props.getProperty('TOKEN_SECRET');
  if (!tokenSecret) {
    const uuid1 = Utilities.getUuid().replace(/-/g, '');
    const uuid2 = Utilities.getUuid().replace(/-/g, '');
    tokenSecret = (uuid1 + uuid2).slice(0, 64);
    props.setProperty('TOKEN_SECRET', tokenSecret);
  }

  let setupCode = props.getProperty('SETUP_CODE');
  if (!setupCode) {
    setupCode = Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
    props.setProperty('SETUP_CODE', setupCode);
  }

  Logger.log('SETUP_CODE: ' + setupCode);
  return 'SETUP_CODE generated and logged.';
}

export function authorizeOnce(): string {
  const rootName = DriveApp.getRootFolder().getName();
  const mailQuota = typeof MailApp !== 'undefined' ? MailApp.getRemainingDailyQuota() : 'N/A';
  Logger.log('Authorized Drive root: ' + rootName + ', Mail quota: ' + mailQuota);

  let formStatus = 'N/A';
  if (typeof FormApp !== 'undefined') {
    try {
      const tempForm = FormApp.create('UMDSC_AUTH_TEMP');
      const tempId = tempForm.getId();
      DriveApp.getFileById(tempId).setTrashed(true);
      formStatus = 'SUCCESS (verified with temp form: ' + tempId + ')';
      Logger.log('Google Forms (FormApp) successfully authorized!');
    } catch (fe: any) {
      formStatus = 'ERROR: ' + (fe?.message || fe);
      Logger.log('Google Forms authorization error: ' + formStatus);
    }
  }

  if (typeof MailApp !== 'undefined') {
    try {
      MailApp.sendEmail({
        to: 'chandahui2004@gmail.com',
        subject: '[UMDSC] System Email Authorization Test',
        body: 'Hi Chan Da Hui,\n\nYour Google Apps Script permissions (Drive, Mail, Forms) have been successfully authorized!\n\nThe UMDSC Dance Class System can now automatically send class registration confirmations, media recap notifications, and synchronize Google Form slot limits.\n\nWebsite: https://umdsc-dance-class.umdancesportc.workers.dev',
        htmlBody: '<div style="font-family:sans-serif;padding:16px;"><h2 style="color:#6366f1;">UMDSC Dance Class System</h2><p>Hi <strong>Chan Da Hui</strong>,</p><p>Your Google Apps Script permissions (Drive, Mail, Forms) have been successfully authorized!</p><p>The system can now automatically send class registration confirmations, media recap notifications, and synchronize Google Form slot limits.</p><p><a href="https://umdsc-dance-class.umdancesportc.workers.dev" style="background:#6366f1;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block;">Open Dancer Portal</a></p></div>'
      });
      Logger.log('Test email sent to chandahui2004@gmail.com');
    } catch (e: any) {
      Logger.log('Error sending test email: ' + (e?.message || e));
    }
  }

  return 'Authorized: ' + rootName + ', Mail quota: ' + mailQuota + ', Forms: ' + formStatus;
}

export function testFormAccess(formId: string = '11ZZM4qFUc1jj9LSqUXSzbr0y2-e4xziO8w4YSc4ze0I'): string {
  try {
    const form = FormApp.openById(formId);
    const title = form.getTitle();
    const items = form.getItems();
    const res = 'SUCCESS! Opened form: "' + title + '" (ID: ' + formId + ') with ' + items.length + ' question/items.';
    Logger.log(res);
    return res;
  } catch (err: any) {
    const msg = 'FAILED to open form ' + formId + ': ' + (err?.message || err);
    Logger.log(msg);
    return msg;
  }
}
