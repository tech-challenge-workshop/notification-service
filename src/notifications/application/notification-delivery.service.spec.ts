import { DeliveryRecord } from '../domain/delivery-record';
import { DeliveryRepository } from '../domain/delivery.repository';
import { TerminalEventDto } from '../dtos/terminal-event.dto';
import { NotificationDeliveryService } from './notification-delivery.service';

class StubDeliveryRepository implements DeliveryRepository {
  private readonly records = new Map<string, DeliveryRecord>();

  findByEventId(eventId: string): Promise<DeliveryRecord | undefined> {
    return Promise.resolve(this.records.get(eventId));
  }

  save(record: DeliveryRecord): Promise<DeliveryRecord> {
    this.records.set(record.eventId, record);
    return Promise.resolve(record);
  }
}

describe('NotificationDeliveryService', () => {
  let service: NotificationDeliveryService;
  let repository: StubDeliveryRepository;

  beforeEach(() => {
    repository = new StubDeliveryRepository();
    service = new NotificationDeliveryService(repository);
  });

  const validCompletedEvent = (): TerminalEventDto => ({
    eventId: 'evt-1',
    processingRequestId: 'req-1',
    ownerUserId: 'user-1',
    status: 'COMPLETED',
    zipStorageKey: 'zip-1',
    occurredAt: '2026-08-27T00:00:00Z',
  });

  describe('recordDelivery', () => {
    it('should create a delivery record for a COMPLETED event', async () => {
      const result = await service.recordDelivery(validCompletedEvent());

      expect(result.eventId).toBe('evt-1');
      expect(result.processingRequestId).toBe('req-1');
      expect(result.ownerUserId).toBe('user-1');
      expect(result.status).toBe('COMPLETED');
      expect(result.recordedAt).toBeInstanceOf(Date);
    });

    it('should create a delivery record for a FAILED event', async () => {
      const event: TerminalEventDto = {
        ...validCompletedEvent(),
        status: 'FAILED',
        failureReason: 'PROCESSAMENTO_FALHOU',
      };

      const result = await service.recordDelivery(event);

      expect(result.status).toBe('FAILED');
      expect(result.eventId).toBe('evt-1');
    });

    it('should return the existing record for a duplicate eventId without creating a second one', async () => {
      const event = validCompletedEvent();
      const first = await service.recordDelivery(event);
      const second = await service.recordDelivery(event);

      expect(second).toBe(first);
      expect(second.recordedAt).toBe(first.recordedAt);
    });

    it('should throw for a non-terminal status', async () => {
      const event: TerminalEventDto = {
        ...validCompletedEvent(),
        status: 'PROCESSING' as 'COMPLETED',
      };

      await expect(service.recordDelivery(event)).rejects.toThrow(
        'Invalid terminal status: PROCESSING',
      );
    });
  });
});
