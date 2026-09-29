import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import amqp from 'amqplib';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { createMicroserviceOptions } from '../src/messaging/rabbitmq.config';
import type { DeliveryRepository } from '../src/notifications/domain/delivery.repository';
import { DELIVERY_REPOSITORY } from '../src/notifications/domain/delivery-repository.token';
import type { EmailMessage } from '../src/notifications/domain/email-sender';
import { EMAIL_SENDER } from '../src/notifications/domain/email-sender.token';
import { TerminalEventDto } from '../src/notifications/dtos/terminal-event.dto';
import { InMemoryEmailSender } from '../src/notifications/infrastructure/email/in-memory-email-sender';
import { SmtpEmailSender } from '../src/notifications/infrastructure/email/smtp-email-sender';
import { DATA_SOURCE } from '../src/notifications/infrastructure/persistence/data-source';
import { notificationMetrics } from '../src/observability/metrics';

// S8 observability slice (OBS-46..55) on a real RabbitMQ and PostgreSQL,
// the service composed by configureApp, as main.ts composes it. Skipped when
// either is unset on a developer machine; in CI an unset one fails instead,
// so the suite can never go green by skipping.
const url = process.env.RABBITMQ_TEST_URL;
const hasDatabase = Boolean(process.env.DATABASE_HOST);

if ((!url || !hasDatabase) && process.env.CI) {
  describe('Notification observability', () => {
    it('requires RABBITMQ_TEST_URL and DATABASE_HOST in CI', () => {
      throw new Error('RABBITMQ_TEST_URL and DATABASE_HOST must be set in CI');
    });
  });
}

const QUEUE = 'notification.terminal';
const DLQ = 'notification.terminal.dlq';
const DEADLINE_MS = 10000;
const TEST_TIMEOUT_MS = 30000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Pino writes through process.stdout only when the stream looks "tampered"
// (pino's hasBeenTampered check); otherwise it takes a raw fd destination no
// test can intercept. Mark it tampered at import time, before any app boots.
type Write = (chunk: unknown, ...args: unknown[]) => boolean;
const stdoutStream = process.stdout as unknown as { write: Write };
const stdoutPrototype = Object.getPrototypeOf(stdoutStream) as {
  write: Write;
};
if (stdoutStream.write === stdoutPrototype.write) {
  const passthrough = stdoutStream.write.bind(process.stdout);
  stdoutStream.write = (chunk: unknown, ...args: unknown[]) =>
    passthrough(chunk, ...args);
}

type LogLine = Record<string, unknown>;

/**
 * Keeps every chunk written to stdout while `fn` runs, then polls up to the
 * deadline for `until`, so pino's asynchronous flush cannot race the
 * assertion.
 */
async function capturingLogs(
  fn: () => Promise<unknown>,
  until: (lines: string) => boolean,
): Promise<{ lines: LogLine[]; raw: string }> {
  const chunks: string[] = [];
  const original = stdoutStream.write;
  stdoutStream.write = (chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  };
  try {
    await fn();
    const deadline = Date.now() + DEADLINE_MS;
    while (Date.now() < deadline && !until(chunks.join(''))) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  } finally {
    stdoutStream.write = original;
  }
  const raw = chunks.join('');
  const lines = raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LogLine);
  return { lines, raw };
}

/**
 * Delivers to memory, except for recipients marked unreachable: those go
 * through the real SMTP sender to a port nothing listens on, so the failure
 * is a genuine nodemailer ECONNREFUSED.
 */
class RoutingEmailSender {
  readonly delivered = new InMemoryEmailSender();
  readonly unreachable = new Set<string>();
  private readonly smtpDown = new SmtpEmailSender({
    host: '127.0.0.1',
    port: 1,
    from: 'fiapx@local',
  });

  send(message: EmailMessage): Promise<void> {
    return this.unreachable.has(message.to)
      ? this.smtpDown.send(message)
      : this.delivered.send(message);
  }
}

(url && hasDatabase ? describe : describe.skip)(
  'Notification observability (e2e, RabbitMQ + PostgreSQL)',
  () => {
    let connection: amqp.ChannelModel;
    let channel: amqp.Channel;
    let app: INestApplication<App> | undefined;
    let sender: RoutingEmailSender;
    const savedLogLevel = process.env.LOG_LEVEL;
    const savedRabbitUrl = process.env.RABBITMQ_URL;

    const http = () => request((app as INestApplication<App>).getHttpServer());

    const startService = async (
      options: { consume?: boolean } = {},
    ): Promise<void> => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(EMAIL_SENDER)
        .useValue(sender)
        .compile();
      app = moduleRef.createNestApplication({ bufferLogs: true });
      const microservice = createMicroserviceOptions();
      configureApp(
        app,
        options.consume === false
          ? null
          : {
              ...microservice,
              options: { ...microservice.options, urls: [url as string] },
            },
      );
      if (options.consume !== false) {
        await app.startAllMicroservices();
      }
      await app.init();
    };

    const repository = (): DeliveryRepository =>
      (app as INestApplication).get<DeliveryRepository>(DELIVERY_REPOSITORY);

    const buildEvent = (
      overrides: Partial<TerminalEventDto> = {},
    ): TerminalEventDto => {
      const id = randomUUID();
      return {
        eventId: `evt-obs-${id}`,
        processingRequestId: `req-obs-${id}`,
        ownerUserId: 'user-obs',
        ownerEmail: `owner-${id}@example.com`,
        status: 'COMPLETED',
        zipStorageKey: `zips/obs-${id}.zip`,
        occurredAt: '2026-09-28T00:00:00Z',
        ...overrides,
      };
    };

    const failedEvent = (
      overrides: Partial<TerminalEventDto> = {},
    ): TerminalEventDto =>
      buildEvent({
        status: 'FAILED',
        zipStorageKey: undefined,
        failureReason: 'O video excede a duracao maxima de 10 minutos.',
        ...overrides,
      });

    const publish = (data: unknown): void => {
      channel.sendToQueue(
        QUEUE,
        Buffer.from(JSON.stringify({ pattern: 'terminal.event', data })),
        { contentType: 'application/json' },
      );
    };

    /** Waits until the event's send attempt has a recorded outcome. */
    const attempted = async (eventId: string) => {
      const deadline = Date.now() + DEADLINE_MS;
      for (;;) {
        const record = await repository().findByEventId(eventId);
        if ((record?.emailSentAt || record?.emailError) ?? false) {
          return record;
        }
        if (Date.now() > deadline) {
          throw new Error(`No send attempt recorded for ${eventId}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };

    /** Enough for a redelivery to be consumed and settled on a local broker. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 1500));

    const queueDepth = async (queue: string) =>
      (await channel.checkQueue(queue)).messageCount;

    const purge = async (): Promise<void> => {
      await channel.purgeQueue(QUEUE);
      await channel.purgeQueue(DLQ);
    };

    const sample = (text: string, series: string): number =>
      Number(
        new RegExp(
          `^${series.replace(/[{}"]/g, (c) => `\\${c}`)} (\\S+)$`,
          'm',
        ).exec(text)?.[1] ?? 0,
      );

    beforeAll(async () => {
      // Read when each app is created: log for real so lines can be asserted.
      process.env.LOG_LEVEL = 'info';
      connection = await amqp.connect(url as string);
      channel = await connection.createChannel();
    });

    beforeEach(async () => {
      notificationMetrics.resetMetrics();
      sender = new RoutingEmailSender();
      await purge();
    });

    afterEach(async () => {
      await app?.close();
      app = undefined;
      if (savedRabbitUrl === undefined) {
        delete process.env.RABBITMQ_URL;
      } else {
        process.env.RABBITMQ_URL = savedRabbitUrl;
      }
      await purge();
    });

    afterAll(async () => {
      await channel.close();
      await connection.close();
      if (savedLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = savedLogLevel;
      }
    });

    // OBS-50..52, the P2 independent test.
    it(
      'counts one sent and one failed delivery exactly once, redeliveries included',
      async () => {
        await startService();
        const completed = buildEvent();
        const failed = failedEvent();
        sender.unreachable.add(failed.ownerEmail);

        publish(completed);
        publish(failed);
        await attempted(completed.eventId);
        await attempted(failed.eventId);
        publish(completed);
        publish(failed);
        await settle();

        const response = await http().get('/metrics');
        expect(response.status).toBe(200);
        expect(
          sample(response.text, 'fiapx_email_delivery_total{outcome="sent"}'),
        ).toBe(1);
        expect(
          sample(response.text, 'fiapx_email_delivery_total{outcome="failed"}'),
        ).toBe(1);
        expect(
          sample(response.text, 'fiapx_email_send_duration_seconds_count'),
        ).toBe(2);
        expect(sender.delivered.sent).toHaveLength(1);
        expect(await queueDepth(QUEUE)).toBe(0);
        expect(await queueDepth(DLQ)).toBe(0);
      },
      TEST_TIMEOUT_MS,
    );

    // OBS-53 and the SMTP edge case: the failure is recorded as today and
    // the message is acked, neither requeued nor dead-lettered.
    it(
      'records a real SMTP failure in the delivery record and acks the message',
      async () => {
        await startService();
        const event = buildEvent();
        sender.unreachable.add(event.ownerEmail);

        publish(event);
        const record = await attempted(event.eventId);
        await settle();

        // Recorded as today (EN-20): the transport's short code, never the
        // raw message with the SMTP host and port.
        expect(record?.emailError).toMatch(/^E[A-Z]+$/);
        expect(record?.emailError).not.toContain('127.0.0.1');
        expect(record?.emailSentAt ?? undefined).toBeUndefined();
        expect(sender.delivered.sent).toHaveLength(0);
        const { text } = await http().get('/metrics');
        expect(
          sample(text, 'fiapx_email_delivery_total{outcome="failed"}'),
        ).toBe(1);
        expect(sample(text, 'fiapx_email_delivery_total{outcome="sent"}')).toBe(
          0,
        );
        expect(await queueDepth(QUEUE)).toBe(0);
        expect(await queueDepth(DLQ)).toBe(0);
      },
      TEST_TIMEOUT_MS,
    );

    // OBS-46, OBS-48: the handling of an event logs under its own id.
    it(
      'carries the event correlationId n-9 on every log line of its handling',
      async () => {
        await startService();
        const event = buildEvent({ correlationId: 'n-9' });
        sender.unreachable.add(event.ownerEmail);

        const { lines } = await capturingLogs(
          async () => {
            publish(event);
            await attempted(event.eventId);
          },
          (text) => text.includes(event.eventId),
        );

        const handling = lines.filter((line) =>
          String(line['msg']).includes(event.eventId),
        );
        expect(handling.length).toBeGreaterThanOrEqual(1);
        for (const line of handling) {
          expect(line['correlationId']).toBe('n-9');
          expect(line['service']).toBe('notification-service');
          expect(typeof line['timestamp']).toBe('number');
          expect(typeof line['level']).toBe('number');
        }
        const scoped = lines.filter((line) => 'correlationId' in line);
        expect(scoped.map((line) => line['correlationId'])).toEqual(
          scoped.map(() => 'n-9'),
        );
      },
      TEST_TIMEOUT_MS,
    );

    // OBS-47: a missing id is replaced and never costs the message.
    it(
      'handles an event without a correlationId under a generated id and acks it',
      async () => {
        await startService();
        const event = buildEvent();
        sender.unreachable.add(event.ownerEmail);

        const { lines } = await capturingLogs(
          async () => {
            publish(event);
            await attempted(event.eventId);
          },
          (text) => text.includes(event.eventId),
        );
        await settle();

        const handling = lines.filter((line) =>
          String(line['msg']).includes(event.eventId),
        );
        expect(handling.length).toBeGreaterThanOrEqual(1);
        for (const line of handling) {
          expect(line['correlationId']).toMatch(UUID);
        }
        expect(await queueDepth(QUEUE)).toBe(0);
        expect(await queueDepth(DLQ)).toBe(0);
      },
      TEST_TIMEOUT_MS,
    );

    // OBS-47 edge case (L-010): a numeric id is replaced, never coerced.
    it(
      'replaces a numeric correlationId with a generated id and still acks the event',
      async () => {
        await startService();
        const event = {
          ...buildEvent(),
          correlationId: 42 as unknown as string,
        };
        sender.unreachable.add(event.ownerEmail);

        const { lines } = await capturingLogs(
          async () => {
            publish(event);
            await attempted(event.eventId);
          },
          (text) => text.includes(event.eventId),
        );
        await settle();

        const handling = lines.filter((line) =>
          String(line['msg']).includes(event.eventId),
        );
        expect(handling.length).toBeGreaterThanOrEqual(1);
        for (const line of handling) {
          expect(line['correlationId']).toMatch(UUID);
          expect(line['correlationId']).not.toBe('42');
        }
        expect(await queueDepth(QUEUE)).toBe(0);
        expect(await queueDepth(DLQ)).toBe(0);
      },
      TEST_TIMEOUT_MS,
    );

    // OBS-49 / AD-015: at the most verbose level, neither path logs the
    // recipient.
    it(
      'never logs the recipient address, on the success or the failure path',
      async () => {
        process.env.LOG_LEVEL = 'trace';
        try {
          await startService();
        } finally {
          process.env.LOG_LEVEL = 'info';
        }
        const sent = buildEvent();
        const failed = failedEvent();
        sender.unreachable.add(failed.ownerEmail);

        const { lines, raw } = await capturingLogs(
          async () => {
            publish(sent);
            publish(failed);
            await attempted(sent.eventId);
            await attempted(failed.eventId);
          },
          (text) => text.includes(failed.eventId),
        );

        expect(sender.delivered.sent.map((m) => m.to)).toEqual([
          sent.ownerEmail,
        ]);
        expect(lines.length).toBeGreaterThanOrEqual(1);
        expect(raw).not.toContain(sent.ownerEmail);
        expect(raw).not.toContain(failed.ownerEmail);
        expect(raw).not.toContain('@example.com');
      },
      TEST_TIMEOUT_MS,
    );

    // OBS-54, OBS-55: a broker the service cannot reach.
    it(
      'answers /health 503 while RabbitMQ is unreachable, with /health/live and /metrics at 200',
      async () => {
        // Read by the health indicator when the app is built; nothing
        // listens on this port.
        process.env.RABBITMQ_URL = 'amqp://127.0.0.1:1';
        await startService({ consume: false });

        const health = await http().get('/health');
        const live = await http().get('/health/live');
        const metrics = await http().get('/metrics');

        expect(health.status).toBe(503);
        expect(health.body).toEqual({
          status: 'error',
          rabbitmq: 'down',
          database: 'up',
        });
        expect(live.status).toBe(200);
        expect(live.body).toEqual({ status: 'ok' });
        expect(metrics.status).toBe(200);
        expect(metrics.headers['content-type']).toBe(
          'text/plain; version=0.0.4',
        );
        expect(metrics.text).toContain(
          'fiapx_email_delivery_total{outcome="sent"} 0',
        );
      },
      TEST_TIMEOUT_MS,
    );

    // OBS-54 and the database edge case: lost at runtime.
    it(
      'answers /health 503 once the database is lost at runtime, with /health/live and /metrics at 200',
      async () => {
        await startService();
        const ready = async () => {
          const deadline = Date.now() + DEADLINE_MS;
          let response = await http().get('/health');
          while (response.status !== 200 && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            response = await http().get('/health');
          }
          return response;
        };
        const initial = await ready();
        expect(initial.body).toEqual({
          status: 'ok',
          rabbitmq: 'up',
          database: 'up',
        });
        expect(initial.status).toBe(200);

        await (app as INestApplication).get<DataSource>(DATA_SOURCE).destroy();

        const health = await http().get('/health');
        const live = await http().get('/health/live');
        const metrics = await http().get('/metrics');
        expect(health.status).toBe(503);
        expect(health.body).toEqual({
          status: 'error',
          rabbitmq: 'up',
          database: 'down',
        });
        expect(live.status).toBe(200);
        expect(metrics.status).toBe(200);
        expect(metrics.text).toContain('# TYPE fiapx_email_delivery_total');
      },
      TEST_TIMEOUT_MS,
    );

    // OBS-55: probes need no credentials and leave no access-log line.
    it(
      'serves the probes without credentials and keeps them out of the access log',
      async () => {
        await startService({ consume: false });
        const marker = randomUUID();

        const { lines } = await capturingLogs(
          async () => {
            for (const path of ['/health', '/health/live', '/metrics']) {
              const response = await http()
                .get(path)
                .set('x-probe-marker', marker);
              expect([200, 503]).toContain(response.status);
              expect(response.status).not.toBe(401);
              expect(response.status).not.toBe(403);
            }
            await http().get('/').set('x-probe-marker', marker);
          },
          (text) => text.includes('request completed'),
        );

        const accessLines = lines.filter(
          (line) =>
            (line['req'] as { headers?: Record<string, string> } | undefined)
              ?.headers?.['x-probe-marker'] === marker,
        );
        expect(
          accessLines.map((line) => (line['req'] as { url: string }).url),
        ).toEqual(['/']);
      },
      TEST_TIMEOUT_MS,
    );
  },
);
