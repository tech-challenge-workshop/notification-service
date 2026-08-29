process.env.LOCAL_INTEGRATION = 'true';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DeliveryRecord } from '../src/notifications/domain/delivery-record';
import { DeliveryRepository } from '../src/notifications/domain/delivery.repository';
import { DELIVERY_REPOSITORY } from '../src/notifications/domain/delivery-repository.token';

describe('LocalDeliveryController enabled (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.LOCAL_INTEGRATION;
  });

  it('returns the delivery record for an existing processing request id', async () => {
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
      .expect((res: { body: DeliveryRecord }) => {
        expect(res.body.eventId).toBe('evt-1');
        expect(res.body.processingRequestId).toBe('req-1');
        expect(res.body.status).toBe('COMPLETED');
      });
  });

  it('returns 404 when the processing request id does not exist', () => {
    return request(app.getHttpServer())
      .get('/local/deliveries/missing')
      .expect(404)
      .expect((res: { body: { statusCode: number; message: string } }) => {
        expect(res.body.statusCode).toBe(404);
        expect(res.body.message).toBe('Not Found');
      });
  });
});
