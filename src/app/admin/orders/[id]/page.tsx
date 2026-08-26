import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone, MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/auth/rbac";
import { orderInclude } from "@/lib/orders";
import { describeChannel } from "@/lib/paystack";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { Card, Badge, Divider } from "@/components/ui";
import { AssignOrderCustomer } from "@/components/admin/order-customer";
import { OrderControls } from "@/components/admin/order-controls";

export const metadata: Metadata = { title: "Order" };

export default async function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  const user = await requirePermission("orders:read");
  const { id } = await params;

  const order = await db.order.findUnique({ where: { id }, include: orderInclude });
  if (!order) notFound();

  const payment = order.payments.find((p) => p.status === "SUCCESS") ?? order.payments[0];
  const canWrite = can(user.role, "orders:write");
  const outstanding = order.total - order.refundedTotal;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/orders"
        className="flex w-fit items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Orders
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl">{order.orderNumber}</h1>
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
        <Badge tone={order.paymentStatus === "SUCCESS" ? "success" : "neutral"}>
          {PAYMENT_STATUS_LABELS[order.paymentStatus]}
        </Badge>
        <span className="text-sm text-[var(--text-secondary)]">
          Placed {formatDate(order.placedAt, true)}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          {/* Items */}
          <Card className="p-5">
            <h2 className="lx-eyebrow mb-4">Items</h2>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-4 py-3">
                  <span className="h-14 w-12 shrink-0 overflow-hidden rounded-sm bg-[var(--surface-sunken)]">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{item.productTitle}</span>
                    {item.variantTitle !== "Default" ? (
                      <span className="block text-xs text-[var(--text-secondary)]">
                        {item.variantTitle}
                      </span>
                    ) : null}
                    <span className="block font-mono text-xs text-[var(--text-muted)]">
                      {item.sku}
                    </span>
                  </span>

                  <span className="text-sm text-[var(--text-secondary)] tabular-nums">
                    {formatMoney(item.unitPrice)} × {item.quantity}
                  </span>

                  <span className="w-24 text-right text-sm tabular-nums">
                    {formatMoney(item.total)}
                  </span>
                </li>
              ))}
            </ul>

            <Divider className="my-4" />

            <dl className="ml-auto max-w-xs space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(order.subtotal)}</dd>
              </div>
              {order.discountTotal > 0 ? (
                <div className="flex justify-between text-success">
                  <dt>
                    Discount
                    {order.redemptions[0] ? ` (${order.redemptions[0].discount.code})` : ""}
                  </dt>
                  <dd className="tabular-nums">-{formatMoney(order.discountTotal)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">
                  Delivery{order.shippingRate ? ` (${order.shippingRate.name})` : ""}
                </dt>
                <dd className="tabular-nums">{formatMoney(order.shippingTotal)}</dd>
              </div>
              <div className="flex justify-between border-t border-[var(--border-subtle)] pt-2 text-base">
                <dt>Total</dt>
                <dd className="font-medium tabular-nums">{formatMoney(order.total)}</dd>
              </div>
              {order.refundedTotal > 0 ? (
                <div className="flex justify-between text-danger">
                  <dt>Refunded</dt>
                  <dd className="tabular-nums">-{formatMoney(order.refundedTotal)}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {/* Timeline */}
          <Card className="p-5">
            <h2 className="lx-eyebrow mb-4">Timeline</h2>
            {order.events.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Nothing logged yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {order.events.map((event) => (
                  <li key={event.id} className="flex gap-3">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-muted)]"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{event.message}</span>
                      <span className="block text-xs text-[var(--text-muted)]">
                        {formatDate(event.createdAt, true)}
                        {event.actorId ? " · staff" : " · system"}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <h2 className="lx-eyebrow mb-3">Customer</h2>
            <div className="flex flex-col gap-2 text-sm">
              {order.user ? (
                <Link
                  href={`/admin/customers/${order.user.id}`}
                  className="font-medium hover:underline"
                >
                  {[order.user.firstName, order.user.lastName].filter(Boolean).join(" ") ||
                    order.user.email}
                </Link>
              ) : (
                <span className="text-[var(--text-secondary)]">Guest checkout</span>
              )}

              <a
                href={`mailto:${order.email}`}
                className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{order.email}</span>
              </a>

              {order.phone ? (
                <a
                  href={`tel:${order.phone}`}
                  className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {order.phone}
                </a>
              ) : null}
            </div>

            {canWrite ? (
              <AssignOrderCustomer
                orderId={order.id}
                defaultEmail={order.email}
                attached={Boolean(order.user)}
              />
            ) : null}
          </Card>

          {order.shippingAddress ? (
            <Card className="p-5">
              <h2 className="lx-eyebrow mb-3">Delivery address</h2>
              <address className="flex gap-2 text-sm not-italic text-[var(--text-secondary)]">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  {order.shippingAddress.firstName} {order.shippingAddress.lastName}
                  <br />
                  {order.shippingAddress.line1}
                  {order.shippingAddress.line2 ? (
                    <>
                      <br />
                      {order.shippingAddress.line2}
                    </>
                  ) : null}
                  <br />
                  {order.shippingAddress.city}, {order.shippingAddress.region}
                  {order.shippingAddress.postalCode ? (
                    <>
                      <br />
                      {order.shippingAddress.postalCode}
                    </>
                  ) : null}
                </span>
              </address>
            </Card>
          ) : null}

          {payment ? (
            <Card className="p-5">
              <h2 className="lx-eyebrow mb-3">Payment</h2>
              <dl className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">Method</dt>
                  <dd>{describeChannel(payment.channel)}</dd>
                </div>
                {payment.cardLast4 ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-secondary)]">Card</dt>
                    <dd>
                      {payment.cardBrand} ••{payment.cardLast4}
                    </dd>
                  </div>
                ) : null}
                {payment.mobileMoneyNumber ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-secondary)]">MoMo</dt>
                    <dd>{payment.mobileMoneyNumber}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--text-secondary)]">Reference</dt>
                  <dd className="truncate font-mono text-xs">{payment.reference}</dd>
                </div>
                {payment.paidAt ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-[var(--text-secondary)]">Paid</dt>
                    <dd>{formatDate(payment.paidAt, true)}</dd>
                  </div>
                ) : null}
              </dl>
            </Card>
          ) : null}

          {order.customerNote ? (
            <Card className="p-5">
              <h2 className="lx-eyebrow mb-2">Customer note</h2>
              <p className="text-sm text-[var(--text-secondary)]">{order.customerNote}</p>
            </Card>
          ) : null}

          {canWrite ? (
            <OrderControls
              orderId={order.id}
              status={order.status}
              trackingNumber={order.trackingNumber}
              trackingCompany={order.trackingCompany}
              staffNote={order.staffNote}
              outstanding={outstanding}
              canRefund={order.paymentStatus === "SUCCESS" && outstanding > 0}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
