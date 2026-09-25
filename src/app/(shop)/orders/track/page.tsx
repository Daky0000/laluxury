import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, FileText, Package, Search, Truck } from "lucide-react";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { ORDER_STATUS_LABELS } from "@/lib/constants";
import { Card, Badge, Alert, EmptyState } from "@/components/ui";
import { Thumb } from "@/components/shop/photo";
import { payRemainingBalanceAction } from "@/app/actions/order-balance";

export const metadata: Metadata = {
  title: "Track an order",
  description: "Check live order status, pre-order production milestones, and download invoices.",
};

export const dynamic = "force-dynamic";

const STEPS = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

const PREORDER_STAGES = [
  { id: "DEPOSIT_CONFIRMED", label: "1. Deposit & Spec Confirmed" },
  { id: "IN_PRODUCTION", label: "2. Workshop Production" },
  { id: "QUALITY_INSPECTION", label: "3. Quality Inspection & Crating" },
  { id: "IN_TRANSIT", label: "4. In Transit / Port Clearance" },
  { id: "READY_FOR_DELIVERY", label: "5. White-Glove Delivery (Accra)" },
] as const;

export default async function TrackOrderPage({ searchParams }: PageProps<"/orders/track">) {
  const params = await searchParams;
  const orderNumber = typeof params.order === "string" ? params.order.trim().toUpperCase() : "";
  const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";

  const order = orderNumber
    ? await db.order.findFirst({
        where: email
          ? { orderNumber, email: { equals: email, mode: "insensitive" } }
          : { orderNumber },
        include: { items: true, shippingRate: true },
      })
    : null;

  const searched = Boolean(orderNumber);
  const currentStep = order ? STEPS.indexOf(order.status as (typeof STEPS)[number]) : -1;
  const currentPreorderIdx = order
    ? Math.max(
        0,
        PREORDER_STAGES.findIndex((s) => s.id === order.preorderStage),
      )
    : 0;

  const balanceRemaining =
    order && order.depositAmount && !order.balancePaidAt
      ? Math.max(0, order.total - order.depositAmount)
      : 0;

  return (
    <div className="lx-container max-w-3xl py-12 sm:py-16">
      <h1 className="text-[clamp(1.875rem,5vw,2.5rem)]">Track an order &amp; pre-order pipeline</h1>
      <p className="mt-2 text-sm sm:text-base font-light text-[var(--text-secondary)]">
        Enter your order number to view live fulfillment progress, pre-order workshop milestones,
        and downloadable PDF invoices.
      </p>

      <Card className="mt-8 p-5 sm:p-6">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-40 flex-1">
            <label htmlFor="order" className="lx-label mb-1.5 block">
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
            <label htmlFor="email" className="lx-label mb-1.5 block">
              Email (optional)
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={email}
              placeholder="you@example.com"
              className="lx-field"
            />
          </div>

          <button
            type="submit"
            className="flex min-h-11 items-center gap-1.5 rounded-(--radius-card) bg-[var(--accent)] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
          >
            <Search className="h-4 w-4" aria-hidden />
            Track Order
          </button>
        </form>
      </Card>

      {searched && !order ? (
        <div className="mt-6">
          <Alert tone="warning">
            We could not find an order with that reference. Check the order number and try again,
            or contact our concierge team.
          </Alert>
        </div>
      ) : null}

      {order ? (
        <Card className="mt-8 p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-lg font-semibold">{order.orderNumber}</span>
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
            {order.hasPreorderItems ? <Badge tone="accent">Pre-Order Pipeline</Badge> : null}
            <span className="ml-auto text-sm text-[var(--text-secondary)]">
              Placed {formatDate(order.placedAt)}
            </span>
          </div>

          {/* Standard Delivery Progress */}
          {order.status !== "CANCELLED" && order.status !== "REFUNDED" && !order.hasPreorderItems ? (
            <ol className="mt-6 flex gap-1.5">
              {STEPS.map((step, index) => {
                const reached = currentStep >= index;
                return (
                  <li key={step} className="flex-1">
                    <div
                      className={`h-1.5 rounded-full ${
                        reached ? "bg-[var(--accent)]" : "bg-[var(--surface-sunken)]"
                      }`}
                      aria-hidden
                    />
                    <p
                      className={`mt-2 text-xs font-medium uppercase tracking-[0.08em] ${
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

          {/* 5-Stage Pre-Order Milestone Tracker */}
          {order.hasPreorderItems ? (
            <div className="mt-6 border border-amber-800/30 bg-[#231B12] p-5 text-[#F4E6C8]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#D4AF37]">
                  <Clock className="h-4 w-4" aria-hidden />
                  Live 5-Stage Pre-Order Concierge Tracker
                </p>
                <span className="text-xs text-[#E2D4B7]">
                  Est. Lead Time:{" "}
                  {order.items.find((i) => i.preorderLeadTime)?.preorderLeadTime ?? "4–6 weeks"}
                </span>
              </div>

              <ol className="mt-4 grid gap-3 sm:grid-cols-5">
                {PREORDER_STAGES.map((stage, idx) => {
                  const done = idx <= currentPreorderIdx;
                  const active = idx === currentPreorderIdx;
                  return (
                    <li
                      key={stage.id}
                      className={`border p-3 text-xs transition-colors ${
                        active
                          ? "border-[#D4AF37] bg-[#D4AF37]/15 text-white"
                          : done
                            ? "border-amber-700/40 bg-white/5 text-[#F4E6C8]"
                            : "border-white/10 text-white/45"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-medium">
                        {done ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#D4AF37]" aria-hidden />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-white/30" />
                        )}
                        <span>{stage.label}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>

              {order.preorderNote ? (
                <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-relaxed text-[#E2D4B7]">
                  <strong className="text-[#D4AF37]">Latest Concierge Update:</strong>{" "}
                  {order.preorderNote}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* 50% Remaining Balance Payment Card */}
          {balanceRemaining > 0 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                  50% Pre-Order Balance Remaining
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Deposit recorded: <strong>{formatMoney(order.depositAmount!)}</strong> · Balance
                  due upon delivery/clearance: <strong>{formatMoney(balanceRemaining)}</strong>
                </p>
              </div>
              <form action={payRemainingBalanceAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <button
                  type="submit"
                  className="bg-[var(--accent)] px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)]"
                >
                  Pay Remaining Balance · {formatMoney(balanceRemaining)}
                </button>
              </form>
            </div>
          ) : order.balancePaidAt ? (
            <div className="mt-6 border border-sage-600/30 bg-sage-600/10 px-4 py-3 text-xs font-medium text-sage-600">
              ✓ Full 100% order balance settled ({formatDate(order.balancePaidAt)}).
            </div>
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
              <li key={item.id} className="flex items-center gap-3 py-3.5">
                <span className="h-14 w-12 shrink-0 overflow-hidden rounded-sm bg-[var(--surface-sunken)]">
                  {item.imageUrl ? <Thumb src={item.imageUrl} width={48} height={56} /> : null}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {item.productTitle}
                    {item.isPreorder ? (
                      <Badge tone="accent">
                        Pre-Order{item.preorderLeadTime ? ` · ${item.preorderLeadTime}` : ""}
                      </Badge>
                    ) : null}
                  </span>
                  {item.variantTitle !== "Default" ? (
                    <span className="block text-sm text-[var(--text-secondary)]">
                      {item.variantTitle}
                    </span>
                  ) : null}
                  <span className="block text-xs text-[var(--text-muted)]">
                    Qty {item.quantity}
                  </span>
                </span>
                <span className="text-sm font-medium tabular-nums">{formatMoney(item.total)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-4">
            <span className="text-sm">Order Total</span>
            <span className="text-2xl font-semibold tabular-nums">{formatMoney(order.total)}</span>
          </div>

          {/* Printable Invoices & Waybill Links */}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] pt-5">
            <Link
              href={`/orders/${order.orderNumber}/invoice?type=invoice`}
              className="inline-flex items-center gap-2 border border-[var(--border-strong)] px-4 py-2.5 text-xs font-medium uppercase tracking-[0.12em] transition-colors hover:bg-[var(--surface-sunken)]"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden />
              Tax / Pro-Forma Invoice (PDF)
            </Link>
            <Link
              href={`/orders/${order.orderNumber}/invoice?type=waybill`}
              className="inline-flex items-center gap-2 border border-[var(--border-subtle)] px-4 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              <Truck className="h-3.5 w-3.5" aria-hidden />
              Delivery Waybill (PDF)
            </Link>
          </div>
        </Card>
      ) : null}

      {!searched ? (
        <div className="mt-8">
          <EmptyState
            icon={<Package className="h-7 w-7" aria-hidden />}
            title="Your order number is in your confirmation receipt"
            description="It looks like LX-8FK2QW."
          />
        </div>
      ) : null}
    </div>
  );
}
