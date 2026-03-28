import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { CreditPackageEntity } from './entities/credit-package.entity';
import { CreditPurchaseEntity } from './entities/credit-purchase.entity';
import { SystemConfigService } from '../system-config/system-config.service';
import { BnbService } from '../bnb/bnb.service';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(
    @InjectRepository(CreditPackageEntity)
    private packages: Repository<CreditPackageEntity>,
    @InjectRepository(CreditPurchaseEntity)
    private purchases: Repository<CreditPurchaseEntity>,
    private dataSource: DataSource,
    private cfg: SystemConfigService,
    private bnb: BnbService,
    private events: EventsGateway,
  ) {}

  private async resolveRiderId(accountId: string): Promise<string | null> {
    const [row] = await this.dataSource.query(
      `SELECT r.id FROM riders r
       JOIN profiles p ON p.id = r.profile_id
       WHERE p.account_id = $1`,
      [accountId],
    );
    return row?.id ?? null;
  }

  /** Genera el string que se codifica en el QR estático del paquete (fallback sin BNB). */
  private async buildQrData(price: number): Promise<string> {
    const [account, holder, bank] = await Promise.all([
      this.cfg.get('platform_bank_account_number'),
      this.cfg.get('platform_bank_account_holder'),
      this.cfg.get('platform_bank_name'),
    ]);
    return [
      `Banco: ${bank ?? 'BNB'}`,
      `Titular: ${holder ?? 'YaYa Eats'}`,
      `Cuenta: ${account ?? ''}`,
      `Monto: Bs ${Number(price).toFixed(2)}`,
      `Glosa: tu código de repartidor`,
    ].join('\n');
  }

  // ── Paquetes ──────────────────────────────────────────────────────────────

  async listPackages(onlyActive = true) {
    return this.packages.find({
      where: onlyActive ? { isActive: true } : {},
      order: { sortOrder: 'ASC', price: 'ASC' },
    });
  }

  async createPackage(dto: {
    name: string;
    credits: number;
    bonusCredits?: number;
    price: number;
    sortOrder?: number;
  }) {
    const pkg = this.packages.create({
      name: dto.name,
      credits: dto.credits,
      bonusCredits: dto.bonusCredits ?? 0,
      price: dto.price,
      sortOrder: dto.sortOrder ?? 0,
      qrData: await this.buildQrData(dto.price),
    });
    return this.packages.save(pkg);
  }

  async updatePackage(
    id: string,
    dto: Partial<{ name: string; credits: number; bonusCredits: number; price: number; isActive: boolean; sortOrder: number }>,
  ) {
    const pkg = await this.packages.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException('Paquete no encontrado');
    Object.assign(pkg, dto);
    if (dto.price !== undefined) {
      pkg.qrData = await this.buildQrData(dto.price);
    }
    return this.packages.save(pkg);
  }

  async refreshAllQrData() {
    const all = await this.packages.find();
    for (const pkg of all) {
      pkg.qrData = await this.buildQrData(Number(pkg.price));
      await this.packages.save(pkg);
    }
    return { updated: all.length };
  }

  // ── Balance ───────────────────────────────────────────────────────────────

  async getMyBalance(accountId: string): Promise<{ balance: number; riderCode: string }> {
    const riderId = await this.resolveRiderId(accountId);
    const riderCode = riderId
      ? `RC-${riderId.replace(/-/g, '').toUpperCase().slice(0, 8)}`
      : '';
    if (!riderId) return { balance: 0, riderCode };
    const [row] = await this.dataSource.query(
      `SELECT COALESCE(balance, 0) AS balance FROM rider_credits WHERE rider_id = $1`,
      [riderId],
    );
    return { balance: Number(row?.balance ?? 0), riderCode };
  }

  // ── Compra (rider confirma → backend genera QR BNB dinámico) ─────────────

  async claimPurchase(accountId: string, packageId: string) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) throw new ForbiddenException('No estás registrado como repartidor');

    // Verificar que no tenga una compra pendiente activa
    const existing = await this.purchases.findOne({
      where: { riderId, status: 'pending' },
    });
    if (existing) {
      throw new ConflictException(
        'Ya tenés una compra pendiente. Cancelala desde tu historial antes de comprar otro paquete.',
      );
    }

    const pkg = await this.packages.findOne({ where: { id: packageId, isActive: true } });
    if (!pkg) throw new NotFoundException('Paquete no disponible');

    const riderCode = `RC-${riderId.replace(/-/g, '').toUpperCase().slice(0, 8)}`;
    const shortId = crypto.randomUUID().replace(/-/g, '').toUpperCase().slice(0, 6);
    const reference = `${riderCode}-${shortId}`;

    // Si hay QR estático configurado, usarlo en lugar de BNB dinámico
    const staticQrUrl = (await this.cfg.get('platform_qr_image_url')) || null;

    let bnbQrId: string | null = null;
    let bnbQrImage: string | null = null;

    if (!staticQrUrl && this.bnb.enabled) {
      try {
        const result = await this.bnb.generateQR({
          amount: Number(pkg.price),
          gloss: riderCode,
          singleUse: true,
        });
        bnbQrId = result.qrId;
        bnbQrImage = result.qrImage;
      } catch (err) {
        this.logger.error('BNB QR generation failed', err);
        // Continuar sin QR BNB — el rider podrá usar transferencia manual
      }
    }

    const purchase = this.purchases.create({
      riderId,
      packageId,
      creditsGranted: pkg.credits + pkg.bonusCredits,
      amountPaid: pkg.price,
      paymentReference: reference,
      status: 'pending',
      bnbQrId,
      bnbQrImage,
    });
    await this.purchases.save(purchase);

    return {
      purchaseId: purchase.id,
      reference,
      bnbQrImage,
      staticQrUrl,
      useBnb: !!bnbQrId,
      packageName: pkg.name,
      amount: Number(pkg.price),
      creditsGranted: purchase.creditsGranted,
    };
  }

  async submitProof(accountId: string, purchaseId: string, proofImageUrl: string) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) throw new ForbiddenException('No estás registrado como repartidor');

    const purchase = await this.purchases.findOne({ where: { id: purchaseId, riderId } });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    if (purchase.status !== 'pending' && purchase.status !== 'rejected') {
      throw new ConflictException('Solo se puede enviar comprobante de compras pendientes o rechazadas');
    }

    await this.purchases.update(purchaseId, {
      proofImageUrl,
      status: 'pending',
      rejectionReason: null,
      cancelledAt: null,
    });
    return { proofImageUrl };
  }

  async cancelPurchase(accountId: string, purchaseId: string) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) throw new ForbiddenException('No estás registrado como repartidor');

    const purchase = await this.purchases.findOne({
      where: { id: purchaseId, riderId },
    });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    if (purchase.status !== 'pending') {
      throw new ConflictException('Solo se pueden cancelar compras pendientes');
    }

    await this.purchases.update(purchase.id, {
      status: 'cancelled',
      cancelledAt: new Date(),
    });

    return { message: 'Compra cancelada' };
  }

  // ── Polling BNB (llamado por CreditPollingService) ────────────────────────

  async processPendingBnbPurchases(): Promise<void> {
    const pending = await this.purchases.find({
      where: { status: 'pending' },
    });

    const withQr = pending.filter((p) => p.bnbQrId);
    if (withQr.length === 0) return;

    for (const purchase of withQr) {
      try {
        const status = await this.bnb.getQRStatus(purchase.bnbQrId!);
        if (status === 2) {
          // Pagado
          await this.confirmCreditPurchase(purchase.paymentReference, true);
        } else if (status === 3 || status === 4) {
          // Expirado o error
          await this.purchases.update(purchase.id, { status: 'expired' });
        }
      } catch (err) {
        this.logger.warn(`Error polling BNB QR ${purchase.bnbQrId}: ${err}`);
      }
    }
  }

  // ── Rechazo (admin) ───────────────────────────────────────────────────────

  async rejectPurchase(reference: string, reason?: string) {
    const purchase = await this.purchases.findOne({ where: { paymentReference: reference } });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    if (purchase.status !== 'pending') {
      throw new ConflictException('Solo se pueden rechazar compras pendientes');
    }
    await this.purchases.update(purchase.id, {
      status: 'rejected',
      cancelledAt: new Date(),
      rejectionReason: reason ?? null,
    });
    this.events.emitCreditRejected(purchase.id, reason);
    return { message: 'Compra rechazada' };
  }

  // ── Confirmación (admin o polling automático) ─────────────────────────────

  async confirmCreditPurchase(reference: string, fromPolling = false) {
    const purchase = await this.purchases.findOne({ where: { paymentReference: reference } });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    if (purchase.status === 'confirmed') return { message: 'Ya confirmado' };
    if (purchase.status === 'cancelled' || purchase.status === 'rejected') throw new ConflictException('Compra cancelada o rechazada');

    await this.purchases.update(purchase.id, { status: 'confirmed' });

    await this.dataSource.query(
      `INSERT INTO rider_credits (id, rider_id, balance)
       VALUES (gen_random_uuid(), $1, $2)
       ON CONFLICT (rider_id) DO UPDATE
         SET balance = rider_credits.balance + $2,
             updated_at = NOW()`,
      [purchase.riderId, purchase.creditsGranted],
    );

    const [credits] = await this.dataSource.query(
      `SELECT balance FROM rider_credits WHERE rider_id = $1`,
      [purchase.riderId],
    );

    const newBalance = Number(credits?.balance ?? 0);

    // Notificar al rider via WebSocket (evento por purchaseId para que el sheet activo lo escuche)
    this.events.emitCreditConfirmed(purchase.id, newBalance);

    return {
      reference,
      creditsAdded: purchase.creditsGranted,
      newBalance,
    };
  }

  // ── Historial ─────────────────────────────────────────────────────────────

  async myPurchaseHistory(accountId: string) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) throw new ForbiddenException('No estás registrado como repartidor');

    return this.dataSource.query(
      `SELECT cp.id, cp.payment_reference, cp.credits_granted, cp.amount_paid,
              cp.status, cp.bnb_qr_image, cp.proof_image_url, cp.rejection_reason, cp.created_at,
              pkg.name AS package_name
       FROM credit_purchases cp
       JOIN credit_packages pkg ON pkg.id = cp.package_id
       WHERE cp.rider_id = $1
       ORDER BY cp.created_at DESC`,
      [riderId],
    );
  }

  async allPurchases() {
    return this.dataSource.query(
      `SELECT cp.*, pkg.name AS package_name,
              p.first_name, p.last_name
       FROM credit_purchases cp
       JOIN credit_packages pkg ON pkg.id = cp.package_id
       JOIN profiles p ON p.id = (
         SELECT profile_id FROM riders WHERE id = cp.rider_id LIMIT 1
       )
       ORDER BY cp.created_at DESC`,
    );
  }

  async getAllRiderBalances() {
    return this.dataSource.query(
      `SELECT r.id AS rider_id,
              p.first_name, p.last_name,
              COALESCE(rc.balance, 0) AS balance
       FROM riders r
       JOIN profiles p ON p.id = r.profile_id
       LEFT JOIN rider_credits rc ON rc.rider_id = r.id
       ORDER BY p.first_name`,
    );
  }
}
