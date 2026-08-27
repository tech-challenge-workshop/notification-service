import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, RmqContext } from '@nestjs/microservices';
import { NotificationDeliveryService } from '../../application/notification-delivery.service';
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
    event: TerminalEventDto,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const channel = context.getChannelRef() as RabbitChannel;
    const message = context.getMessage();

    try {
      await this.notificationDeliveryService.recordDelivery(event);
      channel.ack(message);
    } catch (error) {
      this.logger.error(
        `Failed to process terminal event ${event.eventId}: ${error instanceof Error ? error.message : String(error)}`,
      );

      const isInvalidStatus =
        error instanceof Error &&
        error.message.startsWith('Invalid terminal status');

      if (isInvalidStatus) {
        channel.nack(message, false, false);
      } else {
        channel.nack(message, false, true);
      }
    }
  }
}
