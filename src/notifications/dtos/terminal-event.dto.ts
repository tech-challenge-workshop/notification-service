export class TerminalEventDto {
  eventId: string;
  processingRequestId: string;
  ownerUserId: string;
  ownerEmail: string;
  status: 'COMPLETED' | 'FAILED';
  zipStorageKey?: string;
  failureReason?: string;
  occurredAt: string;
  /** The id the upstream chain assigned; absent from older publishers. */
  correlationId?: string;
}
