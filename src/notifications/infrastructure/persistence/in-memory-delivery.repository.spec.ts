import { DeliveryRecord } from '../../domain/delivery-record';
import { InMemoryDeliveryRepository } from './in-memory-delivery.repository';

describe('InMemoryDeliveryRepository', () => {
  let repository: InMemoryDeliveryRepository;

  beforeEach(() => {
    repository = new InMemoryDeliveryRepository();
  });

  describe('findByEventId', () => {
    it('should return undefined when the eventId was not recorded', async () => {
      const result = await repository.findByEventId('unknown-event');
      expect(result).toBeUndefined();
    });
  });

  describe('findByProcessingRequestId', () => {
    it('should return undefined when no delivery matches the request id', async () => {
      const result = await repository.findByProcessingRequestId('unknown-request');
      expect(result).toBeUndefined();
    });

    it('should return the delivery record for the given processing request id', async () => {
      const record = new DeliveryRecord();
      record.eventId = 'evt-1';
      record.processingRequestId = 'req-1';
      record.ownerUserId = 'user-1';
      record.status = 'COMPLETED';
      record.recordedAt = new Date('2026-08-27T00:00:00Z');
      await repository.save(record);

      const found = await repository.findByProcessingRequestId('req-1');

      expect(found).toBe(record);
      expect(found?.status).toBe('COMPLETED');
    });
  });

  describe('save', () => {
    it('should store a new delivery record', async () => {
      const record = new DeliveryRecord();
      record.eventId = 'evt-1';
      record.processingRequestId = 'req-1';
      record.ownerUserId = 'user-1';
      record.status = 'COMPLETED';
      record.recordedAt = new Date('2026-08-27T00:00:00Z');

      const saved = await repository.save(record);

      expect(saved).toBe(record);
      const found = await repository.findByEventId('evt-1');
      expect(found).toBe(record);
    });

    it('should return the existing record for a duplicate eventId without storing a second one', async () => {
      const first = new DeliveryRecord();
      first.eventId = 'evt-1';
      first.processingRequestId = 'req-1';
      first.ownerUserId = 'user-1';
      first.status = 'COMPLETED';
      first.recordedAt = new Date('2026-08-27T00:00:00Z');
      await repository.save(first);

      const duplicate = new DeliveryRecord();
      duplicate.eventId = 'evt-1';
      duplicate.processingRequestId = 'req-2';
      duplicate.ownerUserId = 'user-2';
      duplicate.status = 'FAILED';
      duplicate.recordedAt = new Date('2026-08-28T00:00:00Z');

      const result = await repository.save(duplicate);

      expect(result).toBe(first);
      const found = await repository.findByEventId('evt-1');
      expect(found).toBe(first);
      expect(found?.processingRequestId).toBe('req-1');
    });
  });
});
