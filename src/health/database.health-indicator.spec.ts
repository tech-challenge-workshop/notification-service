import { DataSource } from 'typeorm';
import { DatabaseHealthIndicator } from './database.health-indicator';

describe('DatabaseHealthIndicator', () => {
  const asDataSource = (value: unknown) => value as DataSource;

  it('reports healthy when no database is configured, since the service runs in memory', async () => {
    await expect(
      new DatabaseHealthIndicator(undefined).isHealthy(),
    ).resolves.toBe(true);
  });

  it('reports unhealthy before the data source is initialised', async () => {
    await expect(
      new DatabaseHealthIndicator(
        asDataSource({ isInitialized: false }),
      ).isHealthy(),
    ).resolves.toBe(false);
  });

  it('reports healthy when the database answers', async () => {
    await expect(
      new DatabaseHealthIndicator(
        asDataSource({
          isInitialized: true,
          query: () => Promise.resolve([{}]),
        }),
      ).isHealthy(),
    ).resolves.toBe(true);
  });

  it('reports unhealthy when the query fails', async () => {
    await expect(
      new DatabaseHealthIndicator(
        asDataSource({
          isInitialized: true,
          query: () => Promise.reject(new Error('connection refused')),
        }),
      ).isHealthy(),
    ).resolves.toBe(false);
  });
});
