import { MigrationInterface, QueryRunner } from 'typeorm';
import { RolEnum } from '../../src/authorization/rol.enum';

export class CasbinRatings1743300000040 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const rules = [
      [RolEnum.CLIENT, '/api/ratings',              'POST', 'allow', 'backend'],
      [RolEnum.CLIENT, '/api/ratings/pending/:id',  'GET',  'allow', 'backend'],
      [RolEnum.CLIENT, '/api/ratings/my-pending',   'GET',  'allow', 'backend'],
      [RolEnum.RIDER,  '/api/ratings',              'POST', 'allow', 'backend'],
      [RolEnum.RIDER,  '/api/ratings/pending/:id',  'GET',  'allow', 'backend'],
      [RolEnum.RIDER,  '/api/ratings/my-pending',   'GET',  'allow', 'backend'],
      [RolEnum.ADMIN,  '/api/ratings',              'POST', 'allow', 'backend'],
      [RolEnum.ADMIN,  '/api/ratings/pending/:id',  'GET',  'allow', 'backend'],
      [RolEnum.ADMIN,  '/api/ratings/my-pending',   'GET',  'allow', 'backend'],
    ];
    for (const [v0, v1, v2, v3, v4] of rules) {
      await queryRunner.query(
        `INSERT INTO casbin_rule (ptype, v0, v1, v2, v3, v4)
         VALUES ('p', $1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [v0, v1, v2, v3, v4],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM casbin_rule WHERE ptype='p' AND v4='backend' AND v1 IN ('/api/ratings', '/api/ratings/pending/:id', '/api/ratings/my-pending')`,
    );
  }
}
