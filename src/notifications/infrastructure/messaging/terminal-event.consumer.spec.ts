import { Logger } from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import { NotificationDeliveryService } from '../../application/notification-delivery.service';
import { DeliveryPersistenceError } from '../../domain/errors/delivery-persistence.error';
import { InvalidTerminalEventError } from '../../domain/errors/invalid-terminal-event.error';
import { TerminalEventDto } from '../../dtos/terminal-event.dto';
import { TerminalEventConsumer } from './terminal-event.consumer';

describe('TerminalEventConsumer', () => {
  let consumer: TerminalEventConsumer;
  let recordDeliveryMock: jest.Mock;
  let deliveryService: NotificationDeliveryService;
  let channel: { ack: jest.Mock; nack: jest.Mock };
  let message: Record<string, unknown>;
  let context: RmqContext;

  beforeEach(() => {
    recordDeliveryMock = jest.fn();
    deliveryService = {
      recordDelivery: recordDeliveryMock,
    } as unknown as NotificationDeliveryService;

    channel = {
      ack: jest.fn(),
      nack: jest.fn(),
    };

    message = { content: Buffer.from('{}') };

    context = {
      getChannelRef: () => channel,
      getMessage: () => message,
    } as unknown as RmqContext;

    consumer = new TerminalEventConsumer(deliveryService);
  });

  const validCompletedEvent = (): TerminalEventDto => ({
    eventId: 'evt-1',
    processingRequestId: 'req-1',
    ownerUserId: 'user-1',
    status: 'COMPLETED',
    zipStorageKey: 'zip-1',
    occurredAt: '2026-08-27T00:00:00Z',
  });

  describe('handleTerminalEvent', () => {
    it('should record a valid terminal event and acknowledge the message', async () => {
      const event = validCompletedEvent();
      recordDeliveryMock.mockResolvedValue({});

      await consumer.handleTerminalEvent(event, context);

      expect(recordDeliveryMock).toHaveBeenCalledWith(event);
      expect(channel.ack).toHaveBeenCalledWith(message);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('should acknowledge duplicate terminal events without a second record', async () => {
      const event = validCompletedEvent();
      const existingRecord = {
        eventId: 'evt-1',
        processingRequestId: 'req-1',
        ownerUserId: 'user-1',
        status: 'COMPLETED',
        recordedAt: new Date(),
      };
      recordDeliveryMock.mockResolvedValue(existingRecord);

      await consumer.handleTerminalEvent(event, context);

      expect(recordDeliveryMock).toHaveBeenCalledTimes(1);
      expect(channel.ack).toHaveBeenCalledWith(message);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('should reject and nack non-terminal events without requeue', async () => {
      const event: TerminalEventDto = {
        ...validCompletedEvent(),
        status: 'PROCESSING' as 'COMPLETED',
      };
      recordDeliveryMock.mockRejectedValue(
        new InvalidTerminalEventError(
          'Invalid terminal status: PROCESSING',
          'INVALID_TERMINAL_STATUS',
        ),
      );

      await consumer.handleTerminalEvent(event, context);

      expect(recordDeliveryMock).toHaveBeenCalledWith(event);
      expect(channel.ack).not.toHaveBeenCalled();
      expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('should reject and nack events missing processingRequestId without requeue', async () => {
      const event: TerminalEventDto = {
        ...validCompletedEvent(),
        processingRequestId: '',
      };

      await consumer.handleTerminalEvent(event, context);

      expect(recordDeliveryMock).not.toHaveBeenCalled();
      expect(channel.ack).not.toHaveBeenCalled();
      expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('should nack with requeue for DeliveryPersistenceError', async () => {
      const event = validCompletedEvent();
      recordDeliveryMock.mockRejectedValue(
        new DeliveryPersistenceError('Database unavailable'),
      );

      await consumer.handleTerminalEvent(event, context);

      expect(channel.ack).not.toHaveBeenCalled();
      expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    });

    it('should nack with requeue for unexpected errors', async () => {
      const event = validCompletedEvent();
      recordDeliveryMock.mockRejectedValue(new Error('Unexpected failure'));

      await consumer.handleTerminalEvent(event, context);

      expect(channel.ack).not.toHaveBeenCalled();
      expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    });
  });

  describe('settling a failure (MSG-10, MSG-11)', () => {
    const previousBackoff = process.env.RABBITMQ_RETRY_BACKOFF_MS;

    beforeEach(() => {
      delete process.env.RABBITMQ_RETRY_BACKOFF_MS;
      jest.useFakeTimers();
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
      if (previousBackoff === undefined) {
        delete process.env.RABBITMQ_RETRY_BACKOFF_MS;
      } else {
        process.env.RABBITMQ_RETRY_BACKOFF_MS = previousBackoff;
      }
    });

    it('dead-letters a body that is not JSON at once, recording nothing', async () => {
      message.content = Buffer.from('not json');

      await consumer.handleTerminalEvent(validCompletedEvent(), context);

      expect(recordDeliveryMock).not.toHaveBeenCalled();
      expect(channel.ack).not.toHaveBeenCalled();
      expect(channel.nack).toHaveBeenCalledTimes(1);
      expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });

    // ROB-04 (V48): a payload the consumer cannot act on is dead-lettered on
    // its first delivery. `null` and a missing `data` used to throw from the
    // catch itself, so the message was never settled.
    it.each([
      ['null', { pattern: 'terminal.event', data: null }, null],
      ['missing', { pattern: 'terminal.event' }, undefined],
      ['an array', { pattern: 'terminal.event', data: [] }, []],
      ['a string', { pattern: 'terminal.event', data: 'x' }, 'x'],
      ['a number', { pattern: 'terminal.event', data: 1 }, 1],
      ['an empty object', { pattern: 'terminal.event', data: {} }, {}],
    ])(
      'dead-letters a payload that is %s at once, recording nothing',
      async (_label, body, payload) => {
        const logged = jest.spyOn(Logger.prototype, 'error');
        message.content = Buffer.from(JSON.stringify(body));

        // No clock is advanced: a nack that waited for the backoff would not
        // have happened yet.
        await expect(
          consumer.handleTerminalEvent(
            payload as unknown as TerminalEventDto,
            context,
          ),
        ).resolves.toBeUndefined();

        expect(recordDeliveryMock).not.toHaveBeenCalled();
        expect(channel.ack).not.toHaveBeenCalled();
        expect(channel.nack).toHaveBeenCalledTimes(1);
        expect(channel.nack).toHaveBeenCalledWith(message, false, false);
        expect(String(logged.mock.calls[0]?.[0])).toContain('unknown');
      },
    );

    // ROB-05: only the parse of the body is a malformed message. A
    // SyntaxError raised while delivering is a fault a retry can clear.
    it('requeues a SyntaxError thrown by the delivery only after the 1000 ms backoff', async () => {
      recordDeliveryMock.mockRejectedValue(new SyntaxError('x'));

      const handled = consumer.handleTerminalEvent(
        validCompletedEvent(),
        context,
      );
      await jest.advanceTimersByTimeAsync(999);
      expect(channel.nack).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      await handled;
      expect(channel.ack).not.toHaveBeenCalled();
      expect(channel.nack).toHaveBeenCalledTimes(1);
      expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    });

    it('dead-letters an invalid event at once', async () => {
      recordDeliveryMock.mockRejectedValue(
        new InvalidTerminalEventError(
          'A FAILED event must carry a failureReason',
          'MISSING_FAILURE_REASON',
        ),
      );

      await consumer.handleTerminalEvent(validCompletedEvent(), context);

      expect(channel.ack).not.toHaveBeenCalled();
      expect(channel.nack).toHaveBeenCalledTimes(1);
      expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('requeues a persistence fault only after the 1000 ms backoff', async () => {
      recordDeliveryMock.mockRejectedValue(
        new DeliveryPersistenceError('Database unavailable'),
      );

      const handled = consumer.handleTerminalEvent(
        validCompletedEvent(),
        context,
      );
      await jest.advanceTimersByTimeAsync(999);
      expect(channel.nack).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      await handled;
      expect(channel.ack).not.toHaveBeenCalled();
      expect(channel.nack).toHaveBeenCalledTimes(1);
      expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    });

    it('acknowledges a successful delivery without settling a failure', async () => {
      recordDeliveryMock.mockResolvedValue({});

      await consumer.handleTerminalEvent(validCompletedEvent(), context);

      expect(channel.ack).toHaveBeenCalledWith(message);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('leaves the message unsettled when the channel closes during the pause', async () => {
      // amqplib throws on ack/nack once its channel is closed; the broker then
      // redelivers the unacked message.
      let closed = false;
      const settled: string[] = [];
      const closingChannel = {
        ack: () => {
          if (closed) throw new Error('Channel closed');
          settled.push('ack');
        },
        nack: () => {
          if (closed) throw new Error('Channel closed');
          settled.push('nack');
        },
      };
      const closingContext = {
        getChannelRef: () => closingChannel,
        getMessage: () => message,
      } as unknown as RmqContext;
      recordDeliveryMock.mockRejectedValue(
        new DeliveryPersistenceError('Database unavailable'),
      );

      const handled = consumer.handleTerminalEvent(
        validCompletedEvent(),
        closingContext,
      );
      await jest.advanceTimersByTimeAsync(500);
      closed = true;
      await jest.advanceTimersByTimeAsync(500);

      await expect(handled).resolves.toBeUndefined();
      expect(settled).toEqual([]);
    });
  });

  describe('transport policy per rejection', () => {
    const valid = (): TerminalEventDto => ({
      eventId: 'evt-policy',
      processingRequestId: 'req-policy',
      ownerUserId: 'user-policy',
      status: 'COMPLETED',
      zipStorageKey: 'zips/a.zip',
      occurredAt: '2026-09-20T00:00:00Z',
    });

    it.each([
      [
        'MISSING_ZIP_STORAGE_KEY',
        'A COMPLETED event must carry a zipStorageKey',
      ],
      ['MISSING_FAILURE_REASON', 'A FAILED event must carry a failureReason'],
      ['AMBIGUOUS_TERMINAL_OUTCOME', 'never both'],
    ])('nacks %s without requeue', async (code, message_) => {
      recordDeliveryMock.mockRejectedValue(
        new InvalidTerminalEventError(
          message_,
          code as ConstructorParameters<typeof InvalidTerminalEventError>[1],
        ),
      );

      await consumer.handleTerminalEvent(valid(), context);

      // A contract violation cannot become valid by being redelivered.
      expect(channel.nack).toHaveBeenCalledWith(message, false, false);
      expect(channel.ack).not.toHaveBeenCalled();
    });

    it('nacks a persistence fault with requeue, because a retry can succeed', async () => {
      recordDeliveryMock.mockRejectedValue(
        new DeliveryPersistenceError('repository unavailable'),
      );

      await consumer.handleTerminalEvent(valid(), context);

      expect(channel.nack).toHaveBeenCalledWith(message, false, true);
      expect(channel.ack).not.toHaveBeenCalled();
    });

    it('logs the rejection with its eventId and the reason', async () => {
      const logged = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      recordDeliveryMock.mockRejectedValue(
        new InvalidTerminalEventError(
          'A FAILED event must carry a failureReason',
          'MISSING_FAILURE_REASON',
        ),
      );

      await consumer.handleTerminalEvent(valid(), context);

      const line = logged.mock.calls.map((c) => String(c[0])).join(' ');
      expect(line).toContain('evt-policy');
      expect(line).toContain('failureReason');
      logged.mockRestore();
    });
  });
});
