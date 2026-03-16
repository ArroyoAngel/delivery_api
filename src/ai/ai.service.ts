import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SystemConfigService } from '../system-config/system-config.service';
import { ChatMessageDto } from './dto/chat.dto';

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
    '/dashboard/restaurants (gestión de restaurantes)',
    '/dashboard/riders (repartidores y sus rutas GPS)',
    '/dashboard/users (cuentas de usuario)',
    '/dashboard/config (configuración del sistema)',
    '/dashboard/roles (permisos por rol)',
  ],
  admin: [
    '/dashboard (inicio con métricas del restaurante)',
    '/dashboard/orders (pedidos del restaurante)',
    '/dashboard/my-restaurant (perfil, menú, horarios)',
    '/dashboard/staff (personal del restaurante)',
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
- "Restaurantes" → lista de restaurantes; clic en uno para editar su perfil y menú
- "Repartidores" → lista de riders; clic en uno para ver su historial de rutas GPS
- "Usuarios" → cuentas registradas; clic en "Roles" en la fila para gestionar roles
- "Configuración" → parámetros del sistema (intervalo GPS, agrupación de pedidos, etc.)
- "Roles" → permisos por rol

INSTRUCCIONES PARA RESPONDER:
- Siempre indica los pasos exactos: "En la barra lateral haz clic en X, luego Y, finalmente Z"
- Usa los nombres exactos de botones y pestañas que aparecen en pantalla
- NO uses links de markdown ni URLs. Solo texto plano con los nombres de las secciones
- Responde en español, de forma clara y concisa`,

  admin: `Eres el asistente IA de YaYa Eats para el administrador del restaurante.

NAVEGACIÓN DEL PANEL — barra lateral izquierda:
- "Dashboard" → métricas de tu restaurante (ventas del día, pedidos recientes)
- "Pedidos" → pedidos de tu restaurante; filtra por estado (Pendiente, Preparando, Listo, etc.)
- "Mi Restaurante" → gestión completa del restaurante, tiene 3 pestañas:
    • Pestaña "Resumen": datos del restaurante. Botón "Editar" para cambiar nombre, dirección, descripción, fee de delivery, tiempo de entrega, pedido mínimo, HORA DE APERTURA y HORA DE CIERRE. Al terminar, botón "Guardar".
    • Pestaña "Menú": lista de items por categoría. Botón "Agregar item" (arriba a la derecha) para crear un nuevo plato. Cada item tiene botón "Editar" para modificarlo y toggle "Disponible/Agotado".
    • Pestaña "Personal": lista del personal del restaurante. Botón "Agregar personal" para registrar cajeros, cocineros, etc. y asignarles permisos.
- "Mi Personal" → misma gestión de personal, acceso directo desde el sidebar
- "Repartidores" → repartidores asignados a tu restaurante

ACCIONES NO DISPONIBLES PARA EL ADMINISTRADOR — responde con "No tienes permisos para esa acción, eso es exclusivo del superadministrador":
- Ver o editar roles y permisos globales del sistema
- Gestionar otros restaurantes que no sean el tuyo
- Ver o modificar cuentas de usuario de otros administradores
- Acceder a la configuración global del sistema (parámetros de GPS, agrupación, etc.)
- Crear o eliminar restaurantes
- Ver el historial GPS de repartidores de otros restaurantes

INSTRUCCIONES PARA RESPONDER:
- Siempre indica los pasos exactos: "En la barra lateral haz clic en X, luego selecciona la pestaña Y, y haz clic en el botón Z"
- Usa los nombres exactos de botones y pestañas que aparecen en pantalla (Editar, Guardar, Agregar item, etc.)
- Si el usuario pide algo de la lista de acciones NO disponibles, responde exactamente: "No tienes permisos para esa acción, eso es exclusivo del superadministrador."
- NO uses links de markdown ni URLs. Solo texto plano con los nombres de las secciones
- Limítate a la información de tu restaurante
- Responde en español, de forma clara y concisa`,

  client: `Eres el asistente IA de YaYa Eats. Responde en español de forma clara y breve.`,
};

@Injectable()
export class AiService {
  constructor(
    private readonly config: ConfigService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  private resolveRole(roles: string[] = []): RoleKey {
    if (roles.includes('superadmin')) return 'superadmin';
    if (roles.includes('admin')) return 'admin';
    return 'client';
  }

  private async loadRoleConfig(role: RoleKey): Promise<RoleConfig> {
    const model = String(
      (await this.systemConfig.get(`ai_model_${role}`)) ??
        this.config.get<string>('OWUI_MODEL') ??
        'llama3.1:8b',
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
    context?: {
      firstName?: string;
      lastName?: string;
      grantedPermissions?: string[]; // sub-admin staff only
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

    const contextBlock = [
      `Usuario: ${name} | Rol: ${role}`,
      `Páginas disponibles en el panel:`,
      ...routes.map((r) => `  • ${r}`),
    ].join('\n');

    const systemContent = `${contextBlock}\n\n${roleCfg.prompt}`;

    const payload = {
      model: roleCfg.model,
      stream: false,
      temperature: roleCfg.temperature,
      messages: [
        { role: 'system', content: systemContent },
        ...params.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      metadata: { user_id: params.userId, role },
    };

    const res = await fetch(`${baseUrl}/api/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
    if (!reply) {
      throw new BadGatewayException('OpenWebUI no devolvió contenido');
    }

    return { role, model: roleCfg.model, reply };
  }

  /** Convert staff granted_permissions to labeled route descriptions */
  private permissionsToRouteLabels(perms: string[]): string[] {
    const routes: string[] = ['/dashboard (inicio)'];
    if (perms.includes('manage_orders') || perms.includes('view_orders'))
      routes.push('/dashboard/orders (pedidos)');
    if (
      perms.includes('manage_restaurant') ||
      perms.includes('manage_menu') ||
      perms.includes('manage_schedule')
    )
      routes.push('/dashboard/my-restaurant (restaurante, menú, horarios)');
    if (perms.includes('manage_staff'))
      routes.push('/dashboard/staff (personal)');
    return routes;
  }
}
