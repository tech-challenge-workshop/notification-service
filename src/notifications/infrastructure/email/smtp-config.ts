import { SmtpOptions } from './smtp-email-sender';

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export function buildSmtpOptions(): SmtpOptions {
  return {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    from: process.env.SMTP_FROM ?? 'fiapx@local',
  };
}
