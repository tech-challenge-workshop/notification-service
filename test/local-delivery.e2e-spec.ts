import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import { DeliveryRecord } from '../src/notifications/domain/delivery-record';
import { DeliveryRepository } from '../src/notifications/domain/delivery.repository';
import { DELIVERY_REPOSITORY } from '../src/notifications/domain/delivery-repository.token';

describe('LocalDeliveryController (e2e)', () => {
  let app: INestApplication<App>;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    delete process.env.LOCAL_INTEGRATION;
    jest.resetModules();
  });

  it('exposes GET /local/deliveries/:processingRequestId when LOCAL_INTEGRATION=true', async () => {
    process.env.LOCAL_INTEGRATION = 'true';
    jest.resetModules();
    const { AppModule } = require('../src/app.module');
    const { Test } = require('@nestjs/testing');
    const request = require('supertest');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const repository = app.get<DeliveryRepository>(DELIVERY_REPOSITORY);
    const record = new DeliveryRecord();
    record.eventId = 'evt-1';
    record.processingRequestId = 'req-1';
    record.ownerUserId = 'user-1';
    record.status = 'COMPLETED';
    record.recordedAt = new Date('2026-08-27T00:00:00Z');
    await repository.save(record);

    return request(app.getHttpServer())
      .get('/local/deliveries/req-1')
      .expect(200)
      .expect((res) => {
        expect(res.body.eventId).toBe('evt-1');
        expect(res.body.processingRequestId).toBe('req-1');
        expect(res.body.status).toBe('COMPLETED');
      });
  });

  it('returns 404 from the local route when the processing request id does not exist', async () => {
    process.env.LOCAL_INTEGRATION = 'true';
    jest.resetModules();
    const { AppModule } = require('../src/app.module');
    const { Test } = require('@nestjs/testing');
    const request = require('supertest');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    return request(app.getHttpServer())
      .get('/local/deliveries/missing')
      .expect(404)
      .expect((res) => {
        expect(res.body.statusCode).toBe(404);
        expect(res.body.message).toBe('Not Found');
      });
  });

  it('does not expose the local route when LOCAL_INTEGRATION is unset', async () => {
    jest.resetModules();
    const { AppModule } = require('../src/app.module');
    const { Test } = require('@nestjs/testing');
    const request = require('supertest');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer()).get(
      '/local/deliveries/req-1',
    );

    expect(response.status).toBe(404);
    expect(response.body.message).toMatch(/^Cannot GET \//);
  });
});
