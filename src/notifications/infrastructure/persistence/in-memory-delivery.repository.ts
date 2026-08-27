import { Injectable } from '@nestjs/common';
import { DeliveryRecord } from '../../domain/delivery-record';
import { DeliveryRepository } from '../../domain/delivery.repository';

@Injectable()
export class InMemoryDeliveryRepository implements DeliveryRepository {
  private readonly records = new Map<string, DeliveryRecord>();

  findByEventId(eventId: string): Promise<DeliveryRecord | undefined> {
    return Promise.resolve(this.records.get(eventId));
  }

  save(record: DeliveryRecord): Promise<DeliveryRecord> {
    const existing = this.records.get(record.eventId);
    if (existing) {
      return Promise.resolve(existing);
    }
    this.records.set(record.eventId, record);
    return Promise.resolve(record);
  }
}
