import { Injectable } from '@nestjs/common';
import { DeliveryRecord } from '../../domain/delivery-record';
import { DeliveryRepository } from '../../domain/delivery.repository';

@Injectable()
export class InMemoryDeliveryRepository implements DeliveryRepository {
  private readonly records = new Map<string, DeliveryRecord>();

  async findByEventId(eventId: string): Promise<DeliveryRecord | undefined> {
    return this.records.get(eventId);
  }

  async save(record: DeliveryRecord): Promise<DeliveryRecord> {
    const existing = this.records.get(record.eventId);
    if (existing) {
      return existing;
    }
    this.records.set(record.eventId, record);
    return record;
  }
}
