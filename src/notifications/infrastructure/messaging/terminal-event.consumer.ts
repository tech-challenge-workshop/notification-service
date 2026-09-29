import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { withMessageCorrelation } from '../../../messaging/with-correlation';
import { NotificationDeliveryService } from '../../application/notification-delivery.service';
import { InvalidTerminalEventError } from '../../domain/errors/invalid-terminal-event.error';
import { TerminalEventDto } from '../../dtos/terminal-event.dto';
import { settleFailedMessage } from './settle-failed-message';

interface RabbitChannel {
  ack(message: unknown): void;
  nack(message: unknown, allUpTo?: boolean, requeue?: boolean): void;
}

@Controller()
export class TerminalEventConsumer {
  private readonly logger = new Logger(TerminalEventConsumer.name);

  constructor(
    private readonly notificationDeliveryService: NotificationDeliveryService,
  ) {}

  @EventPattern('terminal.event')
  async handleTerminalEvent(
    @Payload() payload: unknown,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef() as RabbitChannel;
    const message = context.getMessage() as { content: Buffer };
    // Read by the catch, which must not throw: until parseEnvelope has
    // validated it, the payload may be null, missing or a primitive (V48).
    const event = payload as { eventId?: string } | null | undefined;

    // OBS-46/47: the whole handling, failure and settle included, runs in the
    // message's correlation scope. The wrapper never throws for a missing or
    // invalid id, and the body below settles every message itself.
    await withMessageCorrelation(message.content.toString(), async () => {
      try {
        await this.notificationDeliveryService.recordDelivery(
          parseEnvelope(message.content, payload),
        );
        channel.ack(message);
      } catch (error) {
        this.logger.error(
          `Failed to process terminal event ${event?.eventId ?? 'unknown'}: ${error instanceof Error ? error.message : String(error)}`,
        );

        try {
          await settleFailedMessage(channel, message, error);
        } catch (settleError) {
          // The channel closed during the pause (shutdown): the message stays
          // unacked and the broker redelivers it.
          this.logger.warn(
            `Could not settle terminal event ${event?.eventId ?? 'unknown'}: ${settleError instanceof Error ? settleError.message : String(settleError)}`,
          );
        }
      }
    });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates what the consumer is about to act on, so that every message it
 * can never handle fails here as an `InvalidTerminalEventError`, the one
 * failure `settleFailedMessage` dead-letters at once (ROB-04, ROB-05).
 *
 * Nest falls back to the raw string when the body is not JSON, so the body
 * is parsed here; its SyntaxError is reported as `MALFORMED_JSON`.
 */
function parseEnvelope(content: Buffer, payload: unknown): TerminalEventDto {
  try {
    JSON.parse(content.toString());
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new InvalidTerminalEventError('Body is not JSON', 'MALFORMED_JSON');
    }
    throw error;
  }

  if (!isObject(payload)) {
    throw new InvalidTerminalEventError(
      'Payload is not an object',
      'INVALID_PAYLOAD',
    );
  }

  const { processingRequestId } = payload;
  if (
    typeof processingRequestId !== 'string' ||
    processingRequestId.trim() === ''
  ) {
    throw new InvalidTerminalEventError(
      'Missing processingRequestId',
      'MISSING_PROCESSING_REQUEST_ID',
    );
  }

  return payload as unknown as TerminalEventDto;
}
