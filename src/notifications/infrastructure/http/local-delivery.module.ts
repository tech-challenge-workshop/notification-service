import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../notifications.module';
import { LocalDeliveryController } from './local-delivery.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [LocalDeliveryController],
})
export class LocalDeliveryModule {}
