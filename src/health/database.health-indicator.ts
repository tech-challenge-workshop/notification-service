import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DATA_SOURCE } from '../notifications/infrastructure/persistence/data-source';

/**
 * Readiness must reflect the database. Without it the service accepts
 * terminal events it can only turn into requeues.
 *
 * With no database configured the service runs on the in-memory repository,
 * so there is nothing to be unhealthy about.
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    @Optional()
    @Inject(DATA_SOURCE)
    private readonly dataSource?: DataSource,
  ) {}

  async isHealthy(): Promise<boolean> {
    if (!this.dataSource) {
      return true;
    }
    if (!this.dataSource.isInitialized) {
      return false;
    }
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
