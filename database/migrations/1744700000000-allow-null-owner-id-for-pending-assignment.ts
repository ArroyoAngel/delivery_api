import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowNullOwnerIdForPendingAssignment1744700000000
  implements MigrationInterface
{
  public async up(qr: QueryRunner): Promise<void> {
    // Permitir NULL en owner_id
    await qr.query(`
      ALTER TABLE wallet_transactions
      ALTER COLUMN owner_id DROP NOT NULL
    `);

    // Agregar constraint que permite NULL solo para pending_assignment
    await qr.query(`
      ALTER TABLE wallet_transactions
      ADD CONSTRAINT wallet_transactions_owner_id_check
      CHECK (owner_id IS NOT NULL OR status = 'pending_assignment')
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Revertir cambios
    await qr.query(`
      ALTER TABLE wallet_transactions
      DROP CONSTRAINT IF EXISTS wallet_transactions_owner_id_check
    `);

    // Restaurar NOT NULL
    await qr.query(`
      ALTER TABLE wallet_transactions
      ALTER COLUMN owner_id SET NOT NULL
    `);
  }
}
