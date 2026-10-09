import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.transport = createTransport(env.SMTP_URL);
  }

  /** Plain text on purpose: renders everywhere, nothing to escape, and links stay visible. */
  async send(mail: Mail): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.env.MAIL_FROM, ...mail });
    } catch (error) {
      // the caller's response must not reveal whether an email went out; log and carry on
      this.logger.error(`Sending "${mail.subject}" failed: ${String(error)}`);
    }
  }
}
