import { renderCompletedEmail, renderFailedEmail } from './email-templates';

describe('email templates', () => {
  it('renders the completed template with the request id and no other dynamic field', () => {
    const { subject, text } = renderCompletedEmail({
      processingRequestId: 'req-123',
    });

    expect(subject).toContain('req-123');
    expect(text).toContain('req-123');
  });

  it('renders the failed template with only the safe failureReason and the request id', () => {
    const { subject, text } = renderFailedEmail({
      processingRequestId: 'req-123',
      failureReason: 'O arquivo enviado nao e um video MP4 ou MOV valido.',
    });

    expect(text).toContain('req-123');
    expect(text).toContain(
      'O arquivo enviado nao e um video MP4 ou MOV valido.',
    );
  });

  it('never includes a storage key field name in the failed template', () => {
    const { text } = renderFailedEmail({
      processingRequestId: 'req-123',
      failureReason: 'x',
    });

    expect(text).not.toMatch(/storageKey|zipStorageKey/i);
  });
});
