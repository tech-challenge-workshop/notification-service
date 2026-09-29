import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { NotificationDeliveryService } from '../notifications/application/notification-delivery.service';
import { InMemoryEmailSender } from '../notifications/infrastructure/email/in-memory-email-sender';
import { InMemoryDeliveryRepository } from '../notifications/infrastructure/persistence/in-memory-delivery.repository';
import { MetricsController } from './metrics.controller';
import { notificationMetrics } from './metrics';

describe('MetricsController (OBS-50, OBS-55)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    notificationMetrics.resetMetrics();
    const moduleRef = await Test.createTestingModule({
      controllers: [MetricsController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves the exposition without credentials, with the exact Prometheus content type', async () => {
    const response = await request(app.getHttpServer()).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/plain; version=0.0.4');
  });

  it('exposes both email families with each outcome after a sent and a failed delivery', async () => {
    const emailSender = new InMemoryEmailSender();
    const service = new NotificationDeliveryService(
      new InMemoryDeliveryRepository(),
      emailSender,
    );
    await service.recordDelivery({
      eventId: 'evt-sent',
      processingRequestId: 'req-sent',
      ownerUserId: 'user-1',
      ownerEmail: 'owner@example.com',
      status: 'COMPLETED',
      zipStorageKey: 'zips/a.zip',
      occurredAt: '2026-09-28T00:00:00Z',
    });
    emailSender.send = () => Promise.reject(new Error('down'));
    await service.recordDelivery({
      eventId: 'evt-failed',
      processingRequestId: 'req-failed',
      ownerUserId: 'user-1',
      ownerEmail: 'owner@example.com',
      status: 'FAILED',
      failureReason: 'O video excede a duracao maxima.',
      occurredAt: '2026-09-28T00:00:00Z',
    });

    const { text } = await request(app.getHttpServer()).get('/metrics');

    expect(text).toContain('# TYPE fiapx_email_delivery_total counter');
    expect(text).toContain('fiapx_email_delivery_total{outcome="sent"} 1');
    expect(text).toContain('fiapx_email_delivery_total{outcome="failed"} 1');
    expect(text).toContain(
      '# TYPE fiapx_email_send_duration_seconds histogram',
    );
    expect(text).toContain('fiapx_email_send_duration_seconds_count 2');
  });

  it('carries only the bounded outcome label: no recipient, event or request id', async () => {
    const service = new NotificationDeliveryService(
      new InMemoryDeliveryRepository(),
      new InMemoryEmailSender(),
    );
    await service.recordDelivery({
      eventId: 'evt-label',
      processingRequestId: 'req-label',
      ownerUserId: 'user-label',
      ownerEmail: 'owner-label@example.com',
      status: 'COMPLETED',
      zipStorageKey: 'zips/label.zip',
      occurredAt: '2026-09-28T00:00:00Z',
    });

    const { text } = await request(app.getHttpServer()).get('/metrics');

    expect(text).not.toContain('owner-label@example.com');
    expect(text).not.toContain('@');
    expect(text).not.toContain('evt-label');
    expect(text).not.toContain('req-label');
    expect(text).not.toContain('user-label');
    const labelNames = [...text.matchAll(/^fiapx_email_\w+\{([^}]*)\}/gm)]
      .flatMap(([, labels]) => labels.split(','))
      .map((pair) => pair.split('=')[0]);
    expect(new Set(labelNames)).toEqual(new Set(['outcome', 'le']));
  });
});
