import { DeliveryRecord } from '../domain/delivery-record';
import { DeliveryRepository } from '../domain/delivery.repository';
import { DeliveryPersistenceError } from '../domain/errors/delivery-persistence.error';
import { InvalidTerminalEventError } from '../domain/errors/invalid-terminal-event.error';
import { TerminalEventDto } from '../dtos/terminal-event.dto';
import { NotificationDeliveryService } from './notification-delivery.service';

class StubDeliveryRepository implements DeliveryRepository {
  private readonly records = new Map<string, DeliveryRecord>();
  saveFailure?: Error;

  findByEventId(eventId: string): Promise<DeliveryRecord | undefined> {
    return Promise.resolve(this.records.get(eventId));
  }

  save(record: DeliveryRecord): Promise<DeliveryRecord> {
    if (this.saveFailure) {
      return Promise.reject(this.saveFailure);
    }
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
        zipStorageKey: undefined,
        failureReason: 'Nao foi possivel processar o video.',
      };

      const result = await service.recordDelivery(event);

      expect(result.status).toBe('FAILED');
      expect(result.eventId).toBe('evt-1');
      expect(result.failureReason).toBe('Nao foi possivel processar o video.');
      expect(result.zipStorageKey).toBeUndefined();
    });

    it('should return the existing record for a duplicate eventId without creating a second one', async () => {
      const event = validCompletedEvent();
      const first = await service.recordDelivery(event);
      const second = await service.recordDelivery(event);

      expect(second).toBe(first);
      expect(second.recordedAt).toBe(first.recordedAt);
    });

    it('should throw InvalidTerminalEventError for a non-terminal status', async () => {
      const event: TerminalEventDto = {
        ...validCompletedEvent(),
        status: 'PROCESSING' as 'COMPLETED',
      };

      await expect(service.recordDelivery(event)).rejects.toThrow(
        InvalidTerminalEventError,
      );
      await expect(service.recordDelivery(event)).rejects.toMatchObject({
        code: 'INVALID_TERMINAL_STATUS',
      });
    });

    it('should throw InvalidTerminalEventError when processingRequestId is missing', async () => {
      const event = {
        ...validCompletedEvent(),
        processingRequestId: '',
      };

      await expect(service.recordDelivery(event)).rejects.toThrow(
        InvalidTerminalEventError,
      );
      await expect(service.recordDelivery(event)).rejects.toMatchObject({
        code: 'MISSING_PROCESSING_REQUEST_ID',
      });
    });

    it('should throw DeliveryPersistenceError when the repository rejects unexpectedly', async () => {
      repository.saveFailure = new Error('Database unavailable');
      const event = validCompletedEvent();

      await expect(service.recordDelivery(event)).rejects.toThrow(
        DeliveryPersistenceError,
      );
    });
  });

  describe('payload consistency', () => {
    it('rejects a COMPLETED event with no zipStorageKey and records nothing', async () => {
      await expect(
        service.recordDelivery({
          ...validCompletedEvent(),
          zipStorageKey: undefined,
        }),
      ).rejects.toMatchObject({ code: 'MISSING_ZIP_STORAGE_KEY' });

      await expect(repository.findByEventId('evt-1')).resolves.toBeUndefined();
    });

    it('rejects a FAILED event with no failureReason and records nothing', async () => {
      await expect(
        service.recordDelivery({
          ...validCompletedEvent(),
          status: 'FAILED',
          zipStorageKey: undefined,
        }),
      ).rejects.toMatchObject({ code: 'MISSING_FAILURE_REASON' });

      await expect(repository.findByEventId('evt-1')).resolves.toBeUndefined();
    });

    it('rejects an event carrying both a storage key and a failure reason', async () => {
      await expect(
        service.recordDelivery({
          ...validCompletedEvent(),
          failureReason: 'algo falhou',
        }),
      ).rejects.toMatchObject({ code: 'AMBIGUOUS_TERMINAL_OUTCOME' });

      await expect(repository.findByEventId('evt-1')).resolves.toBeUndefined();
    });

    it('treats a whitespace-only failureReason as absent', async () => {
      await expect(
        service.recordDelivery({
          ...validCompletedEvent(),
          status: 'FAILED',
          zipStorageKey: undefined,
          failureReason: '   ',
        }),
      ).rejects.toMatchObject({ code: 'MISSING_FAILURE_REASON' });
    });

    it('validates before deduplication, so an invalid event is never served from a prior record', async () => {
      // A valid event is recorded under this eventId first.
      await service.recordDelivery(validCompletedEvent());

      // The same eventId arriving inconsistent must be refused, not answered
      // from the record the earlier delivery created.
      await expect(
        service.recordDelivery({
          ...validCompletedEvent(),
          zipStorageKey: undefined,
        }),
      ).rejects.toMatchObject({ code: 'MISSING_ZIP_STORAGE_KEY' });
    });
  });

  describe('outcome retention', () => {
    it('keeps the storage key of a completed request and leaves the reason unset', async () => {
      const record = await service.recordDelivery(validCompletedEvent());

      expect(record.zipStorageKey).toBe(validCompletedEvent().zipStorageKey);
      expect(record.failureReason).toBeUndefined();
      expect(record.ownerUserId).toBe(validCompletedEvent().ownerUserId);
      expect(record.processingRequestId).toBe(
        validCompletedEvent().processingRequestId,
      );
    });

    it('keeps the fields of an existing record unchanged on redelivery', async () => {
      const first = await service.recordDelivery(validCompletedEvent());
      const second = await service.recordDelivery(validCompletedEvent());

      expect(second.zipStorageKey).toBe(first.zipStorageKey);
      expect(second.failureReason).toBe(first.failureReason);
      expect(second.recordedAt).toEqual(first.recordedAt);
    });
  });
});
