import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class RefactorShopCategoriesToMenuItems1744810000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Crear tabla menu_item_shop_categories
    await queryRunner.createTable(
      new Table({
        name: 'menu_item_shop_categories',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'menu_item_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'shop_category_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // 2. Agregar foreign keys
    await queryRunner.createForeignKey(
      'menu_item_shop_categories',
      new TableForeignKey({
        columnNames: ['menu_item_id'],
        referencedTableName: 'menu_items',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'menu_item_shop_categories',
      new TableForeignKey({
        columnNames: ['shop_category_id'],
        referencedTableName: 'shop_categories',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // 3. Crear índices
    await queryRunner.createIndex(
      'menu_item_shop_categories',
      new TableIndex({
        name: 'idx_menu_item_shop_categories_menu_item_id',
        columnNames: ['menu_item_id'],
      }),
    );

    await queryRunner.createIndex(
      'menu_item_shop_categories',
      new TableIndex({
        name: 'idx_menu_item_shop_categories_shop_category_id',
        columnNames: ['shop_category_id'],
      }),
    );

    // 4. Eliminar tabla shop_category_assignments
    await queryRunner.dropTable('shop_category_assignments', true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recrear tabla shop_category_assignments
    await queryRunner.createTable(
      new Table({
        name: 'shop_category_assignments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'shop_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'category_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Agregar foreign keys
    await queryRunner.createForeignKey(
      'shop_category_assignments',
      new TableForeignKey({
        columnNames: ['shop_id'],
        referencedTableName: 'shops',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'shop_category_assignments',
      new TableForeignKey({
        columnNames: ['category_id'],
        referencedTableName: 'shop_categories',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    // Eliminar tabla menu_item_shop_categories
    await queryRunner.dropTable('menu_item_shop_categories', true);
  }
}
