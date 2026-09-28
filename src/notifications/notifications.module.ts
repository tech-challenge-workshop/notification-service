import { Logger, Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationDeliveryService } from './application/notification-delivery.service';
import { DELIVERY_REPOSITORY } from './domain/delivery-repository.token';
import { EMAIL_SENDER } from './domain/email-sender.token';
import { InMemoryEmailSender } from './infrastructure/email/in-memory-email-sender';
import { SmtpEmailSender } from './infrastructure/email/smtp-email-sender';
import {
  buildSmtpOptions,
  isSmtpConfigured,
} from './infrastructure/email/smtp-config';
import { TerminalEventConsumer } from './infrastructure/messaging/terminal-event.consumer';
import { InMemoryDeliveryRepository } from './infrastructure/persistence/in-memory-delivery.repository';
import {
  DATA_SOURCE,
  createDataSource,
  isDatabaseConfigured,
} from './infrastructure/persistence/data-source';
import { TypeOrmDeliveryRepository } from './infrastructure/persistence/typeorm-delivery.repository';

/**
 * With no database configured the service runs on the in-memory repository,
 * so the unit suite and a bare `npm start` need no container. When one is
 * configured, migrations are applied before the service accepts events.
 */
const dataSourceProvider = {
  provide: DATA_SOURCE,
  useFactory: async (): Promise<DataSource | undefined> => {
    if (!isDatabaseConfigured()) {
      return undefined;
    }
    const dataSource = createDataSource();
    await dataSource.initialize();
    await dataSource.runMigrations();
    return dataSource;
  },
};

const logger = new Logger('NotificationsModule');

/**
 * With no SMTP host configured the service runs on the in-memory sender,
 * mirroring the database's fallback above. Unlike that fallback, this one
 * looks like success (send() always resolves), so a missing SMTP_HOST in a
 * real deployment would silently mark emails as sent when none went out —
 * warn loudly so it's caught at boot, not discovered by an angry user.
 */
export const emailSenderProvider = {
  provide: EMAIL_SENDER,
  useFactory: () => {
    if (isSmtpConfigured()) {
      return new SmtpEmailSender(buildSmtpOptions());
    }
    logger.warn(
      'SMTP_HOST is not configured; falling back to InMemoryEmailSender. No real email will be sent.',
    );
    return new InMemoryEmailSender();
  },
};

@Module({
  controllers: [TerminalEventConsumer],
  providers: [
    NotificationDeliveryService,
    dataSourceProvider,
    emailSenderProvider,
    {
      provide: DELIVERY_REPOSITORY,
      useFactory: (dataSource?: DataSource) =>
        dataSource
          ? new TypeOrmDeliveryRepository(dataSource)
          : new InMemoryDeliveryRepository(),
      inject: [DATA_SOURCE],
    },
  ],
  exports: [DELIVERY_REPOSITORY, DATA_SOURCE],
})
export class NotificationsModule {}
