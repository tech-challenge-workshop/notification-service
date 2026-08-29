import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RabbitMqHealthIndicator } from './rabbitmq-health.indicator';

@Module({
  controllers: [HealthController],
  providers: [RabbitMqHealthIndicator],
})
export class HealthModule {}
