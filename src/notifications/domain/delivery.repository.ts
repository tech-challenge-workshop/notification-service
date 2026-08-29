import { DeliveryRecord } from './delivery-record';

export interface DeliveryRepository {
  findByEventId(eventId: string): Promise<DeliveryRecord | undefined>;
  findByProcessingRequestId(
    processingRequestId: string,
  ): Promise<DeliveryRecord | undefined>;
  save(record: DeliveryRecord): Promise<DeliveryRecord>;
}
