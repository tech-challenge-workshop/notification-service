import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationDeliveryService } from './application/notification-delivery.service';
import { DELIVERY_REPOSITORY } from './domain/delivery-repository.token';
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

@Module({
  controllers: [TerminalEventConsumer],
  providers: [
    NotificationDeliveryService,
    dataSourceProvider,
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
