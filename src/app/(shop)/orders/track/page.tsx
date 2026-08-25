import type { Metadata } from "next";
import { Package, Search } from "lucide-react";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { Card, Badge, Alert, EmptyState } from "@/components/ui";

export const metadata: Metadata = {
  title: "Track an order",
  description: "Check where your order has got to.",
};

export const dynamic = "force-dynamic";

const STEPS = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

/**
 * Guest order tracking.
 *
 * Requires the order number AND the email it was placed with, so an order
 * number alone never exposes someone's address or contact details.
 */
export default async function TrackOrderPage({ searchParams }: PageProps<"/orders/track">) {
  const params = await searchParams;
  const orderNumber = typeof params.order === "string" ? params.order.trim().toUpperCase() : "";
  const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";

  const order =
    orderNumber && email
      ? await db.order.findFirst({
          where: { orderNumber, email: { equals: email, mode: "insensitive" } },
          include: { items: true, shippingRate: true },
        })
      : null;

  const searched = Boolean(orderNumber && email);
  const currentStep = order ? STEPS.indexOf(order.status as (typeof STEPS)[number]) : -1;

  return (
    <div className="lx-container max-w-2xl py-14">
      <h1 className="text-3xl md:text-4xl">Track an order</h1>
      <p className="mt-2 text-[var(--text-secondary)]">
        Enter your order number and the email you used at checkout.
      </p>

      <Card className="mt-8 p-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-40 flex-1">
            <label htmlFor="order" className="lx-eyebrow mb-1.5 block">
              Order number
            </label>
            <input
              id="order"
              name="order"
              defaultValue={orderNumber}
              placeholder="LX-8FK2QW"
              required
              className="lx-field font-mono"
            />
          </div>

          <div className="min-w-48 flex-1">
            <label htmlFor="email" className="lx-eyebrow mb-1.5 block">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={email}
              required
              className="lx-field"
            />
          </div>

          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-[--radius-card] bg-[var(--accent)] px-5 py-2.5 text-sm text-[var(--accent-contrast)]"
          >
            <Search className="h-4 w-4" aria-hidden />
            Find it
          </button>
        </form>
      </Card>

      {searched && !order ? (
        <div className="mt-6">
          <Alert tone="warning">
            We could not find an order with that number and email. Check both and try again, or
            contact us and we will look it up.
          </Alert>
        </div>
      ) : null}

      {order ? (
        <Card className="mt-8 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-lg">{order.orderNumber}</span>
            <Badge
              tone={
                order.status === "DELIVERED"
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
            <span className="ml-auto text-sm text-[var(--text-secondary)]">
              Placed {formatDate(order.placedAt)}
            </span>
          </div>

          {/* Progress */}
          {order.status !== "CANCELLED" && order.status !== "REFUNDED" ? (
            <ol className="mt-6 flex gap-1">
              {STEPS.map((step, index) => {
                const reached = currentStep >= index;
                return (
                  <li key={step} className="flex-1">
                    <div
                      className={`h-1 rounded-full ${
                        reached ? "bg-[var(--accent)]" : "bg-[var(--surface-sunken)]"
                      }`}
                      aria-hidden
                    />
                    <p
                      className={`mt-2 text-xs ${
                        reached ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"
                      }`}
                    >
                      {ORDER_STATUS_LABELS[step]}
                    </p>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {order.trackingNumber ? (
            <p className="mt-5 text-sm">
              <span className="text-[var(--text-secondary)]">Tracking: </span>
              {order.trackingCompany} · <span className="font-mono">{order.trackingNumber}</span>
            </p>
          ) : order.shippingRate ? (
            <p className="mt-5 text-sm text-[var(--text-secondary)]">
              Delivery method: {order.shippingRate.name}
            </p>
          ) : null}

          <ul className="mt-6 divide-y divide-[var(--border-subtle)]">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <span className="h-14 w-12 shrink-0 overflow-hidden rounded-sm bg-[var(--surface-sunken)]">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block">{item.productTitle}</span>
                  {item.variantTitle !== "Default" ? (
                    <span className="block text-xs text-[var(--text-secondary)]">
                      {item.variantTitle}
                    </span>
                  ) : null}
                  <span className="block text-xs text-[var(--text-muted)]">
                    Qty {item.quantity}
                  </span>
                </span>
                <span className="text-sm tabular-nums">{formatMoney(item.total)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-4">
            <span className="text-sm">Total</span>
            <span className="font-display text-xl tabular-nums">{formatMoney(order.total)}</span>
          </div>
        </Card>
      ) : null}

      {!searched ? (
        <div className="mt-8">
          <EmptyState
            icon={<Package className="h-7 w-7" aria-hidden />}
            title="Your order number is in your confirmation email"
            description="It looks like LX-8FK2QW."
          />
        </div>
      ) : null}
    </div>
  );
}
