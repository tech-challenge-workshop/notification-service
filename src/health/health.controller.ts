import { Controller, Get } from '@nestjs/common';
import { RabbitMqHealthIndicator } from './rabbitmq-health.indicator';
import { DatabaseHealthIndicator } from './database.health-indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly rabbitMqHealth: RabbitMqHealthIndicator,
    private readonly databaseHealth: DatabaseHealthIndicator,
  ) {}

  @Get()
  async health(): Promise<{ status: string; ready: boolean }> {
    // Readiness covers both dependencies: with the database down every
    // terminal event would only ever become a requeue.
    const ready =
      this.rabbitMqHealth.isReady() && (await this.databaseHealth.isHealthy());

    return { status: 'ok', ready };
  }
}
