import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { AiService } from './ai.service';
import { ChatRequestDto } from './dto/chat.dto';

@ApiTags('AI')
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly authService: AuthService,
  ) {}

  @Post('chat')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chat IA con configuracion por rol desde system_config' })
  async chat(@Request() req, @Body() body: ChatRequestDto) {
    const profile = await this.authService.me(req.user.id).catch(() => null) as any;

    const result = await this.aiService.chatByRole({
      userId: req.user.id,
      roles: req.user.roles ?? [],
      messages: body.messages,
      context: {
        firstName: profile?.firstName,
        lastName: profile?.lastName,
      },
    });

    return {
      role: result.role,
      model: result.model,
      choices: [{ message: { role: 'assistant', content: result.reply } }],
    };
  }
}
