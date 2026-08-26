import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { formatDate, buildQuery } from "@/lib/utils";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { Card, Badge, EmptyState, SectionHeading } from "@/components/ui";
import { ManualOrderPanel } from "@/components/admin/manual-order-form";
import type { OrderStatus, Prisma } from "@/generated/prisma";

export const metadata: Metadata = { title: "Orders" };

const PER_PAGE = 25;

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requirePermission("orders:read");
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "";
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.OrderWhereInput = {
    ...(status ? { status: status as OrderStatus } : {}),
    ...(q
      ? {
          OR: [
            { orderNumber: { contains: q.toUpperCase() } },
            { email: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };

  const [orders, total, statusCounts] = await Promise.all([
    db.order.findMany({
      where,
      include: { items: { select: { quantity: true } } },
      orderBy: { placedAt: "desc" },
      take: PER_PAGE,
      skip: (page - 1) * PER_PAGE,
    }),
    db.order.count({ where }),
    db.order.groupBy({ by: ["status"], _count: true }),
  ]);

  // What a console-raised order can be built from. Capped, because the picker
  // is a select rather than a search.
  const sellable = await db.variant.findMany({
    where: { isActive: true, product: { status: "ACTIVE" } },
    orderBy: [{ product: { title: "asc" } }, { position: "asc" }],
    take: 200,
    select: {
      id: true,
      title: true,
      price: true,
      product: { select: { title: true } },
      inventory: { select: { onHand: true, reserved: true, trackInventory: true } },
    },
  });

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading title="Orders" description={`${total} matching.`} />

      <ManualOrderPanel
        variants={sellable.map((variant) => ({
          id: variant.id,
          label:
            variant.title && variant.title !== "Default"
              ? `${variant.product.title} — ${variant.title}`
              : variant.product.title,
          price: variant.price,
          available:
            variant.inventory && variant.inventory.trackInventory
              ? Math.max(0, variant.inventory.onHand - variant.inventory.reserved)
              : null,
        }))}
      />

      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label htmlFor="q" className="lx-eyebrow mb-1.5 block">
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden
              />
              <input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Order number, email or phone"
                className="lx-field pl-9"
              />
            </div>
          </div>

          <div>
            <label htmlFor="status" className="lx-eyebrow mb-1.5 block">
              Status
            </label>
            <select id="status" name="status" defaultValue={status} className="lx-field w-48">
              <option value="">All</option>
              {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label} ({statusCounts.find((c) => c.status === value)?._count ?? 0})
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="rounded-(--radius-card) bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-contrast)]"
          >
            Filter
          </button>

          {q || status ? (
            <Link
              href="/admin/orders"
              className="px-2 py-2.5 text-sm underline-offset-4 hover:underline"
            >
              Reset
            </Link>
          ) : null}
        </form>
      </Card>

      {orders.length === 0 ? (
        <EmptyState title="No orders match" description="Try clearing the filters." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Placed</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Payment</th>
                  <th className="px-4 py-2.5 font-medium">Items</th>
                  <th className="px-4 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-[var(--surface-sunken)]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-mono text-xs hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="max-w-48 truncate px-4 py-3">{order.email}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {formatDate(order.placedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          order.status === "DELIVERED" || order.status === "SHIPPED"
                            ? "success"
                            : order.status === "CANCELLED" || order.status === "REFUNDED"
                              ? "danger"
                              : order.status === "PENDING"
                                ? "warning"
                                : "info"
                        }
                      >
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          order.paymentStatus === "SUCCESS"
                            ? "success"
                            : order.paymentStatus === "FAILED"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">
                      {order.items.reduce((s, i) => s + i.quantity, 0)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(order.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={`/admin/orders${buildQuery({ q, status, page: page - 1 })}`}
              className="rounded-(--radius-card) border border-[var(--border-subtle)] px-3 py-1.5"
            >
              Previous
            </Link>
          ) : null}
          <span className="tabular-nums text-[var(--text-secondary)]">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={`/admin/orders${buildQuery({ q, status, page: page + 1 })}`}
              className="rounded-(--radius-card) border border-[var(--border-subtle)] px-3 py-1.5"
            >
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
