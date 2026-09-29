import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';
import pinoHttp from 'pino-http';
import { CorrelationContext } from './correlation-context';
import {
  ACCESS_LOG_EXCLUDED_PATHS,
  buildRootLoggerConfig,
} from './logger.config';

function createCapturingLogger(context: CorrelationContext) {
  const raw: string[] = [];
  const sink = new Writable({
    write(chunk: unknown, _encoding, callback) {
      raw.push(String(chunk));
      callback();
    },
  });
  const config = buildRootLoggerConfig(context);
  const instance = pinoHttp(config.pinoHttp, sink);
  return {
    instance,
    raw,
    parsed: (): Record<string, unknown>[] =>
      raw.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

async function withServer(
  logger: ReturnType<typeof createCapturingLogger>,
  handler: (server: Server) => Promise<void>,
): Promise<Record<string, unknown>[]> {
  const server = createServer((req, res) =>
    logger.instance(req, res, () => {
      res.end('ok');
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await handler(server);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  return logger.parsed();
}

describe('buildRootLoggerConfig', () => {
  let context: CorrelationContext;
  const originalLogLevel = process.env.LOG_LEVEL;

  beforeEach(() => {
    context = new CorrelationContext();
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }
  });

  it('emits one json line per log with timestamp, level, msg, service and the als correlationId', () => {
    const logger = createCapturingLogger(context);

    context.runWithCorrelation('n-9', () => {
      logger.instance.logger.info('terminal event consumed');
    });

    expect(logger.raw).toHaveLength(1);
    const [line] = logger.parsed();
    expect(typeof line['timestamp']).toBe('number');
    expect(line['level']).toBe(30);
    expect(line['msg']).toBe('terminal event consumed');
    expect(line['service']).toBe('notification-service');
    expect(line['correlationId']).toBe('n-9');
  });

  it('omits the correlationId key when no correlation scope is active', () => {
    const logger = createCapturingLogger(context);

    logger.instance.logger.info('bootstrap');

    const [line] = logger.parsed();
    expect(line['service']).toBe('notification-service');
    expect(line).not.toHaveProperty('correlationId');
  });

  it('redacts the owner email at the root, nested and inside a terminal event envelope', () => {
    const logger = createCapturingLogger(context);

    logger.instance.logger.info({
      ownerEmail: 'root-owner@example.com',
      email: 'root@example.com',
      owner: { email: 'nested@example.com', ownerUserId: 'u-1' },
      event: {
        data: { ownerEmail: 'event-owner@example.com', eventId: 'e-1' },
      },
      visible: 'kept',
    });

    const [line] = logger.parsed();
    expect(line).not.toHaveProperty('ownerEmail');
    expect(line).not.toHaveProperty('email');
    expect(line['owner']).toEqual({ ownerUserId: 'u-1' });
    expect(line['event']).toEqual({ data: { eventId: 'e-1' } });
    expect(line['visible']).toBe('kept');
    const output = logger.raw.join('');
    for (const address of [
      'root-owner@example.com',
      'root@example.com',
      'nested@example.com',
      'event-owner@example.com',
    ]) {
      expect(output).not.toContain(address);
    }
  });

  it('redacts the recipient on the send path, the storage key and the auth headers', () => {
    const logger = createCapturingLogger(context);

    logger.instance.logger.info({
      to: 'root-to@example.com',
      message: { to: 'message-to@example.com', subject: 'Your video' },
      info: {
        envelope: { from: 'noreply@fiapx', to: ['env@example.com'] },
        accepted: ['accepted@example.com'],
        messageId: 'm-1',
      },
      err: { rejected: ['rejected@example.com'], code: 'EENVELOPE' },
      event: { data: { zipStorageKey: 'zips/pr-1.zip', status: 'COMPLETED' } },
      req: {
        headers: {
          authorization: 'Bearer token-123',
          cookie: 'session=cookie-456',
          'user-agent': 'jest',
        },
      },
    });

    const [line] = logger.parsed();
    expect(line).not.toHaveProperty('to');
    expect(line['message']).toEqual({ subject: 'Your video' });
    expect(line['info']).toEqual({ messageId: 'm-1' });
    expect(line['err']).toEqual({ code: 'EENVELOPE' });
    expect(line['event']).toEqual({ data: { status: 'COMPLETED' } });
    expect(line['req']).toEqual({ headers: { 'user-agent': 'jest' } });
    const output = logger.raw.join('');
    for (const secret of [
      'root-to@example.com',
      'message-to@example.com',
      'env@example.com',
      'accepted@example.com',
      'rejected@example.com',
      'zips/pr-1.zip',
      'token-123',
      'cookie-456',
    ]) {
      expect(output).not.toContain(secret);
    }
  });

  it('skips the access log for health, liveness and metrics only', async () => {
    const logger = createCapturingLogger(context);

    const lines = await withServer(logger, async (server) => {
      const { port } = server.address() as AddressInfo;
      for (const path of ['/health', '/health/live', '/metrics', '/']) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          headers: { 'x-probe-path': path },
        });
        expect(response.status).toBe(200);
      }
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]['msg']).toBe('request completed');
    expect(lines[0]['service']).toBe('notification-service');
    const req = lines[0]['req'] as { headers: Record<string, string> };
    expect(req.headers['x-probe-path']).toBe('/');
  });

  // OBS-55 pinned: exactly the three probe endpoints are exempt, however the
  // probe spells the path, and nothing that merely resembles them.
  it('exempts exactly health, liveness and metrics, and still logs look-alike paths', async () => {
    expect(ACCESS_LOG_EXCLUDED_PATHS).toEqual([
      '/health',
      '/health/live',
      '/metrics',
    ]);
    const logger = createCapturingLogger(context);
    const lookAlikes = [
      '/healthz',
      '/health/ready',
      '/metrics/extra',
      '/api/metrics',
      '/local/deliveries/req-1',
    ];

    const lines = await withServer(logger, async (server) => {
      const { port } = server.address() as AddressInfo;
      for (const path of lookAlikes) {
        await fetch(`http://127.0.0.1:${port}${path}`, {
          headers: { 'x-probe-path': path },
        });
      }
    });

    expect(
      lines.map(
        (line) =>
          (line['req'] as { headers: Record<string, string> }).headers[
            'x-probe-path'
          ],
      ),
    ).toEqual(lookAlikes);
  });

  it('skips the access log for the probe endpoints with a query string or a trailing slash', async () => {
    const logger = createCapturingLogger(context);

    const lines = await withServer(logger, async (server) => {
      const { port } = server.address() as AddressInfo;
      for (const path of [
        '/health?probe=1',
        '/health/',
        '/health/live?x=y',
        '/health/live/',
        '/metrics?name[]=fiapx_email_delivery_total',
        '/metrics/',
      ]) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`);
        expect(response.status).toBe(200);
      }
    });

    expect(lines).toEqual([]);
  });

  it('defaults to the info level when LOG_LEVEL is unset', () => {
    const logger = createCapturingLogger(context);

    logger.instance.logger.debug('hidden debug');
    logger.instance.logger.info('shown info');

    expect(logger.parsed().map((line) => line['msg'])).toEqual(['shown info']);
  });

  it('honors LOG_LEVEL from the environment', () => {
    process.env.LOG_LEVEL = 'error';
    const logger = createCapturingLogger(context);

    logger.instance.logger.info('hidden info');
    logger.instance.logger.error('shown error');

    expect(logger.parsed().map((line) => line['msg'])).toEqual(['shown error']);
  });
});
