import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface AiAddress {
  id: string;
  name: string;
  fullAddress: string;
  isDefault: boolean;
  latitude: number | null;
  longitude: number | null;
}

export interface AiMenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
}

export interface AiShop {
  id: string;
  name: string;
  deliveryFee: number;
  minOrder: number;
  items: AiMenuItem[];
}

export interface AiClientContext {
  addresses: AiAddress[];
  shops: AiShop[];
}

@Injectable()
export class AiContextService {
  constructor(private readonly dataSource: DataSource) {}

  async getClientContext(accountId: string): Promise<AiClientContext> {
    // ── Direcciones del usuario ──────────────────────────────────────────────
    const addressRows: any[] = await this.dataSource.query(
      `SELECT id, name, street, number, is_default, latitude, longitude
       FROM user_addresses
       WHERE account_id = $1
       ORDER BY is_default DESC, created_at ASC
       LIMIT 5`,
      [accountId],
    );

    // ── Negocios abiertos con sus ítems ──────────────────────────────────
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const shopRows: any[] = await this.dataSource.query(
      `SELECT id, name, delivery_fee, minimum_order
       FROM shops
       WHERE is_open = true
         AND (opening_time IS NULL OR opening_time <= $1::time)
         AND (closing_time IS NULL OR closing_time >= $1::time)
       ORDER BY name
       LIMIT 30`,
      [timeStr],
    );

    const shopIds = shopRows.map((r) => r.id);
    let itemRows: any[] = [];
    if (shopIds.length > 0) {
      itemRows = await this.dataSource.query(
        `SELECT mi.id, mi.name, mi.price, mi.shop_id,
                COALESCE(mc.name, 'General') AS category
         FROM menu_items mi
         LEFT JOIN menu_categories mc ON mc.id = mi.category_id
         WHERE mi.shop_id = ANY($1::uuid[])
           AND mi.is_available = true
           AND (mi.stock IS NULL OR mi.stock > 0)
           AND (mi.daily_limit IS NULL OR mi.daily_sold < mi.daily_limit)
         ORDER BY mi.shop_id, mc.sort_order, mi.name`,
        [shopIds],
      );
    }

    // Agrupar ítems por negocio
    const byShop = new Map<string, AiMenuItem[]>();
    for (const row of itemRows) {
      const list = byShop.get(row.shop_id) ?? [];
      list.push({
        id: row.id,
        name: row.name,
        price: Number(row.price),
        category: row.category,
      });
      byShop.set(row.shop_id, list);
    }

    return {
      addresses: addressRows.map((a) => ({
        id: a.id,
        name: a.name,
        fullAddress: [a.street, a.number].filter(Boolean).join(' '),
        isDefault: a.is_default,
        latitude: a.latitude != null ? Number(a.latitude) : null,
        longitude: a.longitude != null ? Number(a.longitude) : null,
      })),
      shops: shopRows
        .map((r) => ({
          id: r.id,
          name: r.name,
          deliveryFee: Number(r.delivery_fee ?? 0),
          minOrder: Number(r.minimum_order ?? 0),
          items: byShop.get(r.id) ?? [],
        }))
        .filter((r) => r.items.length > 0),
    };
  }

  /** Formatea el contexto como texto para incluir en el system prompt */
  formatForPrompt(ctx: AiClientContext): string {
    const lines: string[] = ['=== CONTEXTO DEL USUARIO ==='];

    if (ctx.addresses.length === 0) {
      lines.push('\nDIRECCIONES: (ninguna registrada)');
    } else {
      lines.push('\nDIRECCIONES REGISTRADAS:');
      ctx.addresses.forEach((a, i) => {
        const tag = a.isDefault ? ' [predeterminada]' : '';
        lines.push(`${i + 1}. ${a.name}${tag} — ${a.fullAddress} | id: ${a.id}`);
      });
    }

    if (ctx.shops.length === 0) {
      lines.push('\nNEGOCIOS: (ninguno disponible ahora)');
    } else {
      lines.push('\nNEGOCIOS DISPONIBLES AHORA:');
      for (const r of ctx.shops) {
        lines.push(
          `\n[${r.name}] (id: ${r.id}, tarifa delivery: Bs ${r.deliveryFee.toFixed(2)}, pedido mínimo: Bs ${r.minOrder.toFixed(2)})`,
        );
        const byCategory = new Map<string, AiMenuItem[]>();
        for (const item of r.items) {
          const list = byCategory.get(item.category) ?? [];
          list.push(item);
          byCategory.set(item.category, list);
        }
        for (const [cat, items] of byCategory) {
          lines.push(`  ${cat}:`);
          for (const item of items) {
            lines.push(`    - ${item.name} — Bs ${item.price.toFixed(2)} | id: ${item.id}`);
          }
        }
      }
    }

    lines.push('\n=== FIN DEL CONTEXTO ===');
    return lines.join('\n');
  }
}
