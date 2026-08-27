import { DeliveryRecord } from './delivery-record';

export interface DeliveryRepository {
  findByEventId(eventId: string): Promise<DeliveryRecord | undefined>;
  save(record: DeliveryRecord): Promise<DeliveryRecord>;
}
