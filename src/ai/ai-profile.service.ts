import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

export interface UserAiProfile {
  pedidosFrecuentes?: string[];      // ["Majadito - La Casona", "Salteñas"]
  restaurantesFavoritos?: string[];  // ["La Casona"]
  ultimoPedido?: { descripcion: string; fecha: string };
  tendencias?: string;               // "prefiere almuerzo, alto consumo de carbohidratos"
  personalidad?: string;             // "directo, sabe lo que quiere"
  gastoPromedio?: number;            // Bs promedio por pedido
  alergias?: string[];
  notas?: string;
}

@Injectable()
export class AiProfileService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async getProfile(accountId: string): Promise<UserAiProfile> {
    const rows = await this.dataSource.query(
      `SELECT ai_profile FROM profiles WHERE account_id = $1 LIMIT 1`,
      [accountId],
    );
    return (rows[0]?.ai_profile as UserAiProfile) ?? {};
  }

  /** Actualiza el perfil del usuario en base a una conversación completada.
   *  Se llama en background tras PAYMENT_CONFIRMED — no bloquea la respuesta. */
  async updateProfileFromConversation(
    accountId: string,
    messages: Array<{ role: string; content: string }>,
    currentProfile: UserAiProfile,
  ): Promise<void> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY', '');
    if (!apiKey) return; // sin API key no actualizamos

    const today = new Date().toISOString().split('T')[0];
    const conversation = messages
      .filter((m) => !m.content.startsWith('[')) // omitir mensajes internos de sistema
      .map((m) => `${m.role === 'user' ? 'Cliente' : 'Asistente'}: ${m.content}`)
      .join('\n');

    if (!conversation.trim()) return;

    const systemPrompt = `Eres un analizador de conversaciones de delivery.
Extrae información sobre preferencias del cliente a partir de la conversación y devuelve SOLO un JSON válido con el perfil actualizado.
Hoy es ${today}.
Perfil actual: ${JSON.stringify(currentProfile)}

Devuelve ÚNICAMENTE un objeto JSON con estos campos (omite los que no puedas inferir):
{
  "pedidosFrecuentes": string[],     // platos que pide frecuentemente: "Nombre plato - Restaurante"
  "restaurantesFavoritos": string[], // restaurantes donde ha pedido
  "ultimoPedido": { "descripcion": string, "fecha": string },
  "tendencias": string,              // patrones de consumo (horario, tipo comida, etc.)
  "personalidad": string,            // cómo interactúa (directo, indeciso, detallista, etc.)
  "gastoPromedio": number,           // promedio en Bs por pedido
  "alergias": string[],
  "notas": string                    // cualquier dato relevante no categorizado
}
Combina con el perfil actual — no elimines info existente salvo que la nueva contradiga.`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', // siempre Haiku para esto — barato y rápido
          max_tokens: 512,
          temperature: 0,
          system: systemPrompt,
          messages: [{ role: 'user', content: conversation }],
        }),
      });

      const data = await res.json() as any;
      const raw = data?.content?.[0]?.text?.trim() ?? '';

      // Extraer JSON de la respuesta (puede venir envuelto en ```json ... ```)
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return;

      const updated: UserAiProfile = JSON.parse(match[0]);

      await this.dataSource.query(
        `UPDATE profiles SET ai_profile = $1 WHERE account_id = $2`,
        [JSON.stringify(updated), accountId],
      );

      console.log(`[AiProfile] Perfil actualizado para ${accountId}:`, updated);
    } catch (err) {
      console.error('[AiProfile] Error actualizando perfil:', err);
    }
  }

  /** Formatea el perfil como bloque de texto para inyectar en el system prompt. */
  formatForPrompt(profile: UserAiProfile): string {
    if (!Object.keys(profile).length) return '';

    const lines: string[] = ['PERFIL DEL CLIENTE (úsalo para personalizar la experiencia):'];

    if (profile.pedidosFrecuentes?.length)
      lines.push(`- Pide frecuentemente: ${profile.pedidosFrecuentes.join(', ')}`);
    if (profile.restaurantesFavoritos?.length)
      lines.push(`- Restaurantes favoritos: ${profile.restaurantesFavoritos.join(', ')}`);
    if (profile.ultimoPedido)
      lines.push(`- Último pedido: ${profile.ultimoPedido.descripcion} (${profile.ultimoPedido.fecha})`);
    if (profile.tendencias)
      lines.push(`- Tendencias: ${profile.tendencias}`);
    if (profile.personalidad)
      lines.push(`- Estilo: ${profile.personalidad}`);
    if (profile.gastoPromedio)
      lines.push(`- Gasto promedio: Bs ${profile.gastoPromedio}`);
    if (profile.alergias?.length)
      lines.push(`- Alergias/restricciones: ${profile.alergias.join(', ')}`);
    if (profile.notas)
      lines.push(`- Notas: ${profile.notas}`);

    lines.push(
      '',
      'Usa este perfil para:',
      '- Saludar de forma familiar si tiene historial ("¡Hola de nuevo, [nombre]!")',
      '- Sugerir sus favoritos proactivamente',
      '- Personalizar recomendaciones según sus tendencias',
    );

    return lines.join('\n');
  }
}
