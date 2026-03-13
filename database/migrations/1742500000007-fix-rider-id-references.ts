import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix orders.rider_id and delivery_groups.rider_id to reference riders(id)
 * instead of accounts(id).
 *
 * Steps:
 *  1. Convert existing data: accounts.id → riders.id (via accounts→profiles→riders join)
 *  2. Drop old FKs referencing accounts(id)
 *  3. Add new FKs referencing riders(id)
 */
export class FixRiderIdReferences1742500000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop old FKs (reference accounts(id)) BEFORE modifying data
    await queryRunner.query(`ALTER TABLE delivery_groups DROP CONSTRAINT IF EXISTS "fk_dg_rider"`);
    await queryRunner.query(`ALTER TABLE delivery_groups DROP CONSTRAINT IF EXISTS "FK_dg_rider"`);
    await queryRunner.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS "fk_ord_rider"`);
    await queryRunner.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS "FK_ord_rider"`);

    // 2. Convert delivery_groups.rider_id: accounts.id → riders.id
    await queryRunner.query(`
      UPDATE delivery_groups dg
      SET rider_id = r.id
      FROM riders r
      JOIN profiles p ON p.id = r.profile_id
      WHERE p.account_id = dg.rider_id
        AND dg.rider_id IS NOT NULL
    `);

    // 3. Convert orders.rider_id: accounts.id → riders.id
    await queryRunner.query(`
      UPDATE orders o
      SET rider_id = r.id
      FROM riders r
      JOIN profiles p ON p.id = r.profile_id
      WHERE p.account_id = o.rider_id
        AND o.rider_id IS NOT NULL
    `);

    // 4. Recreate FKs pointing to riders(id)
    await queryRunner.query(`
      ALTER TABLE delivery_groups
        ADD CONSTRAINT "FK_dg_rider"
        FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE orders
        ADD CONSTRAINT "FK_ord_rider"
        FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert FKs back to accounts(id)
    await queryRunner.query(`ALTER TABLE delivery_groups DROP CONSTRAINT IF EXISTS "FK_dg_rider"`);
    await queryRunner.query(`
      ALTER TABLE delivery_groups
        ADD CONSTRAINT "FK_dg_rider"
        FOREIGN KEY (rider_id) REFERENCES accounts(id) ON DELETE SET NULL
    `);

    await queryRunner.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS "FK_ord_rider"`);
    await queryRunner.query(`
      ALTER TABLE orders
        ADD CONSTRAINT "FK_ord_rider"
        FOREIGN KEY (rider_id) REFERENCES accounts(id) ON DELETE SET NULL
    `);

    // Note: data conversion (accounts.id → riders.id) is NOT reversed here
    // because we cannot reliably know which rider_ids were already riders.id
    // before this migration ran. A full DB reset + re-seed is the safe rollback.
  }
}
