import { createTransport, Transporter } from 'nodemailer';
import { EmailMessage, EmailSender } from '../../domain/email-sender';

export interface SmtpOptions {
  host: string;
  port: number;
  from: string;
}

const TIMEOUT_MS = 5000;

export class SmtpEmailSender implements EmailSender {
  private readonly transporter: Transporter;

  constructor(
    private readonly options: SmtpOptions,
    transporter?: Transporter,
  ) {
    this.transporter =
      transporter ??
      createTransport({
        host: options.host,
        port: options.port,
        secure: false,
        connectionTimeout: TIMEOUT_MS,
        greetingTimeout: TIMEOUT_MS,
        socketTimeout: TIMEOUT_MS,
      });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.options.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}
