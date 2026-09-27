import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import amqp from 'amqplib';
import { AppModule } from '../src/app.module';
import { createMicroserviceOptions } from '../src/messaging/rabbitmq.config';

// ROB-04 (V48): a terminal event with `data: null` is dead-lettered on its
// first delivery. No fake channel can prove it: the message used to stay
// unacked forever, because the consumer threw before settling it. Checked
// against a real RabbitMQ loaded with fiap-x-platform's definitions.json, so
// the queue, its `.dlq` and the dead-letter policy are the stack's own.
// Skipped when RABBITMQ_TEST_URL is unset on a developer machine; in CI an
// unset URL fails instead, so the suite can never go green by skipping.
const url = process.env.RABBITMQ_TEST_URL;

if (!url && process.env.CI) {
  describe('Notification against a real RabbitMQ', () => {
    it('requires RABBITMQ_TEST_URL in CI', () => {
      throw new Error('RABBITMQ_TEST_URL must be set in CI');
    });
  });
}

const QUEUE = 'notification.terminal';
const DLQ = 'notification.terminal.dlq';
const DEADLINE_MS = 10000;
// Above the polling deadline, so a message that never reaches the DLQ fails
// on its assertion rather than on Jest's default timeout.
const TEST_TIMEOUT_MS = 30000;

(url ? describe : describe.skip)('Notification against a real RabbitMQ', () => {
  let connection: amqp.ChannelModel;
  let channel: amqp.Channel;
  let app: INestApplication | undefined;

  const ready = async (queue: string): Promise<number> =>
    (await channel.checkQueue(queue)).messageCount;

  /** Reads until the value is `expected` or the deadline passes; returns the last read. */
  const eventually = async (
    read: () => Promise<number>,
    expected: number,
  ): Promise<number> => {
    const deadline = Date.now() + DEADLINE_MS;
    let last = await read();
    while (last !== expected && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      last = await read();
    }
    return last;
  };

  const purge = async (): Promise<void> => {
    await channel.purgeQueue(QUEUE);
    await channel.purgeQueue(DLQ);
  };

  // The service as main.ts composes it, pointed at the test broker.
  const startService = async (): Promise<void> => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    const options = createMicroserviceOptions();
    app.connectMicroservice({
      ...options,
      options: { ...options.options, urls: [url as string] },
    });
    await app.startAllMicroservices();
    await app.init();
  };

  beforeAll(async () => {
    connection = await amqp.connect(url as string);
    channel = await connection.createChannel();
  });

  beforeEach(purge);

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await purge();
  });

  afterAll(async () => {
    await channel.close();
    await connection.close();
  });

  // ROB-04 AC1, the story's independent test
  it(
    'dead-letters a terminal event with data: null on its first delivery',
    async () => {
      await startService();
      const body = JSON.stringify({ pattern: 'terminal.event', data: null });

      channel.sendToQueue(QUEUE, Buffer.from(body));

      expect(await eventually(() => ready(DLQ), 1)).toBe(1);
      // Still 1 once deliveries have had time to settle: one message, not a
      // passing moment, and nothing left behind on the consumer's queue.
      await new Promise((r) => setTimeout(r, 1000));
      expect(await ready(DLQ)).toBe(1);
      expect(await ready(QUEUE)).toBe(0);

      const dead = await channel.get(DLQ, { noAck: true });
      expect(dead).not.toBe(false);
      const { content, properties } = dead as amqp.GetMessage;
      expect(content.toString()).toBe(body);
      // Rejected by the consumer, once - not dropped by the delivery limit
      // after a series of requeues.
      const [death] = (properties.headers ?? {})['x-death'] as Array<{
        queue: string;
        reason: string;
        count: number;
      }>;
      expect(death).toMatchObject({
        queue: QUEUE,
        reason: 'rejected',
        count: 1,
      });
    },
    TEST_TIMEOUT_MS,
  );
});
