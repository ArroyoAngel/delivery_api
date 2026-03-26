import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface BnbToken {
  token: string;
  expiresAt: number; // ms timestamp
}

@Injectable()
export class BnbService {
  private readonly logger = new Logger(BnbService.name);
  private _cachedToken: BnbToken | null = null;

  constructor(private cfg: ConfigService) {}

  get enabled(): boolean {
    return !!(
      this.cfg.get<string>('BNB_ACCOUNT_ID') &&
      this.cfg.get<string>('BNB_AUTHORIZATION_ID')
    );
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  private async getToken(): Promise<string> {
    const now = Date.now();
    if (this._cachedToken && this._cachedToken.expiresAt > now + 30_000) {
      return this._cachedToken.token;
    }

    const authUrl =
      this.cfg.get<string>('BNB_AUTH_URL') ??
      'https://clientauthenticationapiv2.azurewebsites.net/api/v1/auth/token';

    const res = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: this.cfg.get<string>('BNB_ACCOUNT_ID'),
        authorizationId: this.cfg.get<string>('BNB_AUTHORIZATION_ID'),
      }),
    });

    if (!res.ok) throw new Error(`BNB auth failed: ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;

    // BNB returns the token in the `message` field
    const token = data?.message as string;
    if (!token) throw new Error('BNB auth failed: no token in response');

    // BNB tokens last 15 min; cache for 12 min to be safe
    this._cachedToken = { token, expiresAt: now + 12 * 60 * 1000 };
    return token;
  }

  // ── QR Generation ───────────────────────────────────────────────────────────

  /**
   * Genera un QR único para el monto dado.
   * Devuelve { qrId, qrImage (Base64) }.
   */
  async generateQR(params: {
    amount: number;
    gloss: string;
    currency?: string;
    singleUse?: boolean;
    expirationDate?: string;
  }): Promise<{ qrId: string; qrImage: string }> {
    const token = await this.getToken();

    const qrUrl =
      this.cfg.get<string>('BNB_QR_URL') ??
      'https://qrsimpleapiv2.azurewebsites.net/api/v1/main/getQRWithImageAsync';

    // Vencimiento por defecto: 3 días
    const expiration =
      params.expirationDate ??
      new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const res = await fetch(qrUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        currency: params.currency ?? 'BOB',
        gloss: params.gloss,
        amount: params.amount,
        expirationDate: expiration,
        singleUse: params.singleUse ?? true,
      }),
    });

    if (!res.ok) throw new Error(`BNB QR generation failed: ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;

    const qrId = (data?.qrId ?? data?.id) as string;
    const qrImage = (data?.qrImage ?? data?.image) as string;

    if (!qrId || !qrImage) {
      throw new Error('BNB QR generation failed: missing qrId or qrImage');
    }

    return { qrId, qrImage };
  }

  // ── Status ───────────────────────────────────────────────────────────────────

  /**
   * Estado del QR:
   *   1 = sin usar (esperando pago)
   *   2 = usado (pagado)
   *   3 = expirado
   *   4 = error
   */
  async getQRStatus(qrId: string): Promise<number> {
    const token = await this.getToken();

    const baseUrl =
      this.cfg.get<string>('BNB_QR_BASE_URL') ??
      'https://qrsimpleapiv2.azurewebsites.net/api/v1/main';

    const res = await fetch(`${baseUrl}/getQRStatusAsync?qrId=${encodeURIComponent(qrId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`BNB status check failed: ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;

    return (data?.qrId ?? data?.status ?? 1) as number;
  }
}
