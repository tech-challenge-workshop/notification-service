import { RmqContext } from '@nestjs/microservices';
import { NotificationDeliveryService } from '../../application/notification-delivery.service';
import { TerminalEventDto } from '../../dtos/terminal-event.dto';
import { TerminalEventConsumer } from './terminal-event.consumer';

describe('TerminalEventConsumer', () => {
  let consumer: TerminalEventConsumer;
  let deliveryService: jest.Mocked<NotificationDeliveryService>;
  let channel: { ack: jest.Mock; nack: jest.Mock };
  let message: Record<string, unknown>;
  let context: RmqContext;

  beforeEach(() => {
    deliveryService = {
      recordDelivery: jest.fn(),
    } as unknown as jest.Mocked<NotificationDeliveryService>;

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
      deliveryService.recordDelivery.mockResolvedValue({} as ReturnType<
        NotificationDeliveryService['recordDelivery']
      >);

      await consumer.handleTerminalEvent(event, context);

      expect(deliveryService.recordDelivery).toHaveBeenCalledWith(event);
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
      deliveryService.recordDelivery.mockResolvedValue(existingRecord);

      await consumer.handleTerminalEvent(event, context);

      expect(deliveryService.recordDelivery).toHaveBeenCalledTimes(1);
      expect(channel.ack).toHaveBeenCalledWith(message);
      expect(channel.nack).not.toHaveBeenCalled();
    });

    it('should reject and nack non-terminal events without creating a record', async () => {
      const event: TerminalEventDto = {
        ...validCompletedEvent(),
        status: 'PROCESSING' as 'COMPLETED',
      };
      deliveryService.recordDelivery.mockRejectedValue(
        new Error('Invalid terminal status: PROCESSING'),
      );

      await consumer.handleTerminalEvent(event, context);

      expect(deliveryService.recordDelivery).toHaveBeenCalledWith(event);
      expect(channel.ack).not.toHaveBeenCalled();
      expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    });

    it('should nack with requeue when recording fails for technical redelivery', async () => {
      const event = validCompletedEvent();
      deliveryService.recordDelivery.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await consumer.handleTerminalEvent(event, context);

      expect(channel.ack).not.toHaveBeenCalled();
      expect(channel.nack).toHaveBeenCalledWith(message, false, true);
    });
  });
});
