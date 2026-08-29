import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createMicroserviceOptions } from './messaging/rabbitmq.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice(createMicroserviceOptions());
  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3003);
}
void bootstrap();
