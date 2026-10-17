import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** the same message laid out for mail apps that show HTML; `text` is the fallback */
  html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.transport = createTransport(env.SMTP_URL);
  }

  /**
   * Never rejects, so callers may send without awaiting (account emails do, so the reply time does not reveal
   * whether one went out).
   */
  async send(mail: Mail): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.env.MAIL_FROM, ...mail });
    } catch (error) {
      // the caller's response must not reveal whether an email went out; log and carry on
      this.logger.error(`Sending "${mail.subject}" failed: ${String(error)}`);
    }
  }
}
