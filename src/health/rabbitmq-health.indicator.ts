import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { connect, AmqpConnectionManager } from 'amqp-connection-manager';

@Injectable()
export class RabbitMqHealthIndicator implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqHealthIndicator.name);
  private connection: AmqpConnectionManager | undefined;
  private ready = false;

  constructor() {
    const url = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';
    this.connection = connect([url]);
  }

  onModuleInit(): void {
    if (!this.connection) {
      return;
    }

    this.connection.on('connect', () => {
      this.logger.log('RabbitMQ connected');
      this.ready = true;
    });

    this.connection.on('disconnect', (err) => {
      this.logger.error(
        `RabbitMQ disconnected: ${err.err instanceof Error ? err.err.message : 'unknown'}`,
      );
      this.ready = false;
    });
  }

  onModuleDestroy(): void {
    this.connection?.close();
  }

  isReady(): boolean {
    return this.ready;
  }
}
