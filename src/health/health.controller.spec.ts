import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { RabbitMqHealthIndicator } from './rabbitmq-health.indicator';

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
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return ready=true when RabbitMQ is connected', () => {
    indicator.isReady.mockReturnValue(true);

    const result = controller.health();

    expect(result).toEqual({ status: 'ok', ready: true });
    expect(indicator.isReady).toHaveBeenCalled();
  });

  it('should return ready=false when RabbitMQ is unavailable', () => {
    indicator.isReady.mockReturnValue(false);

    const result = controller.health();

    expect(result).toEqual({ status: 'ok', ready: false });
  });
});
