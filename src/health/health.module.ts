import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RabbitMqHealthIndicator } from './rabbitmq-health.indicator';
import { DatabaseHealthIndicator } from './database.health-indicator';

@Module({
  controllers: [HealthController],
  providers: [RabbitMqHealthIndicator, DatabaseHealthIndicator],
})
export class HealthModule {}
