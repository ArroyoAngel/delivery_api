import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class PaymentsAdminService {
  constructor(private readonly dataSource: DataSource) {}

  private async resolveShopId(accountId: string): Promise<string | null> {
    const [owner] = await this.dataSource.query(
      `SELECT id FROM shops WHERE owner_account_id = $1 LIMIT 1`,
      [accountId],
    );
    if (owner?.id) return owner.id;

    const [staff] = await this.dataSource.query(
      `SELECT a.shop_id
       FROM admins a
       JOIN profiles p ON p.id = a.profile_id
       WHERE p.account_id = $1
         AND a.shop_id IS NOT NULL
         AND (
           'manage_shop' = ANY(a.granted_permissions)
           OR 'manage_orders' = ANY(a.granted_permissions)
           OR 'view_orders' = ANY(a.granted_permissions)
         )
       LIMIT 1`,
      [accountId],
    );
    return staff?.shop_id ?? null;
  }

  async getSummary() {
    const [summary] = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS total_payments,
         COALESCE(SUM(total_amount), 0)::numeric AS total_amount,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_payments,
         COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed_payments
       FROM payments`,
    );

    const [wallet] = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS total_wallet_entries,
         COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0)::numeric AS credits,
         COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0)::numeric AS debits
       FROM wallet_transactions`,
    );

    const [withdrawals] = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS total_withdrawals,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_withdrawals,
         COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)::numeric AS pending_withdrawals_amount,
         COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0)::numeric AS paid_out_amount
       FROM withdrawal_requests`,
    );

    // ── Ganancias de la plataforma ──────────────────────────────────────────
    const [platform] = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0)::numeric
           AS total_earned,
         COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'
           AND description ILIKE '%comisión%'), 0)::numeric
           AS commission_earned,
         COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'
           AND description ILIKE '%servicio%'), 0)::numeric
           AS fee_earned,
         COALESCE(SUM(amount) FILTER (WHERE status = 'pending_rider'), 0)::numeric
           AS pending_rider_payout
       FROM wallet_transactions
       WHERE owner_type = 'platform'`,
    );

    return {
      ...summary,
      wallet,
      withdrawals,
      platform,
    };
  }

  async getPayments(limit = 100) {
    return this.dataSource.query(
      `SELECT
         p.id,
         p.reference,
         p.scope_type,
         p.status,
         p.subtotal,
         p.delivery_fee,
         p.platform_fee,
         p.total_amount,
         p.bank_provider,
         p.bank_transaction_id,
         p.requested_at,
         p.confirmed_at,
         p.order_id,
         p.group_id,
         a.email AS payer_email
       FROM payments p
       LEFT JOIN accounts a ON a.id = p.payer_account_id
       ORDER BY p.requested_at DESC
       LIMIT $1`,
      [limit],
    );
  }

  async getBankAccounts() {
    return this.dataSource.query(
      `SELECT
         'shop'::text AS owner_type,
         sba.id,
         sba.shop_id AS owner_id,
         r.name AS owner_name,
         sba.bank_name,
         sba.account_holder,
         sba.account_number,
         sba.account_type,
         sba.branch_name,
         sba.is_default,
         sba.created_at,
         sba.updated_at
       FROM shop_bank_accounts sba
       LEFT JOIN shops r ON r.id = sba.shop_id

       UNION ALL

       SELECT
         'rider'::text AS owner_type,
         rba.id,
         rba.rider_id AS owner_id,
         COALESCE(p.first_name || ' ' || p.last_name, a.email) AS owner_name,
         rba.bank_name,
         rba.account_holder,
         rba.account_number,
         rba.account_type,
         rba.branch_name,
         rba.is_default,
         rba.created_at,
         rba.updated_at
       FROM rider_bank_accounts rba
       LEFT JOIN riders r ON r.id = rba.rider_id
       LEFT JOIN profiles p ON p.id = r.profile_id
       LEFT JOIN accounts a ON a.id = p.account_id

       ORDER BY owner_type, owner_name, is_default DESC, created_at DESC`,
    );
  }

  async getWithdrawals(limit = 100) {
    return this.dataSource.query(
      `SELECT
         wr.id,
         wr.owner_type,
         wr.status,
         wr.amount,
         wr.external_transfer_id,
         wr.notes,
         wr.requested_at,
         wr.processed_at,
         wr.shop_id,
         wr.rider_id,
         COALESCE(s.name, p.first_name || ' ' || p.last_name, acc.email) AS owner_name,
         COALESCE(sba.bank_name, rrba.bank_name) AS bank_name,
         COALESCE(sba.account_number, rrba.account_number) AS account_number
       FROM withdrawal_requests wr
       LEFT JOIN shops s ON s.id = wr.shop_id
       LEFT JOIN riders rr ON rr.id = wr.rider_id
       LEFT JOIN profiles p ON p.id = rr.profile_id
       LEFT JOIN accounts acc ON acc.id = p.account_id
       LEFT JOIN shop_bank_accounts sba ON sba.id = wr.shop_bank_account_id
       LEFT JOIN rider_bank_accounts rrba ON rrba.id = wr.rider_bank_account_id
       ORDER BY wr.requested_at DESC
       LIMIT $1`,
      [limit],
    );
  }

  async getMyIncomeSummary(accountId: string) {
    const shopId = await this.resolveShopId(accountId);
    if (!shopId) {
      return {
        shopId: null,
        total_orders: 0,
        gross_sales: '0',
        net_income: '0',
        pending_withdrawals_amount: '0',
      };
    }

    const [income] = await this.dataSource.query(
      `SELECT
         (
           SELECT COUNT(*)::int
           FROM orders o
           WHERE o.shop_id = $1
             AND o.status IN ('confirmado','preparando','listo','en_camino','entregado')
         ) AS total_orders,
         (
           SELECT COALESCE(SUM(COALESCE(NULLIF(o.subtotal, 0), o.total)), 0)::numeric
           FROM orders o
           WHERE o.shop_id = $1
             AND o.status IN ('confirmado','preparando','listo','en_camino','entregado')
         ) AS gross_sales,
         (
           SELECT COALESCE(SUM(wt.amount), 0)::numeric
           FROM wallet_transactions wt
           JOIN orders o ON o.id = wt.order_id
           WHERE o.shop_id = $1
             AND wt.owner_type = 'shop'
             AND wt.entry_type = 'credit'
         ) AS net_income`,
      [shopId],
    );

    const [withdrawalSummary] = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)::numeric AS pending_withdrawals_amount,
         COALESCE(SUM(amount) FILTER (WHERE status IN ('pending','completed')), 0)::numeric AS total_requested
       FROM withdrawal_requests
       WHERE owner_type = 'shop'
         AND shop_id = $1`,
      [shopId],
    );

    const netIncome = Number(income.net_income ?? 0);
    const totalRequested = Number(withdrawalSummary?.total_requested ?? 0);
    const availableBalance = Math.max(0, netIncome - totalRequested);

    return {
      shopId,
      ...income,
      available_balance: availableBalance.toFixed(2),
      pending_withdrawals_amount:
        withdrawalSummary?.pending_withdrawals_amount ?? '0',
    };
  }

  async createWithdrawalRequest(accountId: string, amount: number, bankAccountId: string) {
    const shopId = await this.resolveShopId(accountId);
    if (!shopId) throw new Error('No se encontró el negocio asociado a este usuario');

    // Verificar saldo disponible
    const summary = await this.getMyIncomeSummary(accountId);
    const available = Number((summary as any).available_balance ?? 0);
    if (amount > available) {
      throw new Error(`Saldo insuficiente. Disponible: Bs ${available.toFixed(2)}`);
    }

    // Verificar que la cuenta bancaria pertenece al shop
    const [bankAccount] = await this.dataSource.query(
      `SELECT id FROM shop_bank_accounts WHERE id = $1 AND shop_id = $2`,
      [bankAccountId, shopId],
    );
    if (!bankAccount) throw new Error('Cuenta bancaria no válida');

    const [result] = await this.dataSource.query(
      `INSERT INTO withdrawal_requests
         (owner_type, shop_id, amount, shop_bank_account_id, status, requested_at)
       VALUES ('shop', $1, $2, $3, 'pending', NOW())
       RETURNING id, amount, status, requested_at`,
      [shopId, amount, bankAccountId],
    );
    return result;
  }

  async getMyBankAccounts(accountId: string) {
    const shopId = await this.resolveShopId(accountId);
    if (!shopId) return [];

    return this.dataSource.query(
      `SELECT
         sba.id,
         sba.shop_id,
         r.name AS shop_name,
         sba.bank_name,
         sba.account_holder,
         sba.account_number,
         sba.account_type,
         sba.branch_name,
         sba.is_default,
         sba.created_at,
         sba.updated_at
       FROM shop_bank_accounts sba
       LEFT JOIN shops r ON r.id = sba.shop_id
       WHERE sba.shop_id = $1
       ORDER BY sba.is_default DESC, sba.created_at DESC`,
      [shopId],
    );
  }

  async getMyWithdrawals(accountId: string, limit = 100) {
    const shopId = await this.resolveShopId(accountId);
    if (!shopId) return [];

    return this.dataSource.query(
      `SELECT
         wr.id,
         wr.status,
         wr.amount,
         wr.external_transfer_id,
         wr.notes,
         wr.requested_at,
         wr.processed_at,
         sba.bank_name,
         sba.account_number
       FROM withdrawal_requests wr
       LEFT JOIN shop_bank_accounts sba ON sba.id = wr.shop_bank_account_id
       WHERE wr.owner_type = 'shop'
         AND wr.shop_id = $1
       ORDER BY wr.requested_at DESC
       LIMIT $2`,
      [shopId, limit],
    );
  }

  // ── SA: per-shop views ─────────────────────────────────────────────

  async getShopIncomeSummary(shopId: string) {
    const [income] = await this.dataSource.query(
      `SELECT
         (
           SELECT COUNT(*)::int
           FROM orders o
           WHERE o.shop_id = $1
             AND o.status IN ('confirmado','preparando','listo','en_camino','entregado')
         ) AS total_orders,
         (
           SELECT COALESCE(SUM(COALESCE(NULLIF(o.subtotal, 0), o.total)), 0)::numeric
           FROM orders o
           WHERE o.shop_id = $1
             AND o.status IN ('confirmado','preparando','listo','en_camino','entregado')
         ) AS gross_sales,
         (
           SELECT COALESCE(SUM(wt.amount), 0)::numeric
           FROM wallet_transactions wt
           JOIN orders o ON o.id = wt.order_id
           WHERE o.shop_id = $1
             AND wt.owner_type = 'shop'
             AND wt.entry_type = 'credit'
         ) AS net_income`,
      [shopId],
    );

    const [withdrawalSummary] = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)::numeric AS pending_withdrawals_amount,
         COALESCE(SUM(amount) FILTER (WHERE status IN ('pending','completed')), 0)::numeric AS total_requested
       FROM withdrawal_requests
       WHERE owner_type = 'shop'
         AND shop_id = $1`,
      [shopId],
    );

    const netIncome = Number(income.net_income ?? 0);
    const totalRequested = Number(withdrawalSummary?.total_requested ?? 0);

    return {
      shopId,
      ...income,
      available_balance: Math.max(0, netIncome - totalRequested).toFixed(2),
      pending_withdrawals_amount:
        withdrawalSummary?.pending_withdrawals_amount ?? '0',
    };
  }

  async getShopBankAccounts(shopId: string) {
    return this.dataSource.query(
      `SELECT
         sba.id,
         sba.shop_id,
         r.name AS shop_name,
         sba.bank_name,
         sba.account_holder,
         sba.account_number,
         sba.account_type,
         sba.branch_name,
         sba.is_default,
         sba.created_at,
         sba.updated_at
       FROM shop_bank_accounts sba
       LEFT JOIN shops r ON r.id = sba.shop_id
       WHERE sba.shop_id = $1
       ORDER BY sba.is_default DESC, sba.created_at DESC`,
      [shopId],
    );
  }

  async processWithdrawal(
    withdrawalId: string,
    action: 'completed' | 'rejected',
    externalTransferId?: string,
    notes?: string,
  ) {
    const [wr] = await this.dataSource.query(
      `SELECT id, status, amount, owner_type FROM withdrawal_requests WHERE id = $1`,
      [withdrawalId],
    );
    if (!wr) throw new Error('Solicitud de retiro no encontrada');
    if (wr.status !== 'pending') throw new Error(`La solicitud ya fue procesada (estado: ${wr.status})`);

    const [result] = await this.dataSource.query(
      `UPDATE withdrawal_requests
       SET status = $2,
           external_transfer_id = COALESCE($3, external_transfer_id),
           notes = COALESCE($4, notes),
           processed_at = NOW()
       WHERE id = $1
       RETURNING id, status, amount, processed_at`,
      [withdrawalId, action, externalTransferId ?? null, notes ?? null],
    );

    // Si se aprueba, registrar débito en wallet_transactions
    if (action === 'completed') {
      const [wr2] = await this.dataSource.query(
        `SELECT owner_type, shop_id, rider_id FROM withdrawal_requests WHERE id = $1`,
        [withdrawalId],
      );
      const ownerId = wr2.shop_id ?? wr2.rider_id;
      const ownerType = wr2.owner_type;
      await this.dataSource.query(
        `INSERT INTO wallet_transactions
           (owner_type, owner_id, entry_type, amount, status, description)
         VALUES ($1, $2, 'debit', $3, 'confirmed', 'Retiro procesado')`,
        [ownerType, ownerId, wr.amount],
      );
    }

    return result;
  }

  async getShopWithdrawals(shopId: string, limit = 100) {
    return this.dataSource.query(
      `SELECT
         wr.id,
         wr.status,
         wr.amount,
         wr.external_transfer_id,
         wr.notes,
         wr.requested_at,
         wr.processed_at,
         sba.bank_name,
         sba.account_number
       FROM withdrawal_requests wr
       LEFT JOIN shop_bank_accounts sba ON sba.id = wr.shop_bank_account_id
       WHERE wr.owner_type = 'shop'
         AND wr.shop_id = $1
       ORDER BY wr.requested_at DESC
       LIMIT $2`,
      [shopId, limit],
    );
  }

  // ── Rider: own bank accounts ────────────────────────────────────────────

  private async resolveRiderId(accountId: string): Promise<string | null> {
    const [row] = await this.dataSource.query(
      `SELECT r.id FROM riders r
       JOIN profiles p ON p.id = r.profile_id
       WHERE p.account_id = $1 LIMIT 1`,
      [accountId],
    );
    return row?.id ?? null;
  }

  async getRiderBankAccounts(accountId: string) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) return [];
    return this.dataSource.query(
      `SELECT id, bank_name, account_holder, account_number, account_type,
              branch_name, is_default, created_at
       FROM rider_bank_accounts
       WHERE rider_id = $1 AND is_active = true
       ORDER BY is_default DESC, created_at DESC`,
      [riderId],
    );
  }

  async createRiderBankAccount(
    accountId: string,
    dto: {
      bankName: string;
      accountHolder: string;
      accountNumber: string;
      accountType?: string;
      branchName?: string;
      isDefault?: boolean;
    },
  ) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) throw new Error('Repartidor no encontrado');

    if (dto.isDefault) {
      await this.dataSource.query(
        `UPDATE rider_bank_accounts SET is_default = false WHERE rider_id = $1`,
        [riderId],
      );
    }

    const [result] = await this.dataSource.query(
      `INSERT INTO rider_bank_accounts
         (rider_id, bank_name, account_holder, account_number, account_type, branch_name, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, bank_name, account_holder, account_number, account_type, branch_name, is_default, created_at`,
      [
        riderId,
        dto.bankName,
        dto.accountHolder,
        dto.accountNumber,
        dto.accountType ?? null,
        dto.branchName ?? null,
        dto.isDefault ?? false,
      ],
    );
    return result;
  }

  async deleteRiderBankAccount(accountId: string, bankAccountId: string) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) throw new Error('Repartidor no encontrado');

    const [row] = await this.dataSource.query(
      `SELECT id FROM rider_bank_accounts WHERE id = $1 AND rider_id = $2`,
      [bankAccountId, riderId],
    );
    if (!row) throw new Error('Cuenta bancaria no encontrada');

    await this.dataSource.query(
      `UPDATE rider_bank_accounts SET is_active = false WHERE id = $1`,
      [bankAccountId],
    );
    return { deleted: true };
  }

  // ── Rider: earnings & withdrawals ───────────────────────────────────────────

  async getRiderIncomeSummary(accountId: string) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) {
      return { total_earned: '0', pending_withdrawals_amount: '0', available_balance: '0' };
    }

    // Total ganado = suma de delivery_fee de TODAS las entregas completadas (efectivo + QR)
    const [earned] = await this.dataSource.query(
      `SELECT COALESCE(SUM(delivery_fee), 0) AS total_earned
       FROM orders
       WHERE rider_id = $1 AND status = 'entregado'`,
      [riderId],
    );

    // Disponible = solo pagos QR confirmados que la plataforma retiene para el rider
    const [qr] = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS qr_balance
       FROM wallet_transactions
       WHERE owner_type = 'rider' AND owner_id = $1 AND status = 'confirmed'`,
      [riderId],
    );

    const [pending] = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS pending_withdrawals_amount
       FROM withdrawal_requests
       WHERE owner_type = 'rider' AND rider_id = $1 AND status = 'pending'`,
      [riderId],
    );

    const totalEarned = Number(earned.total_earned ?? 0);
    const qrBalance = Number(qr.qr_balance ?? 0);
    const pendingAmount = Number(pending.pending_withdrawals_amount ?? 0);
    const available = Math.max(0, qrBalance - pendingAmount);
    return {
      total_earned: totalEarned.toFixed(2),
      pending_withdrawals_amount: pendingAmount.toFixed(2),
      available_balance: available.toFixed(2),
    };
  }

  async getRiderWithdrawals(accountId: string, limit = 50) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) return [];

    return this.dataSource.query(
      `SELECT
         wr.id, wr.status, wr.amount, wr.notes, wr.requested_at, wr.processed_at,
         rba.bank_name, rba.account_number
       FROM withdrawal_requests wr
       LEFT JOIN rider_bank_accounts rba ON rba.id = wr.rider_bank_account_id
       WHERE wr.owner_type = 'rider' AND wr.rider_id = $1
       ORDER BY wr.requested_at DESC
       LIMIT $2`,
      [riderId, limit],
    );
  }

  async createRiderWithdrawalRequest(accountId: string, amount: number, bankAccountId: string) {
    const riderId = await this.resolveRiderId(accountId);
    if (!riderId) throw new Error('Repartidor no encontrado');

    const summary = await this.getRiderIncomeSummary(accountId);
    const available = Number(summary.available_balance);
    if (amount <= 0) throw new Error('El monto debe ser mayor a 0');
    if (amount > available) throw new Error(`Saldo insuficiente. Disponible: Bs ${available.toFixed(2)}`);

    const [bankAccount] = await this.dataSource.query(
      `SELECT id FROM rider_bank_accounts WHERE id = $1 AND rider_id = $2 AND is_active = true`,
      [bankAccountId, riderId],
    );
    if (!bankAccount) throw new Error('Cuenta bancaria no válida');

    const [result] = await this.dataSource.query(
      `INSERT INTO withdrawal_requests
         (owner_type, rider_id, amount, rider_bank_account_id, status, requested_at)
       VALUES ('rider', $1, $2, $3, 'pending', NOW())
       RETURNING id, status, amount, requested_at`,
      [riderId, amount, bankAccountId],
    );
    return result;
  }
}
