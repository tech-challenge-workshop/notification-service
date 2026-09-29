import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { createMicroserviceOptions } from './messaging/rabbitmq.config';

async function bootstrap() {
  // Buffer until the pino logger is resolved, so bootstrap lines are JSON
  // too. useLogger replaces Nest's global logger, which the RMQ microservice
  // connected below shares with the HTTP app.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.connectMicroservice(createMicroserviceOptions());
  app
    .startAllMicroservices()
    .catch((err: unknown) =>
      logger.error({ err, msg: 'Microservice failed to start' }, 'Bootstrap'),
    );
  await app.listen(process.env.PORT ?? 3003);
  app.flushLogs();
}
void bootstrap();
