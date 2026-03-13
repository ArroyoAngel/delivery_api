import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pedidos históricos entregados con recorrido GPS de los repartidores.
 * Ubicaciones en Santa Cruz de la Sierra, Bolivia.
 *
 * 8 pedidos en 4 grupos de delivery:
 *   Grupo 1 (rider1/Diego,  hace 7 días): Ana→Fogón, Carlos→Casona
 *   Grupo 2 (rider2/Marco,  hace 7 días): Sofía→Sushi, Miguel→Fogón
 *   Grupo 3 (rider3/Patricia, hace 4 días): Valeria→Casona, Ana→Sushi
 *   Grupo 4 (rider1/Diego,  hace 2 días): Carlos→Fogón, Sofía→Casona
 *
 * rider_location_history: una entrada por entrega, interval_seconds=5.
 * Formato path: "lat,lng;lat,lng;..." — cada punto = 5 segundos de recorrido.
 */

/** Interpolación lineal entre dos coordenadas → string de puntos GPS */
function buildPath(
  fromLat: number, fromLng: number,
  toLat: number,   toLng: number,
  numSegments: number,
): string {
  const pts: string[] = [];
  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const lat = (fromLat + (toLat - fromLat) * t).toFixed(5);
    const lng = (fromLng + (toLng - fromLng) * t).toFixed(5);
    pts.push(`${lat},${lng}`);
  }
  return pts.join(';');
}

export class OrdersHistory1742500000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {

    // ── IDs de cuentas ────────────────────────────────────────────────────
    const accRows: { email: string; id: string }[] = await queryRunner.query(
      `SELECT email, id FROM accounts WHERE email = ANY($1)`,
      [[
        'rider1@yayaeats.com', 'rider2@yayaeats.com', 'rider3@yayaeats.com',
        'ana.garcia@gmail.com', 'carlos.mendez@gmail.com', 'sofia.vargas@gmail.com',
        'miguel.torrez@gmail.com', 'valeria.suarez@gmail.com',
      ]],
    );
    const acc: Record<string, string> = Object.fromEntries(accRows.map(r => [r.email, r.id]));

    // ── IDs de la tabla riders (para rider_location_history) ──────────────
    const riderRows: { email: string; rider_id: string }[] = await queryRunner.query(
      `SELECT a.email, r.id AS rider_id
       FROM riders r
       JOIN profiles p ON p.id = r.profile_id
       JOIN accounts a ON a.id = p.account_id
       WHERE a.email = ANY($1)`,
      [['rider1@yayaeats.com', 'rider2@yayaeats.com', 'rider3@yayaeats.com']],
    );
    const riderPid: Record<string, string> = Object.fromEntries(
      riderRows.map(r => [r.email, r.rider_id]),
    );

    // ── IDs de menu items ─────────────────────────────────────────────────
    const itemRows: { name: string; id: string; price: string; restaurant_id: string }[] =
      await queryRunner.query(
        `SELECT mi.name, mi.id, mi.price, mi.restaurant_id
         FROM menu_items mi
         WHERE mi.restaurant_id IN (
           'b1000000-0000-0000-0000-000000000001',
           'b1000000-0000-0000-0000-000000000002',
           'b1000000-0000-0000-0000-000000000003'
         )`,
      );
    const item = (restId: string, name: string) =>
      itemRows.find(r => r.restaurant_id === restId && r.name === name)!;

    // ── Constantes ────────────────────────────────────────────────────────
    const R = {
      FOGON:  { id: 'b1000000-0000-0000-0000-000000000001', lat: -17.78400, lng: -63.18000, fee: 8.00 },
      CASONA: { id: 'b1000000-0000-0000-0000-000000000002', lat: -17.78200, lng: -63.18400, fee: 5.00 },
      SUSHI:  { id: 'b1000000-0000-0000-0000-000000000003', lat: -17.78600, lng: -63.17800, fee: 10.00 },
    } as const;

    // Direcciones de entrega de cada cliente en Santa Cruz
    const A = {
      ANA:     { text: 'Av. San Martín #234, Equipetrol, Santa Cruz',              lat: -17.77100, lng: -63.19200 },
      CARLOS:  { text: 'Calle Ingavi #234, Barrio Hamacas, Santa Cruz',             lat: -17.77550, lng: -63.17500 },
      SOFIA:   { text: 'Av. Beni #890, Barrio Norte, Santa Cruz',                   lat: -17.76800, lng: -63.18000 },
      MIGUEL:  { text: 'Calle Roca y Coronado #456, Barrio Las Palmas, Santa Cruz', lat: -17.79300, lng: -63.18800 },
      VALERIA: { text: 'Av. Paurito #789, Barrio Sirari, Santa Cruz',               lat: -17.79500, lng: -63.17600 },
    } as const;

    // ── Delivery Groups ───────────────────────────────────────────────────
    type Group = { id: string; rider: string; daysAgo: number };
    const groups: Group[] = [
      { id: 'c1000000-0000-0000-0000-000000000001', rider: 'rider1@yayaeats.com', daysAgo: 7 },
      { id: 'c1000000-0000-0000-0000-000000000002', rider: 'rider2@yayaeats.com', daysAgo: 7 },
      { id: 'c1000000-0000-0000-0000-000000000003', rider: 'rider3@yayaeats.com', daysAgo: 4 },
      { id: 'c1000000-0000-0000-0000-000000000004', rider: 'rider1@yayaeats.com', daysAgo: 2 },
    ];

    for (const g of groups) {
      await queryRunner.query(
        `INSERT INTO delivery_groups (id, rider_id, status, created_at, updated_at)
         VALUES ($1, $2, 'completed',
                 now() - ($3 || ' days')::interval,
                 now() - ($3 || ' days')::interval + interval '1 hour')
         ON CONFLICT (id) DO NOTHING`,
        [g.id, riderPid[g.rider], String(g.daysAgo)],
      );
    }

    // ── Helper: crear pedido + items ──────────────────────────────────────
    type RestDef  = { id: string; lat: number; lng: number; fee: number };
    type AddrDef  = { text: string; lat: number; lng: number };
    type ItemDef  = { name: string; qty: number };

    const insertOrder = async (
      orderId:    string,
      clientEmail: string,
      riderEmail: string,
      rest:       RestDef,
      addr:       AddrDef,
      groupId:    string,
      items:      ItemDef[],
      daysAgo:    number,
      minOffset:  number,   // minutos desde medianoche del día
    ) => {
      const orderItems = items.map(i => ({ ...item(rest.id, i.name), qty: i.qty }));
      const subtotal   = orderItems.reduce((s, i) => s + Number(i.price) * i.qty, 0);
      const total      = subtotal + rest.fee;
      const size       = items.reduce((s, i) => s + i.qty, 0);

      await queryRunner.query(
        `INSERT INTO orders
           (id, client_id, restaurant_id, rider_id, status, delivery_type,
            delivery_address, delivery_lat, delivery_lng,
            total, delivery_fee, group_id, order_size, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'entregado', 'delivery',
                 $5, $6, $7, $8, $9, $10, $11,
                 now() - ($12 || ' days')::interval + ($13 || ' minutes')::interval,
                 now() - ($12 || ' days')::interval + ($13 || ' minutes')::interval + interval '40 minutes')
         ON CONFLICT (id) DO NOTHING`,
        [
          orderId, acc[clientEmail], rest.id, riderPid[riderEmail],
          addr.text, addr.lat, addr.lng,
          total.toFixed(2), rest.fee.toFixed(2), groupId, size,
          String(daysAgo), String(minOffset),
        ],
      );

      for (const oi of orderItems) {
        await queryRunner.query(
          `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
           VALUES ($1, $2, $3, $4)`,
          [orderId, oi.id, oi.qty, oi.price],
        );
      }
    };

    // ── Grupo 1 — rider1 (Diego), hace 7 días ─────────────────────────────
    // Pedido 1: Ana → El Fogón Cruceño
    await insertOrder(
      'd1000000-0000-0000-0000-000000000001',
      'ana.garcia@gmail.com', 'rider1@yayaeats.com',
      R.FOGON, A.ANA, 'c1000000-0000-0000-0000-000000000001',
      [{ name: 'Asado de tira', qty: 1 }, { name: 'Yuca frita', qty: 1 }, { name: 'Tujuré', qty: 2 }],
      7, 720, // 12:00
    );
    // Pedido 2: Carlos → La Casona
    await insertOrder(
      'd1000000-0000-0000-0000-000000000002',
      'carlos.mendez@gmail.com', 'rider1@yayaeats.com',
      R.CASONA, A.CARLOS, 'c1000000-0000-0000-0000-000000000001',
      [{ name: 'Majadito de charque', qty: 1 }, { name: 'Sopa de maní', qty: 1 }, { name: 'Mocochinchi', qty: 1 }],
      7, 740, // 12:20
    );

    // ── Grupo 2 — rider2 (Marco), hace 7 días ─────────────────────────────
    // Pedido 3: Sofía → Sushi Zen
    await insertOrder(
      'd1000000-0000-0000-0000-000000000003',
      'sofia.vargas@gmail.com', 'rider2@yayaeats.com',
      R.SUSHI, A.SOFIA, 'c1000000-0000-0000-0000-000000000002',
      [{ name: 'Philadelphia Roll (8 pzs)', qty: 1 }, { name: 'Dragon Roll (8 pzs)', qty: 1 }, { name: 'Té verde', qty: 2 }],
      7, 1200, // 20:00
    );
    // Pedido 4: Miguel → El Fogón Cruceño
    await insertOrder(
      'd1000000-0000-0000-0000-000000000004',
      'miguel.torrez@gmail.com', 'rider2@yayaeats.com',
      R.FOGON, A.MIGUEL, 'c1000000-0000-0000-0000-000000000002',
      [{ name: 'Costillas al palo', qty: 1 }, { name: 'Ensalada mixta', qty: 2 }, { name: 'Refresco natural', qty: 2 }],
      7, 1220, // 20:20
    );

    // ── Grupo 3 — rider3 (Patricia), hace 4 días ─────────────────────────
    // Pedido 5: Valeria → La Casona
    await insertOrder(
      'd1000000-0000-0000-0000-000000000005',
      'valeria.suarez@gmail.com', 'rider3@yayaeats.com',
      R.CASONA, A.VALERIA, 'c1000000-0000-0000-0000-000000000003',
      [{ name: 'Locro de gallina', qty: 1 }, { name: 'Arroz con leche', qty: 1 }, { name: 'Chicha morada', qty: 2 }],
      4, 780, // 13:00
    );
    // Pedido 6: Ana → Sushi Zen
    await insertOrder(
      'd1000000-0000-0000-0000-000000000006',
      'ana.garcia@gmail.com', 'rider3@yayaeats.com',
      R.SUSHI, A.ANA, 'c1000000-0000-0000-0000-000000000003',
      [{ name: 'Spicy Tuna Roll (8 pzs)', qty: 1 }, { name: 'Salmón Nigiri (2 pzs)', qty: 2 }, { name: 'Agua mineral', qty: 2 }],
      4, 810, // 13:30
    );

    // ── Grupo 4 — rider1 (Diego), hace 2 días ─────────────────────────────
    // Pedido 7: Carlos → El Fogón Cruceño
    await insertOrder(
      'd1000000-0000-0000-0000-000000000007',
      'carlos.mendez@gmail.com', 'rider1@yayaeats.com',
      R.FOGON, A.CARLOS, 'c1000000-0000-0000-0000-000000000004',
      [{ name: 'Asado de tira', qty: 2 }, { name: 'Yuca frita', qty: 2 }, { name: 'Tujuré', qty: 2 }],
      2, 1140, // 19:00
    );
    // Pedido 8: Sofía → La Casona
    await insertOrder(
      'd1000000-0000-0000-0000-000000000008',
      'sofia.vargas@gmail.com', 'rider1@yayaeats.com',
      R.CASONA, A.SOFIA, 'c1000000-0000-0000-0000-000000000004',
      [{ name: 'Majadito de charque', qty: 1 }, { name: 'Locro de gallina', qty: 1 }, { name: 'Mocochinchi', qty: 2 }],
      2, 1165, // 19:25
    );

    // ── Rider Location History ────────────────────────────────────────────
    // Una entrada por entrega: recorrido desde el restaurante hasta el cliente.
    // interval_seconds = 5 → cada punto del path = 5 segundos de recorrido.
    // numSegments × 5 segundos = duración total del trayecto.
    //
    // Distancias aproximadas y tiempos estimados:
    //   Fogón  → Ana (Equipetrol):   ~2.0 km → 12 min → 144 segmentos
    //   Casona → Carlos (Hamacas):   ~1.2 km →  8 min →  96 segmentos
    //   Sushi  → Sofía (Norte):      ~2.0 km → 12 min → 144 segmentos
    //   Fogón  → Miguel (Las Palmas):~1.3 km →  9 min → 108 segmentos
    //   Casona → Valeria (Sirari):   ~1.7 km → 11 min → 132 segmentos
    //   Sushi  → Ana (Equipetrol):   ~2.5 km → 15 min → 180 segmentos
    //   Fogón  → Carlos (Hamacas):   ~1.0 km →  7 min →  84 segmentos
    //   Casona → Sofía (Norte):      ~1.6 km → 10 min → 120 segmentos

    type RouteEntry = {
      rider:       string;
      fromLat:     number; fromLng: number;
      toLat:       number; toLng:   number;
      segments:    number; // numPoints = numSegments (path tiene segments+1 coords)
      daysAgo:     number;
      minOffset:   number; // minutos desde medianoche del día base
    };

    const routes: RouteEntry[] = [
      // Grupo 1 (rider1/Diego, hace 7 días)
      { rider: 'rider1@yayaeats.com', fromLat: R.FOGON.lat,  fromLng: R.FOGON.lng,  toLat: A.ANA.lat,     toLng: A.ANA.lng,     segments: 144, daysAgo: 7, minOffset: 725  },
      { rider: 'rider1@yayaeats.com', fromLat: R.CASONA.lat, fromLng: R.CASONA.lng, toLat: A.CARLOS.lat,  toLng: A.CARLOS.lng,  segments:  96, daysAgo: 7, minOffset: 755  },
      // Grupo 2 (rider2/Marco, hace 7 días)
      { rider: 'rider2@yayaeats.com', fromLat: R.SUSHI.lat,  fromLng: R.SUSHI.lng,  toLat: A.SOFIA.lat,   toLng: A.SOFIA.lng,   segments: 144, daysAgo: 7, minOffset: 1215 },
      { rider: 'rider2@yayaeats.com', fromLat: R.FOGON.lat,  fromLng: R.FOGON.lng,  toLat: A.MIGUEL.lat,  toLng: A.MIGUEL.lng,  segments: 108, daysAgo: 7, minOffset: 1245 },
      // Grupo 3 (rider3/Patricia, hace 4 días)
      { rider: 'rider3@yayaeats.com', fromLat: R.CASONA.lat, fromLng: R.CASONA.lng, toLat: A.VALERIA.lat, toLng: A.VALERIA.lng, segments: 132, daysAgo: 4, minOffset: 790  },
      { rider: 'rider3@yayaeats.com', fromLat: R.SUSHI.lat,  fromLng: R.SUSHI.lng,  toLat: A.ANA.lat,     toLng: A.ANA.lng,     segments: 180, daysAgo: 4, minOffset: 825  },
      // Grupo 4 (rider1/Diego, hace 2 días)
      { rider: 'rider1@yayaeats.com', fromLat: R.FOGON.lat,  fromLng: R.FOGON.lng,  toLat: A.CARLOS.lat,  toLng: A.CARLOS.lng,  segments:  84, daysAgo: 2, minOffset: 1150 },
      { rider: 'rider1@yayaeats.com', fromLat: R.CASONA.lat, fromLng: R.CASONA.lng, toLat: A.SOFIA.lat,   toLng: A.SOFIA.lng,   segments: 120, daysAgo: 2, minOffset: 1175 },
    ];

    for (const r of routes) {
      const path          = buildPath(r.fromLat, r.fromLng, r.toLat, r.toLng, r.segments);
      const durationSec   = r.segments * 5; // interval_seconds = 5

      await queryRunner.query(
        `INSERT INTO rider_location_history
           (rider_id, path, started_at, ended_at, interval_seconds, created_at)
         VALUES (
           $1, $2,
           now() - ($3 || ' days')::interval + ($4 || ' minutes')::interval,
           now() - ($3 || ' days')::interval + ($4 || ' minutes')::interval + ($5 || ' seconds')::interval,
           5,
           now() - ($3 || ' days')::interval + ($4 || ' minutes')::interval
         )`,
        [
          riderPid[r.rider],
          path,
          String(r.daysAgo),
          String(r.minOffset),
          String(durationSec),
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM orders WHERE id LIKE 'd1000000%'`,
    );
    await queryRunner.query(
      `DELETE FROM delivery_groups WHERE id LIKE 'c1000000%'`,
    );
    await queryRunner.query(
      `DELETE FROM rider_location_history
       WHERE rider_id IN (
         SELECT r.id FROM riders r
         JOIN profiles p ON p.id = r.profile_id
         JOIN accounts a ON a.id = p.account_id
         WHERE a.email IN ('rider1@yayaeats.com', 'rider2@yayaeats.com', 'rider3@yayaeats.com')
       )`,
    );
  }
}
