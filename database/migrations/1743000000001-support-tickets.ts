import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupportTickets1743000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id    UUID REFERENCES accounts(id) ON DELETE SET NULL,
        subject       VARCHAR(255) NOT NULL,
        message       TEXT NOT NULL,
        status        VARCHAR(20) NOT NULL DEFAULT 'open',
        admin_notes   TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_support_tickets_account ON support_tickets(account_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS support_tickets`);
  }
}
