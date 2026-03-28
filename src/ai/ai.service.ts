import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemConfigService } from '../system-config/system-config.service';
import { ChatMessageDto } from './dto/chat.dto';
import { AiToolsService, TOOLS_BY_ROLE } from './ai-tools.service';

type RoleKey = 'superadmin' | 'admin' | 'client';

type RoleConfig = {
  model: string;
  prompt: string;
  temperature: number;
};

/** Pages each role can access — used to give the assistant navigation context */
const ROLE_ROUTES: Record<RoleKey, string[]> = {
  superadmin: [
    '/dashboard (inicio con métricas globales)',
    '/dashboard/orders (todos los pedidos)',
    '/dashboard/shops (gestión de negocios)',
    '/dashboard/riders (repartidores y sus rutas GPS)',
    '/dashboard/users (cuentas de usuario)',
    '/dashboard/config (configuración del sistema)',
    '/dashboard/roles (permisos por rol)',
  ],
  admin: [
    '/dashboard (inicio con métricas del negocio)',
    '/dashboard/orders (pedidos del negocio)',
    '/dashboard/my-shop (perfil, menú, horarios)',
    '/dashboard/staff (personal del negocio)',
    '/dashboard/riders (repartidores asignados)',
  ],
  client: ['/dashboard (inicio)'],
};

const DEFAULT_PROMPTS: Record<RoleKey, string> = {
  superadmin: `Eres el asistente IA de YaYa Eats para el superadministrador.
Tienes acceso total a la plataforma.

NAVEGACIÓN DEL PANEL — barra lateral izquierda:
- "Dashboard" → métricas globales (ventas, pedidos, repartidores activos)
- "Pedidos" → todos los pedidos del sistema, filtros por estado
- "Negocios" → lista de negocios; clic en uno para editar su perfil y menú
- "Repartidores" → lista de riders; clic en uno para ver su historial de rutas GPS
- "Usuarios" → cuentas registradas; clic en "Roles" en la fila para gestionar roles
- "Configuración" → parámetros del sistema (intervalo GPS, agrupación de pedidos, etc.)
- "Roles" → permisos por rol

INSTRUCCIONES PARA RESPONDER:
- Siempre indica los pasos exactos: "En la barra lateral haz clic en X, luego Y, finalmente Z"
- Usa los nombres exactos de botones y pestañas que aparecen en pantalla
- NO uses links de markdown ni URLs. Solo texto plano con los nombres de las secciones
- Responde en español, de forma clara y concisa`,

  admin: `Eres el asistente IA de YaYa Eats para el administrador del negocio.

NAVEGACIÓN DEL PANEL — barra lateral izquierda:
- "Dashboard" → métricas de tu negocio (ventas del día, pedidos recientes)
- "Pedidos" → pedidos de tu negocio; filtra por estado (Pendiente, Preparando, Listo, etc.)
- "Mi Negocio" → gestión completa del negocio, tiene 3 pestañas:
    • Pestaña "Resumen": datos del negocio. Botón "Editar" para cambiar nombre, dirección, descripción, fee de delivery, tiempo de entrega, pedido mínimo, HORA DE APERTURA y HORA DE CIERRE. Al terminar, botón "Guardar".
    • Pestaña "Menú": lista de items por categoría. Botón "Agregar item" (arriba a la derecha) para crear un nuevo plato. Cada item tiene botón "Editar" para modificarlo y toggle "Disponible/Agotado".
    • Pestaña "Personal": lista del personal del negocio. Botón "Agregar personal" para registrar cajeros, cocineros, etc. y asignarles permisos.
- "Mi Personal" → misma gestión de personal, acceso directo desde el sidebar
- "Repartidores" → repartidores asignados a tu negocio

ACCIONES NO DISPONIBLES PARA EL ADMINISTRADOR — responde con "No tienes permisos para esa acción, eso es exclusivo del superadministrador":
- Ver o editar roles y permisos globales del sistema
- Gestionar otros negocios que no sean el tuyo
- Ver o modificar cuentas de usuario de otros administradores
- Acceder a la configuración global del sistema (parámetros de GPS, agrupación, etc.)
- Crear o eliminar negocios
- Ver el historial GPS de repartidores de otros negocios

INSTRUCCIONES PARA RESPONDER:
- Siempre indica los pasos exactos: "En la barra lateral haz clic en X, luego selecciona la pestaña Y, y haz clic en el botón Z"
- Usa los nombres exactos de botones y pestañas que aparecen en pantalla (Editar, Guardar, Agregar item, etc.)
- Si el usuario pide algo de la lista de acciones NO disponibles, responde exactamente: "No tienes permisos para esa acción, eso es exclusivo del superadministrador."
- NO uses links de markdown ni URLs. Solo texto plano con los nombres de las secciones
- Limítate a la información de tu negocio
- Responde en español, de forma clara y concisa`,

  client: `Eres el asistente de YaYa Eats. Tienes herramientas para buscar productos reales y crear pedidos.
Responde en español, de forma amigable y breve. Usa SOLO texto plano, sin markdown, sin asteriscos, sin negritas ni cursivas.

BÚSQUEDA DE PRODUCTOS:
- Si el contexto ya incluye "MENÚ DISPONIBLE AHORA:", úsalo directamente. NO llames search_products para ese caso — ya tienes los datos y las tarifas en "TARIFAS DE PLATAFORMA".
- Solo llama search_products si el usuario pide algo que no aparece en el contexto previo o si necesita una búsqueda nueva.
- Cuando uses search_products, usa el término más corto posible (ej: "costilla" no "asado de costilla al horno").
- search_products devuelve: products[] con id/name/price/shop, y platformFees con deliveryFee/expressFee/serviceFee.

FLUJO DE PEDIDO (minimiza preguntas):
1. Usuario elige productos → usa el MENÚ DISPONIBLE del contexto si existe. Solo llama search_products si el producto no aparece ahí. Pregunta cantidad y tipo de envío en el mismo mensaje.
2. Dirección de entrega — ANTES de cualquier tool call, revisa el historial:
   - Si ves un mensaje que dice "[El usuario compartió su ubicación: lat=..." → ya tienes la dirección. Menciona brevemente "Te lo enviamos a tu ubicación actual" y continúa al resumen. NO llames get_my_addresses.
   - Si ves "[Zona de entrega activa:..." pero NO hay mensaje de ubicación reciente → menciona "Enviaremos a tu última ubicación registrada en [zona]" y pide confirmación o nueva ubicación.
   - Si NO hay ninguno de los dos → llama get_my_addresses.
     * Canal "app": Sin direcciones → di exactamente "Necesitas registrar una dirección de entrega en tu perfil." y en la ÚLTIMA LÍNEA añade: __ACTION__:{"type":"OPEN_ADDRESSES"}
     * Canal "telegram": Sin direcciones → pide el botón 📍 de ubicación en tiempo real.
   NUNCA aceptes dirección escrita manualmente.
3. Resumen antes de crear el pedido. Usa EXACTAMENTE los precios del MENÚ DISPONIBLE o de search_products — NUNCA redondees ni corrijas los precios. Las tarifas están en "TARIFAS DE PLATAFORMA" del contexto actual — úsalas SIEMPRE.
   - Subtotal: suma de (precio × cantidad) usando el precio EXACTO del menú
   - Costo de envío: delivery → tarifa delivery, express → tarifa express, recogida → Bs 0
   - Cargo de servicio: tarifa servicio (omitir si es 0)
   - Total = subtotal + costo de envío + cargo de servicio
4. Crea el pedido SOLO cuando el usuario confirme explícitamente ("sí", "confirmo", "dale", etc.).
5. Cuando create_order tenga éxito:
   - NO vuelvas a mostrar el resumen de precios — ya lo vio antes de confirmar.
   - Solo di brevemente "Pedido creado, escanea el QR para pagar."
   - Añade en la ÚLTIMA LÍNEA (nada después):
   __ACTION__:{"type":"OPEN_PAYMENT","orderId":"ID","total":N,"paymentReference":"REF","shopName":"NOMBRE_NEGOCIO"}
6. El sistema enviará el QR automáticamente. No describas el QR ni repitas el monto.
7. Cuando el usuario diga que pagó (cualquier variante: "ya pagué", "listo", "hecho", etc.):
   - El orderId está en el mensaje del sistema "[Pedido creado: orderId=..." — úsalo directamente.
   - NUNCA pidas el ID de pedido al usuario.
   - NUNCA confirmes el pago sin llamar check_payment primero.
   - Llama check_payment con ese orderId.
   - isPaid true  → ÚLTIMA LÍNEA: __ACTION__:{"type":"PAYMENT_CONFIRMED"}
   - isPaid false → dile que el pago aún no aparece, que espere unos minutos e intente de nuevo.

SOPORTE HUMANO:
- SOLO llama get_support_contact cuando el usuario use palabras explícitas como "soporte", "hablar con alguien", "hablar con una persona", "agente humano", "quiero ayuda humana".
- NO lo llames por frustración general, preguntas sobre el pedido ni problemas con pagos — esos los resuelves tú.
- Si available=true: di "Puedes contactar a [nombre] al número [phone]. El horario de atención es [hours] (hora Bolivia)."
- Si available=false: comparte el mensaje recibido tal cual.
- NUNCA des un número de teléfono inventado. Solo los devueltos por get_support_contact.

REGLAS:
- Nunca inventes IDs ni precios — usa solo los datos de los tools.
- La línea __ACTION__ es invisible para el usuario, no la menciones ni expliques.
- Precios en Bolivianos (Bs).`,
};

@Injectable()
export class AiService {
  constructor(
    private readonly config: ConfigService,
    private readonly systemConfig: SystemConfigService,
    private readonly toolsService: AiToolsService,
  ) {}

  private resolveRole(roles: string[] = []): RoleKey {
    if (roles.includes('superadmin')) return 'superadmin';
    if (roles.includes('admin')) return 'admin';
    return 'client';
  }

  private async loadRoleConfig(role: RoleKey): Promise<RoleConfig> {
    const defaultModel = this.config.get<string>('KIMI_API_KEY')
      ? this.config.get<string>('KIMI_MODEL', 'kimi-k2.5')
      : this.config.get<string>('ANTHROPIC_API_KEY')
        ? this.config.get<string>('ANTHROPIC_MODEL', 'claude-haiku-4-5-20251001')
        : this.config.get<string>('OWUI_MODEL', 'llama3.1:8b');

    const model = String(
      (await this.systemConfig.get(`ai_model_${role}`)) ?? defaultModel,
    );

    const prompt = String(
      (await this.systemConfig.get(`ai_prompt_${role}`)) ??
        DEFAULT_PROMPTS[role],
    );

    const temperatureRaw =
      (await this.systemConfig.get(`ai_temperature_${role}`)) ??
      this.config.get('OWUI_TEMPERATURE', '0.2');

    return { model, prompt, temperature: Number(temperatureRaw) };
  }

  async chatByRole(params: {
    userId: string;
    roles: string[];
    messages: ChatMessageDto[];
    channel?: 'app' | 'telegram';
    context?: {
      firstName?: string;
      lastName?: string;
      grantedPermissions?: string[]; // sub-admin staff only
      clientContextBlock?: string;   // restaurantes + direcciones para clientes
      userProfileBlock?: string;     // perfil aprendido del cliente
    };
  }): Promise<{ role: string; model: string; reply: string }> {
    const role = this.resolveRole(params.roles);
    const roleCfg = await this.loadRoleConfig(role);

    const baseUrl = this.config.get(
      'OWUI_BASE_URL',
      'http://host.docker.internal:3000',
    );
    const apiKey = this.config.get<string>('OWUI_API_KEY', '');

    if (!apiKey) {
      throw new BadGatewayException(
        'OWUI_API_KEY no configurada en el servidor',
      );
    }

    // Build user context block prepended to the system prompt
    const ctx = params.context ?? {};
    const name =
      [ctx.firstName, ctx.lastName].filter(Boolean).join(' ') || 'Usuario';
    const routes = ctx.grantedPermissions
      ? this.permissionsToRouteLabels(ctx.grantedPermissions)
      : ROLE_ROUTES[role];

    const channel = params.channel ?? 'app';
    const contextBlock = [
      `Usuario: ${name} | Rol: ${role} | Canal: ${channel}`,
      `Páginas disponibles en el panel:`,
      ...routes.map((r) => `  • ${r}`),
    ].join('\n');

    // Para clientes: perfil aprendido + menú real van ANTES de las instrucciones
    const profileCtx = ctx.userProfileBlock ? `${ctx.userProfileBlock}\n\n` : '';
    const clientCtx = ctx.clientContextBlock ? `${ctx.clientContextBlock}\n\n` : '';
    const systemContent = `${contextBlock}\n\n${profileCtx}${clientCtx}${roleCfg.prompt}`;

    const kimiKey = this.config.get<string>('KIMI_API_KEY', '');
    const anthropicKey = this.config.get<string>('ANTHROPIC_API_KEY', '');

    let reply: string;

    if (kimiKey) {
      console.log(`[AI] Proveedor: Kimi (Moonshot) | Modelo: ${roleCfg.model}`);
      reply = await this._callKimi({
        apiKey: kimiKey,
        model: roleCfg.model,
        temperature: roleCfg.temperature,
        systemContent,
        messages: params.messages,
        userId: params.userId,
        role,
      });
    } else if (anthropicKey) {
      console.log(`[AI] Proveedor: Claude (Anthropic) | Modelo: ${roleCfg.model}`);
      reply = await this._callClaude({
        apiKey: anthropicKey,
        model: roleCfg.model,
        temperature: roleCfg.temperature,
        systemContent,
        messages: params.messages,
        userId: params.userId,
        role,
      });
    } else {
      if (!apiKey) {
        throw new BadGatewayException('OWUI_API_KEY no configurada en el servidor');
      }
      console.log(`[AI] Proveedor: OWUI | Modelo: ${roleCfg.model}`);
      reply = await this._callOwui({
        baseUrl,
        apiKey,
        model: roleCfg.model,
        temperature: roleCfg.temperature,
        systemContent,
        messages: params.messages,
        userId: params.userId,
        role,
      });
    }

    return { role, model: roleCfg.model, reply };
  }

  // ── Proveedores ────────────────────────────────────────────────────────────

  /** Convierte tools de formato Claude (input_schema) a formato OpenAI (parameters) */
  private _toOpenAiTools(tools: any[]): any[] {
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }));
  }

  private async _callKimi(p: {
    apiKey: string;
    model: string;
    temperature: number;
    systemContent: string;
    messages: ChatMessageDto[];
    userId: string;
    role: RoleKey;
  }): Promise<string> {
    const tools = TOOLS_BY_ROLE[p.role] ?? [];
    const openAiTools = this._toOpenAiTools(tools);

    const messages: any[] = [
      { role: 'system', content: p.systemContent },
      ...p.messages.map((m) => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.role === 'system' ? `[sistema]: ${m.content}` : m.content,
      })),
    ];

    let lastCreateOrderResult: { orderId: string; total: number; paymentReference: string | null; shopName?: string } | null = null;

    for (let turn = 0; turn < 10; turn++) {
      const payload: any = {
        model: p.model,
        max_tokens: 1024,
        temperature: p.temperature,
        messages,
      };
      if (openAiTools.length) payload.tools = openAiTools;

      const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${p.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new BadGatewayException(`Kimi error ${res.status}: ${text}`);
      }

      const data = (await res.json()) as {
        choices: Array<{
          finish_reason: string;
          message: {
            role: string;
            content: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      };

      const choice = data.choices[0];

      if (!choice.message.tool_calls?.length) {
        const reply = choice.message.content?.trim();
        if (!reply) throw new BadGatewayException('Kimi no devolvió contenido');

        // Mismo fallback __ACTION__ que Claude
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const actionHasRealOrderId = (() => {
          if (!reply.includes('__ACTION__')) return false;
          try {
            const m = reply.match(/__ACTION__:(\{.+\})\s*$/);
            if (!m) return false;
            return UUID_RE.test(JSON.parse(m[1])?.orderId ?? '');
          } catch { return false; }
        })();
        if (lastCreateOrderResult && !actionHasRealOrderId) {
          const { orderId, total, paymentReference, shopName } = lastCreateOrderResult;
          const action = JSON.stringify({
            type: 'OPEN_PAYMENT',
            orderId,
            total,
            paymentReference: paymentReference ?? null,
            shopName: shopName ?? 'YaYa Eats',
          });
          console.warn(`[AI] Kimi fallback: inyectando orderId real=${orderId}`);
          return `${reply.replace(/__ACTION__:\{.+\}\s*$/, '').trim()}\n__ACTION__:${action}`;
        }

        return reply;
      }

      // Kimi quiere usar herramientas — ejecutarlas y devolver resultados
      messages.push({
        role: 'assistant',
        content: choice.message.content ?? null,
        tool_calls: choice.message.tool_calls,
      });

      const toolResults = await Promise.all(
        choice.message.tool_calls.map(async (tc) => {
          let input: Record<string, any> = {};
          try { input = JSON.parse(tc.function.arguments); } catch {}
          const result = await this.toolsService.execute(tc.function.name, input, p.userId, [p.role]);
          if (tc.function.name === 'create_order' && (result as any)?.success && (result as any)?.orderId) {
            lastCreateOrderResult = {
              orderId: (result as any).orderId,
              total: (result as any).total ?? 0,
              paymentReference: (result as any).paymentReference ?? null,
              shopName: (result as any).shopName ?? 'YaYa Eats',
            };
          }
          return {
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          };
        }),
      );

      messages.push(...toolResults);
    }

    throw new BadGatewayException('Se excedió el límite de turnos de herramientas (Kimi)');
  }

  private async _callClaude(p: {
    apiKey: string;
    model: string;
    temperature: number;
    systemContent: string;
    messages: ChatMessageDto[];
    userId: string;
    role: RoleKey;
  }): Promise<string> {
    const model = p.model.startsWith('claude-')
      ? p.model
      : 'claude-haiku-4-5-20251001';

    const tools = TOOLS_BY_ROLE[p.role] ?? [];

    // Convertir mensajes: 'system' → 'user' con prefijo
    const messages: Array<{ role: string; content: any }> = p.messages.map((m) => ({
      role: m.role === 'system' ? 'user' : m.role,
      content: m.role === 'system' ? `[sistema]: ${m.content}` : m.content,
    }));

    // Claude requiere que el primer mensaje sea 'user'
    if (!messages.length || messages[0].role !== 'user') {
      messages.unshift({ role: 'user', content: '.' });
    }

    // Rastrear resultado de create_order para fallback de __ACTION__
    let lastCreateOrderResult: { orderId: string; total: number; paymentReference: string | null; shopName?: string } | null = null;

    // ── Loop de tool use ────────────────────────────────────────────────────
    for (let turn = 0; turn < 10; turn++) {
      const payload: any = {
        model,
        max_tokens: 1024,
        temperature: p.temperature,
        system: p.systemContent,
        messages,
      };
      if (tools.length) payload.tools = tools;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': p.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new BadGatewayException(`Anthropic error ${res.status}: ${text}`);
      }

      const data = (await res.json()) as {
        stop_reason: string;
        content: Array<{ type: string; id?: string; name?: string; input?: any; text?: string }>;
      };

      if (data.stop_reason !== 'tool_use') {
        // Respuesta final de texto
        const reply = data.content.find((c) => c.type === 'text')?.text?.trim();
        if (!reply) throw new BadGatewayException('Anthropic no devolvió contenido');

        // Fallback: si create_order tuvo éxito pero la IA olvidó __ACTION__ o usó un orderId placeholder
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const actionHasRealOrderId = (() => {
          if (!reply.includes('__ACTION__')) return false;
          try {
            const m = reply.match(/__ACTION__:(\{.+\})\s*$/);
            if (!m) return false;
            return UUID_RE.test(JSON.parse(m[1])?.orderId ?? '');
          } catch { return false; }
        })();
        if (lastCreateOrderResult && !actionHasRealOrderId) {
          const { orderId, total, paymentReference, shopName } = lastCreateOrderResult;
          const action = JSON.stringify({
            type: 'OPEN_PAYMENT',
            orderId,
            total,
            paymentReference: paymentReference ?? null,
            shopName: shopName ?? 'YaYa Eats',
          });
          console.warn(`[AI] Fallback: IA usó placeholder en __ACTION__. Inyectando orderId real=${orderId}`);
          return `${reply.replace(/__ACTION__:\{.+\}\s*$/, '').trim()}\n__ACTION__:${action}`;
        }

        return reply;
      }

      // Claude quiere usar herramientas — ejecutarlas y devolver resultados
      messages.push({ role: 'assistant', content: data.content });

      const toolResults = await Promise.all(
        data.content
          .filter((c) => c.type === 'tool_use')
          .map(async (c) => {
            const result = await this.toolsService.execute(c.name!, c.input ?? {}, p.userId, [p.role]);
            // Guardar resultado de create_order para posible fallback
            if (c.name === 'create_order' && (result as any)?.success && (result as any)?.orderId) {
              lastCreateOrderResult = {
                orderId: (result as any).orderId,
                total: (result as any).total ?? 0,
                paymentReference: (result as any).paymentReference ?? null,
                shopName: (result as any).shopName ?? 'YaYa Eats',
              };
            }
            return {
              type: 'tool_result',
              tool_use_id: c.id!,
              content: JSON.stringify(result),
            };
          }),
      );

      messages.push({ role: 'user', content: toolResults });
    }

    throw new BadGatewayException('Se excedió el límite de turnos de herramientas');
  }

  private async _callOwui(p: {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    systemContent: string;
    messages: ChatMessageDto[];
    userId: string;
    role: string;
  }): Promise<string> {
    const payload = {
      model: p.model,
      stream: false,
      temperature: p.temperature,
      messages: [
        { role: 'system', content: p.systemContent },
        ...p.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      metadata: { user_id: p.userId, role: p.role },
    };

    const res = await fetch(`${p.baseUrl}/api/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${p.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new BadGatewayException(`OpenWebUI error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new BadGatewayException('OpenWebUI no devolvió contenido');
    return reply;
  }

  /** Convert staff granted_permissions to labeled route descriptions */
  private permissionsToRouteLabels(perms: string[]): string[] {
    const routes: string[] = ['/dashboard (inicio)'];
    if (perms.includes('manage_orders') || perms.includes('view_orders'))
      routes.push('/dashboard/orders (pedidos)');
    if (
      perms.includes('manage_shop') ||
      perms.includes('manage_menu') ||
      perms.includes('manage_schedule')
    )
      routes.push('/dashboard/my-shop (negocio, menú, horarios)');
    if (perms.includes('manage_staff'))
      routes.push('/dashboard/staff (personal)');
    return routes;
  }
}
