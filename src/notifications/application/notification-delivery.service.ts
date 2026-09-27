import { Inject, Injectable, Logger } from '@nestjs/common';
import { DeliveryRecord } from '../domain/delivery-record';
import type { DeliveryRepository } from '../domain/delivery.repository';
import { DELIVERY_REPOSITORY } from '../domain/delivery-repository.token';
import { EMAIL_SENDER } from '../domain/email-sender.token';
import type { EmailSender } from '../domain/email-sender';
import { DeliveryPersistenceError } from '../domain/errors/delivery-persistence.error';
import { InvalidTerminalEventError } from '../domain/errors/invalid-terminal-event.error';
import { TerminalEventDto } from '../dtos/terminal-event.dto';
import { renderCompletedEmail, renderFailedEmail } from './email-templates';

const MAX_ERROR_MESSAGE_LENGTH = 200;

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    @Inject(DELIVERY_REPOSITORY)
    private readonly deliveryRepository: DeliveryRepository,
    @Inject(EMAIL_SENDER)
    private readonly emailSender: EmailSender,
  ) {}

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

    const ownerEmail = event.ownerEmail?.trim();
    if (!ownerEmail) {
      throw new InvalidTerminalEventError(
        'Missing ownerEmail',
        'MISSING_OWNER_EMAIL',
      );
    }

    // A present-but-empty value carries nothing a notification could render,
    // so it is treated as absent.
    const zipStorageKey = event.zipStorageKey?.trim() || undefined;
    const failureReason = event.failureReason?.trim() || undefined;

    if (zipStorageKey && failureReason) {
      throw new InvalidTerminalEventError(
        'A terminal event carries either a storage key or a failure reason, never both',
        'AMBIGUOUS_TERMINAL_OUTCOME',
      );
    }
    if (event.status === 'COMPLETED' && !zipStorageKey) {
      throw new InvalidTerminalEventError(
        'A COMPLETED event must carry a zipStorageKey',
        'MISSING_ZIP_STORAGE_KEY',
      );
    }
    if (event.status === 'FAILED' && !failureReason) {
      throw new InvalidTerminalEventError(
        'A FAILED event must carry a failureReason',
        'MISSING_FAILURE_REASON',
      );
    }

    try {
      let record = await this.deliveryRepository.findByEventId(event.eventId);
      if (record && (record.emailSentAt || record.emailError)) {
        return record; // an attempt already completed for this event
      }

      if (!record) {
        record = new DeliveryRecord();
        record.eventId = event.eventId;
        record.processingRequestId = event.processingRequestId;
        record.ownerUserId = event.ownerUserId;
        record.status = event.status;
        record.zipStorageKey = zipStorageKey;
        record.failureReason = failureReason;
        record.recordedAt = new Date();
        record = await this.deliveryRepository.save(record);

        // save() can hand back an existing row when a concurrent insert
        // already won the race (unique-violation fallback). That row may
        // already carry a completed attempt.
        if (record.emailSentAt || record.emailError) {
          return record;
        }
      }

      await this.attemptEmail(record, ownerEmail);
      return record;
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

  private async attemptEmail(
    record: DeliveryRecord,
    ownerEmail: string,
  ): Promise<void> {
    const template =
      record.status === 'COMPLETED'
        ? renderCompletedEmail({
            processingRequestId: record.processingRequestId,
          })
        : renderFailedEmail({
            processingRequestId: record.processingRequestId,
            failureReason: record.failureReason ?? '',
          });

    // The send is attempted in isolation from persisting its outcome: if the
    // send succeeds and the subsequent write fails, the catch below must not
    // run (it would record a failure for an email that was actually
    // delivered, and a second failed write from there would leave the row
    // with no outcome at all, inviting a duplicate send on redelivery).
    let outcome: { emailSentAt: Date } | { emailError: string };
    try {
      await this.emailSender.send({ to: ownerEmail, ...template });
      outcome = { emailSentAt: new Date() };
    } catch (error) {
      // An empty message must not collapse to '', which is falsy and would
      // let the send-attempt gate miss it on redelivery.
      const message = error instanceof Error ? error.message : '';
      const safeMessage = (message || 'Unknown email send failure').slice(
        0,
        MAX_ERROR_MESSAGE_LENGTH,
      );
      this.logger.warn(
        `Email send failed for event ${record.eventId}: ${safeMessage}`,
      );
      outcome = { emailError: safeMessage };
    }

    Object.assign(record, outcome);
    await this.deliveryRepository.updateEmailOutcome(record.eventId, outcome);
  }
}
