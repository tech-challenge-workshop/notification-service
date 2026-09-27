import { DeliveryPersistenceError } from '../../domain/errors/delivery-persistence.error';
import { InvalidTerminalEventError } from '../../domain/errors/invalid-terminal-event.error';
import {
  isPermanentFailure,
  retryBackoffMs,
  settleFailedMessage,
} from './settle-failed-message';

const previousBackoff = process.env.RABBITMQ_RETRY_BACKOFF_MS;

function restoreBackoff(): void {
  if (previousBackoff === undefined) {
    delete process.env.RABBITMQ_RETRY_BACKOFF_MS;
  } else {
    process.env.RABBITMQ_RETRY_BACKOFF_MS = previousBackoff;
  }
}

function parseError(): SyntaxError {
  try {
    JSON.parse('not json');
  } catch (error) {
    return error as SyntaxError;
  }
  throw new Error('JSON.parse accepted a non-JSON body');
}

describe('retryBackoffMs', () => {
  afterEach(restoreBackoff);

  it('defaults to 1000 ms when the variable is unset', () => {
    delete process.env.RABBITMQ_RETRY_BACKOFF_MS;
    expect(retryBackoffMs()).toBe(1000);
  });

  it.each([
    ['empty', ''],
    ['whitespace', '  '],
  ])('defaults to 1000 ms when the variable is %s', (_label, raw) => {
    // Number('') is 0: without the blank check an empty variable would
    // silently remove the pause.
    process.env.RABBITMQ_RETRY_BACKOFF_MS = raw;
    expect(retryBackoffMs()).toBe(1000);
  });

  it('accepts 0 as an explicit "no pause"', () => {
    process.env.RABBITMQ_RETRY_BACKOFF_MS = '0';
    expect(retryBackoffMs()).toBe(0);
  });

  it('reads a configured value', () => {
    process.env.RABBITMQ_RETRY_BACKOFF_MS = '250';
    expect(retryBackoffMs()).toBe(250);
  });

  it.each([
    ['negative', '-1'],
    ['non-numeric', 'abc'],
  ])('defaults to 1000 ms when the variable is %s', (_label, raw) => {
    process.env.RABBITMQ_RETRY_BACKOFF_MS = raw;
    expect(retryBackoffMs()).toBe(1000);
  });
});

describe('isPermanentFailure', () => {
  it('treats an invalid terminal event as permanent', () => {
    expect(
      isPermanentFailure(
        new InvalidTerminalEventError('bad', 'MISSING_FAILURE_REASON'),
      ),
    ).toBe(true);
  });

  it('treats a body that is not JSON, as the consumer reports it, as permanent', () => {
    expect(
      isPermanentFailure(
        new InvalidTerminalEventError('Body is not JSON', 'MALFORMED_JSON'),
      ),
    ).toBe(true);
  });

  // ROB-05: a bare SyntaxError says nothing about the message - it may come
  // from the delivery itself, where a retry can succeed.
  it.each([
    ['a persistence fault', new DeliveryPersistenceError('db down')],
    ['an unexpected error', new Error('boom')],
    ['a TypeError', new TypeError('x is undefined')],
    ['a bare SyntaxError', parseError()],
  ])('treats %s as transient', (_label, error) => {
    expect(isPermanentFailure(error)).toBe(false);
  });
});

describe('settleFailedMessage', () => {
  const message = { content: Buffer.from('{}') };
  let channel: { nack: jest.Mock };

  beforeEach(() => {
    delete process.env.RABBITMQ_RETRY_BACKOFF_MS;
    channel = { nack: jest.fn() };
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    restoreBackoff();
  });

  it('requeues a transient failure only after the default 1000 ms pause', async () => {
    const settled = settleFailedMessage(
      channel,
      message,
      new DeliveryPersistenceError('db down'),
    );

    await jest.advanceTimersByTimeAsync(999);
    expect(channel.nack).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await settled;
    expect(channel.nack).toHaveBeenCalledTimes(1);
    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
  });

  it('requeues without a pause when the backoff is 0', async () => {
    process.env.RABBITMQ_RETRY_BACKOFF_MS = '0';

    await settleFailedMessage(channel, message, new Error('boom'));

    expect(channel.nack).toHaveBeenCalledWith(message, false, true);
  });

  it.each([
    [
      'an invalid terminal event',
      new InvalidTerminalEventError('bad', 'MISSING_FAILURE_REASON'),
    ],
    [
      'a body that is not JSON',
      new InvalidTerminalEventError('Body is not JSON', 'MALFORMED_JSON'),
    ],
  ])(
    'dead-letters %s at once, without advancing the clock',
    async (_label, error) => {
      await settleFailedMessage(channel, message, error);

      expect(channel.nack).toHaveBeenCalledTimes(1);
      expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    },
  );
});
