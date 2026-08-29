import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { NotificationDeliveryService } from '../../application/notification-delivery.service';
import { DeliveryPersistenceError } from '../../domain/errors/delivery-persistence.error';
import { InvalidTerminalEventError } from '../../domain/errors/invalid-terminal-event.error';
import { TerminalEventDto } from '../../dtos/terminal-event.dto';

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
    const message = context.getMessage();

    try {
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

      if (error instanceof InvalidTerminalEventError) {
        channel.nack(message, false, false);
      } else if (error instanceof DeliveryPersistenceError) {
        channel.nack(message, false, true);
      } else {
        channel.nack(message, false, true);
      }
    }
  }
}
