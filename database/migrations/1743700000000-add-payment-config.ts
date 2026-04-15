import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentConfig1743700000000 implements MigrationInterface {
  name = 'AddPaymentConfig1743700000000';

  public async up(qr: QueryRunner): Promise<void> {
    // Agregar platform_qr_image_url a system_config
    await qr.query(
      `INSERT INTO system_config (key, value, description)
       VALUES ('platform_qr_image_url', '', 'URL de la imagen QR para pagos por transferencia bancaria')
       ON CONFLICT DO NOTHING`,
    );

    // Agregar min_cash_order_amount a system_config
    await qr.query(
      `INSERT INTO system_config (key, value, description)
       VALUES ('min_cash_order_amount', '0', 'Monto mínimo en Bs para habilitar pago en efectivo')
       ON CONFLICT DO NOTHING`,
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `DELETE FROM system_config
       WHERE key IN ('platform_qr_image_url', 'min_cash_order_amount')`,
    );
  }
}
