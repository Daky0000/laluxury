import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Plus,
  Calculator,
  PackageCheck,
} from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { dashboardMetrics, revenueSeries, topProducts } from "@/lib/analytics";
import { lowStockItems } from "@/lib/inventory";
import { integrationStatus } from "@/lib/integrations";
import { formatMoney } from "@/lib/money";
import { daysAgo, relativeTime } from "@/lib/utils";
import { Card, Stat, Badge, EmptyState, InfoTooltip } from "@/components/ui";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Dashboard" };

const tableHead =
  "border-b border-[var(--border-subtle)] px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]";

export default async function AdminDashboard() {
  await requirePermission("dashboard:view");

  const [metrics, series, top, lowStock, recentOrders, integrations, attention, settings] = await Promise.all([
    dashboardMetrics(30),
    revenueSeries(30),
    topProducts(30, 5),
    lowStockItems(6),
    db.order.findMany({
      orderBy: { placedAt: "desc" },
      take: 8,
      select: {
        id: true,
        orderNumber: true,
        email: true,
        total: true,
        status: true,
        paymentStatus: true,
        placedAt: true,
        shippingAddress: { select: { firstName: true, lastName: true, city: true } },
      },
    }),
    integrationStatus(),
    Promise.all([
      db.order.count({ where: { status: "PENDING", paymentStatus: "PENDING" } }),
      db.review.count({ where: { isApproved: false } }),
      db.contactMessage.count({ where: { isHandled: false } }),
      db.orderEvent.count({
        where: {
          type: { in: ["payment.after_cancel", "payment.mismatch"] },
          createdAt: { gte: daysAgo(30) },
        },
      }),
      db.preorderRequest.count({
        where: { status: { in: ["NEW", "QUOTED", "SOURCING"] } },
      }),
      db.tradeApplication.count(),
    ]).then(([awaitingPayment, pendingReviews, unreadMessages, paymentFlags, openPreorders, tradePartners]) => ({
      awaitingPayment,
      pendingReviews,
      unreadMessages,
      paymentFlags,
      openPreorders,
      tradePartners,
    })),
    getSettings(),
  ]);

  const hiddenAdminNav = new Set(settings.hiddenAdminNavItems ?? []);

  const todo = [
    {
      label: "Orders to Pack",
      count: metrics.pendingFulfilment,
      href: "/admin/orders?status=PAID",
      tooltip: "Paid orders waiting for warehouse packing & delivery.",
      urgent: metrics.pendingFulfilment > 0,
    },
    {
      label: "Awaiting Payment",
      count: attention.awaitingPayment,
      href: "/admin/orders?status=PENDING",
      tooltip: "Items reserved. Customer has not completed payment yet.",
      urgent: false,
    },
    {
      label: "Pre-Orders",
      count: attention.openPreorders,
      href: "/admin/preorders",
      tooltip: "Custom furniture requests & advance commissions.",
      urgent: attention.openPreorders > 0,
    },
    {
      label: "Unfinished Carts",
      count: metrics.abandonedCarts,
      href: "/admin/carts",
      tooltip: "Carts left behind before payment. Ready for 1-click WhatsApp follow-up.",
      urgent: false,
    },
    {
      label: "Reviews to Check",
      count: attention.pendingReviews,
      href: "/admin/reviews",
      tooltip: "Customer reviews waiting for moderation before appearing on site.",
      urgent: attention.pendingReviews > 0,
    },
    {
      label: "Customer Messages",
      count: attention.unreadMessages,
      href: "/admin/activity",
      tooltip: "Unread inquiries submitted through website contact form.",
      urgent: attention.unreadMessages > 0,
    },
  ].filter((item) => !hiddenAdminNav.has(item.href.split("?")[0]));

  return (
    <div className="flex flex-col gap-5">
      {/* Top Header & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Overview
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Sales, open orders, and store activity today.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/products/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Product</span>
          </Link>
          <Link
            href="/admin/orders/new"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] shadow-xs hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <Calculator className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span>In-Store POS</span>
          </Link>
          <Link
            href="/admin/orders?status=PAID"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] shadow-xs hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <PackageCheck className="h-3.5 w-3.5 text-blue-600" />
            <span>Orders to Pack</span>
            {metrics.pendingFulfilment > 0 ? (
              <span className="rounded-full bg-blue-600 px-1.5 py-0.2 text-[10px] font-bold text-white tabular-nums">
                {metrics.pendingFulfilment}
              </span>
            ) : null}
          </Link>
        </div>
      </div>

      {/* Primary KPI Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Revenue (30d)"
          value={formatMoney(metrics.revenue)}
          tooltip="Total money collected from paid customer orders in the last 30 days."
          delta={
            metrics.revenueChange !== null
              ? {
                  value: `${Math.abs(metrics.revenueChange).toFixed(0)}%`,
                  positive: metrics.revenueChange >= 0,
                }
              : undefined
          }
          hint={`Across ${metrics.orderCount} paid orders`}
        />
        <Stat
          label="Paid Orders"
          value={String(metrics.orderCount)}
          tooltip="Number of completed customer purchases in the last 30 days."
          delta={
            metrics.orderCountChange !== null
              ? {
                  value: `${Math.abs(metrics.orderCountChange).toFixed(0)}%`,
                  positive: metrics.orderCountChange >= 0,
                }
              : undefined
          }
          hint="Completed checkouts"
        />
        <Stat
          label="Avg. Order Spend"
          value={formatMoney(metrics.averageOrderValue)}
          tooltip="Average amount spent each time a customer buys."
          hint="Per paid order"
        />
        <Stat
          label="Ready to Pack"
          value={String(metrics.pendingFulfilment)}
          tooltip="Paid customer orders waiting for warehouse packaging & delivery."
          hint={metrics.pendingFulfilment > 0 ? "Awaiting packing" : "All orders packed"}
        />
      </div>

      {/* Action Items / Needs Attention */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-1.5 mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Needs Attention
          </h3>
          <InfoTooltip content="Action items requiring staff attention or customer follow-up." />
        </div>

        <ul className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {todo.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className={`group block rounded-lg border p-3 transition-colors hover:bg-[var(--surface-sunken)] ${
                  item.urgent
                    ? "border-[var(--accent)] bg-[var(--accent)]/5 shadow-xs"
                    : item.count > 0
                      ? "border-[var(--border-strong)] bg-[var(--surface-raised)]"
                      : "border-[var(--border-subtle)] bg-[var(--surface-raised)]/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--text-secondary)] truncate">
                    {item.label}
                  </span>
                  <InfoTooltip content={item.tooltip} size={12} />
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span
                    className={`font-semibold text-2xl tracking-tight tabular-nums ${
                      item.count > 0 ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                    }`}
                  >
                    {item.count}
                  </span>
                  {item.count > 0 ? (
                    <span className="text-[11px] font-medium text-[var(--accent)] group-hover:underline">
                      View →
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {/* Revenue Chart + Top Selling Items */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Revenue · Last 30 Days</h3>
              <InfoTooltip content="Daily sales volume from confirmed customer orders." />
            </div>
            <span className="text-xs font-semibold tabular-nums text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded-md">
              {formatMoney(metrics.revenue)}
            </span>
          </div>
          <RevenueChart data={series} />
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Top Products</h3>
            <InfoTooltip content="Highest earning items by total sales in the last 30 days." />
          </div>
          {top.length === 0 ? (
            <p className="py-10 text-center text-xs text-[var(--text-muted)]">
              No sales recorded yet this month.
            </p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {top.map((product, index) => (
                <li
                  key={product.title}
                  className="flex items-center gap-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-2 text-xs"
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-[var(--surface-sunken)] text-[11px] font-bold text-[var(--text-primary)] tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">
                    {product.title}
                    <span className="block text-[11px] font-normal text-[var(--text-muted)]">
                      {product.units} {product.units === 1 ? "unit" : "units"} sold
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-[var(--text-primary)]">
                    {formatMoney(product.revenue)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* Recent Orders Table */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent Orders</h3>
            <InfoTooltip content="Latest customer orders placed online or via in-store POS." />
          </div>
          <Link
            href="/admin/orders"
            className="text-xs font-medium text-[var(--accent)] hover:underline"
          >
            All orders →
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="Recent purchases will show up here as customers check out."
          />
        ) : (
          <div
            className="overflow-x-auto overscroll-x-contain"
            tabIndex={0}
            role="region"
            aria-label="Recent orders table"
          >
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr>
                  <th className={tableHead}>Order</th>
                  <th className={tableHead}>Customer</th>
                  <th className={tableHead}>When</th>
                  <th className={tableHead}>Total</th>
                  <th className={tableHead}>
                    <span className="inline-flex items-center gap-1">
                      <span>Status</span>
                      <InfoTooltip content="Order lifecycle: Awaiting Payment → Paid → Processing → Shipped → Delivered" size={11} />
                    </span>
                  </th>
                  <th className={tableHead}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {recentOrders.map((order) => {
                  const address = order.shippingAddress;
                  const who = address
                    ? `${address.firstName} ${address.lastName}`.trim()
                    : order.email || "Customer";

                  return (
                    <tr key={order.id} className="hover:bg-[var(--surface-sunken)]/50 transition-colors">
                      <td className="px-3 py-3 font-semibold text-[var(--accent)]">
                        <Link href={`/admin/orders/${order.id}`} className="hover:underline">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-[var(--text-secondary)]">
                        <span className="font-medium text-[var(--text-primary)]">{who}</span>
                        {address?.city ? (
                          <span className="block text-[11px] text-[var(--text-muted)]">
                            {address.city}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-[var(--text-muted)]">
                        {relativeTime(order.placedAt)}
                      </td>
                      <td className="px-3 py-3 font-medium tabular-nums text-[var(--text-primary)]">
                        {formatMoney(order.total)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={order.status} paymentStatus={order.paymentStatus} />
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] hover:border-[var(--accent)] transition-colors shadow-xs"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Stock Alerts & Connected Integrations */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Low Stock Alerts</h3>
              <InfoTooltip content="Products at or below their reorder threshold that need restocking." />
            </div>
            <Link href="/admin/inventory" className="text-xs font-medium text-[var(--accent)] hover:underline">
              Inventory →
            </Link>
          </div>

          {lowStock.length === 0 ? (
            <div className="flex items-center gap-2 py-6 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden />
              <span>All inventory levels are healthy. Nothing needs restocking.</span>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)] text-xs">
              {lowStock.map((item) => (
                <li key={item.inventoryItemId} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[var(--text-primary)]">
                      {item.productTitle}
                    </span>
                    <span className="block font-mono text-[11px] text-[var(--text-muted)]">
                      SKU: {item.sku}
                    </span>
                  </div>
                  <Badge tone={item.available <= 0 ? "danger" : "warning"}>
                    {item.available <= 0 ? "Out of stock" : `${item.available} left`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Integrations</h3>
              <InfoTooltip content="Connected payment gateways, SMS providers, and storage services." />
            </div>
            <Link href="/admin/settings" className="text-xs font-medium text-[var(--accent)] hover:underline">
              Settings →
            </Link>
          </div>

          <ul className="grid gap-2 sm:grid-cols-2 text-xs">
            {integrations.map((i) => (
              <li
                key={i.key}
                className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-2"
              >
                {i.ready ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                ) : (
                  <Circle className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
                )}
                <span className={`truncate font-medium ${i.ready ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
                  {i.label}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({
  status,
  paymentStatus,
}: {
  status: string;
  paymentStatus?: string;
}) {
  switch (status) {
    case "PAID":
      return <Badge tone="info">Paid</Badge>;
    case "PROCESSING":
      return <Badge tone="accent">Processing</Badge>;
    case "SHIPPED":
      return <Badge tone="info">Shipped</Badge>;
    case "DELIVERED":
      return <Badge tone="success">Delivered</Badge>;
    case "CANCELLED":
    case "REFUNDED":
      return <Badge tone="danger">{ORDER_STATUS_LABELS[status as keyof typeof ORDER_STATUS_LABELS] ?? status}</Badge>;
    case "PENDING":
    default:
      if (paymentStatus === "SUCCESS") {
        return <Badge tone="info">Paid</Badge>;
      }
      return <Badge tone="warning">Awaiting Payment</Badge>;
  }
}
