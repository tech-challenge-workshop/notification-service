import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { correlationContext } from './correlation-context';
import { buildRootLoggerConfig } from './logger.config';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [
    // SPEC_DEVIATION: tasks.md names `LoggerModule.forRoot(rootConfig)`.
    // Reason: forRootAsync builds the config when the app is created, not when
    // this file is imported, so a LOG_LEVEL set by a test bootstrap applies.
    //
    // The process-wide instance, so the consumer wrapper and the pino mixin
    // read the same ALS store.
    LoggerModule.forRootAsync({
      useFactory: () => buildRootLoggerConfig(correlationContext),
    }),
  ],
  controllers: [MetricsController],
})
export class ObservabilityModule {}
