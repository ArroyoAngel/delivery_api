import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import TelegramBot from 'node-telegram-bot-api';
import * as QRCode from 'qrcode';
import { OnEvent } from '@nestjs/event-emitter';
import { AiService } from '../ai/ai.service';
import { AiProfileService, UserAiProfile } from '../ai/ai-profile.service';

interface TelegramSession {
  accountId: string;
  firstName: string;
  roles: string[];
  messages: Array<{ role: string; content: string }>;
  location?: { lat: number; lng: number };
  zoneId?: string;
  zoneName?: string;
  /** Menú completo + tarifas cargados en el primer mensaje; se reinyectan en cada turno */
  platformFeesLine?: string;
  /** Perfil aprendido del cliente — se inyecta en cada turno */
  aiProfile?: UserAiProfile;
  /** orderId del pedido en espera de pago — se inyecta en cada turno hasta confirmación */
  pendingOrderId?: string;
}

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private bot: TelegramBot;
  private sessions = new Map<number, TelegramSession>();
  /** Buffer de mensajes pendientes por chat (debounce antes de enviar a la IA) */
  private pendingTexts = new Map<number, string[]>();
  private debounceTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private readonly DEBOUNCE_MS = 0;
  private readonly MAX_MESSAGES = 50;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly aiService: AiService,
    private readonly aiProfileService: AiProfileService,
  ) {}

  onModuleInit() {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN', '');
    if (!token) {
      console.warn('[Telegram] TELEGRAM_BOT_TOKEN no configurado — bot deshabilitado');
      return;
    }
    this.bot = new TelegramBot(token, { polling: true });
    this.bot.on('message', (msg) =>
      this._handleMessage(msg).catch((err) =>
        console.error('[Telegram] Error en mensaje:', err),
      ),
    );
    console.log('[Telegram] Bot iniciado — @yayaeatsbot');
  }

  onModuleDestroy() {
    this.bot?.stopPolling();
  }

  // ── Dispatcher principal ──────────────────────────────────────────────────

  private async _handleMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;

    // Teléfono compartido via botón nativo
    if (msg.contact) {
      await this._handlePhoneContact(chatId, msg.contact, msg.from);
      return;
    }

    // Comando /start
    if (msg.text === '/start') {
      this.sessions.delete(chatId);
      this.dataSource.query(`DELETE FROM telegram_sessions WHERE chat_id = $1`, [chatId]).catch(() => null);
      await this._sendWelcome(chatId);
      return;
    }

    // Ubicación compartida (actual o en tiempo real)
    if (msg.location) {
      await this._handleLocation(chatId, msg.location, msg.from);
      return;
    }

    // Sin sesión → intentar restaurar desde DB antes de pedir teléfono
    if (!this.sessions.has(chatId)) {
      const restored = await this._tryRestoreSession(chatId);
      if (!restored) {
        await this._sendPhoneRequest(chatId);
        return;
      }
    }

    const session = this.sessions.get(chatId)!;

    // Cliente sin zona → pedir ubicación antes de chatear
    if (msg.text && session.roles.includes('client') && !session.zoneId) {
      await this._sendLocationRequest(chatId);
      return;
    }

    // Primera vez en esta sesión (mensajes vacíos) con zona ya guardada → inyectar contexto de zona
    if (msg.text && session.roles.includes('client') && session.zoneId && session.messages.length === 0) {
      session.messages.push({
        role: 'user',
        content: `[Zona de entrega activa: ${session.zoneName}. zoneId=${session.zoneId}. El usuario puede compartir una nueva ubicación para cambiarla.]`,
      });
    }

    // Mensaje normal → acumular y procesar con IA
    if (msg.text) {
      this._scheduleChat(chatId, msg.text);
    }
  }

  // ── Restaurar sesión desde DB (sin pedir teléfono de nuevo) ──────────────

  private async _tryRestoreSession(chatId: number): Promise<boolean> {
    const tgEmail = `tg_${chatId}@yayaeats.local`;
    const rows = await this.dataSource.query(
      `SELECT a.id, a.roles, p.first_name, p.last_zone_id, dz.name AS zone_name
       FROM accounts a
       JOIN profiles p ON p.account_id = a.id
       LEFT JOIN delivery_zones dz ON dz.id = p.last_zone_id AND dz.is_active = true
       WHERE a.email = $1
       LIMIT 1`,
      [tgEmail],
    );

    if (!rows.length) return false;

    // Restaurar historial persistido (últimos MAX_MESSAGES mensajes)
    const sessionRows = await this.dataSource.query(
      `SELECT messages FROM telegram_sessions WHERE chat_id = $1 LIMIT 1`,
      [chatId],
    );
    const messages: Array<{ role: string; content: string }> = sessionRows[0]?.messages ?? [];

    const aiProfile = await this.aiProfileService.getProfile(rows[0].id);

    this.sessions.set(chatId, {
      accountId: rows[0].id,
      firstName: rows[0].first_name || 'Usuario',
      roles: rows[0].roles ?? ['client'],
      messages,
      zoneId: rows[0].last_zone_id ?? undefined,
      zoneName: rows[0].zone_name ?? undefined,
      aiProfile,
    });
    return true;
  }

  // ── Mensajes de bienvenida / autenticación ────────────────────────────────

  private async _sendWelcome(chatId: number) {
    await this.bot.sendMessage(
      chatId,
      '👋 ¡Hola! Soy el asistente de *YaYa Eats*.\n\nPuedo recomendarte platos y hacer pedidos por ti. Para comenzar, comparte tu número de teléfono:',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            [{ text: '📱 Compartir teléfono', request_contact: true }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  }

  private async _sendPhoneRequest(chatId: number) {
    await this.bot.sendMessage(
      chatId,
      'Primero necesito verificar tu número de teléfono:',
      {
        reply_markup: {
          keyboard: [
            [{ text: '📱 Compartir teléfono', request_contact: true }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  }

  // ── Registro / vinculación de cuenta ─────────────────────────────────────

  private async _handlePhoneContact(
    chatId: number,
    contact: TelegramBot.Contact,
    from?: TelegramBot.User,
  ) {
    const phone = contact.phone_number.startsWith('+')
      ? contact.phone_number
      : `+${contact.phone_number}`;

    // Buscar cuenta existente por teléfono en profiles
    const rows = await this.dataSource.query(
      `SELECT a.id, a.roles, p.first_name
       FROM profiles p
       JOIN accounts a ON a.id = p.account_id
       WHERE p.phone = $1
       LIMIT 1`,
      [phone],
    );

    let accountId: string;
    let firstName: string;
    let roles: string[];

    if (rows.length) {
      accountId = rows[0].id;
      firstName = rows[0].first_name || from?.first_name || 'Usuario';
      roles = rows[0].roles ?? ['client'];
    } else {
      const tgEmail = `tg_${chatId}@yayaeats.local`;
      firstName = from?.first_name ?? 'Usuario';
      const lastName = from?.last_name ?? '';
      roles = ['client'];

      const existing = await this.dataSource.query(
        `SELECT id FROM accounts WHERE email = $1 LIMIT 1`,
        [tgEmail],
      );

      if (existing.length) {
        accountId = existing[0].id;
        await this.dataSource.query(
          `UPDATE profiles SET phone = $1 WHERE account_id = $2`,
          [phone, accountId],
        );
      } else {
        const [account] = await this.dataSource.query(
          `INSERT INTO accounts (email, roles) VALUES ($1, $2) RETURNING id`,
          [tgEmail, roles],
        );
        accountId = account.id;
        await this.dataSource.query(
          `INSERT INTO profiles (account_id, first_name, last_name, phone)
           VALUES ($1, $2, $3, $4)`,
          [accountId, firstName, lastName, phone],
        );
      }
    }

    this.sessions.set(chatId, {
      accountId,
      firstName,
      roles,
      messages: [],
    });

    // Pedir ubicación al cliente inmediatamente después del registro
    if (roles.includes('client')) {
      await this._sendLocationRequest(chatId, firstName);
    } else {
      await this.bot.sendMessage(
        chatId,
        `Bienvenido, ${firstName}. ¿En qué puedo ayudarte?`,
        { reply_markup: { remove_keyboard: true } },
      );
    }
  }

  private async _sendLocationRequest(chatId: number, firstName?: string) {
    const greeting = firstName ? `Hola ${firstName}! ` : '';
    await this.bot.sendMessage(
      chatId,
      `${greeting}Para ver los negocios disponibles en tu zona, comparte tu ubicacion:`,
      {
        reply_markup: {
          keyboard: [[{ text: '📍 Compartir ubicacion', request_location: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      },
    );
  }

  // ── Ubicación compartida ──────────────────────────────────────────────────

  private async _handleLocation(
    chatId: number,
    location: TelegramBot.Location,
    _from?: TelegramBot.User,
  ) {
    // Restaurar sesión si no existe
    if (!this.sessions.has(chatId)) {
      const restored = await this._tryRestoreSession(chatId);
      if (!restored) {
        await this._sendPhoneRequest(chatId);
        return;
      }
    }

    const session = this.sessions.get(chatId)!;
    const { latitude: lat, longitude: lng } = location;

    // ── Detectar zona de cobertura ────────────────────────────────────────
    const zone = await this._detectZone(lat, lng);
    if (!zone) {
      await this.bot.sendMessage(
        chatId,
        'Lo sentimos, aun no tenemos cobertura en tu zona. Pronto llegaremos a mas ciudades.',
        { reply_markup: { remove_keyboard: true } },
      );
      return;
    }

    session.location = { lat, lng };
    session.zoneId = zone.id;
    session.zoneName = zone.name;

    // Persistir zona en DB para restaurarla en futuras sesiones
    await this.dataSource.query(
      `UPDATE profiles SET last_zone_id = $1 WHERE account_id = $2`,
      [zone.id, session.accountId],
    );

    // Inyectar la ubicación en el historial como contexto
    const locationMsg =
      `[El usuario compartió su ubicación: lat=${lat}, lng=${lng}. ` +
      `Zona de cobertura: ${zone.name}. ` +
      `Úsala como dirección de entrega al crear el pedido (deliveryLat/deliveryLng). ` +
      `No pidas dirección registrada.]`;
    session.messages.push({ role: 'user', content: locationMsg });

    const midOrder = session.messages.length > 1;
    await this.bot.sendMessage(
      chatId,
      midOrder
        ? `📍 Ubicacion recibida (${zone.name}). Continuo con tu pedido.`
        : `📍 Perfecto, veo que estas en ${zone.name}. Que se te antoja hoy?`,
      { reply_markup: { remove_keyboard: true } },
    );

    if (!this._flushDebounceIfPending(chatId) && midOrder) {
      this._handleChat(chatId, '').catch((err) =>
        console.error('[Telegram] Error en chat (location trigger):', err),
      );
    }
  }

  private async _detectZone(lat: number, lng: number): Promise<{ id: string; name: string } | null> {
    const rows = await this.dataSource.query(
      `SELECT id, name FROM delivery_zones
       WHERE is_active = true
         AND (6371000 * acos(LEAST(1.0,
           cos(radians(center_lat)) * cos(radians($1)) *
           cos(radians($2) - radians(center_lng)) +
           sin(radians(center_lat)) * sin(radians($1))
         ))) <= radius_meters
       ORDER BY (6371000 * acos(LEAST(1.0,
           cos(radians(center_lat)) * cos(radians($1)) *
           cos(radians($2) - radians(center_lng)) +
           sin(radians(center_lat)) * sin(radians($1))
         ))) ASC
       LIMIT 1`,
      [lat, lng],
    );
    return rows[0] ?? null;
  }

  // ── Debounce: acumula mensajes y espera silencio antes de enviar a la IA ──

  private _scheduleChat(chatId: number, text: string) {
    if (!this.pendingTexts.has(chatId)) this.pendingTexts.set(chatId, []);
    this.pendingTexts.get(chatId)!.push(text);

    if (this.debounceTimers.has(chatId)) clearTimeout(this.debounceTimers.get(chatId)!);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(chatId);
      const texts = this.pendingTexts.get(chatId) ?? [];
      this.pendingTexts.delete(chatId);
      if (!texts.length) return;
      this._handleChat(chatId, texts.join('\n')).catch((err) =>
        console.error('[Telegram] Error en chat:', err),
      );
    }, this.DEBOUNCE_MS);

    this.debounceTimers.set(chatId, timer);
  }

  /** Procesa textos pendientes de inmediato. Devuelve true si había algo pendiente. */
  private _flushDebounceIfPending(chatId: number): boolean {
    if (!this.debounceTimers.has(chatId)) return false;
    clearTimeout(this.debounceTimers.get(chatId)!);
    this.debounceTimers.delete(chatId);

    const texts = this.pendingTexts.get(chatId) ?? [];
    this.pendingTexts.delete(chatId);
    if (!texts.length) return false;

    this._handleChat(chatId, texts.join('\n')).catch((err) =>
      console.error('[Telegram] Error en chat (flush):', err),
    );
    return true;
  }

  // ── Persistencia del historial de conversación ───────────────────────────

  private async _persistMessages(chatId: number, session: TelegramSession) {
    const trimmed = session.messages.slice(-this.MAX_MESSAGES);
    session.messages = trimmed;
    // Filtrar mensajes de inyección interna — no deben persistirse ni
    // contaminar sesiones futuras con contexto de pedidos anteriores.
    const toSave = trimmed.filter(
      (m) => !(typeof m.content === 'string' && m.content.startsWith('[Pedido creado:')),
    );
    await this.dataSource.query(
      `INSERT INTO telegram_sessions (chat_id, account_id, messages, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (chat_id) DO UPDATE
         SET messages = $3, updated_at = now()`,
      [chatId, session.accountId, JSON.stringify(toSave)],
    );
  }

  // ── Pre-carga del menú (evita round-trip a la API por search_products) ───

  private async _buildMenuContext(zoneId?: string): Promise<{ full: string; feesLine: string }> {
    // Siempre cargar tarifas, independiente de si hay menú
    const [deliveryFee, expressFee, serviceFee] = await Promise.all([
      this.dataSource.query(`SELECT value FROM system_config WHERE key='delivery_fee' LIMIT 1`),
      this.dataSource.query(`SELECT value FROM system_config WHERE key='express_fee' LIMIT 1`),
      this.dataSource.query(`SELECT value FROM system_config WHERE key='app_service_fee' LIMIT 1`),
    ]);

    const feesLine =
      `TARIFAS DE PLATAFORMA: delivery Bs ${Number(deliveryFee[0]?.value ?? 5).toFixed(2)}, ` +
      `express Bs ${Number(expressFee[0]?.value ?? 5).toFixed(2)}, ` +
      `servicio Bs ${Number(serviceFee[0]?.value ?? 1).toFixed(2)}`;

    // Menú: primero intenta filtrar por zona, si no hay resultados carga todo
    const zoneFilter = zoneId ? `AND (r.zone_id = '${zoneId}' OR r.zone_id IS NULL)` : '';
    const rows = await this.dataSource.query(
      `SELECT mi.id, mi.name, mi.price, r.id AS shop_id, r.name AS shop
       FROM menu_items mi
       JOIN shops r ON r.id = mi.shop_id
       WHERE mi.is_available = true
         AND (mi.stock IS NULL OR mi.stock > 0)
         AND (mi.daily_limit IS NULL OR mi.daily_sold < mi.daily_limit)
         AND r.is_open = true
         ${zoneFilter}
       ORDER BY r.name, mi.name
       LIMIT 60`,
    );

    if (!rows.length) return { full: feesLine, feesLine };

    const lines = rows.map(
      (r: any) => `- ${r.name} | ${r.shop} | Bs ${Number(r.price).toFixed(2)} | itemId:${r.id} | shopId:${r.shop_id}`,
    );
    return {
      full: `MENÚ DISPONIBLE AHORA (nombre | negocio | precio | itemId | shopId):\n${lines.join('\n')}\n\n${feesLine}`,
      feesLine,
    };
  }

  // ── Chat con IA ───────────────────────────────────────────────────────────

  private async _handleChat(chatId: number, text: string) {
    const session = this.sessions.get(chatId)!;
    // text vacío = disparado por ubicación; el mensaje ya está en session.messages
    if (text) session.messages.push({ role: 'user', content: text });

    await this.bot.sendChatAction(chatId, 'typing');

    // Contexto para el cliente: menú completo la primera vez que se carga, solo tarifas después
    let clientContextBlock: string | undefined;
    if (session.roles.includes('client')) {
      if (!session.platformFeesLine) {
        // Primera vez en esta sesión que llega al chat — cargar menú completo + tarifas
        const ctx = await this._buildMenuContext(session.zoneId);
        clientContextBlock = ctx.full;
        // Guardar menú completo (no solo tarifas) para re-inyectarlo en cada turno
        session.platformFeesLine = ctx.full;
      } else {
        clientContextBlock = session.platformFeesLine;
      }
    }

    let reply: string;
    try {
      const userProfileBlock = session.aiProfile
        ? this.aiProfileService.formatForPrompt(session.aiProfile)
        : undefined;

      const result = await this.aiService.chatByRole({
        userId: session.accountId,
        roles: session.roles,
        messages: session.messages as any,
        channel: 'telegram',
        context: { firstName: session.firstName, clientContextBlock, userProfileBlock },
      });
      reply = result.reply;
    } catch (err: any) {
      await this.bot.sendMessage(
        chatId,
        `⚠️ Error al contactar la IA: ${err.message}`,
      );
      session.messages.pop();
      return;
    }

    // Separar __ACTION__ del texto visible
    const actionMatch = reply.match(/__ACTION__:(\{.+\})\s*$/);
    const cleanText = reply.replace(/__ACTION__:\{.+\}\s*$/, '').trim();
    const action = actionMatch ? JSON.parse(actionMatch[1]) : null;

    session.messages.push({ role: 'assistant', content: cleanText });
    // Persistir historial (recortado a MAX_MESSAGES) en background — no bloquea la respuesta
    this._persistMessages(chatId, session).catch(() => null);

    if (cleanText) {
      await this.bot.sendMessage(chatId, cleanText);
    }

    if (action?.type === 'OPEN_PAYMENT') {
      // Rechazar orderId que no sea UUID válido (evita crash en postgres)
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(action.orderId ?? '')) {
        console.warn(`[Telegram] OPEN_PAYMENT con orderId no-UUID: ${action.orderId}`);
        await this.bot.sendMessage(chatId, 'Hubo un problema al crear el pedido. Por favor intenta de nuevo.');
        session.messages.pop();
        return;
      }
      // Validar que el pedido realmente existe en DB (evita alucinaciones de la IA)
      const orderRows = await this.dataSource.query(
        `SELECT id, total, payment_reference FROM orders WHERE id = $1 LIMIT 1`,
        [action.orderId],
      );
      if (!orderRows.length) {
        console.warn(`[Telegram] IA generó OPEN_PAYMENT con orderId falso: ${action.orderId}`);
        await this.bot.sendMessage(
          chatId,
          'Hubo un problema al crear el pedido. Por favor intenta de nuevo.',
        );
        // Limpiar el mensaje inventado del historial
        session.messages.pop();
        return;
      }
      // Usar datos reales del DB (no los de la IA que pueden ser incorrectos)
      action.total = Number(orderRows[0].total);
      action.paymentReference = orderRows[0].payment_reference ?? action.paymentReference;

      // Guardar orderId en sesión para que la IA lo tenga en el próximo turno
      session.pendingOrderId = action.orderId;
      // Inyectar contexto de pedido pendiente en el historial
      session.messages.push({
        role: 'user',
        content: `[Pedido creado: orderId=${action.orderId}. Cuando el usuario diga que pagó, llama check_payment con este orderId. NUNCA pidas el orderId al usuario.]`,
      });
      await this._sendPaymentQr(chatId, action);
    } else if (action?.type === 'PAYMENT_CONFIRMED') {
      // Actualizar perfil aprendido en background antes de limpiar mensajes
      const messagesSnapshot = [...session.messages];
      const profileSnapshot = session.aiProfile ?? {};
      this.aiProfileService
        .updateProfileFromConversation(session.accountId, messagesSnapshot, profileSnapshot)
        .catch(() => null);

      session.messages = [];
      session.location = undefined;
      session.pendingOrderId = undefined;
      this.dataSource.query(
        `DELETE FROM telegram_sessions WHERE chat_id = $1`, [chatId],
      ).catch(() => null);
      await this.bot.sendMessage(
        chatId,
        '🎉 ¡Pago confirmado! Tu pedido está siendo preparado.\n\n¿Algo más en lo que te pueda ayudar?',
      );
    }
  }

  // ── Notificación automática de pago confirmado ───────────────────────────

  @OnEvent('payment.confirmed')
  async onPaymentConfirmed(payload: { orderId: string; clientId: string; total: number }) {
    if (!this.bot) return;

    // Obtener email de la cuenta para saber si es usuario de Telegram
    const rows = await this.dataSource.query(
      `SELECT email FROM accounts WHERE id = $1 LIMIT 1`,
      [payload.clientId],
    );
    if (!rows.length) return;

    const email: string = rows[0].email;
    const match = email.match(/^tg_(-?\d+)@yayaeats\.local$/);
    if (!match) return; // no es cuenta de Telegram

    const chatId = parseInt(match[1], 10);
    await this.bot
      .sendMessage(
        chatId,
        `✅ *¡Pago confirmado!*\n\nTu pedido está siendo preparado. Pronto llegará a tu dirección.\n\nTotal pagado: *Bs ${Number(payload.total).toFixed(2)}*`,
        { parse_mode: 'Markdown' },
      )
      .catch((err) => console.error('[Telegram] Error notificando pago:', err));
  }

  // ── QR de pago ────────────────────────────────────────────────────────────

  private async _sendPaymentQr(chatId: number, action: any) {
    const { paymentReference, total } = action;
    const shopName = action.shopName ?? action.restaurantName ?? 'YaYa Eats';
    if (!paymentReference) {
      console.warn('[Telegram] _sendPaymentQr: paymentReference vacío para orderId=', action.orderId);
      await this.bot.sendMessage(
        chatId,
        `⚠️ No se pudo generar el QR de pago. Por favor, indica al negocio tu pedido (ID: \`${action.orderId ?? '?'}\`) y coordina el pago directamente.`,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const caption =
      `💳 *Pago para ${shopName}*\n` +
      `Total: *Bs ${Number(total).toFixed(2)}*\n\n` +
      `Escanea el QR con tu app bancaria y luego dime *"ya pagué"*.`;

    try {
      const qrBuffer = await QRCode.toBuffer(paymentReference, {
        type: 'png',
        width: 400,
        margin: 2,
      });
      await this.bot.sendPhoto(chatId, qrBuffer, {
        caption,
        parse_mode: 'Markdown',
      });
    } catch {
      await this.bot.sendMessage(
        chatId,
        `${caption}\n\nReferencia: \`${paymentReference}\``,
        { parse_mode: 'Markdown' },
      );
    }
  }
}
