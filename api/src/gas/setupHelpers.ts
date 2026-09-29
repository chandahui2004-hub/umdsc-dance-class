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
  Logger.log('Authorized Drive root: ' + rootName);
  return 'Authorized: ' + rootName;
}
