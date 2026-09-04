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
import { Card, Stat, Badge, EmptyState } from "@/components/ui";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { ORDER_STATUS_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Dashboard" };

const cardTitle = "text-sm font-semibold";
const tableHead =
  "border-b border-[var(--border-subtle)] px-2 py-2.5 text-left text-sm font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]";

export default async function AdminDashboard() {
  await requirePermission("dashboard:view");

  const [metrics, series, top, lowStock, recentOrders, integrations] = await Promise.all([
    dashboardMetrics(30),
    revenueSeries(30),
    topProducts(30, 5),
    lowStockItems(6),
    db.order.findMany({
      orderBy: { placedAt: "desc" },
      take: 6,
      select: {
        id: true,
        orderNumber: true,
        email: true,
        total: true,
        status: true,
        placedAt: true,
        shippingAddress: { select: { firstName: true, lastName: true, city: true } },
      },
    }),
    Promise.resolve(integrationStatus()),
  ]);

  const unready = integrations.filter((i) => !i.ready);

  return (
    <div className="flex flex-col gap-4.5">
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
      <div className="grid gap-4.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Revenue (30d)"
          value={formatMoney(metrics.revenue)}
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
          hint="Paid in the last 30 days"
        />
        <Stat
          label="Avg order value"
          value={formatMoney(metrics.averageOrderValue)}
          hint="Per paid order"
        />
        <Stat
          label="To fulfil"
          value={String(metrics.pendingFulfilment)}
          hint={metrics.pendingFulfilment > 0 ? "Awaiting packing" : "All clear"}
        />
      </div>

      {/* Chart + top products */}
      <div className="grid gap-4.5 lg:grid-cols-[1.5fr_1fr]">
        <Card className="px-6 py-5.5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className={cardTitle}>Revenue · last 30 days</h2>
            <span className="text-sm font-semibold text-sage-600 tabular-nums">
              {formatMoney(metrics.revenue)} total
            </span>
          </div>
          <RevenueChart data={series} />
        </Card>

        <Card className="px-6 py-5.5">
          <h2 className={cardTitle}>Top products</h2>
          {top.length === 0 ? (
            <p className="py-10 text-center text-sm text-[var(--text-muted)]">
              No sales in this window yet.
            </p>
          ) : (
            <ol className="mt-4 flex flex-col gap-3.5">
              {top.map((product, index) => (
                <li key={product.title} className="flex items-center gap-3">
                  <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] bg-[var(--surface-sunken)] text-xs font-semibold text-[var(--accent)] tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{product.title}</span>
                    <span className="text-sm text-[var(--text-muted)]">
                      {product.units} sold
                    </span>
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {formatMoney(product.revenue)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* Recent orders */}
      <Card className="px-6 py-5.5">
        <div className="mb-2 flex items-center justify-between gap-4">
          <h2 className={cardTitle}>Recent orders</h2>
          <Link href="/admin/orders" className="text-sm text-[var(--accent)]">
            View all →
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <EmptyState title="No orders yet" description="They will appear here as they come in." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={tableHead}>Order</th>
                  <th className={tableHead}>Customer</th>
                  <th className={tableHead}>Date</th>
                  <th className={tableHead}>Total</th>
                  <th className={tableHead}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => {
                  const address = order.shippingAddress;
                  const who = address
                    ? `${address.firstName} ${address.lastName}`.trim()
                    : order.email;

                  return (
                    <tr key={order.id} className="border-b border-[var(--border-subtle)] last:border-0">
                      <td className="px-2 py-3">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="text-sm font-medium text-[var(--accent)] underline underline-offset-4"
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-2 py-3 text-sm text-[var(--text-secondary)]">
                        {who}
                        {address?.city ? (
                          <span className="block text-sm text-[var(--text-muted)]">
                            {address.city}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-3 text-sm text-[var(--text-muted)]">
                        {relativeTime(order.placedAt)}
                      </td>
                      <td className="px-2 py-3 text-sm tabular-nums">
                        {formatMoney(order.total)}
                      </td>
                      <td className="px-2 py-3">
                        <StatusBadge status={order.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Stock + integrations */}
      <div className="grid gap-4.5 lg:grid-cols-2">
        <Card className="px-6 py-5.5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className={cardTitle}>Low stock</h2>
            <Link href="/admin/inventory" className="text-sm text-[var(--accent)]">
              Manage inventory →
            </Link>
          </div>

          {lowStock.length === 0 ? (
            <div className="flex items-center gap-2 py-8 text-sm text-sage-600">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Everything is above its reorder point.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {lowStock.map((item) => (
                <li key={item.inventoryItemId} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{item.productTitle}</span>
                    <span className="block font-mono text-sm text-[var(--text-muted)]">
                      {item.sku}
                    </span>
                  </span>
                  <Badge tone={item.available <= 0 ? "danger" : "warning"}>
                    {item.available <= 0 ? "Out of stock" : `${item.available} left`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="px-6 py-5.5">
          <h2 className={cardTitle}>Integrations</h2>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {integrations.map((integration) => (
              <li key={integration.key} className="flex items-center gap-2 text-sm">
                {integration.ready ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-sage-600" aria-hidden />
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
      </div>

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
