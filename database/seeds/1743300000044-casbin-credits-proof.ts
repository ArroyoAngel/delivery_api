import { MigrationInterface, QueryRunner } from 'typeorm';
import { RolEnum } from '../../src/authorization/rol.enum';

export class CasbinCreditsProof1743300000044 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
       VALUES ('p', $1, '/api/credits/purchases/:id/proof', 'POST', 'allow', 'backend')
       ON CONFLICT DO NOTHING`,
      [RolEnum.RIDER],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM casbin_rule
       WHERE ptype = 'p' AND v4 = 'backend'
         AND v1 = '/api/credits/purchases/:id/proof' AND v2 = 'POST'`,
    );
  }
}
