import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrdersService } from '../orders/orders.service';
import { AddressesService } from '../addresses/addresses.service';
import { SystemConfigService } from '../system-config/system-config.service';

// ── Definiciones de herramientas por rol ─────────────────────────────────────

const TOOL_SEARCH_PRODUCTS = {
  name: 'search_products',
  description:
    'Busca productos o platos disponibles en los restaurantes/markets abiertos ahora. ' +
    'Úsalo cuando el usuario pida recomendaciones o quiera saber qué hay disponible. ' +
    'Para ver TODO lo disponible, omite el query o usa query vacío.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Término de búsqueda (ej: hamburguesa, pizza, refresco). ' +
          'Omitir o dejar vacío para ver todos los productos disponibles.',
      },
    },
    required: [],
  },
};

const TOOL_GET_ADDRESSES = {
  name: 'get_my_addresses',
  description:
    'Obtiene las direcciones registradas del usuario. ' +
    'Úsalo cuando el usuario quiera hacer un pedido a domicilio o express.',
  input_schema: { type: 'object', properties: {} },
};

const TOOL_CREATE_ORDER = {
  name: 'create_order',
  description:
    'Crea un pedido real. Úsalo SOLO cuando el usuario haya confirmado explícitamente. ' +
    'Devuelve orderId, total y paymentReference para mostrar el QR de pago.',
  input_schema: {
    type: 'object',
    properties: {
      shopId: { type: 'string', description: 'UUID del negocio (campo shopId del menú disponible)' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            menuItemId: { type: 'string', description: 'UUID del item (campo itemId del menú disponible)' },
            quantity: { type: 'number', minimum: 1 },
          },
          required: ['menuItemId', 'quantity'],
        },
      },
      deliveryType: {
        type: 'string',
        enum: ['delivery', 'express', 'recogida'],
        description: 'delivery=a domicilio, express=rápido tarifa×2, recogida=va a recoger',
      },
      addressId: {
        type: 'string',
        description: 'ID de la dirección registrada. Omitir si el usuario compartió ubicación o si deliveryType es recogida.',
      },
      deliveryLat: {
        type: 'number',
        description: 'Latitud de entrega. Usar cuando el usuario compartió su ubicación en tiempo real (ej. por Telegram).',
      },
      deliveryLng: {
        type: 'number',
        description: 'Longitud de entrega. Usar junto a deliveryLat.',
      },
      deliveryAddressText: {
        type: 'string',
        description: 'Descripción textual de la dirección cuando se usan coordenadas directas.',
      },
    },
    required: ['shopId', 'items', 'deliveryType'],
  },
};

const TOOL_CHECK_PAYMENT = {
  name: 'check_payment',
  description: 'Verifica si el pago de un pedido fue confirmado por el banco.',
  input_schema: {
    type: 'object',
    properties: {
      orderId: { type: 'string', description: 'ID del pedido a verificar' },
    },
    required: ['orderId'],
  },
};

const TOOL_SHOP_ORDERS = {
  name: 'get_shop_orders',
  description: 'Obtiene los pedidos activos del negocio del administrador.',
  input_schema: { type: 'object', properties: {} },
};

const TOOL_UPDATE_ORDER_STATUS = {
  name: 'update_order_status',
  description: 'Actualiza el estado de un pedido del negocio.',
  input_schema: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
      status: {
        type: 'string',
        enum: ['preparando', 'listo'],
        description: 'preparando=en cocina, listo=listo para entregar',
      },
    },
    required: ['orderId', 'status'],
  },
};

const TOOL_ALL_ORDERS = {
  name: 'get_all_orders',
  description: 'Obtiene todos los pedidos del sistema (solo superadmin).',
  input_schema: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Filtrar por estado (opcional)' },
    },
  },
};

const TOOL_GET_SUPPORT_CONTACT = {
  name: 'get_support_contact',
  description:
    'Obtiene el número de teléfono de un superadmin disponible para soporte humano. ' +
    'Úsalo SOLO cuando el usuario pida explícitamente hablar con una persona o solicite soporte humano.',
  input_schema: { type: 'object', properties: {} },
};

export const TOOLS_BY_ROLE: Record<string, any[]> = {
  client: [TOOL_SEARCH_PRODUCTS, TOOL_GET_ADDRESSES, TOOL_CREATE_ORDER, TOOL_CHECK_PAYMENT, TOOL_GET_SUPPORT_CONTACT],
  admin: [TOOL_SHOP_ORDERS, TOOL_UPDATE_ORDER_STATUS],
  superadmin: [TOOL_SHOP_ORDERS, TOOL_UPDATE_ORDER_STATUS, TOOL_ALL_ORDERS],
};

// ── Servicio de ejecución ─────────────────────────────────────────────────────

@Injectable()
export class AiToolsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ordersService: OrdersService,
    private readonly addressesService: AddressesService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async execute(
    toolName: string,
    input: Record<string, any>,
    userId: string,
    roles: string[],
  ): Promise<Record<string, any>> {
    console.log(`[AI Tool] ${toolName}`, JSON.stringify(input));
    try {
      switch (toolName) {
        case 'search_products':
          return await this._searchProducts(input.query as string | undefined);
        case 'get_my_addresses':
          return await this._getMyAddresses(userId);
        case 'create_order':
          return await this._createOrder(userId, input);
        case 'check_payment':
          return await this._checkPayment(userId, input.orderId as string, roles);
        case 'get_shop_orders':
          return await this._getShopOrders(userId);
        case 'update_order_status':
          return await this._updateOrderStatus(userId, input.orderId as string, input.status as string);
        case 'get_all_orders':
          return await this._getAllOrders(input.status as string | undefined);
        case 'get_support_contact':
          return await this._getSupportContact();
        default:
          return { error: `Herramienta desconocida: ${toolName}` };
      }
    } catch (err: any) {
      return { error: err?.message ?? 'Error desconocido al ejecutar la herramienta' };
    }
  }

  // ── Herramientas cliente ───────────────────────────────────────────────────

  private async _searchProducts(query?: string) {
    // Split multi-word queries and search each significant word with OR
    // This handles cases like "majadito de charque de la casona" → matches "Majadito de charque"
    const STOP_WORDS = new Set(['de', 'la', 'el', 'los', 'las', 'del', 'con', 'un', 'una', 'y', 'en', 'para']);
    const words = query?.trim()
      ? query.trim().split(/\s+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w.toLowerCase()))
      : [];

    let rows: any[];
    if (!words.length) {
      rows = await this.dataSource.query(
        `SELECT mi.id, mi.name, mi.price,
                r.id AS shop_id, r.name AS shop_name,
                r.delivery_fee,
                COALESCE(mc.name, 'General') AS category
         FROM menu_items mi
         JOIN shops r ON r.id = mi.shop_id
         LEFT JOIN menu_categories mc ON mc.id = mi.category_id
         WHERE mi.is_available = true
           AND (mi.stock IS NULL OR mi.stock > 0)
           AND (mi.daily_limit IS NULL OR mi.daily_sold < mi.daily_limit)
           AND r.is_open = true
         ORDER BY r.name, mi.name
         LIMIT 20`,
      );
    } else {
      // Build OR conditions: each word checked against item name OR shop name
      const conditions = words
        .map((_, i) => `(mi.name ILIKE $${i + 1} OR r.name ILIKE $${i + 1})`)
        .join(' OR ');
      const params = words.map((w) => `%${w}%`);

      rows = await this.dataSource.query(
        `SELECT mi.id, mi.name, mi.price,
                r.id AS shop_id, r.name AS shop_name,
                r.delivery_fee,
                COALESCE(mc.name, 'General') AS category
         FROM menu_items mi
         JOIN shops r ON r.id = mi.shop_id
         LEFT JOIN menu_categories mc ON mc.id = mi.category_id
         WHERE mi.is_available = true
           AND (mi.stock IS NULL OR mi.stock > 0)
           AND (mi.daily_limit IS NULL OR mi.daily_sold < mi.daily_limit)
           AND r.is_open = true
           AND (${conditions})
         ORDER BY r.name, mi.name
         LIMIT 20`,
        params,
      );
    }

    if (!rows.length) {
      return { found: false, message: `No hay "${query ?? 'productos'}" disponible ahora.` };
    }

    const [deliveryFee, expressFee, serviceFee] = await Promise.all([
      this.systemConfig.getNumber('delivery_fee', 5),
      this.systemConfig.getNumber('express_fee', 5),
      this.systemConfig.getNumber('app_service_fee', 1),
    ]);

    return {
      found: true,
      products: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        price: Number(r.price),
        category: r.category,
        shop: { id: r.shop_id, name: r.shop_name },
      })),
      platformFees: {
        deliveryFee,
        expressFee,
        serviceFee,
      },
    };
  }

  private async _getMyAddresses(userId: string) {
    const addresses = await this.addressesService.findAll(userId);
    if (!addresses.length) {
      return {
        found: false,
        message: 'No tienes direcciones registradas. Ve a Perfil → Mis Direcciones para agregar una.',
      };
    }
    return {
      found: true,
      addresses: addresses.map((a: any) => ({
        id: a.id,
        name: a.name,
        fullAddress: [a.street, a.number].filter(Boolean).join(', '),
        isDefault: a.isDefault,
      })),
    };
  }

  private async _createOrder(userId: string, input: Record<string, any>) {
    let deliveryAddress: string | undefined;
    let deliveryLat: number | undefined;
    let deliveryLng: number | undefined;

    if (input.deliveryLat && input.deliveryLng) {
      // Coordenadas directas (ej. ubicación compartida por Telegram)
      deliveryLat = Number(input.deliveryLat);
      deliveryLng = Number(input.deliveryLng);
      deliveryAddress = input.deliveryAddressText ?? 'Ubicación compartida';
    } else if (input.addressId && input.deliveryType !== 'recogida') {
      // Dirección registrada en la app
      const addresses = await this.addressesService.findAll(userId);
      const addr = addresses.find((a: any) => a.id === input.addressId);
      if (addr) {
        deliveryAddress = [addr.street, (addr as any).number].filter(Boolean).join(', ');
        deliveryLat = (addr as any).latitude ?? undefined;
        deliveryLng = (addr as any).longitude ?? undefined;
      }
    }

    const order = await this.ordersService.create(userId, {
      shopId: input.shopId,
      items: input.items,
      deliveryType: input.deliveryType,
      deliveryAddress,
      deliveryLat,
      deliveryLng,
    } as any);

    // Obtener nombre del negocio para el QR de pago
    const shopRows = await this.dataSource.query(
      `SELECT name FROM shops WHERE id = $1 LIMIT 1`,
      [input.shopId],
    );
    const shopName: string = shopRows[0]?.name ?? 'YaYa Eats';

    // paymentReference puede no estar en la respuesta si la orden fue de recogida
    // o si el ORM no lo retornó. Consultar DB como fallback.
    let paymentReference = (order as any).paymentReference ?? null;
    if (!paymentReference && (order as any).id) {
      const [row] = await this.dataSource.query(
        `SELECT payment_reference FROM orders WHERE id = $1 LIMIT 1`,
        [(order as any).id],
      );
      paymentReference = row?.payment_reference ?? null;
    }

    return {
      success: true,
      orderId: (order as any).id,
      total: Number((order as any).total ?? 0),
      paymentReference,
      shopName,
      status: (order as any).status,
      // Señal para Flutter de abrir la pantalla de pago
      __navigate: 'PAYMENT_PAGE',
    };
  }

  private async _checkPayment(userId: string, orderId: string, roles: string[]) {
    const order = await this.ordersService.findOne(userId, orderId, roles);
    const paid = ['confirmado', 'preparando', 'listo', 'en_camino', 'entregado'].includes(
      (order as any).status,
    );
    return {
      orderId,
      status: (order as any).status,
      isPaid: paid,
    };
  }

  // ── Herramientas admin ────────────────────────────────────────────────────

  private async _getShopOrders(accountId: string) {
    const orders = await this.ordersService.findShopOrders(accountId);
    return { orders };
  }

  private async _updateOrderStatus(accountId: string, orderId: string, status: string) {
    const endpoint = status === 'preparando' ? 'preparing' : 'ready';
    // Llama directamente al método del servicio según estado
    const result = await this.dataSource.query(
      `UPDATE orders SET status = $1, updated_at = NOW()
       WHERE id = $2
         AND shop_id IN (SELECT id FROM shops WHERE owner_account_id = $3)
       RETURNING id, status`,
      [status, orderId, accountId],
    );
    if (!result.length) {
      return { success: false, error: 'Pedido no encontrado o sin permisos' };
    }
    return { success: true, orderId, newStatus: status, endpoint };
  }

  // ── Herramientas superadmin ───────────────────────────────────────────────

  private async _getAllOrders(status?: string) {
    const orders = await this.ordersService.findAllOrders();
    const filtered = status
      ? (orders as any[]).filter((o) => o.status === status)
      : orders;
    return { total: (filtered as any[]).length, orders: filtered };
  }

  private async _getSupportContact() {
    const supportEnabled = await this.systemConfig.get('support_enabled');
    if (supportEnabled === 'false') {
      return {
        available: false,
        message: 'El soporte humano no está disponible en este momento.',
      };
    }

    // Check support hours (Bolivia timezone UTC-4)
    const hoursStart = (await this.systemConfig.get('support_hours_start')) ?? '08:00';
    const hoursEnd = (await this.systemConfig.get('support_hours_end')) ?? '20:00';

    const now = new Date();
    // Bolivia is UTC-4
    const boliviaOffset = -4 * 60;
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const localMinutes = ((utcMinutes + boliviaOffset) % (24 * 60) + 24 * 60) % (24 * 60);

    const [startH, startM] = hoursStart.split(':').map(Number);
    const [endH, endM] = hoursEnd.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (localMinutes < startMinutes || localMinutes >= endMinutes) {
      return {
        available: false,
        message: `El soporte humano está disponible de ${hoursStart} a ${hoursEnd} (hora Bolivia). Fuera de ese horario puedes seguir usando el asistente de IA.`,
      };
    }

    // Find superadmin with a phone number, preferring most recently active Telegram session
    const rows = await this.dataSource.query(
      `SELECT p.phone, p.first_name, p.last_name, ts.updated_at AS last_active
       FROM accounts a
       JOIN profiles p ON p.account_id = a.id
       LEFT JOIN telegram_sessions ts ON ts.account_id = a.id
       WHERE 'superadmin' = ANY(a.roles)
         AND p.phone IS NOT NULL
         AND p.phone <> ''
       ORDER BY ts.updated_at DESC NULLS LAST, a.created_at ASC
       LIMIT 1`,
    );

    if (!rows.length) {
      return {
        available: false,
        message: 'No hay un agente de soporte disponible en este momento. Por favor intenta más tarde.',
      };
    }

    const agent = rows[0];
    const name = [agent.first_name, agent.last_name].filter(Boolean).join(' ') || 'Soporte YaYa Eats';
    return {
      available: true,
      name,
      phone: agent.phone,
      hours: `${hoursStart}–${hoursEnd}`,
    };
  }
}
