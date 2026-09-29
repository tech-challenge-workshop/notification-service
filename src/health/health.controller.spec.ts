import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthController } from './health.controller';
import { RabbitMqHealthIndicator } from './rabbitmq-health.indicator';
import { DatabaseHealthIndicator } from './database.health-indicator';

// OBS-54: readiness maps dependency state to the HTTP status, not a body
// flag, so a scraper or `--wait` sees it. OBS-55: liveness never consults a
// dependency. Asserted over HTTP, because the status code is the contract.
describe('HealthController', () => {
  let app: INestApplication<App>;
  let rabbitMq: { isReady: jest.Mock };
  let database: { isHealthy: jest.Mock };

  const start = async (
    databaseIndicator: Partial<DatabaseHealthIndicator>,
  ): Promise<void> => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: RabbitMqHealthIndicator, useValue: rabbitMq },
        { provide: DatabaseHealthIndicator, useValue: databaseIndicator },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  };

  beforeEach(() => {
    rabbitMq = { isReady: jest.fn() };
    database = { isHealthy: jest.fn() };
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers 200 when RabbitMQ is connected and no database is configured (in-memory run)', async () => {
    rabbitMq.isReady.mockReturnValue(true);
    await start(new DatabaseHealthIndicator(undefined));

    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      rabbitmq: 'up',
      database: 'up',
    });
  });

  it('answers 503 when RabbitMQ is unavailable', async () => {
    rabbitMq.isReady.mockReturnValue(false);
    database.isHealthy.mockResolvedValue(true);
    await start(database);

    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'error',
      rabbitmq: 'down',
      database: 'up',
    });
  });

  it('answers 503 when the database is unreachable, even with the broker up', async () => {
    rabbitMq.isReady.mockReturnValue(true);
    database.isHealthy.mockResolvedValue(false);
    await start(database);

    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'error',
      rabbitmq: 'up',
      database: 'down',
    });
  });

  it('answers 503 naming both when both dependencies are down', async () => {
    rabbitMq.isReady.mockReturnValue(false);
    database.isHealthy.mockResolvedValue(false);
    await start(database);

    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'error',
      rabbitmq: 'down',
      database: 'down',
    });
  });

  it('keeps liveness at 200 while both dependencies are down, consulting neither', async () => {
    rabbitMq.isReady.mockReturnValue(false);
    database.isHealthy.mockResolvedValue(false);
    await start(database);

    const response = await request(app.getHttpServer()).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(rabbitMq.isReady).not.toHaveBeenCalled();
    expect(database.isHealthy).not.toHaveBeenCalled();
  });
});
