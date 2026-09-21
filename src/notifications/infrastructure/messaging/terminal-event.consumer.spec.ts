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
