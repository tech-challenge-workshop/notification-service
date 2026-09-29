import { INestApplication } from '@nestjs/common';
import { RmqOptions } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { createMicroserviceOptions } from './messaging/rabbitmq.config';

/**
 * Composes the service on a created app: the pino logger and the RMQ
 * terminal-event consumer. main.ts and the observability e2e share it, so
 * the tests run the service's own wiring. Pass `null` to skip the consumer.
 */
export function configureApp(
  app: INestApplication,
  consumer: RmqOptions | null = createMicroserviceOptions(),
): void {
  // useLogger replaces Nest's global logger, which the RMQ microservice
  // connected below shares with the HTTP app.
  app.useLogger(app.get(Logger));
  if (consumer) {
    app.connectMicroservice(consumer);
  }
}
