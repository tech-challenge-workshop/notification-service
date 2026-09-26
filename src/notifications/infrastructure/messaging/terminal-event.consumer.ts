import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
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
    @Payload() event: TerminalEventDto,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef() as RabbitChannel;
    const message = context.getMessage() as { content: Buffer };

    try {
      // Nest falls back to the raw string when the body is not JSON, so the
      // body is parsed here: the SyntaxError then classifies as permanent.
      JSON.parse(message.content.toString());

      if (!event.processingRequestId) {
        throw new InvalidTerminalEventError(
          'Missing processingRequestId',
          'MISSING_PROCESSING_REQUEST_ID',
        );
      }

      await this.notificationDeliveryService.recordDelivery(event);
      channel.ack(message);
    } catch (error) {
      this.logger.error(
        `Failed to process terminal event ${event.eventId}: ${error instanceof Error ? error.message : String(error)}`,
      );

      try {
        await settleFailedMessage(channel, message, error);
      } catch (settleError) {
        // The channel closed during the pause (shutdown): the message stays
        // unacked and the broker redelivers it.
        this.logger.warn(
          `Could not settle terminal event ${event.eventId}: ${settleError instanceof Error ? settleError.message : String(settleError)}`,
        );
      }
    }
  }
}
