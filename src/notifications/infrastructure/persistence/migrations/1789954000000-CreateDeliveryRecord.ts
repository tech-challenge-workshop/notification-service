import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeliveryRecord1789954000000 implements MigrationInterface {
  name = 'CreateDeliveryRecord1789954000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS delivery_record (
        event_id              text        PRIMARY KEY,
        processing_request_id text        NOT NULL,
        owner_user_id         text        NOT NULL,
        status                text        NOT NULL,
        zip_storage_key       text        NULL,
        failure_reason        text        NULL,
        recorded_at           timestamptz NOT NULL
      )
    `);

    // The local observation route reads by request, not by event.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_delivery_record_request
        ON delivery_record (processing_request_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_delivery_record_request`);
    await queryRunner.query(`DROP TABLE IF EXISTS delivery_record`);
  }
}
