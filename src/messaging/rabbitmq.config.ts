import { RmqOptions, Transport } from '@nestjs/microservices';

export function createMicroserviceOptions(): RmqOptions {
  return {
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'],
      queue: process.env.RABBITMQ_QUEUE ?? 'notification.terminal',
      noAck: false,
      queueOptions: {
        durable: true,
      },
      exchange: process.env.RABBITMQ_EXCHANGE ?? 'fiapx.terminal',
      routingKey: process.env.RABBITMQ_ROUTING_KEY ?? 'terminal.event',
    },
  };
}
