import { Injectable } from '@nestjs/common';
import { DeliveryRecord } from '../domain/delivery-record';
import { DeliveryRepository } from '../domain/delivery.repository';
import { TerminalEventDto } from '../dtos/terminal-event.dto';

@Injectable()
export class NotificationDeliveryService {
  constructor(private readonly deliveryRepository: DeliveryRepository) {}

  async recordDelivery(event: TerminalEventDto): Promise<DeliveryRecord> {
    if (event.status !== 'COMPLETED' && event.status !== 'FAILED') {
      throw new Error(`Invalid terminal status: ${event.status}`);
    }

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

    return this.deliveryRepository.save(record);
  }
}
