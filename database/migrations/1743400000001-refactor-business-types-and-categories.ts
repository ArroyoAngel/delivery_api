import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorBusinessTypesAndCategories1743400000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Agregar business_type_id a shop_categories
    await queryRunner.query(`
      ALTER TABLE shop_categories
      ADD COLUMN business_type_id VARCHAR(50);
    `);

    // 2. Agregar FK desde shop_categories a business_types
    await queryRunner.query(`
      ALTER TABLE shop_categories
      ADD CONSTRAINT FK_shop_cat_business_type
      FOREIGN KEY (business_type_id) REFERENCES business_types(value);
    `);

    // 3. Actualizar shop_categories con el business_type correspondiente
    await queryRunner.query(`
      UPDATE shop_categories
      SET business_type_id = business_type
      WHERE business_type IS NOT NULL;
    `);

    // 4. Eliminar columna business_type de shop_categories (ahora redundante)
    await queryRunner.query(`
      ALTER TABLE shop_categories
      DROP COLUMN business_type;
    `);

    // 5. Cambiar shops.business_type de VARCHAR a FK (business_type_id)
    // Primero agregar la nueva columna
    await queryRunner.query(`
      ALTER TABLE shops
      ADD COLUMN business_type_id VARCHAR(50);
    `);

    // 6. Copiar datos de business_type a business_type_id
    await queryRunner.query(`
      UPDATE shops
      SET business_type_id = business_type
      WHERE business_type IS NOT NULL;
    `);

    // 7. Agregar FK desde shops a business_types
    await queryRunner.query(`
      ALTER TABLE shops
      ADD CONSTRAINT FK_shops_business_type
      FOREIGN KEY (business_type_id) REFERENCES business_types(value);
    `);

    // 8. Eliminar category_id de shops (ya no es necesario)
    await queryRunner.query(`
      ALTER TABLE shops
      DROP CONSTRAINT FK_shop_cat;
    `);

    await queryRunner.query(`
      ALTER TABLE shops
      DROP COLUMN category_id;
    `);

    // 9. Eliminar business_type de shops (ahora redundante)
    await queryRunner.query(`
      ALTER TABLE shops
      DROP COLUMN business_type;
    `);

    // 10. Crear tabla N:N entre shops y shop_categories
    await queryRunner.query(`
      CREATE TABLE shop_category_assignments (
        id                UUID          NOT NULL DEFAULT gen_random_uuid(),
        shop_id           UUID          NOT NULL,
        category_id       UUID          NOT NULL,
        created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT PK_shop_cat_assign PRIMARY KEY (id),
        CONSTRAINT FK_sca_shop FOREIGN KEY (shop_id)
          REFERENCES shops(id) ON DELETE CASCADE,
        CONSTRAINT FK_sca_category FOREIGN KEY (category_id)
          REFERENCES shop_categories(id) ON DELETE CASCADE,
        CONSTRAINT UQ_shop_category UNIQUE(shop_id, category_id)
      )
    `);

    // 11. Crear índices para performance
    await queryRunner.query(`
      CREATE INDEX idx_sca_shop_id ON shop_category_assignments(shop_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_sca_category_id ON shop_category_assignments(category_id);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_shop_categories_business_type ON shop_categories(business_type_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso

    // 1. Eliminar tabla N:N
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_sca_category_id;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_sca_shop_id;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_shop_categories_business_type;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS shop_category_assignments;
    `);

    // 2. Restaurar business_type en shops
    await queryRunner.query(`
      ALTER TABLE shops
      ADD COLUMN business_type VARCHAR(50) NOT NULL DEFAULT 'restaurant';
    `);

    await queryRunner.query(`
      UPDATE shops s
      SET business_type = s.business_type_id
      WHERE business_type_id IS NOT NULL;
    `);

    // 3. Eliminar FK de shops a business_types
    await queryRunner.query(`
      ALTER TABLE shops
      DROP CONSTRAINT FK_shops_business_type;
    `);

    // 4. Eliminar business_type_id de shops
    await queryRunner.query(`
      ALTER TABLE shops
      DROP COLUMN business_type_id;
    `);

    // 5. Restaurar category_id en shops
    await queryRunner.query(`
      ALTER TABLE shops
      ADD COLUMN category_id UUID;
    `);

    await queryRunner.query(`
      ALTER TABLE shops
      ADD CONSTRAINT FK_shop_cat FOREIGN KEY (category_id)
      REFERENCES shop_categories(id) ON DELETE SET NULL;
    `);

    // 6. Restaurar business_type en shop_categories
    await queryRunner.query(`
      ALTER TABLE shop_categories
      ADD COLUMN business_type VARCHAR(50);
    `);

    await queryRunner.query(`
      UPDATE shop_categories
      SET business_type = business_type_id
      WHERE business_type_id IS NOT NULL;
    `);

    // 7. Eliminar FK y business_type_id de shop_categories
    await queryRunner.query(`
      ALTER TABLE shop_categories
      DROP CONSTRAINT FK_shop_cat_business_type;
    `);

    await queryRunner.query(`
      ALTER TABLE shop_categories
      DROP COLUMN business_type_id;
    `);
  }
}
