import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class PaymentsAdminService {
  constructor(private readonly dataSource: DataSource) {}

  private async resolveRestaurantId(accountId: string): Promise<string | null> {
    const [owner] = await this.dataSource.query(
      `SELECT id FROM restaurants WHERE owner_account_id = $1 LIMIT 1`,
      [accountId],
    );
    if (owner?.id) return owner.id;

    const [staff] = await this.dataSource.query(
      `SELECT a.restaurant_id
       FROM admins a
       JOIN profiles p ON p.id = a.profile_id
       WHERE p.account_id = $1
         AND a.restaurant_id IS NOT NULL
         AND (
           'manage_restaurant' = ANY(a.granted_permissions)
           OR 'manage_orders' = ANY(a.granted_permissions)
           OR 'view_orders' = ANY(a.granted_permissions)
         )
       LIMIT 1`,
      [accountId],
    );
    return staff?.restaurant_id ?? null;
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
         COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)::numeric AS pending_withdrawals_amount
       FROM withdrawal_requests`,
    );

    return {
      ...summary,
      wallet,
      withdrawals,
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
         'restaurant'::text AS owner_type,
         rba.id,
         rba.restaurant_id AS owner_id,
         r.name AS owner_name,
         rba.bank_name,
         rba.account_holder,
         rba.account_number,
         rba.account_type,
         rba.branch_name,
         rba.is_default,
         rba.created_at,
         rba.updated_at
       FROM restaurant_bank_accounts rba
       LEFT JOIN restaurants r ON r.id = rba.restaurant_id

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
         wr.restaurant_id,
         wr.rider_id,
         COALESCE(rest.name, p.first_name || ' ' || p.last_name, acc.email) AS owner_name,
         COALESCE(rba.bank_name, rrba.bank_name) AS bank_name,
         COALESCE(rba.account_number, rrba.account_number) AS account_number
       FROM withdrawal_requests wr
       LEFT JOIN restaurants rest ON rest.id = wr.restaurant_id
       LEFT JOIN riders rr ON rr.id = wr.rider_id
       LEFT JOIN profiles p ON p.id = rr.profile_id
       LEFT JOIN accounts acc ON acc.id = p.account_id
       LEFT JOIN restaurant_bank_accounts rba ON rba.id = wr.restaurant_bank_account_id
       LEFT JOIN rider_bank_accounts rrba ON rrba.id = wr.rider_bank_account_id
       ORDER BY wr.requested_at DESC
       LIMIT $1`,
      [limit],
    );
  }

  async getMyIncomeSummary(accountId: string) {
    const restaurantId = await this.resolveRestaurantId(accountId);
    if (!restaurantId) {
      return {
        restaurantId: null,
        total_orders: 0,
        gross_sales: '0',
        net_income: '0',
        pending_withdrawals_amount: '0',
      };
    }

    const [income] = await this.dataSource.query(
      `SELECT
         COUNT(*) FILTER (WHERE o.status IN ('confirmado','preparando','listo','en_camino','entregado'))::int AS total_orders,
         COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('confirmado','preparando','listo','en_camino','entregado')), 0)::numeric AS gross_sales,
         COALESCE(SUM(wt.amount) FILTER (WHERE wt.owner_type = 'restaurant' AND wt.entry_type = 'credit'), 0)::numeric AS net_income
       FROM orders o
       LEFT JOIN wallet_transactions wt ON wt.order_id = o.id
       WHERE o.restaurant_id = $1`,
      [restaurantId],
    );

    const [pendingWithdrawals] = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS pending_withdrawals_amount
       FROM withdrawal_requests
       WHERE owner_type = 'restaurant'
         AND restaurant_id = $1
         AND status = 'pending'`,
      [restaurantId],
    );

    return {
      restaurantId,
      ...income,
      pending_withdrawals_amount: pendingWithdrawals?.pending_withdrawals_amount ?? '0',
    };
  }

  async getMyBankAccounts(accountId: string) {
    const restaurantId = await this.resolveRestaurantId(accountId);
    if (!restaurantId) return [];

    return this.dataSource.query(
      `SELECT
         rba.id,
         rba.restaurant_id,
         r.name AS restaurant_name,
         rba.bank_name,
         rba.account_holder,
         rba.account_number,
         rba.account_type,
         rba.branch_name,
         rba.is_default,
         rba.created_at,
         rba.updated_at
       FROM restaurant_bank_accounts rba
       LEFT JOIN restaurants r ON r.id = rba.restaurant_id
       WHERE rba.restaurant_id = $1
       ORDER BY rba.is_default DESC, rba.created_at DESC`,
      [restaurantId],
    );
  }

  async getMyWithdrawals(accountId: string, limit = 100) {
    const restaurantId = await this.resolveRestaurantId(accountId);
    if (!restaurantId) return [];

    return this.dataSource.query(
      `SELECT
         wr.id,
         wr.status,
         wr.amount,
         wr.external_transfer_id,
         wr.notes,
         wr.requested_at,
         wr.processed_at,
         rba.bank_name,
         rba.account_number
       FROM withdrawal_requests wr
       LEFT JOIN restaurant_bank_accounts rba ON rba.id = wr.restaurant_bank_account_id
       WHERE wr.owner_type = 'restaurant'
         AND wr.restaurant_id = $1
       ORDER BY wr.requested_at DESC
       LIMIT $2`,
      [restaurantId, limit],
    );
  }

  // ── SA: per-restaurant views ─────────────────────────────────────────────

  async getRestaurantIncomeSummary(restaurantId: string) {
    const [income] = await this.dataSource.query(
      `SELECT
         COUNT(*) FILTER (WHERE o.status IN ('confirmado','preparando','listo','en_camino','entregado'))::int AS total_orders,
         COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('confirmado','preparando','listo','en_camino','entregado')), 0)::numeric AS gross_sales,
         COALESCE(SUM(wt.amount) FILTER (WHERE wt.owner_type = 'restaurant' AND wt.entry_type = 'credit'), 0)::numeric AS net_income
       FROM orders o
       LEFT JOIN wallet_transactions wt ON wt.order_id = o.id
       WHERE o.restaurant_id = $1`,
      [restaurantId],
    );

    const [pending] = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS pending_withdrawals_amount
       FROM withdrawal_requests
       WHERE owner_type = 'restaurant'
         AND restaurant_id = $1
         AND status = 'pending'`,
      [restaurantId],
    );

    return {
      restaurantId,
      ...income,
      pending_withdrawals_amount: pending?.pending_withdrawals_amount ?? '0',
    };
  }

  async getRestaurantBankAccounts(restaurantId: string) {
    return this.dataSource.query(
      `SELECT
         rba.id,
         rba.restaurant_id,
         r.name AS restaurant_name,
         rba.bank_name,
         rba.account_holder,
         rba.account_number,
         rba.account_type,
         rba.branch_name,
         rba.is_default,
         rba.created_at,
         rba.updated_at
       FROM restaurant_bank_accounts rba
       LEFT JOIN restaurants r ON r.id = rba.restaurant_id
       WHERE rba.restaurant_id = $1
       ORDER BY rba.is_default DESC, rba.created_at DESC`,
      [restaurantId],
    );
  }

  async getRestaurantWithdrawals(restaurantId: string, limit = 100) {
    return this.dataSource.query(
      `SELECT
         wr.id,
         wr.status,
         wr.amount,
         wr.external_transfer_id,
         wr.notes,
         wr.requested_at,
         wr.processed_at,
         rba.bank_name,
         rba.account_number
       FROM withdrawal_requests wr
       LEFT JOIN restaurant_bank_accounts rba ON rba.id = wr.restaurant_bank_account_id
       WHERE wr.owner_type = 'restaurant'
         AND wr.restaurant_id = $1
       ORDER BY wr.requested_at DESC
       LIMIT $2`,
      [restaurantId, limit],
    );
  }
}
