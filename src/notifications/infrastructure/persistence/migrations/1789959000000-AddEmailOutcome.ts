import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailOutcome1789959000000 implements MigrationInterface {
  name = 'AddEmailOutcome1789959000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE delivery_record
        ADD COLUMN IF NOT EXISTS email_sent_at timestamptz NULL,
        ADD COLUMN IF NOT EXISTS email_error   text        NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE delivery_record
        DROP COLUMN IF EXISTS email_sent_at,
        DROP COLUMN IF EXISTS email_error
    `);
  }
}
