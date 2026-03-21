import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { AiService } from './ai.service';
import { AiContextService } from './ai-context.service';
import { AiProfileService } from './ai-profile.service';
import { ChatRequestDto } from './dto/chat.dto';

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly authService: AuthService,
    private readonly aiContext: AiContextService,
    private readonly aiProfile: AiProfileService,
  ) {}

  @Post('chat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Chat IA con configuracion por rol desde system_config',
  })
  async chat(@Request() req, @Body() body: ChatRequestDto) {
    const profile = (await this.authService
      .me(req.user.id)
      .catch(() => null)) as any;

    const roles: string[] = req.user.roles ?? [];
    const isClient =
      !roles.includes('superadmin') && !roles.includes('admin');

    // Para clientes, inyectar contexto (direcciones + restaurantes) y perfil aprendido
    let clientContextBlock: string | undefined;
    let userProfileBlock: string | undefined;
    if (isClient) {
      try {
        const [ctx, aiProfile] = await Promise.all([
          this.aiContext.getClientContext(req.user.id),
          this.aiProfile.getProfile(req.user.id),
        ]);
        clientContextBlock = this.aiContext.formatForPrompt(ctx);
        userProfileBlock = this.aiProfile.formatForPrompt(aiProfile) || undefined;
      } catch (err) {
        console.error('[AI] Error al obtener contexto del cliente:', err);
      }

      // Si la respuesta contiene PAYMENT_CONFIRMED, actualizar perfil en background
      const lastAssistant = body.messages.findLast?.((m) => m.role === 'assistant');
      if (lastAssistant?.content?.includes('PAYMENT_CONFIRMED')) {
        const profile2 = await this.aiProfile.getProfile(req.user.id).catch(() => ({}));
        this.aiProfile
          .updateProfileFromConversation(req.user.id, body.messages as any, profile2)
          .catch(() => null);
      }
    }

    const result = await this.aiService.chatByRole({
      userId: req.user.id,
      roles,
      messages: body.messages,
      channel: body.channel ?? 'app',
      context: {
        firstName: profile?.firstName,
        lastName: profile?.lastName,
        clientContextBlock,
        userProfileBlock,
      },
    });

    return {
      role: result.role,
      model: result.model,
      choices: [{ message: { role: 'assistant', content: result.reply } }],
    };
  }
}
