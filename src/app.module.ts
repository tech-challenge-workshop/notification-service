import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { LocalDeliveryModule } from './notifications/infrastructure/http/local-delivery.module';
import { NotificationsModule } from './notifications/notifications.module';

const localModules =
  process.env.LOCAL_INTEGRATION === 'true' ? [LocalDeliveryModule] : [];

@Module({
  imports: [NotificationsModule, HealthModule, ...localModules],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
