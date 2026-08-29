process.env.LOCAL_INTEGRATION = 'true';

jest.setTimeout(15000);

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import amqp from 'amqplib';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { createMicroserviceOptions } from '../src/messaging/rabbitmq.config';
import { TerminalEventDto } from '../src/notifications/dtos/terminal-event.dto';

const RABBITMQ_URL = 'amqp://localhost:5672';
const EXCHANGE = 'fiapx.terminal';
const QUEUE = 'notification.terminal';
const ROUTING_KEY = 'terminal.event';

async function waitForDelivery(
  httpRequest: request.Agent,
  processingRequestId: string,
): Promise<request.Response> {
  const startedAt = Date.now();
  const timeout = 5000;

  while (Date.now() - startedAt < timeout) {
    const response = await httpRequest.get(
      `/local/deliveries/${processingRequestId}`,
    );
    if (response.status === 200) {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Timed out waiting for delivery with processingRequestId ${processingRequestId}`,
  );
}

describe('Local integration (e2e)', () => {
  let app: INestApplication<App>;
  let httpRequest: request.Agent;
  let amqpConnection: amqp.ChannelModel;
  let amqpChannel: amqp.Channel;

  beforeAll(async () => {
    amqpConnection = await amqp.connect(RABBITMQ_URL);
    amqpChannel = await amqpConnection.createChannel();
    await amqpChannel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await amqpChannel.assertQueue(QUEUE, { durable: true });
    await amqpChannel.bindQueue(QUEUE, EXCHANGE, ROUTING_KEY);
  });

  beforeEach(async () => {
    process.env.LOCAL_INTEGRATION = 'true';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.connectMicroservice(createMicroserviceOptions());
    await app.startAllMicroservices();
    await app.init();
    httpRequest = request(app.getHttpServer());
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await amqpChannel.close();
    await amqpConnection.close();
  });

  function buildEvent(): TerminalEventDto {
    return {
      eventId: 'evt-integration-1',
      processingRequestId: 'req-integration-1',
      ownerUserId: 'user-integration-1',
      status: 'COMPLETED',
      zipStorageKey: 'zip-integration-1',
      occurredAt: '2026-08-27T00:00:00Z',
    };
  }

  function publishTerminalEvent(event: TerminalEventDto): void {
    const payload = { pattern: ROUTING_KEY, data: event };
    amqpChannel.publish(
      EXCHANGE,
      ROUTING_KEY,
      Buffer.from(JSON.stringify(payload)),
      { contentType: 'application/json' },
    );
  }

  it('records a COMPLETED delivery from RabbitMQ and exposes it on the local route', async () => {
    const event = buildEvent();

    publishTerminalEvent(event);

    const response = await waitForDelivery(
      httpRequest,
      event.processingRequestId,
    );

    const body = response.body as TerminalEventDto;

    expect(response.status).toBe(200);
    expect(body.eventId).toBe(event.eventId);
    expect(body.processingRequestId).toBe(event.processingRequestId);
    expect(body.ownerUserId).toBe(event.ownerUserId);
    expect(body.status).toBe('COMPLETED');
  });

  it('keeps exactly one delivery record when the same event is published twice', async () => {
    const event = buildEvent();

    publishTerminalEvent(event);
    await waitForDelivery(httpRequest, event.processingRequestId);

    publishTerminalEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const response = await httpRequest.get(
      `/local/deliveries/${event.processingRequestId}`,
    );

    const body = response.body as TerminalEventDto;

    expect(response.status).toBe(200);
    expect(body.eventId).toBe(event.eventId);
    expect(body.status).toBe('COMPLETED');
  });
});
