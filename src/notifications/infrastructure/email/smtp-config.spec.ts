import { buildSmtpOptions, isSmtpConfigured } from './smtp-config';

describe('smtp-config', () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('is not configured when SMTP_HOST is unset', () => {
    delete process.env.SMTP_HOST;
    expect(isSmtpConfigured()).toBe(false);
  });

  it('is configured when SMTP_HOST is set', () => {
    process.env.SMTP_HOST = 'mailpit';
    expect(isSmtpConfigured()).toBe(true);
  });

  it('builds options from env, with defaults for port and from', () => {
    process.env.SMTP_HOST = 'mailpit';
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_FROM;

    expect(buildSmtpOptions()).toEqual({
      host: 'mailpit',
      port: 1025,
      from: 'fiapx@local',
    });
  });
});
