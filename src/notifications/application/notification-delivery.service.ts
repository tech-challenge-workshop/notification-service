import { Inject, Injectable } from '@nestjs/common';
import { DeliveryRecord } from '../domain/delivery-record';
import type { DeliveryRepository } from '../domain/delivery.repository';
import { DELIVERY_REPOSITORY } from '../domain/delivery-repository.token';
import { DeliveryPersistenceError } from '../domain/errors/delivery-persistence.error';
import { InvalidTerminalEventError } from '../domain/errors/invalid-terminal-event.error';
import { TerminalEventDto } from '../dtos/terminal-event.dto';

@Injectable()
export class NotificationDeliveryService {
  constructor(
    @Inject(DELIVERY_REPOSITORY)
    private readonly deliveryRepository: DeliveryRepository,
  ) {}

  async recordDelivery(event: TerminalEventDto): Promise<DeliveryRecord> {
    if (!event.processingRequestId) {
      throw new InvalidTerminalEventError(
        'Missing processingRequestId',
        'MISSING_PROCESSING_REQUEST_ID',
      );
    }

    if (event.status !== 'COMPLETED' && event.status !== 'FAILED') {
      throw new InvalidTerminalEventError(
        `Invalid terminal status: ${String(event.status)}`,
        'INVALID_TERMINAL_STATUS',
      );
    }

    // A present-but-empty value carries nothing a notification could render,
    // so it is treated as absent.
    const zipStorageKey = event.zipStorageKey?.trim() || undefined;
    const failureReason = event.failureReason?.trim() || undefined;

    if (zipStorageKey && failureReason) {
      throw new InvalidTerminalEventError(
        'A terminal event carries either a storage key or a failure reason, never both',
        'AMBIGUOUS_TERMINAL_OUTCOME',
      );
    }
    if (event.status === 'COMPLETED' && !zipStorageKey) {
      throw new InvalidTerminalEventError(
        'A COMPLETED event must carry a zipStorageKey',
        'MISSING_ZIP_STORAGE_KEY',
      );
    }
    if (event.status === 'FAILED' && !failureReason) {
      throw new InvalidTerminalEventError(
        'A FAILED event must carry a failureReason',
        'MISSING_FAILURE_REASON',
      );
    }

    try {
      const existing = await this.deliveryRepository.findByEventId(
        event.eventId,
      );
      if (existing) {
        return existing;
      }

      const record = new DeliveryRecord();
      record.eventId = event.eventId;
      record.processingRequestId = event.processingRequestId;
      record.ownerUserId = event.ownerUserId;
      record.status = event.status;
      record.zipStorageKey = zipStorageKey;
      record.failureReason = failureReason;
      record.recordedAt = new Date();

      return await this.deliveryRepository.save(record);
    } catch (error) {
      if (error instanceof InvalidTerminalEventError) {
        throw error;
      }

      throw new DeliveryPersistenceError(
        `Failed to record delivery for event ${event.eventId}`,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
