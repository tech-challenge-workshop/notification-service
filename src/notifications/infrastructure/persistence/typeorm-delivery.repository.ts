import { DataSource, QueryFailedError } from 'typeorm';
import { DeliveryRecord } from '../../domain/delivery-record';
import { DeliveryRepository } from '../../domain/delivery.repository';
import { DeliveryRecordEntity } from './delivery-record.entity';

/** PostgreSQL's unique-violation code. */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code ===
      UNIQUE_VIOLATION
  );
}

function toDomain(row: DeliveryRecordEntity): DeliveryRecord {
  const record = new DeliveryRecord();
  record.eventId = row.eventId;
  record.processingRequestId = row.processingRequestId;
  record.ownerUserId = row.ownerUserId;
  record.status = row.status as 'COMPLETED' | 'FAILED';
  // Absent stays absent: a null column must not become an empty string.
  record.zipStorageKey = row.zipStorageKey ?? undefined;
  record.failureReason = row.failureReason ?? undefined;
  record.recordedAt = row.recordedAt;
  return record;
}

export class TypeOrmDeliveryRepository implements DeliveryRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findByEventId(eventId: string): Promise<DeliveryRecord | undefined> {
    const row = await this.dataSource.manager.findOne(DeliveryRecordEntity, {
      where: { eventId },
    });
    return row ? toDomain(row) : undefined;
  }

  async findByProcessingRequestId(
    processingRequestId: string,
  ): Promise<DeliveryRecord | undefined> {
    const row = await this.dataSource.manager.findOne(DeliveryRecordEntity, {
      where: { processingRequestId },
    });
    return row ? toDomain(row) : undefined;
  }

  async save(record: DeliveryRecord): Promise<DeliveryRecord> {
    try {
      await this.dataSource.manager.insert(DeliveryRecordEntity, {
        eventId: record.eventId,
        processingRequestId: record.processingRequestId,
        ownerUserId: record.ownerUserId,
        status: record.status,
        zipStorageKey: record.zipStorageKey ?? null,
        failureReason: record.failureReason ?? null,
        recordedAt: record.recordedAt,
      });
      return record;
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Another replica recorded this event first. Surfacing this as a
        // persistence error would requeue forever against a row that is
        // already correct, so the existing record is the right answer.
        const existing = await this.findByEventId(record.eventId);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }
}
