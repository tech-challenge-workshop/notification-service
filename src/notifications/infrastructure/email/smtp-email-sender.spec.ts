import { SmtpEmailSender } from './smtp-email-sender';

describe('SmtpEmailSender', () => {
  it('sends through the injected transporter with the configured from address', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const sender = new SmtpEmailSender(
      { host: 'mailpit', port: 1025, from: 'fiapx@local' },
      { sendMail } as never,
    );

    await sender.send({ to: 'alice@fiapx.local', subject: 'S', text: 'T' });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'fiapx@local',
      to: 'alice@fiapx.local',
      subject: 'S',
      text: 'T',
    });
  });

  it('propagates a transport failure to the caller', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const sender = new SmtpEmailSender(
      { host: 'mailpit', port: 1025, from: 'fiapx@local' },
      { sendMail } as never,
    );

    await expect(
      sender.send({ to: 'a@x.com', subject: 'S', text: 'T' }),
    ).rejects.toThrow('ECONNREFUSED');
  });
});
