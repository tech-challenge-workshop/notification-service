import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  // Buffer until the pino logger is resolved, so bootstrap lines are JSON
  // too.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app);
  const logger = app.get(Logger);
  app
    .startAllMicroservices()
    .catch((err: unknown) =>
      logger.error({ err, msg: 'Microservice failed to start' }, 'Bootstrap'),
    );
  await app.listen(process.env.PORT ?? 3003);
  app.flushLogs();
}
void bootstrap();
