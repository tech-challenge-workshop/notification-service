import { Test } from '@nestjs/testing';
import { DATA_SOURCE } from '../notifications/infrastructure/persistence/data-source';
import { DatabaseHealthIndicator } from './database.health-indicator';
import { HealthModule } from './health.module';
import { RabbitMqHealthIndicator } from './rabbitmq-health.indicator';

// OBS-54: readiness must see the service's own DataSource. Without the
// wiring, the @Optional() injection resolves to undefined and the indicator
// reports a lost database as healthy.
describe('HealthModule', () => {
  it("hands the service's DataSource to the database indicator", async () => {
    const lostDatabase = {
      isInitialized: false,
      query: jest.fn(),
      getRepository: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(DATA_SOURCE)
      .useValue(lostDatabase)
      .overrideProvider(RabbitMqHealthIndicator)
      .useValue({ isReady: () => true })
      .compile();

    const healthy = await moduleRef.get(DatabaseHealthIndicator).isHealthy();

    expect(healthy).toBe(false);
    await moduleRef.close();
  });
});
