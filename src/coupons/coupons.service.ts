import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CouponEntity } from './entities/coupon.entity';

export interface CouponApplicationResult {
  couponId: string;
  code: string;
  discountAmount: number;
  absorbsCost: string;
  type: string;
}

@Injectable()
export class CouponsService {
  constructor(
    @InjectRepository(CouponEntity)
    private readonly repo: Repository<CouponEntity>,
  ) {}

  /**
   * Valida un cupón y calcula el descuento, sin aplicarlo todavía.
   * @param code Código del cupón
   * @param subtotal Subtotal del pedido (sin delivery ni fees)
   * @param deliveryFee Fee de entrega del pedido
   * @param shopId ID del negocio del pedido
   */
  async validate(
    code: string,
    subtotal: number,
    deliveryFee: number,
    shopId: string,
  ): Promise<CouponApplicationResult> {
    const coupon = await this.repo.findOne({ where: { code: code.toUpperCase() } });
    if (!coupon) throw new NotFoundException('Cupón no encontrado');
    if (!coupon.isActive) throw new BadRequestException('El cupón no está activo');
    if (coupon.expiresAt && coupon.expiresAt < new Date())
      throw new BadRequestException('El cupón ha expirado');
    if (coupon.maxUses !== null && coupon.usesCount >= coupon.maxUses)
      throw new BadRequestException('El cupón ya alcanzó su límite de usos');
    if (coupon.shopId && coupon.shopId !== shopId)
      throw new BadRequestException('El cupón no es válido para este negocio');
    if (coupon.minOrderAmount && subtotal < Number(coupon.minOrderAmount))
      throw new BadRequestException(
        `El pedido mínimo para este cupón es Bs ${Number(coupon.minOrderAmount).toFixed(2)}`,
      );

    let discountAmount = 0;
    const val = Number(coupon.value);
    if (coupon.type === 'product_pct') {
      discountAmount = Math.min(subtotal * (val / 100), subtotal);
    } else if (coupon.type === 'product_fixed') {
      discountAmount = Math.min(val, subtotal);
    } else if (coupon.type === 'delivery_free') {
      discountAmount = deliveryFee;
    }

    discountAmount = Math.round(discountAmount * 100) / 100;

    return {
      couponId: coupon.id,
      code: coupon.code,
      discountAmount,
      absorbsCost: coupon.absorbsCost,
      type: coupon.type,
    };
  }

  /**
   * Incrementa el contador de usos dentro de una transacción existente.
   * Usar SELECT FOR UPDATE para evitar race conditions.
   */
  async incrementUsesInEm(em: EntityManager, couponCode: string): Promise<void> {
    await em.query(
      `UPDATE coupons SET uses_count = uses_count + 1, updated_at = NOW()
       WHERE code = $1`,
      [couponCode],
    );
  }

  // ── CRUD para superadmin ──────────────────────────────────────────────────

  /** SA: puede elegir cualquier tipo y quién absorbe el costo */
  async createAsSuperadmin(
    createdBy: string,
    dto: {
      code: string;
      description?: string;
      type: string;
      value: number;
      absorbsCost?: string;
      minOrderAmount?: number;
      maxUses?: number;
      expiresAt?: string;
      shopId?: string;
    },
  ): Promise<CouponEntity> {
    const coupon = this.repo.create({
      code: dto.code.toUpperCase(),
      description: dto.description,
      type: dto.type,
      value: dto.value,
      absorbsCost: dto.absorbsCost ?? 'platform',
      minOrderAmount: dto.minOrderAmount,
      maxUses: dto.maxUses,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      shopId: dto.shopId,
      createdBy,
    });
    return this.repo.save(coupon);
  }

  /**
   * Admin de negocio: absorbs_cost siempre 'shop', tipos limitados a
   * product_pct y product_fixed (no puede hacer delivery gratis).
   * El shop_id se resuelve desde la cuenta del admin.
   */
  async createAsShopAdmin(
    createdBy: string,
    shopId: string,
    dto: {
      code: string;
      description?: string;
      type: 'product_pct' | 'product_fixed';
      value: number;
      minOrderAmount?: number;
      maxUses?: number;
      expiresAt?: string;
    },
  ): Promise<CouponEntity> {
    if (!['product_pct', 'product_fixed'].includes(dto.type)) {
      throw new BadRequestException(
        'Solo se permiten cupones de tipo product_pct o product_fixed para negocios',
      );
    }
    const coupon = this.repo.create({
      code: dto.code.toUpperCase(),
      description: dto.description,
      type: dto.type,
      value: dto.value,
      absorbsCost: 'shop',   // siempre forzado
      minOrderAmount: dto.minOrderAmount,
      maxUses: dto.maxUses,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      shopId,
      createdBy,
    });
    return this.repo.save(coupon);
  }

  /** SA: todos los cupones */
  findAll(): Promise<CouponEntity[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  /** Admin: solo los cupones de su negocio */
  findByShop(shopId: string): Promise<CouponEntity[]> {
    return this.repo.find({ where: { shopId }, order: { createdAt: 'DESC' } });
  }

  async deactivate(id: string, shopId?: string): Promise<CouponEntity> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Cupón no encontrado');
    if (shopId && c.shopId !== shopId)
      throw new ForbiddenException('No tenés acceso a este cupón');
    c.isActive = false;
    return this.repo.save(c);
  }

  async activate(id: string, shopId?: string): Promise<CouponEntity> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Cupón no encontrado');
    if (shopId && c.shopId !== shopId)
      throw new ForbiddenException('No tenés acceso a este cupón');
    c.isActive = true;
    return this.repo.save(c);
  }
}
