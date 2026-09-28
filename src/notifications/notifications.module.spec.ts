import { Logger } from '@nestjs/common';
import { InMemoryEmailSender } from './infrastructure/email/in-memory-email-sender';
import { SmtpEmailSender } from './infrastructure/email/smtp-email-sender';
import { emailSenderProvider } from './notifications.module';

describe('emailSenderProvider', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('warns and falls back to InMemoryEmailSender when SMTP_HOST is missing, so a misconfigured deployment is not silently poisoned', () => {
    delete process.env.SMTP_HOST;
    const warned = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const sender = emailSenderProvider.useFactory();

    expect(sender).toBeInstanceOf(InMemoryEmailSender);
    expect(warned).toHaveBeenCalledWith(expect.stringContaining('SMTP_HOST'));
  });

  it('uses SmtpEmailSender without warning when SMTP_HOST is configured', () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    const warned = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const sender = emailSenderProvider.useFactory();

    expect(sender).toBeInstanceOf(SmtpEmailSender);
    expect(warned).not.toHaveBeenCalled();
  });
});
