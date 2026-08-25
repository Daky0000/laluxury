import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { dashboardMetrics, revenueSeries, topProducts } from "@/lib/analytics";
import { lowStockItems } from "@/lib/inventory";
import { integrationStatus } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import { formatDate, relativeTime } from "@/lib/utils";
import { Card, Stat, Badge, SectionHeading, EmptyState } from "@/components/ui";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { ORDER_STATUS_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  await requirePermission("dashboard:view");

  const [metrics, series, top, lowStock, recentOrders, integrations] = await Promise.all([
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
        placedAt: true,
      },
    }),
    Promise.resolve(integrationStatus()),
  ]);

  const unready = integrations.filter((i) => !i.ready);

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        eyebrow="Last 30 days"
        title="Dashboard"
        description="Revenue counts paid orders only, so abandoned checkouts never inflate it."
      />

      {/* Setup nudge */}
      {unready.length > 0 ? (
        <Card className="border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <div>
              <p className="text-sm font-medium">
                {unready.length} integration{unready.length === 1 ? "" : "s"} still to configure
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {unready.map((i) => i.label).join(", ")}. Add the keys in your environment, then
                restart.
              </p>
              <Link
                href="/admin/settings"
                className="mt-2 inline-flex items-center gap-1 text-xs underline underline-offset-4"
              >
                Setup guide <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Headline numbers */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Revenue"
          value={formatMoney(metrics.revenue)}
          delta={
            metrics.revenueChange !== null
              ? {
                  value: `${Math.abs(metrics.revenueChange).toFixed(0)}%`,
                  positive: metrics.revenueChange >= 0,
                }
              : undefined
          }
          hint="vs previous 30 days"
        />
        <Stat
          label="Orders"
          value={String(metrics.orderCount)}
          delta={
            metrics.orderCountChange !== null
              ? {
                  value: `${Math.abs(metrics.orderCountChange).toFixed(0)}%`,
                  positive: metrics.orderCountChange >= 0,
                }
              : undefined
          }
          hint="paid"
        />
        <Stat label="Average order" value={formatMoney(metrics.averageOrderValue)} />
        <Stat
          label="To fulfil"
          value={String(metrics.pendingFulfilment)}
          hint={metrics.pendingFulfilment > 0 ? "needs packing" : "all clear"}
        />
      </div>

      {/* Chart + top products */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <h2 className="lx-eyebrow mb-4">Revenue, last 30 days</h2>
          <RevenueChart data={series} />
        </Card>

        <Card className="p-5">
          <h2 className="lx-eyebrow mb-4">Best sellers</h2>
          {top.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">
              No sales in this window yet.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {top.map((product, index) => (
                <li key={product.title} className="flex items-center gap-3">
                  <span className="w-4 text-xs tabular-nums text-[var(--text-muted)]">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{product.title}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {product.units} sold
                    </span>
                  </span>
                  <span className="text-sm tabular-nums">{formatMoney(product.revenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* Orders + stock */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="lx-eyebrow">Recent orders</h2>
            <Link href="/admin/orders" className="text-xs underline underline-offset-4">
              All orders
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <EmptyState title="No orders yet" description="They will appear here as they come in." />
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="flex items-center gap-3 py-2.5 transition-colors hover:bg-[var(--surface-sunken)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs">{order.orderNumber}</span>
                      <span className="block truncate text-xs text-[var(--text-muted)]">
                        {order.email}
                      </span>
                    </span>
                    <StatusBadge status={order.status} />
                    <span className="w-20 text-right text-sm tabular-nums">
                      {formatMoney(order.total)}
                    </span>
                    <span className="hidden w-16 text-right text-xs text-[var(--text-muted)] sm:block">
                      {relativeTime(order.placedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="lx-eyebrow">Low stock</h2>
            <Link href="/admin/inventory" className="text-xs underline underline-offset-4">
              Manage inventory
            </Link>
          </div>

          {lowStock.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Everything is above its reorder point.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {lowStock.map((item) => (
                <li key={item.inventoryItemId} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{item.productTitle}</span>
                    <span className="block font-mono text-xs text-[var(--text-muted)]">
                      {item.sku}
                    </span>
                  </span>
                  <Badge tone={item.available <= 0 ? "danger" : "warning"}>
                    {item.available <= 0 ? "Out of stock" : `${item.available} left`}
                  </Badge>
                  <span className="hidden text-xs text-[var(--text-muted)] sm:block">
                    reorder {item.reorderQuantity || item.reorderPoint * 2}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Integrations */}
      <Card className="p-5">
        <h2 className="lx-eyebrow mb-4">Integrations</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map((integration) => (
            <li key={integration.key} className="flex items-center gap-2 text-sm">
              {integration.ready ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
              )}
              <span className={integration.ready ? "" : "text-[var(--text-muted)]"}>
                {integration.label}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-xs text-[var(--text-muted)]">
        {metrics.customerCount} customers · {metrics.activeProducts} active products ·{" "}
        {metrics.allOrders} orders all time · {metrics.abandonedCarts} carts abandoned this week ·
        as of {formatDate(new Date(), true)}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: keyof typeof ORDER_STATUS_LABELS }) {
  const tone =
    status === "DELIVERED" || status === "SHIPPED"
      ? "success"
      : status === "CANCELLED" || status === "REFUNDED"
        ? "danger"
        : status === "PENDING"
          ? "warning"
          : "info";

  return <Badge tone={tone}>{ORDER_STATUS_LABELS[status]}</Badge>;
}
