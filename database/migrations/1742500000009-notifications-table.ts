import { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationsTable1742500000009 implements MigrationInterface {
  async up(qr: QueryRunner) {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID        NOT NULL,
        title       VARCHAR     NOT NULL,
        body        VARCHAR     NOT NULL,
        type        VARCHAR,
        data        JSONB,
        is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id
        ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
        ON notifications(user_id, is_read) WHERE is_read = FALSE;
    `);
  }

  async down(qr: QueryRunner) {
    await qr.query(`DROP TABLE IF EXISTS notifications;`);
  }
}
