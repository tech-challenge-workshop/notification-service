import { Module } from '@nestjs/common';
import { NotificationDeliveryService } from './application/notification-delivery.service';
import { DELIVERY_REPOSITORY } from './domain/delivery-repository.token';
import { TerminalEventConsumer } from './infrastructure/messaging/terminal-event.consumer';
import { InMemoryDeliveryRepository } from './infrastructure/persistence/in-memory-delivery.repository';

@Module({
  controllers: [TerminalEventConsumer],
  providers: [
    NotificationDeliveryService,
    {
      provide: DELIVERY_REPOSITORY,
      useClass: InMemoryDeliveryRepository,
    },
  ],
  exports: [DELIVERY_REPOSITORY],
})
export class NotificationsModule {}
