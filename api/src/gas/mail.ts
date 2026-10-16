import { MailPort, SendEmailOptions } from '../ports';

export class GasMailAdapter implements MailPort {
  sendEmail(options: SendEmailOptions): void {
    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    for (const to of recipients) {
      const email = String(to || '').trim();
      if (!email || !email.includes('@')) continue;
      try {
        if (typeof MailApp !== 'undefined' && MailApp.sendEmail) {
          const params: GoogleAppsScript.Mail.MailAdvancedParameters = {
            to: email,
            subject: options.subject,
            body: options.body
          };
          if (options.htmlBody) {
            params.htmlBody = options.htmlBody;
          }
          MailApp.sendEmail(params);
        } else if (typeof GmailApp !== 'undefined' && GmailApp.sendEmail) {
          const extra: GoogleAppsScript.Gmail.GmailAdvancedOptions = {};
          if (options.htmlBody) {
            extra.htmlBody = options.htmlBody;
          }
          GmailApp.sendEmail(email, options.subject, options.body, extra);
        } else {
          console.warn('[GasMailAdapter] No MailApp or GmailApp available in current environment');
        }
      } catch (err) {
        console.warn(`[GasMailAdapter] Failed to send email to ${email}:`, err);
      }
    }
  }
}
