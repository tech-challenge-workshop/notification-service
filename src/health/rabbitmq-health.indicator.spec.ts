import { EventEmitter } from 'events';
import { Test, TestingModule } from '@nestjs/testing';
import * as amqpConnectionManager from 'amqp-connection-manager';
import { RabbitMqHealthIndicator } from './rabbitmq-health.indicator';

jest.mock('amqp-connection-manager', () => {
  return {
    connect: jest.fn(),
  };
});

const mockedAmqp = amqpConnectionManager as unknown as {
  connect: jest.Mock;
};

describe('RabbitMqHealthIndicator', () => {
  let indicator: RabbitMqHealthIndicator;
  type MockConnection = EventEmitter & {
    close: jest.Mock;
    isConnected: jest.Mock;
  };
  let mockConnection: MockConnection;

  function createMockConnection(): MockConnection {
    return Object.assign(new EventEmitter(), {
      close: jest.fn(),
      isConnected: jest.fn(() => false),
    });
  }

  beforeEach(async () => {
    mockConnection = createMockConnection();
    mockedAmqp.connect.mockReturnValue(mockConnection);

    const module: TestingModule = await Test.createTestingModule({
      providers: [RabbitMqHealthIndicator],
    }).compile();

    indicator = module.get<RabbitMqHealthIndicator>(RabbitMqHealthIndicator);
    indicator.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should report not ready before connecting', () => {
    expect(indicator.isReady()).toBe(false);
  });

  it('should report ready after RabbitMQ connects', () => {
    mockConnection.emit('connect');

    expect(indicator.isReady()).toBe(true);
  });

  it('should report not ready after RabbitMQ disconnects', () => {
    mockConnection.emit('connect');
    mockConnection.emit('disconnect', { err: new Error('connection lost') });

    expect(indicator.isReady()).toBe(false);
  });

  // The connection opens in the constructor, but the listeners attach in
  // onModuleInit; the database factory's migrations run in between. A broker
  // that connected in that gap must not leave readiness at 503 forever.
  it('reports ready when RabbitMQ connected before the listeners attached', async () => {
    const early = createMockConnection();
    early.isConnected.mockReturnValue(true);
    mockedAmqp.connect.mockReturnValue(early);
    const module: TestingModule = await Test.createTestingModule({
      providers: [RabbitMqHealthIndicator],
    }).compile();
    const lateInit = module.get<RabbitMqHealthIndicator>(
      RabbitMqHealthIndicator,
    );

    lateInit.onModuleInit();

    expect(lateInit.isReady()).toBe(true);
    early.emit('disconnect', { err: new Error('connection lost') });
    expect(lateInit.isReady()).toBe(false);
  });

  it('should close the connection when the module is destroyed', () => {
    indicator.onModuleDestroy();

    expect(mockConnection.close).toHaveBeenCalled();
  });
});
