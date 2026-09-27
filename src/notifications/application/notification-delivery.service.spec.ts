import { DeliveryRecord } from '../domain/delivery-record';
import { DeliveryRepository } from '../domain/delivery.repository';
import { DeliveryPersistenceError } from '../domain/errors/delivery-persistence.error';
import { InvalidTerminalEventError } from '../domain/errors/invalid-terminal-event.error';
import { TerminalEventDto } from '../dtos/terminal-event.dto';
import { InMemoryEmailSender } from '../infrastructure/email/in-memory-email-sender';
import { NotificationDeliveryService } from './notification-delivery.service';

class StubDeliveryRepository implements DeliveryRepository {
  private readonly records = new Map<string, DeliveryRecord>();
  saveFailure?: Error;

  findByEventId(eventId: string): Promise<DeliveryRecord | undefined> {
    return Promise.resolve(this.records.get(eventId));
  }

  findByProcessingRequestId(
    processingRequestId: string,
  ): Promise<DeliveryRecord | undefined> {
    return Promise.resolve(
      [...this.records.values()].find(
        (record) => record.processingRequestId === processingRequestId,
      ),
    );
  }

  save(record: DeliveryRecord): Promise<DeliveryRecord> {
    if (this.saveFailure) {
      return Promise.reject(this.saveFailure);
    }
    this.records.set(record.eventId, record);
    return Promise.resolve(record);
  }

  updateEmailOutcome(
    eventId: string,
    outcome: { emailSentAt: Date } | { emailError: string },
  ): Promise<void> {
    const record = this.records.get(eventId);
    if (!record) {
      return Promise.resolve();
    }
    if ('emailSentAt' in outcome) {
      record.emailSentAt = outcome.emailSentAt;
      record.emailError = undefined;
    } else {
      record.emailError = outcome.emailError;
      record.emailSentAt = undefined;
    }
    return Promise.resolve();
  }
}

describe('NotificationDeliveryService', () => {
  let service: NotificationDeliveryService;
  let repository: StubDeliveryRepository;
  let emailSender: InMemoryEmailSender;

  beforeEach(() => {
    repository = new StubDeliveryRepository();
    emailSender = new InMemoryEmailSender();
    service = new NotificationDeliveryService(repository, emailSender);
  });

  const validCompletedEvent = (): TerminalEventDto => ({
    eventId: 'evt-1',
    processingRequestId: 'req-1',
    ownerUserId: 'user-1',
    ownerEmail: 'owner@example.com',
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

    it('rejects an event with no ownerEmail and records nothing', async () => {
      await expect(
        service.recordDelivery({ ...validCompletedEvent(), ownerEmail: '' }),
      ).rejects.toMatchObject({ code: 'MISSING_OWNER_EMAIL' });

      await expect(repository.findByEventId('evt-1')).resolves.toBeUndefined();
    });

    it('treats a whitespace-only ownerEmail as absent', async () => {
      await expect(
        service.recordDelivery({ ...validCompletedEvent(), ownerEmail: '   ' }),
      ).rejects.toMatchObject({ code: 'MISSING_OWNER_EMAIL' });
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

  describe('email sending', () => {
    it('sends the completed template exactly once for a new event', async () => {
      await service.recordDelivery(validCompletedEvent());

      expect(emailSender.sent).toHaveLength(1);
      expect(emailSender.sent[0].to).toBe('owner@example.com');
      expect(emailSender.sent[0].text).toContain('req-1');
    });

    it('sends the failed template with only the safe failureReason', async () => {
      const event: TerminalEventDto = {
        ...validCompletedEvent(),
        status: 'FAILED',
        zipStorageKey: undefined,
        failureReason: 'Nao foi possivel processar o video.',
      };

      await service.recordDelivery(event);

      expect(emailSender.sent).toHaveLength(1);
      expect(emailSender.sent[0].text).toContain(
        'Nao foi possivel processar o video.',
      );
    });

    it('does not send a second email when the same eventId is redelivered after a completed attempt', async () => {
      await service.recordDelivery(validCompletedEvent());
      await service.recordDelivery(validCompletedEvent());

      expect(emailSender.sent).toHaveLength(1);
    });

    it('still sends exactly one email when a redelivered eventId finds a row with no prior outcome (crash recovery)', async () => {
      // Simulates a crash between save() and send(): the record exists, but
      // neither emailSentAt nor emailError has ever been set on it.
      const record = new DeliveryRecord();
      Object.assign(record, {
        eventId: 'evt-1',
        processingRequestId: 'req-1',
        ownerUserId: 'user-1',
        status: 'COMPLETED',
        zipStorageKey: 'zip-1',
        recordedAt: new Date(),
      });
      await repository.save(record);

      await service.recordDelivery(validCompletedEvent());

      expect(emailSender.sent).toHaveLength(1);
    });

    it('records emailError and does not throw when the send fails, and does not send again on redelivery', async () => {
      // Long enough (and with the address positioned past the 200-char
      // truncation boundary) that the assertion below only passes if
      // MAX_ERROR_MESSAGE_LENGTH truncation genuinely removes the address,
      // not because the short literal happened to fit under the limit.
      const rawTransportError = `${'connection diagnostics '.repeat(10)}connect ECONNREFUSED 1.2.3.4:1025`;
      emailSender.send = () => Promise.reject(new Error(rawTransportError));

      const result = await service.recordDelivery(validCompletedEvent());
      expect(result.emailError).toBeDefined();
      expect(result.emailError).not.toContain('1.2.3.4'); // bounded, not the raw error

      emailSender.send = (m) => {
        emailSender.sent.push(m);
        return Promise.resolve();
      };
      await service.recordDelivery(validCompletedEvent());

      expect(emailSender.sent).toHaveLength(0); // already-failed attempt is not retried
    });

    it('falls back to a safe message when the send rejects with an empty error message, and still does not retry', async () => {
      emailSender.send = () => Promise.reject(new Error(''));

      const result = await service.recordDelivery(validCompletedEvent());
      expect(result.emailError).toBe('Unknown email send failure');

      emailSender.send = (m) => {
        emailSender.sent.push(m);
        return Promise.resolve();
      };
      await service.recordDelivery(validCompletedEvent());

      expect(emailSender.sent).toHaveLength(0); // an empty message must not be treated as "no outcome"
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
