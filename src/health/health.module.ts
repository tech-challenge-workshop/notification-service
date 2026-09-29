import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { HealthController } from './health.controller';
import { RabbitMqHealthIndicator } from './rabbitmq-health.indicator';
import { DatabaseHealthIndicator } from './database.health-indicator';

@Module({
  // NotificationsModule exports DATA_SOURCE: without this import the
  // indicator's @Optional() injection resolves to undefined and readiness
  // never sees the database (OBS-54).
  imports: [NotificationsModule],
  controllers: [HealthController],
  providers: [RabbitMqHealthIndicator, DatabaseHealthIndicator],
})
export class HealthModule {}
