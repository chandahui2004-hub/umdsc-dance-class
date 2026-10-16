import { MailPort, SendEmailOptions } from '../../src/ports';

export class FakeMailAdapter implements MailPort {
  sent: SendEmailOptions[] = [];

  sendEmail(options: SendEmailOptions): void {
    this.sent.push({ ...options });
  }

  reset(): void {
    this.sent = [];
  }
}
