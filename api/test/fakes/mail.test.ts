import { describe, it, expect } from 'vitest';
import { FakeMailAdapter } from './mail';

describe('FakeMailAdapter', () => {
  it('records sent emails and resets', () => {
    const mail = new FakeMailAdapter();
    expect(mail.sent).toEqual([]);

    mail.sendEmail({
      to: 'dancer@example.com',
      subject: 'Welcome',
      body: 'Hello dancer',
      htmlBody: '<p>Hello dancer</p>'
    });

    expect(mail.sent.length).toBe(1);
    expect(mail.sent[0]).toEqual({
      to: 'dancer@example.com',
      subject: 'Welcome',
      body: 'Hello dancer',
      htmlBody: '<p>Hello dancer</p>'
    });

    mail.reset();
    expect(mail.sent).toEqual([]);
  });
});
