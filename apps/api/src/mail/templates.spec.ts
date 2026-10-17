import { accountExistsMail, resetPasswordMail, verifyEmailMail } from './templates.js';

const link = 'https://yogi-store.vercel.app/verify-email?token=abc_DEF-123';

describe('email templates', () => {
  it('send every email as HTML with a plain-text twin, both carrying the link', () => {
    for (const mail of [
      verifyEmailMail('ana@example.com', 'Ana', link),
      resetPasswordMail('ana@example.com', 'Ana', link),
      accountExistsMail('ana@example.com', link),
    ]) {
      expect(mail.text).toContain(link);
      expect(mail.html).toContain(`href="${link}"`);
      expect(mail.html).toContain('RAKIT');
    }
  });

  it('escapes the name a visitor typed, so it cannot inject markup', () => {
    const mail = verifyEmailMail('x@example.com', '<a href="https://evil.example">Win</a>', link);
    expect(mail.html).not.toContain('<a href="https://evil.example">');
    expect(mail.html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;Win&lt;/a&gt;');
  });
});
