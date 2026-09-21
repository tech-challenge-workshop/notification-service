import { DataSource, DataSourceOptions } from 'typeorm';
import { DeliveryRecordEntity } from './delivery-record.entity';

export const DATA_SOURCE = 'DATA_SOURCE';

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_HOST);
}

export function buildDataSourceOptions(): DataSourceOptions {
  return {
    type: 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME ?? 'fiapx',
    // Its own schema: the foundation forbids sharing tables with the Catalog,
    // and the role backing this connection is denied the other's schema.
    schema: process.env.DATABASE_SCHEMA ?? 'notification',
    username: process.env.DATABASE_USER ?? 'notification',
    password: process.env.DATABASE_PASSWORD ?? 'notification',
    entities: [DeliveryRecordEntity],
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    synchronize: false,
    logging: false,
  };
}

export function createDataSource(): DataSource {
  return new DataSource(buildDataSourceOptions());
}
