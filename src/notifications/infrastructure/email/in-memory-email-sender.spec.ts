import { InMemoryEmailSender } from './in-memory-email-sender';

describe('InMemoryEmailSender', () => {
  it('records every message it is sent, in order', async () => {
    const sender = new InMemoryEmailSender();

    await sender.send({ to: 'a@x.com', subject: 'S1', text: 'T1' });
    await sender.send({ to: 'b@x.com', subject: 'S2', text: 'T2' });

    expect(sender.sent).toEqual([
      { to: 'a@x.com', subject: 'S1', text: 'T1' },
      { to: 'b@x.com', subject: 'S2', text: 'T2' },
    ]);
  });
});
