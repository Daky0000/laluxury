import type { Metadata } from "next";
import Link from "next/link";
import { Clock, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import { verifyTransaction, describeChannel } from "@/lib/paystack";
import { markOrderPaid, markPaymentFailed, logOrderEvent } from "@/lib/orders";
import { postAlert } from "@/lib/agent/slack";
import { productCardSelect } from "@/lib/catalog";
import { toTile } from "@/lib/product-view";
import { formatMoney, formatPrice } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
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
  const isDirectPayment = payment.provider === "direct" || params.mode === "direct";

  // Verify with Paystack unless it is a direct/concierge order or already settled.
  if (!isDirectPayment && payment.status !== "SUCCESS") {
    try {
      const transaction = await verifyTransaction(reference);

      if (transaction.status === "success" && transaction.amount !== payment.amount) {
        const held = await db.orderEvent.findFirst({
          where: { orderId: order.id, type: "payment.mismatch" },
          select: { id: true },
        });
        if (!held) {
          await logOrderEvent({
            orderId: order.id,
            type: "payment.mismatch",
            message: `Paystack reported ${formatMoney(transaction.amount)} but the expected amount is ${formatMoney(payment.amount)}. Held for review.`,
            meta: { reference, reported: transaction.amount, expected: payment.amount },
          });
          await postAlert(
            `:warning: Payment amount mismatch on ${order.orderNumber}. Paystack says ${formatMoney(transaction.amount)}, expected ${formatMoney(payment.amount)}.`,
          );
        }
      } else if (transaction.status === "success") {
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
  const isConfirmedOrder =
    fresh.paymentStatus === "SUCCESS" || latestPayment?.provider === "direct" || isDirectPayment;

  if (isConfirmedOrder) {
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
    const estimate = fresh.hasPreorderItems
      ? (fresh.items.find((i) => i.preorderLeadTime)?.preorderLeadTime ?? "4–6 weeks (Pre-Order)")
      : fresh.shippingRate?.estimatedDaysMin
        ? `${fresh.shippingRate.estimatedDaysMin}–${fresh.shippingRate.estimatedDaysMax} days`
        : (fresh.shippingRate?.name ?? "2–4 days");

    const paymentLabel =
      fresh.paymentStatus === "SUCCESS"
        ? latestPayment?.channel
          ? describeChannel(latestPayment.channel)
          : "Paid"
        : fresh.paymentMethod === "pay_on_delivery"
          ? "Pay on Delivery"
          : fresh.paymentMethod === "direct_momo"
            ? "Direct MoMo / Bank"
            : "Concierge Settlement";

    const meta = [
      { label: "Order", value: fresh.orderNumber },
      { label: fresh.hasPreorderItems ? "Est. Lead Time" : "Est. Delivery", value: estimate },
      {
        label: "Payment",
        value: paymentLabel,
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

          <p className="lx-eyebrow mt-6.5">
            {fresh.hasPreorderItems ? "Pre-Order & Order Confirmed" : "Order confirmed"}
          </p>
          <h1 className="mt-3 text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.05]">
            Thank you{firstName ? `, ${firstName}` : ""}.
          </h1>
          <p className="mx-auto mt-3.5 max-w-[500px] text-base font-light leading-relaxed text-[var(--text-secondary)]">
            Your order <strong className="font-medium text-[var(--text-primary)]">{fresh.orderNumber}</strong> is
            confirmed. We have recorded your details under {fresh.email} and our concierge team will
            reach you on {formatPhone(fresh.phone ?? fresh.shippingAddress?.phone ?? "")} to finalize
            dispatch.
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
                <dt className="text-sm uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  {item.label}
                </dt>
                <dd className="mt-1 text-base font-medium">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Direct Payment / Pre-Order Instructions Banner */}
        {fresh.paymentStatus !== "SUCCESS" ? (
          <section className="lx-container max-w-[760px] pb-6">
            <div className="border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                Next Steps · Settlement &amp; Dispatch
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {fresh.paymentMethod === "pay_on_delivery"
                  ? "Your order is reserved for Pay on Delivery / Concierge Verification. Our Accra dispatch team will call you to confirm your delivery window."
                  : `To complete your ${fresh.depositAmount ? "50% pre-order deposit" : "payment"} of ${formatPrice(fresh.depositAmount ?? fresh.total)} immediately via Mobile Money or Bank Transfer, use your Order Reference (${fresh.orderNumber}) or contact our concierge desk at ${formatPhone(settings.supportPhone)}.`}
              </p>
            </div>
          </section>
        ) : null}

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
                    <span className="flex flex-wrap items-center gap-2 text-base">
                      {item.productTitle}
                      {item.isPreorder ? (
                        <span className="border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--accent)]">
                          Pre-Order{item.preorderLeadTime ? ` · ${item.preorderLeadTime}` : ""}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-sm uppercase tracking-[0.08em] text-[var(--text-muted)]">
                      {item.variantTitle !== "Default" ? `${item.variantTitle} · ` : ""}
                      Qty {item.quantity}
                    </span>
                  </span>
                  <span className="text-[17px] font-semibold tabular-nums">
                    {formatPrice(item.total)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="px-7 pb-6 pt-4">
              <div className="flex justify-between py-1.5 text-sm text-[var(--text-secondary)]">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatPrice(fresh.subtotal)}</dd>
              </div>
              {fresh.discountTotal > 0 ? (
                <div className="flex justify-between py-1.5 text-sm text-sage-600">
                  <dt>Discount</dt>
                  <dd className="tabular-nums">-{formatPrice(fresh.discountTotal)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between py-1.5 text-sm text-[var(--text-secondary)]">
                <dt>Delivery</dt>
                <dd className="tabular-nums">
                  {fresh.shippingTotal === 0 ? "Free" : formatPrice(fresh.shippingTotal)}
                </dd>
              </div>
              <div className="mt-2.5 flex items-baseline justify-between border-t border-[var(--border-strong)] pt-3.5">
                <dt className="text-sm uppercase tracking-[0.06em]">Total</dt>
                <dd className="text-[26px] font-semibold tabular-nums">{formatPrice(fresh.total)}</dd>
              </div>
              {fresh.depositAmount ? (
                <div className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-sm">
                  <div className="flex justify-between font-medium text-[var(--accent)]">
                    <dt>50% Pre-Order Deposit</dt>
                    <dd className="tabular-nums">{formatPrice(fresh.depositAmount)}</dd>
                  </div>
                  <div className="mt-1 flex justify-between text-[var(--text-secondary)]">
                    <dt>Balance on White-Glove Delivery</dt>
                    <dd className="tabular-nums">
                      {formatPrice(fresh.total - fresh.depositAmount)}
                    </dd>
                  </div>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {fresh.shippingAddress ? (
              <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-6 py-5">
                <h3 className="text-sm uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Delivering to
                </h3>
                <address className="mt-2 text-sm not-italic leading-relaxed">
                  {fresh.shippingAddress.firstName} {fresh.shippingAddress.lastName}
                  <br />
                  {fresh.shippingAddress.line1}
                  {fresh.shippingAddress.line2 ? `, ${fresh.shippingAddress.line2}` : ""}
                  <br />
                  {fresh.shippingAddress.city}, {fresh.shippingAddress.region} ·{" "}
                  {formatPhone(fresh.shippingAddress.phone)}
                </address>
              </div>
            ) : null}

            <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-6 py-5">
              <h3 className="text-sm uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Need to change something?
              </h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-[var(--text-secondary)]">
                Message us with your order number and we will sort it before dispatch.
              </p>
              <Link href="/contact" className="mt-2.5 inline-block text-sm text-[var(--accent)]">
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
            className="inline-flex items-center justify-center border border-[var(--border-strong)] px-8 py-4 text-sm font-medium uppercase tracking-[0.12em] transition-colors hover:bg-[var(--surface-sunken)]"
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
