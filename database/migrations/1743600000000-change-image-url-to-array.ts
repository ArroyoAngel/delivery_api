import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeImageUrlToArray1743600000000 implements MigrationInterface {
  name = 'ChangeImageUrlToArray1743600000000';

  public async up(qr: QueryRunner): Promise<void> {
    // Crear columna temporal con tipo JSON
    await qr.query(`
      ALTER TABLE shops
      ADD COLUMN image_urls_new jsonb DEFAULT '[]'::jsonb
    `);

    // Migrar datos existentes: si hay image_url, agregar a array; si no, dejar como array vacío
    await qr.query(`
      UPDATE shops
      SET image_urls_new =
        CASE
          WHEN image_url IS NOT NULL THEN to_jsonb(ARRAY[image_url])
          ELSE '[]'::jsonb
        END
    `);

    // Eliminar la columna vieja
    await qr.query(`ALTER TABLE shops DROP COLUMN image_url`);

    // Renombrar la columna nueva
    await qr.query(`ALTER TABLE shops RENAME COLUMN image_urls_new TO image_urls`);
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Crear columna temporal string
    await qr.query(`
      ALTER TABLE shops
      ADD COLUMN image_url_old text
    `);

    // Migrar datos de vuelta: tomar el primer elemento del array
    await qr.query(`
      UPDATE shops
      SET image_url_old =
        CASE
          WHEN image_urls::text != '[]' THEN image_urls->>0
          ELSE NULL
        END
    `);

    // Eliminar la columna JSON
    await qr.query(`ALTER TABLE shops DROP COLUMN image_urls`);

    // Renombrar
    await qr.query(`ALTER TABLE shops RENAME COLUMN image_url_old TO image_url`);
  }
}
