import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { RabbitMqHealthIndicator } from './rabbitmq-health.indicator';
import { DatabaseHealthIndicator } from './database.health-indicator';

describe('HealthController', () => {
  let controller: HealthController;
  let indicator: { isReady: jest.Mock };

  beforeEach(async () => {
    indicator = { isReady: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: RabbitMqHealthIndicator,
          useValue: indicator,
        },
        {
          // No database configured in this suite, which the indicator reports
          // as healthy: the service is deliberately running in memory.
          provide: DatabaseHealthIndicator,
          useValue: new DatabaseHealthIndicator(undefined),
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return ready=true when RabbitMQ is connected', async () => {
    indicator.isReady.mockReturnValue(true);

    const result = await controller.health();

    expect(result).toEqual({ status: 'ok', ready: true });
    expect(indicator.isReady).toHaveBeenCalled();
  });

  it('should return ready=false when RabbitMQ is unavailable', async () => {
    indicator.isReady.mockReturnValue(false);

    const result = await controller.health();

    expect(result).toEqual({ status: 'ok', ready: false });
  });

  it('reports not ready when the database is unreachable, even with the broker up', async () => {
    indicator.isReady.mockReturnValue(true);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: RabbitMqHealthIndicator, useValue: indicator },
        {
          provide: DatabaseHealthIndicator,
          useValue: { isHealthy: () => Promise.resolve(false) },
        },
      ],
    }).compile();

    const result = await module
      .get<HealthController>(HealthController)
      .health();

    expect(result).toEqual({ status: 'ok', ready: false });
  });
});
