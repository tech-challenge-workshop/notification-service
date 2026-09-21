export class DeliveryRecord {
  eventId: string;
  processingRequestId: string;
  ownerUserId: string;
  status: 'COMPLETED' | 'FAILED';
  /** Present when the request completed. Mutually exclusive with failureReason. */
  zipStorageKey?: string;
  /** Present when the request failed. Already safe for a user to read. */
  failureReason?: string;
  recordedAt: Date;
}
