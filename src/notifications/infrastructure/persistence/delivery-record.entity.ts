import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Kept separate from the domain class so persistence annotations never reach
 * the domain, matching how the Catalog separates its aggregate from storage.
 *
 * `event_id` is the primary key: deduplication becomes a schema guarantee
 * rather than a check-then-act two replicas can both win.
 */
@Entity({ name: 'delivery_record' })
export class DeliveryRecordEntity {
  // `text`, not `uuid`: the terminal contract declares eventId as a string.
  // Narrowing it in the schema would reject a publisher that honours the
  // contract, which is not this service's call to make.
  @PrimaryColumn({ name: 'event_id', type: 'text' })
  eventId: string;

  @Index()
  @Column({ name: 'processing_request_id', type: 'text' })
  processingRequestId: string;

  @Column({ name: 'owner_user_id', type: 'text' })
  ownerUserId: string;

  @Column({ name: 'status', type: 'text' })
  status: string;

  @Column({ name: 'zip_storage_key', type: 'text', nullable: true })
  zipStorageKey: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;
}
