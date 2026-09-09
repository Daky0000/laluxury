import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { orderInclude } from "@/lib/orders";
import { describeChannel } from "@/lib/paystack";
import { formatMoney } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { formatDate } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/constants";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The invoice and packing slip, on one sheet.
 *
 * Lives outside the console layout so the printout is the document and nothing
 * else - no rail, no topbar. Ghanaian couriers still want a paper slip in the
 * parcel, and a customer paying by transfer wants an invoice they can file, so
 * the top half is the money and the bottom half is the packing list with a
 * tick box a packer can actually use.
 */
export default async function PrintOrderPage({ params }: PageProps<"/print/orders/[id]">) {
  await requirePermission("orders:read");
  const { id } = await params;

  const [order, settings] = await Promise.all([
    db.order.findUnique({ where: { id }, include: orderInclude }),
    getSettings(),
  ]);
  if (!order) notFound();

  const payment = order.payments.find((p) => p.status === "SUCCESS") ?? null;
  const address = order.shippingAddress;

  return (
    <div className="mx-auto max-w-[760px] px-8 py-10 text-[15px] text-[#1a1a18] print:max-w-none print:px-0 print:py-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-sm text-[#6e6c66]">Use your browser&rsquo;s print dialog to save as PDF.</p>
        <PrintButton />
      </div>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-[#1a1a18] pb-6">
        <div>
          <p className="font-display text-[28px] font-medium uppercase tracking-[0.16em]">{settings.storeName}</p>
          <p className="mt-1 text-sm text-[#6e6c66]">
            {settings.addressLine}
            {settings.supportPhone ? ` · ${settings.supportPhone}` : ""}
            {settings.supportEmail ? ` · ${settings.supportEmail}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-[#6e6c66]">Invoice</p>
          <p className="mt-1 font-mono text-xl">{order.orderNumber}</p>
          <p className="mt-1 text-sm text-[#6e6c66]">Placed {formatDate(order.placedAt, true)}</p>
        </div>
      </header>

      {/* Parties */}
      <section className="grid gap-8 py-6 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#6e6c66]">Deliver to</p>
          {address ? (
            <address className="mt-2 not-italic leading-relaxed">
              {address.firstName} {address.lastName}
              <br />
              {address.line1}
              {address.line2 ? (
                <>
                  <br />
                  {address.line2}
                </>
              ) : null}
              <br />
              {address.city}, {address.region}
              {address.postalCode ? ` · ${address.postalCode}` : ""}
              <br />
              {formatPhone(address.phone)}
            </address>
          ) : (
            <p className="mt-2">No delivery address on file.</p>
          )}
          <p className="mt-2 text-sm text-[#6e6c66]">{order.email}</p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[#6e6c66]">Payment</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-[#6e6c66]">Status</dt>
            <dd>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</dd>
            {payment ? (
              <>
                <dt className="text-[#6e6c66]">Method</dt>
                <dd>{describeChannel(payment.channel)}</dd>
                <dt className="text-[#6e6c66]">Reference</dt>
                <dd className="font-mono text-xs">{payment.reference}</dd>
                {payment.paidAt ? (
                  <>
                    <dt className="text-[#6e6c66]">Paid</dt>
                    <dd>{formatDate(payment.paidAt, true)}</dd>
                  </>
                ) : null}
              </>
            ) : null}
            <dt className="text-[#6e6c66]">Order</dt>
            <dd>{ORDER_STATUS_LABELS[order.status]}</dd>
            {order.shippingRate ? (
              <>
                <dt className="text-[#6e6c66]">Delivery</dt>
                <dd>{order.shippingRate.name}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </section>

      {/* Lines */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#1a1a18] text-left text-xs uppercase tracking-[0.12em] text-[#6e6c66]">
            <th className="py-2 pr-3 font-medium">Item</th>
            <th className="py-2 pr-3 font-medium">SKU</th>
            <th className="py-2 pr-3 text-right font-medium">Qty</th>
            <th className="py-2 pr-3 text-right font-medium">Unit</th>
            <th className="py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-[#e4e3de]">
              <td className="py-2.5 pr-3">
                {item.productTitle}
                {item.variantTitle !== "Default" ? (
                  <span className="block text-xs text-[#6e6c66]">{item.variantTitle}</span>
                ) : null}
              </td>
              <td className="py-2.5 pr-3 font-mono text-xs">{item.sku}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{item.quantity}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{formatMoney(item.unitPrice)}</td>
              <td className="py-2.5 text-right tabular-nums">{formatMoney(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-4 w-64 text-sm">
        <div className="flex justify-between py-1">
          <dt className="text-[#6e6c66]">Subtotal</dt>
          <dd className="tabular-nums">{formatMoney(order.subtotal)}</dd>
        </div>
        {order.discountTotal > 0 ? (
          <div className="flex justify-between py-1">
            <dt className="text-[#6e6c66]">
              Discount{order.redemptions[0] ? ` (${order.redemptions[0].discount.code})` : ""}
            </dt>
            <dd className="tabular-nums">-{formatMoney(order.discountTotal)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between py-1">
          <dt className="text-[#6e6c66]">Delivery</dt>
          <dd className="tabular-nums">{formatMoney(order.shippingTotal)}</dd>
        </div>
        <div className="mt-1 flex justify-between border-t border-[#1a1a18] pt-2 text-base font-medium">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatMoney(order.total)}</dd>
        </div>
        {order.refundedTotal > 0 ? (
          <div className="flex justify-between py-1 text-[#a63d3d]">
            <dt>Refunded</dt>
            <dd className="tabular-nums">-{formatMoney(order.refundedTotal)}</dd>
          </div>
        ) : null}
      </dl>

      {order.customerNote ? (
        <section className="mt-6 rounded border border-[#e4e3de] p-4 text-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-[#6e6c66]">Customer note</p>
          <p className="mt-1.5">{order.customerNote}</p>
        </section>
      ) : null}

      {/* Packing slip */}
      <section className="mt-10 border-t-2 border-dashed border-[#cfcdc6] pt-8 print:break-before-page print:border-0 print:pt-0">
        <div className="flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-[#6e6c66]">Packing slip</p>
          <p className="font-mono text-lg">{order.orderNumber}</p>
        </div>
        <ul className="mt-4 divide-y divide-[#e4e3de]">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-4 py-3">
              <span aria-hidden className="h-5 w-5 shrink-0 border border-[#1a1a18]" />
              <span className="flex-1">
                {item.productTitle}
                {item.variantTitle !== "Default" ? (
                  <span className="text-[#6e6c66]"> · {item.variantTitle}</span>
                ) : null}
                <span className="block font-mono text-xs text-[#6e6c66]">{item.sku}</span>
              </span>
              <span className="text-lg tabular-nums">× {item.quantity}</span>
            </li>
          ))}
        </ul>
        {address ? (
          <p className="mt-6 text-sm">
            <span className="text-[#6e6c66]">Deliver to: </span>
            {address.firstName} {address.lastName}, {address.line1}
            {address.line2 ? `, ${address.line2}` : ""}, {address.city}, {address.region} ·{" "}
            {formatPhone(address.phone)}
          </p>
        ) : null}
        <p className="mt-6 text-xs text-[#6e6c66]">
          {settings.returnsPolicy}
        </p>
      </section>
    </div>
  );
}
