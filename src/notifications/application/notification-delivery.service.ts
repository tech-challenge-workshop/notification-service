import { Injectable } from '@nestjs/common';
import { DeliveryRecord } from '../domain/delivery-record';
import type { DeliveryRepository } from '../domain/delivery.repository';
import { DeliveryPersistenceError } from '../domain/errors/delivery-persistence.error';
import { InvalidTerminalEventError } from '../domain/errors/invalid-terminal-event.error';
import { TerminalEventDto } from '../dtos/terminal-event.dto';

@Injectable()
export class NotificationDeliveryService {
  constructor(private readonly deliveryRepository: DeliveryRepository) {}

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

    try {
      const existing = await this.deliveryRepository.findByEventId(event.eventId);
      if (existing) {
        return existing;
      }

      const record = new DeliveryRecord();
      record.eventId = event.eventId;
      record.processingRequestId = event.processingRequestId;
      record.ownerUserId = event.ownerUserId;
      record.status = event.status;
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
