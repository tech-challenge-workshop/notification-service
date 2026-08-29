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
  let mockConnection: EventEmitter & { close: jest.Mock };

  function createMockConnection(): EventEmitter & { close: jest.Mock } {
    return Object.assign(new EventEmitter(), { close: jest.fn() });
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

  it('should close the connection when the module is destroyed', () => {
    indicator.onModuleDestroy();

    expect(mockConnection.close).toHaveBeenCalled();
  });
});
