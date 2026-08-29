import { Controller, Get } from '@nestjs/common';
import { RabbitMqHealthIndicator } from './rabbitmq-health.indicator';

@Controller('health')
export class HealthController {
  constructor(private readonly rabbitMqHealth: RabbitMqHealthIndicator) {}

  @Get()
  health(): { status: string; ready: boolean } {
    return {
      status: 'ok',
      ready: this.rabbitMqHealth.isReady(),
    };
  }
}
