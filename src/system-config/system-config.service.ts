import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfigEntity } from './entities/system-config.entity';

const DEFAULTS: { key: string; value: string; description: string }[] = [
  {
    key: 'nearby_shop_radius_meters',
    value: '200',
    description:
      'Radio máximo en metros para agrupar pedidos de negocios cercanos',
  },
  {
    key: 'max_orders_per_group',
    value: '3',
    description: 'Número máximo de pedidos por grupo de entrega',
  },
  {
    key: 'group_wait_minutes',
    value: '5',
    description:
      'Minutos de espera antes de enviar un pedido solo sin grupo completo',
  },
  {
    key: 'location_interval_seconds',
    value: '5',
    description:
      'Intervalo en segundos entre puntos GPS del repartidor (1–300). Se aplica al iniciar sesión de tracking.',
  },
  {
    key: 'platform_service_fee',
    value: '0.00',
    description: 'Cargo fijo de plataforma aplicado al total del pago.',
  },
  {
    key: 'minimum_withdrawal_amount',
    value: '20.00',
    description: 'Monto mínimo requerido para solicitar un retiro.',
  },
  {
    key: 'delivery_fee',
    value: '5.00',
    description: 'Costo fijo de delivery cobrado al cliente por orden (Bs).',
  },
  {
    key: 'express_fee',
    value: '5.00',
    description: 'Costo fijo de envío express cobrado al cliente por orden (Bs).',
  },
  {
    key: 'app_service_fee',
    value: '1.00',
    description: 'Cargo de servicio de la app por orden (Bs). Mostrar solo si > 0.',
  },
  {
    key: 'shop_commission_pct',
    value: '0.00',
    description: 'Porcentaje de comisión cobrado al negocio por orden (%). No se muestra al cliente.',
  },
  {
    key: 'platform_bank_name',
    value: 'BNB',
    description: 'Nombre del banco de la plataforma donde se reciben todos los pagos.',
  },
  {
    key: 'platform_bank_account_holder',
    value: 'YaYa Eats',
    description: 'Titular de la cuenta bancaria de la plataforma.',
  },
  {
    key: 'platform_bank_account_number',
    value: '',
    description: 'Número de cuenta BNB de la plataforma (actualizar con tu número real).',
  },
  {
    key: 'support_enabled',
    value: 'true',
    description: 'Habilitar soporte humano vía Telegram. Si es false, el bot indica que no hay soporte disponible.',
  },
  {
    key: 'support_hours_start',
    value: '08:00',
    description: 'Hora de inicio de atención al cliente (formato HH:MM, hora local Bolivia).',
  },
  {
    key: 'support_hours_end',
    value: '20:00',
    description: 'Hora de fin de atención al cliente (formato HH:MM, hora local Bolivia).',
  },
];

@Injectable()
export class SystemConfigService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(SystemConfigEntity)
    private repo: Repository<SystemConfigEntity>,
  ) {}

  async onApplicationBootstrap() {
    for (const d of DEFAULTS) {
      const exists = await this.repo.findOne({ where: { key: d.key } });
      if (!exists) await this.repo.save(this.repo.create(d));
    }
  }

  async get(key: string): Promise<string | null> {
    const entry = await this.repo.findOne({ where: { key } });
    return entry?.value ?? null;
  }

  async getNumber(key: string, fallback: number): Promise<number> {
    const val = await this.get(key);
    return val !== null ? Number(val) : fallback;
  }

  async set(key: string, value: string): Promise<SystemConfigEntity> {
    let entry = await this.repo.findOne({ where: { key } });
    if (entry) {
      entry.value = value;
    } else {
      entry = this.repo.create({ key, value });
    }
    return this.repo.save(entry);
  }

  async findAll(): Promise<SystemConfigEntity[]> {
    return this.repo.find();
  }
}
