import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatPrice } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { formatDate } from "@/lib/utils";
import { PrintInvoiceButton } from "@/components/shop/print-invoice-button";

export const metadata: Metadata = { title: "Invoice & Delivery Waybill" };
export const dynamic = "force-dynamic";

export default async function OrderInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { orderNumber } = await params;
  const query = await searchParams;
  const docType = query.type === "waybill" ? "waybill" : "invoice";

  const [order, settings] = await Promise.all([
    db.order.findUnique({
      where: { orderNumber: orderNumber.toUpperCase() },
      include: {
        items: true,
        shippingAddress: true,
        shippingRate: true,
        payments: { orderBy: { createdAt: "desc" } },
      },
    }),
    getSettings(),
  ]);

  if (!order) notFound();

  const isPaid = order.paymentStatus === "SUCCESS" || Boolean(order.balancePaidAt);
  const balanceRemaining =
    order.depositAmount && !order.balancePaidAt
      ? Math.max(0, order.total - order.depositAmount)
      : isPaid
        ? 0
        : order.total;

  return (
    <div className="lx-container max-w-4xl py-10 print:py-0">
      {/* Action Bar (hidden when printing) */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-5 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/orders/track?order=${order.orderNumber}`}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            ← Back to Order {order.orderNumber}
          </Link>
          <span className="text-[var(--text-muted)]">|</span>
          <Link
            href={`/orders/${order.orderNumber}/invoice?type=invoice`}
            className={`text-xs uppercase tracking-[0.14em] ${docType === "invoice" ? "font-semibold text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}
          >
            Tax / Pro-Forma Invoice
          </Link>
          <Link
            href={`/orders/${order.orderNumber}/invoice?type=waybill`}
            className={`text-xs uppercase tracking-[0.14em] ${docType === "waybill" ? "font-semibold text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}
          >
            White-Glove Delivery Waybill
          </Link>
        </div>

        <PrintInvoiceButton
          label={
            docType === "waybill"
              ? "Print Delivery Waybill (PDF)"
              : "Print / Download Invoice (PDF)"
          }
        />
      </div>

      {/* Printable Document Sheet */}
      <div className="border border-[var(--border-subtle)] bg-white p-8 text-ink-950 shadow-sm sm:p-12 print:border-0 print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-ink-950/15 pb-8">
          <div>
            <p className="font-display text-3xl uppercase tracking-[0.18em]">
              {settings.storeName}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-ink-500">
              Luxury Furniture · Lighting · Bespoke Interiors · Accra, Ghana
            </p>
            <p className="mt-3 text-xs text-ink-600">
              {settings.supportEmail} · {formatPhone(settings.supportPhone)}
            </p>
          </div>

          <div className="text-right">
            <span className="inline-block border border-ink-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]">
              {docType === "waybill"
                ? "White-Glove Delivery Waybill"
                : isPaid
                  ? "Official Tax Invoice & Receipt"
                  : "Pro-Forma Invoice"}
            </span>
            <p className="mt-3 font-mono text-lg font-semibold">{order.orderNumber}</p>
            <p className="text-xs text-ink-600">Issued: {formatDate(order.placedAt)}</p>
          </div>
        </div>

        {/* Bill To / Deliver To */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-500">
              Client &amp; Delivery Address
            </h2>
            {order.shippingAddress ? (
              <address className="mt-2 text-sm not-italic leading-relaxed">
                <strong>
                  {order.shippingAddress.firstName} {order.shippingAddress.lastName}
                </strong>
                <br />
                {order.shippingAddress.line1}
                {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ""}
                <br />
                {order.shippingAddress.city}, {order.shippingAddress.region}
                {order.shippingAddress.postalCode
                  ? ` · Digital Address: ${order.shippingAddress.postalCode}`
                  : ""}
                <br />
                Tel: {formatPhone(order.shippingAddress.phone)} · {order.email}
              </address>
            ) : (
              <p className="mt-2 text-sm">{order.email}</p>
            )}
          </div>

          <div className="sm:text-right">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-500">
              Order &amp; Fulfilment Details
            </h2>
            <p className="mt-2 text-sm">
              <strong>Order Status:</strong> {order.status}
            </p>
            <p className="mt-1 text-sm">
              <strong>Payment Status:</strong>{" "}
              {order.balancePaidAt ? "PAID IN FULL" : order.paymentStatus}
            </p>
            {order.hasPreorderItems ? (
              <p className="mt-1 text-sm text-[#8C6528]">
                <strong>Pipeline Stage:</strong>{" "}
                {order.preorderStage.replace(/_/g, " ")}
              </p>
            ) : null}
            {order.shippingRate ? (
              <p className="mt-1 text-sm">
                <strong>Dispatch Method:</strong> {order.shippingRate.name}
              </p>
            ) : null}
          </div>
        </div>

        {/* Line Items Table */}
        <div className="mt-8 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-2 border-ink-950 text-xs uppercase tracking-[0.14em] text-ink-600">
                <th className="py-3 pr-4">Item &amp; Specification</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-center">Qty</th>
                <th className="px-4 py-3 text-right">Unit Price</th>
                <th className="py-3 pl-4 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-950/10">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-4 pr-4">
                    <div className="font-medium">{item.productTitle}</div>
                    <div className="text-xs text-ink-600">
                      {item.variantTitle !== "Default" ? item.variantTitle : "Standard Specification"}
                      {item.isPreorder
                        ? ` · Pre-Order (${item.preorderLeadTime ?? "4–6 weeks"})`
                        : " · In-Stock"}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs text-ink-600">{item.sku}</td>
                  <td className="px-4 py-4 text-center tabular-nums">{item.quantity}</td>
                  <td className="px-4 py-4 text-right tabular-nums">
                    {formatPrice(item.unitPrice)}
                  </td>
                  <td className="py-4 pl-4 text-right font-medium tabular-nums">
                    {formatPrice(item.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Breakdown */}
        <div className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between text-ink-600">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatPrice(order.subtotal)}</dd>
            </div>
            {order.discountTotal > 0 ? (
              <div className="flex justify-between text-sage-600">
                <dt>Discount</dt>
                <dd className="tabular-nums">-{formatPrice(order.discountTotal)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-ink-600">
              <dt>White-Glove Delivery</dt>
              <dd className="tabular-nums">
                {order.shippingTotal === 0 ? "Complimentary" : formatPrice(order.shippingTotal)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-ink-950 pt-3 text-base font-semibold">
              <dt>Total (GHS)</dt>
              <dd className="tabular-nums">{formatPrice(order.total)}</dd>
            </div>
            {order.depositAmount ? (
              <>
                <div className="flex justify-between pt-1 text-xs font-medium text-[#8C6528]">
                  <dt>50% Pre-Order Deposit</dt>
                  <dd className="tabular-nums">{formatPrice(order.depositAmount)}</dd>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <dt>Balance Due on Delivery</dt>
                  <dd className="tabular-nums">{formatPrice(balanceRemaining)}</dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>

        {/* Waybill / Inspection Signature Block */}
        <div className="mt-12 grid gap-8 border-t border-ink-950/15 pt-8 text-xs text-ink-600 sm:grid-cols-2">
          <div>
            <p className="font-semibold uppercase tracking-[0.14em] text-ink-950">
              Settlement &amp; Bank / MoMo Instructions
            </p>
            <p className="mt-1.5 leading-relaxed">
              Quote reference <strong>{order.orderNumber}</strong> on all Mobile Money or corporate
              bank transfers. All pieces include LaLuxury&apos;s white-glove room placement and
              packaging removal in Greater Accra.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-4 sm:pt-0">
            <div className="border-t border-ink-950/40 pt-2">
              <p className="font-medium text-ink-950">Dispatch Officer Signature</p>
              <p className="mt-0.5 text-[11px]">Date &amp; Time</p>
            </div>
            <div className="border-t border-ink-950/40 pt-2">
              <p className="font-medium text-ink-950">Client Inspection &amp; Sign-Off</p>
              <p className="mt-0.5 text-[11px]">Received in good condition</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
