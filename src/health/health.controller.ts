import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { RabbitMqHealthIndicator } from './rabbitmq-health.indicator';
import { DatabaseHealthIndicator } from './database.health-indicator';

type DependencyState = 'up' | 'down';

@Controller('health')
export class HealthController {
  constructor(
    private readonly rabbitMqHealth: RabbitMqHealthIndicator,
    private readonly databaseHealth: DatabaseHealthIndicator,
  ) {}

  /**
   * Readiness covers both dependencies: with the database down every terminal
   * event would only ever become a requeue. The state is the HTTP status
   * (OBS-54), so a scraper or a `--wait` probe sees it without reading the
   * body.
   */
  @Get()
  async health(): Promise<{
    status: 'ok';
    rabbitmq: DependencyState;
    database: DependencyState;
  }> {
    const rabbitmq = this.rabbitMqHealth.isReady();
    const database = await this.databaseHealth.isHealthy();

    if (!rabbitmq || !database) {
      throw new ServiceUnavailableException({
        status: 'error',
        rabbitmq: rabbitmq ? 'up' : 'down',
        database: database ? 'up' : 'down',
      });
    }

    return { status: 'ok', rabbitmq: 'up', database: 'up' };
  }

  /**
   * Liveness: 200 while the process serves requests. It never consults a
   * dependency, so an outage makes the service not-ready rather than
   * restarted.
   */
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
