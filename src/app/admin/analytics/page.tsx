import type { Metadata } from "next";
import Link from "next/link";
import { TrendingUp, Wallet, ArrowUpRight, Sparkles } from "lucide-react";
import { ExportLink } from "@/components/admin/export-link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { Card, Badge, SectionHeading, Stat } from "@/components/ui";

export const metadata: Metadata = { title: "Financial & Margin Analytics" };
export const dynamic = "force-dynamic";

export default async function AdminFinancialAnalyticsPage() {
  await requirePermission("dashboard:view");

  const [orders, variants, tradeApps] = await Promise.all([
    db.order.findMany({
      where: { status: { not: "CANCELLED" } },
      include: {
        items: {
          include: {
            variant: { select: { costPrice: true } },
          },
        },
        shippingAddress: true,
        redemptions: {
          include: { discount: { select: { code: true } } },
        },
      },
      orderBy: { placedAt: "desc" },
    }),
    db.variant.findMany({
      where: { isActive: true, product: { status: "ACTIVE" } },
      include: {
        product: { select: { title: true, isPreorder: true } },
      },
      orderBy: { price: "desc" },
    }),
    db.tradeApplication.findMany(),
  ]);

  const tradeEmails = new Set(tradeApps.map((t) => t.email.toLowerCase()));

  let grossContractRevenue = 0;
  let cashCollectedToDate = 0;
  let balanceReceivableTotal = 0;
  let estimatedCogsTotal = 0;

  let inStockRevenue = 0;
  let preorderRevenue = 0;
  let tradeChannelRevenue = 0;

  const receivableOrders: typeof orders = [];

  for (const o of orders) {
    grossContractRevenue += o.total;

    const isTrade =
      tradeEmails.has(o.email.toLowerCase()) ||
      o.redemptions.some((r) => r.discount.code.startsWith("TRADE-"));

    if (isTrade) {
      tradeChannelRevenue += o.total;
    }
    if (o.hasPreorderItems) {
      preorderRevenue += o.total;
    } else {
      inStockRevenue += o.total;
    }

    const isSplitUnpaid = o.depositAmount && o.depositAmount < o.total && !o.balancePaidAt;
    if (isSplitUnpaid && o.depositAmount) {
      cashCollectedToDate += o.depositAmount;
      balanceReceivableTotal += o.total - o.depositAmount;
      receivableOrders.push(o);
    } else if (o.paymentStatus === "SUCCESS") {
      cashCollectedToDate += o.total;
    }

    for (const item of o.items) {
      const unitCost = item.variant?.costPrice ?? Math.round(item.unitPrice * 0.58);
      estimatedCogsTotal += unitCost * item.quantity;
    }
  }

  const grossProfit = Math.max(0, grossContractRevenue - estimatedCogsTotal);
  const grossMarginPercent =
    grossContractRevenue > 0 ? Math.round((grossProfit / grossContractRevenue) * 100) : 42;

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Financial, Profit Margin & Receivables Report"
        description="Executive CFO overview of gross contract revenue, collected cash vs. 50% Pre-Order balances receivable, COGS profit margin, and Trade channel contribution."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ExportLink
              href="/api/admin/export?type=orders"
              label="Export CFO Accounting Ledger (.CSV)"
            />
            <Link
              href="/admin/products/bulk"
              className="inline-flex items-center gap-1.5 rounded-(--radius-card) border border-[var(--border-subtle)] px-3.5 py-2 text-xs font-medium hover:bg-[var(--surface-sunken)]"
            >
              Edit Unit COGS &amp; Prices →
            </Link>
          </div>
        }
      />

      {/* Primary Financial KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Gross Contract Revenue"
          value={formatMoney(grossContractRevenue)}
          hint={`${orders.length} active orders`}
        />
        <Stat
          label="Cash Collected to Date"
          value={formatMoney(cashCollectedToDate)}
          hint="Full orders + 50% deposits"
        />
        <Stat
          label="50% Balances Receivable"
          value={formatMoney(balanceReceivableTotal)}
          hint={`${receivableOrders.length} pre-orders awaiting arrival`}
        />
        <Stat
          label="Estimated Gross Profit"
          value={formatMoney(grossProfit)}
          hint={`${grossMarginPercent}% gross margin after COGS`}
        />
      </div>

      {/* Channel Split Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="lx-eyebrow">In-Stock Showroom Sales</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 font-display text-2xl tabular-nums">{formatMoney(inStockRevenue)}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Immediate dispatch pieces from Accra inventory
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="lx-eyebrow">Pre-Order &amp; Bespoke Commissions</span>
            <Sparkles className="h-4 w-4 text-[var(--accent)]" />
          </div>
          <p className="mt-2 font-display text-2xl tabular-nums">{formatMoney(preorderRevenue)}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Reserved via 50% deposit split or full reservation
          </p>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="lx-eyebrow">Trade &amp; Interior Designer Channel</span>
            <Wallet className="h-4 w-4 text-[var(--accent)]" />
          </div>
          <p className="mt-2 font-display text-2xl tabular-nums">
            {formatMoney(tradeChannelRevenue)}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {tradeApps.length} accredited partner studios (`TRADE-XXXX`)
          </p>
        </Card>
      </div>

      {/* Section 1: 50% Pre-Order Balances Receivable Ledger */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-6 py-4">
          <div>
            <h2 className="text-base font-medium">
              50% Pre-Order Balances Receivable ({receivableOrders.length} Orders)
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Orders where the 50% deposit has been paid and the remaining 50% balance is due upon arrival in Accra.
            </p>
          </div>
        </div>

        {receivableOrders.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--text-muted)]">
            All Pre-Order 50% balances are currently settled. New 50% deposit orders will appear here automatically.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-6 py-3">Order #</th>
                  <th className="px-6 py-3">Client</th>
                  <th className="px-6 py-3">Milestone Stage</th>
                  <th className="px-6 py-3">Contract Total</th>
                  <th className="px-6 py-3">50% Deposit Paid</th>
                  <th className="px-6 py-3">50% Balance Due</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {receivableOrders.map((o) => {
                  const deposit = o.depositAmount ?? Math.round(o.total * 0.5);
                  const balance = o.total - deposit;
                  const clientName = o.shippingAddress
                    ? `${o.shippingAddress.firstName} ${o.shippingAddress.lastName}`
                    : o.email;
                  const cleanPhone = (o.phone ?? o.shippingAddress?.phone ?? "").replace(
                    /[^0-9]/g,
                    "",
                  );

                  return (
                    <tr key={o.id}>
                      <td className="px-6 py-3.5 font-mono font-semibold">
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {o.orderNumber}
                        </Link>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="font-medium">{clientName}</div>
                        <div className="text-xs text-[var(--text-muted)]">{formatDate(o.placedAt)}</div>
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge tone="accent">{o.preorderStage.replace(/_/g, " ")}</Badge>
                      </td>
                      <td className="px-6 py-3.5 tabular-nums">{formatMoney(o.total)}</td>
                      <td className="px-6 py-3.5 tabular-nums text-emerald-600">
                        {formatMoney(deposit)}
                      </td>
                      <td className="px-6 py-3.5 font-semibold tabular-nums text-amber-600">
                        {formatMoney(balance)}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="inline-flex items-center gap-3 text-xs">
                          {cleanPhone ? (
                            <a
                              href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(
                                `Hello ${clientName}, your LaLuxury commission (${o.orderNumber}) is ready for white-glove delivery. Your remaining 50% balance of ${formatMoney(balance)} can be completed at /orders/track.`,
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-emerald-700 hover:underline"
                            >
                              Request Balance on WhatsApp ↗
                            </a>
                          ) : null}
                          <Link
                            href={`/orders/${o.orderNumber}/invoice`}
                            target="_blank"
                            className="text-[var(--accent)] hover:underline"
                          >
                            Invoice ↗
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Section 2: Catalog Unit Margin & COGS Table */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-6 py-4">
          <div>
            <h2 className="text-base font-medium">Catalog SKU Gross Margin Leaderboard</h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Unit retail price vs. landed workshop/freight cost (`costPrice`) and gross margin percentage.
            </p>
          </div>
          <Link
            href="/admin/products/bulk"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
          >
            Update COGS in Bulk Matrix <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
              <tr>
                <th className="px-6 py-3">Piece &amp; Variant</th>
                <th className="px-6 py-3">SKU</th>
                <th className="px-6 py-3">Retail Price</th>
                <th className="px-6 py-3">Unit COGS</th>
                <th className="px-6 py-3">Unit Gross Profit</th>
                <th className="px-6 py-3">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {variants.slice(0, 25).map((v) => {
                const cogs = v.costPrice ?? Math.round(v.price * 0.58);
                const unitProfit = v.price - cogs;
                const marginPct = v.price > 0 ? Math.round((unitProfit / v.price) * 100) : 0;

                return (
                  <tr key={v.id}>
                    <td className="px-6 py-3">
                      <span className="font-medium">{v.product.title}</span>
                      <span className="ml-2 text-xs text-[var(--text-muted)]">{v.title}</span>
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-[var(--text-muted)]">
                      {v.sku}
                    </td>
                    <td className="px-6 py-3 tabular-nums">{formatMoney(v.price)}</td>
                    <td className="px-6 py-3 tabular-nums text-[var(--text-secondary)]">
                      {formatMoney(cogs)}
                    </td>
                    <td className="px-6 py-3 font-medium tabular-nums text-emerald-600">
                      +{formatMoney(unitProfit)}
                    </td>
                    <td className="px-6 py-3">
                      <Badge tone={marginPct >= 40 ? "success" : "warning"}>{marginPct}%</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
