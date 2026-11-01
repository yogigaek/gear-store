import { Logger } from '@nestjs/common';
import type { Env } from '../config/env.js';
import { MailService } from './mail.service.js';

const MAIL = { to: 'ana@test.example', subject: 'Reset your password', text: 'token=secret-link-token' };

describe('MailService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends from MAIL_FROM with the message as given', async () => {
    const mail = new MailService({
      SMTP_URL: 'smtp://127.0.0.1:1',
      MAIL_FROM: 'Rakit <a@rakit.example>',
    } as Env);
    const transport = (mail as unknown as { transport: { sendMail: (m: object) => Promise<unknown> } })
      .transport;
    const sendMail = vi.spyOn(transport, 'sendMail').mockResolvedValue({});
    await mail.send(MAIL);
    expect(sendMail).toHaveBeenCalledWith({ from: 'Rakit <a@rakit.example>', ...MAIL });
  });

  it('never rejects when the mail server cannot be reached, and logs the subject but not the body', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    // port 1 refuses the connection at once: the mail server is down
    const mail = new MailService({
      SMTP_URL: 'smtp://127.0.0.1:1',
      MAIL_FROM: 'Rakit <a@rakit.example>',
    } as Env);
    await expect(mail.send(MAIL)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
    const line = String(error.mock.calls[0]![0]);
    expect(line).toContain('Sending "Reset your password" failed');
    expect(line).not.toContain('secret-link-token');
  });
});
