import { EmailMessage, EmailSender } from '../../domain/email-sender';

/** Test/no-SMTP-configured fallback, mirroring InMemoryDeliveryRepository's role. */
export class InMemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}
