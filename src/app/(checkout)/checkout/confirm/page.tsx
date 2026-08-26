import type { Metadata } from "next";
import Link from "next/link";
import { Clock, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { verifyTransaction, describeChannel } from "@/lib/paystack";
import { markOrderPaid, markPaymentFailed } from "@/lib/orders";
import { productCardSelect } from "@/lib/catalog";
import { toTile } from "@/lib/product-view";
import { formatPrice } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { ProductTile } from "@/components/shop/product-tile";
import { Footer } from "@/components/shop/footer";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "Order confirmation" };
export const dynamic = "force-dynamic";

/**
 * Paystack redirects here after payment.
 *
 * The webhook is the authoritative path, but the shopper arrives here first
 * and expects an answer, so this verifies directly too. Both routes funnel
 * into the same idempotent `markOrderPaid`, so whichever lands first wins and
 * the second is a no-op.
 */
export default async function ConfirmPage({ searchParams }: PageProps<"/checkout/confirm">) {
  const params = await searchParams;
  const raw = params.reference ?? params.trxref;
  const reference = Array.isArray(raw) ? raw[0] : raw;

  const settings = await getSettings();

  if (!reference) {
    return (
      <Shell
        icon={<XCircle className="h-10 w-10 text-danger" aria-hidden />}
        title="No payment reference"
        body="We could not tell which order this was. If you were charged, contact us and we will sort it out immediately."
      />
    );
  }

  const payment = await db.payment.findUnique({
    where: { reference },
    include: { order: { include: { items: true, shippingAddress: true } } },
  });

  if (!payment) {
    return (
      <Shell
        icon={<XCircle className="h-10 w-10 text-danger" aria-hidden />}
        title="We do not recognise that payment"
        body={`Reference ${reference} is not on our records. Contact ${settings.supportEmail} and we will look into it.`}
      />
    );
  }

  const order = payment.order;

  // Verify unless the webhook has already settled it.
  if (payment.status !== "SUCCESS") {
    try {
      const transaction = await verifyTransaction(reference);

      if (transaction.status === "success" && transaction.amount === order.total) {
        await markOrderPaid({
          orderId: order.id,
          reference,
          amount: transaction.amount,
          channel: transaction.channel,
          providerTransactionId: String(transaction.id),
          cardLast4: transaction.authorization?.last4 ?? null,
          cardBrand: transaction.authorization?.brand ?? null,
          authCode: transaction.authorization?.authorization_code ?? null,
          mobileMoneyNumber: transaction.authorization?.mobile_money_number ?? null,
          raw: transaction as never,
        });
      } else if (transaction.status === "failed" || transaction.status === "abandoned") {
        await markPaymentFailed({
          orderId: order.id,
          reference,
          reason: transaction.gateway_response ?? "Payment did not complete.",
        });
      }
    } catch (error) {
      console.error("[checkout confirm] verify failed", error);
    }
  }

  // Re-read so the page reflects whatever just happened.
  const fresh = await db.order.findUnique({
    where: { id: order.id },
    include: {
      items: true,
      shippingAddress: true,
      shippingRate: true,
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!fresh) return null;

  const latestPayment = fresh.payments[0];

  if (fresh.paymentStatus === "SUCCESS") {
    // Four more pieces for the room, none of them already in the order.
    const relatedRows = await db.product.findMany({
      where: {
        status: "ACTIVE",
        id: { notIn: fresh.items.map((item) => item.productId).filter((id) => id !== null) },
      },
      select: productCardSelect,
      orderBy: [{ isFeatured: "desc" }, { createdAt: "asc" }],
      take: 4,
    });

    const firstName = fresh.shippingAddress?.firstName;
    const estimate = fresh.shippingRate?.estimatedDaysMin
      ? `${fresh.shippingRate.estimatedDaysMin}–${fresh.shippingRate.estimatedDaysMax} days`
      : (fresh.shippingRate?.name ?? "2–4 days");

    const meta = [
      { label: "Order", value: fresh.orderNumber },
      { label: "Est. delivery", value: estimate },
      {
        label: "Payment",
        value: latestPayment?.channel ? describeChannel(latestPayment.channel) : "Paid",
      },
    ];

    return (
      <>
        <section className="lx-container max-w-[760px] pb-10 pt-16 text-center">
          <span className="lx-pop mx-auto grid h-[76px] w-[76px] place-items-center rounded-full border border-sage-200 bg-sage-100">
            <svg viewBox="0 0 24 24" className="lx-draw h-[34px] w-[34px]" fill="none" aria-hidden>
              <path
                d="M5 12.5l4.5 4.5L19 7.5"
                stroke="var(--color-sage-600)"
                strokeWidth={2}
                strokeLinecap="round"
              />
            </svg>
          </span>

          <p className="lx-eyebrow mt-6.5">Order confirmed</p>
          <h1 className="mt-3 text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.05]">
            Thank you{firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="mx-auto mt-3.5 max-w-[460px] text-[15.5px] font-light leading-relaxed text-[var(--text-secondary)]">
            Your order is in. A receipt is on its way to {fresh.email}, and our team will call you
            shortly to arrange delivery.
          </p>

          <dl className="mt-7 inline-flex flex-wrap justify-center gap-x-9 gap-y-4 border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-8 py-4.5 text-left">
            {meta.map((item, index) => (
              <div
                key={item.label}
                className={
                  index > 0
                    ? "border-[var(--border-subtle)] sm:-ml-4.5 sm:border-l sm:pl-4.5"
                    : undefined
                }
              >
                <dt className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {item.label}
                </dt>
                <dd className="mt-1 text-[15px] font-medium">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Order detail */}
        <section className="lx-container max-w-[760px] pb-7">
          <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
            <h2 className="border-b border-[var(--border-subtle)] px-7 py-5 font-display text-[22px]">
              Order summary
            </h2>

            <ul className="px-7">
              {fresh.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-4 border-b border-[var(--border-subtle)] py-4 last:border-0"
                >
                  <span className="h-16 w-14 shrink-0 overflow-hidden bg-[var(--surface-media)]">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[14.5px]">{item.productTitle}</span>
                    <span className="mt-0.5 block text-[11.5px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {item.variantTitle !== "Default" ? `${item.variantTitle} · ` : ""}
                      Qty {item.quantity}
                    </span>
                  </span>
                  <span className="font-display text-[17px] tabular-nums">
                    {formatPrice(item.total)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="px-7 pb-6 pt-4">
              <div className="flex justify-between py-1.5 text-[13.5px] text-[var(--text-secondary)]">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatPrice(fresh.subtotal)}</dd>
              </div>
              {fresh.discountTotal > 0 ? (
                <div className="flex justify-between py-1.5 text-[13.5px] text-sage-600">
                  <dt>Discount</dt>
                  <dd className="tabular-nums">-{formatPrice(fresh.discountTotal)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between py-1.5 text-[13.5px] text-[var(--text-secondary)]">
                <dt>Delivery</dt>
                <dd className="tabular-nums">
                  {fresh.shippingTotal === 0 ? "Free" : formatPrice(fresh.shippingTotal)}
                </dd>
              </div>
              <div className="mt-2.5 flex items-baseline justify-between border-t border-[var(--border-strong)] pt-3.5">
                <dt className="text-[13px] uppercase tracking-[0.06em]">Total</dt>
                <dd className="font-display text-[26px] tabular-nums">{formatPrice(fresh.total)}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {fresh.shippingAddress ? (
              <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-6 py-5">
                <h3 className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Delivering to
                </h3>
                <address className="mt-2 text-sm not-italic leading-relaxed">
                  {fresh.shippingAddress.firstName} {fresh.shippingAddress.lastName}
                  <br />
                  {fresh.shippingAddress.line1}
                  {fresh.shippingAddress.line2 ? `, ${fresh.shippingAddress.line2}` : ""}
                  <br />
                  {fresh.shippingAddress.city}, {fresh.shippingAddress.region} ·{" "}
                  {fresh.shippingAddress.phone}
                </address>
              </div>
            ) : null}

            <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-6 py-5">
              <h3 className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Need to change something?
              </h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-[var(--text-secondary)]">
                Message us with your order number and we will sort it before dispatch.
              </p>
              <Link href="/contact" className="mt-2.5 inline-block text-[13px] text-[var(--accent)]">
                Contact us →
              </Link>
            </div>
          </div>
        </section>

        {/* CTAs */}
        <section className="lx-container flex flex-wrap justify-center gap-3.5 pb-8">
          <Link href="/shop" className="lx-cta">
            Continue shopping
          </Link>
          <Link
            href={`/orders/track?order=${fresh.orderNumber}`}
            className="inline-flex items-center justify-center border border-[var(--border-strong)] px-8 py-4 text-xs font-medium uppercase tracking-[0.12em] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Track this order
          </Link>
        </section>

        {/* Complete the room */}
        {relatedRows.length > 0 ? (
          <section className="lx-container pb-10 pt-6">
            <h2 className="mb-7 text-center text-[clamp(1.75rem,4vw,2.125rem)]">
              Complete the room
            </h2>
            <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-4">
              {relatedRows.map((row) => (
                <ProductTile key={row.id} product={toTile(row)} />
              ))}
            </div>
          </section>
        ) : null}

        <Footer />
      </>
    );
  }

  if (fresh.paymentStatus === "FAILED") {
    return (
      <Shell
        icon={<XCircle className="h-10 w-10 text-danger" aria-hidden />}
        title="That payment did not go through"
        body="Nothing has been charged. Your bag is still saved, so you can try again with another method."
        action={<LinkButton href="/checkout">Try again</LinkButton>}
      />
    );
  }

  return (
    <Shell
      icon={<Clock className="h-10 w-10 text-warning" aria-hidden />}
      title="Payment is still processing"
      body={`We are waiting on confirmation for ${fresh.orderNumber}. Refresh in a moment — we will email you as soon as it clears.`}
      action={<LinkButton href={`/checkout/confirm?reference=${reference}`}>Refresh</LinkButton>}
    />
  );
}

function Shell({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="lx-container max-w-lg py-24 text-center">
      <div className="flex justify-center">{icon}</div>
      <h1 className="mt-4 text-3xl">{title}</h1>
      <p className="mt-2 text-[var(--text-secondary)]">{body}</p>
      <div className="mt-6 flex justify-center gap-3">
        {action}
        <Link href="/contact" className="self-center text-sm underline-offset-4 hover:underline">
          Contact us
        </Link>
      </div>
    </div>
  );
}
